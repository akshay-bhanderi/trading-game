/**
 * localStorage save/load — Trade Winds of Selvara.
 *
 * Design doc reference: §17 (localStorage persistence, schema version), §1
 * ("Save" — a run's full state, including its RNG seed, persists across
 * browser sessions).
 *
 * Pure TypeScript, zero React imports (see /src/engine/README.md). The only
 * browser-specific API used is `localStorage` itself, guarded so this file
 * never throws in an environment without it (SSR, tests, privacy mode with
 * storage disabled).
 */

import type { GameState } from '../types'

/** Bumped whenever `GameState`'s shape changes in a way old saves can't be
 * read as-is. `migrate` below is the seam a future bump hooks into. */
export const SCHEMA_VERSION = 2

const SAVE_KEY = 'tradeWindsOfSelvara.save'

interface SaveEnvelope {
  schemaVersion: number
  state: GameState
}

/**
 * `globalThis.localStorage` rather than `window.localStorage` deliberately —
 * identical in a real browser (`window === globalThis` there), but this also
 * lets a Node test environment (this repo's engine tests run headless in
 * Node, per §17/README's "no DOM in /src/engine" rule) exercise this file
 * with nothing more than a plain `globalThis.localStorage = <mock>` stub,
 * with no `jsdom`/`window` polyfill required.
 */
function storage(): Storage | null {
  return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage
}

/** Old (pre-v2) per-city bank account shape — `depositBalance` lived here
 * before the 2026-08 pooled-deposit redesign (see bank/deposits.ts). Only
 * used by `migrate` below to read a v1 save's raw JSON; the CURRENT
 * `BankAccount` type (types.ts) no longer has this field. */
interface LegacyBankAccountV1 {
  cityId: string
  depositBalance?: number
  loan: unknown
}

/**
 * Runs a loaded save through any field-by-field migrations needed to reach
 * the CURRENT schema, based on the version it was actually saved under.
 *
 * v1 -> v2 (2026-08): deposits moved from a per-city `BankAccount.
 * depositBalance` to one pooled `GameState.deposit` balance — see
 * bank/deposits.ts's file header for the full redesign rationale. A v1 save
 * had its money split across however many cities the player had deposited
 * at; this sums all of it into the new pooled field (nothing is lost) and
 * strips the now-meaningless `depositBalance` key off each account (each
 * account's `loan`, if any, is left exactly as-is — loans were never part of
 * this redesign).
 */
function migrate(envelope: SaveEnvelope): GameState {
  let state = envelope.state

  if (envelope.schemaVersion < 2) {
    const legacyAccounts = state.bankAccounts as unknown as Record<string, LegacyBankAccountV1 | undefined>
    let pooled = state.deposit ?? 0
    const migratedAccounts: GameState['bankAccounts'] = {}

    for (const cityId in legacyAccounts) {
      const account = legacyAccounts[cityId]
      if (!account) continue
      pooled += account.depositBalance ?? 0
      migratedAccounts[cityId] = { cityId: account.cityId, loan: account.loan as GameState['bankAccounts'][string]['loan'] }
    }

    state = { ...state, deposit: pooled, bankAccounts: migratedAccounts }
  }

  state = reclaimOrphanedDepositBalances(state)

  return state
}

/**
 * USER-REPORTED BUG FIX (2026-08): "deposited $100k, switched city, it
 * vanished, can't withdraw from any city." Root cause: the v1->v2 migration
 * above only reclaims a stray per-city `depositBalance` when the save's OWN
 * `schemaVersion` tag is still < 2. But a save can end up carrying leftover
 * `depositBalance` data on an account EVEN WHEN IT'S ALREADY TAGGED v2 — if,
 * during the deploy that introduced the pooled-deposit redesign, a browser
 * tab kept running the OLD bank code (which still called `deposit(state,
 * cityId, amount)`, writing straight to `bankAccounts[cityId].
 * depositBalance`) against a GameState object that had ALREADY been migrated
 * to the new schema for that same session. The schema-version check alone
 * can't catch this, because the save gets re-written (via the normal
 * auto-save-on-every-action path, `saveGame`) with the CURRENT
 * `SCHEMA_VERSION` (2) every time, regardless of which code version actually
 * produced the data inside it.
 *
 * This function is therefore UNCONDITIONAL — it runs on every load,
 * regardless of `schemaVersion` — and simply reclaims any stray, VALID
 * (finite, positive) `depositBalance` still sitting on any `bankAccounts`
 * entry into the pooled `state.deposit` field, then strips the field. This
 * is a no-op (returns the state unchanged in shape, cheap to check) for the
 * overwhelmingly common case where no such stray data exists.
 *
 * Known limitation, disclosed rather than silently swallowed: if the old
 * code's write happened as `existing.depositBalance + amount` where
 * `existing.depositBalance` was already `undefined` (the normal case for an
 * account created fresh under the new schema), the result is `NaN`, not a
 * recoverable number — JS arithmetic destroys the original amount the
 * instant it happens, there is nothing left in the data to reconstruct it
 * from. This function explicitly does NOT fold `NaN`/non-finite values into
 * the pool (would corrupt the balance further) — it only strips them out as
 * dead weight. A player whose deposit was lost this specific way cannot be
 * automatically restored by this function; that requires a manual, explicit
 * data repair (crediting a known amount back) once the true lost amount is
 * confirmed with them directly.
 */
function reclaimOrphanedDepositBalances(state: GameState): GameState {
  let pooled = state.deposit ?? 0
  let foundAny = false
  const cleanedAccounts: GameState['bankAccounts'] = {}

  for (const cityId in state.bankAccounts) {
    const account = state.bankAccounts[cityId]
    if (!account) continue

    const stray = (account as unknown as { depositBalance?: unknown }).depositBalance
    if (stray !== undefined) {
      foundAny = true
      if (typeof stray === 'number' && Number.isFinite(stray) && stray > 0) {
        pooled += stray
      }
      // Rebuild the account without the stray field (whether or not its
      // value was recoverable) — `bankAccounts[cityId]` should only ever
      // have `cityId`/`loan` under the current schema.
      cleanedAccounts[cityId] = { cityId: account.cityId, loan: account.loan }
    } else {
      cleanedAccounts[cityId] = account
    }
  }

  if (!foundAny) return state

  return { ...state, deposit: pooled, bankAccounts: cleanedAccounts }
}

/**
 * Serializes the full `GameState` (including its RNG `seed` — the run
 * remains exactly reproducible from this point on) to a single localStorage
 * key, wrapped with the current `SCHEMA_VERSION`. Never throws: a storage
 * failure (quota exceeded, disabled storage) is swallowed and reported via
 * the boolean return so callers can decide how to surface it.
 */
export function saveGame(state: GameState): boolean {
  const store = storage()
  if (!store) return false

  const envelope: SaveEnvelope = { schemaVersion: SCHEMA_VERSION, state }

  try {
    store.setItem(SAVE_KEY, JSON.stringify(envelope))
    return true
  } catch {
    return false
  }
}

/**
 * Deserializes the saved `GameState`, running it through `migrate` first
 * (a no-op today). Returns `null` — never throws — when there is no save,
 * storage is unavailable, or the stored JSON is corrupt/unreadable.
 */
export function loadGame(): GameState | null {
  const store = storage()
  if (!store) return null

  try {
    const raw = store.getItem(SAVE_KEY)
    if (raw === null) return null

    const envelope = JSON.parse(raw) as SaveEnvelope
    if (typeof envelope.schemaVersion !== 'number' || !envelope.state) return null

    return migrate(envelope)
  } catch {
    return null
  }
}

/** Cheap existence check — used by the Title screen to enable/disable its
 * "Continue" action without deserializing the full state. */
export function hasSavedGame(): boolean {
  const store = storage()
  if (!store) return false
  try {
    return store.getItem(SAVE_KEY) !== null
  } catch {
    return false
  }
}

/** Deletes the current save, if any (e.g. after declaring bankruptcy / game
 * over, so "Continue" doesn't resurrect a finished run). Never throws. */
export function clearSavedGame(): void {
  const store = storage()
  if (!store) return
  try {
    store.removeItem(SAVE_KEY)
  } catch {
    // Swallowed deliberately — see file header.
  }
}
