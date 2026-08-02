/**
 * Bank default flow — Trade Winds of Selvara.
 *
 * Design doc reference: §9 "Default — player's choice" —
 *   "Trigger: a loan is 15 days past its 60-day term, OR total debt > 2x net
 *   worth for 7 straight days. The bank confronts the player with three
 *   options (player picks — per design decision):
 *     1. Surrender assets: bank seizes deposits + cargo at 70% value until
 *        debt cleared; run continues; repaymentRecord -0.5.
 *     2. Restructure (debt pressure): debt refinanced at 2x interest + %pd
 *        collector fee = 0.5% of debt; if debt still > 2x net worth after
 *        15 more days -> forced game over; repaymentRecord -0.3.
 *     3. Declare bankruptcy: run ends now; score = peak net worth reached."
 *
 * Pure TypeScript, zero React imports (see /src/engine/README.md).
 *
 * ---------------------------------------------------------------------------
 * Convention: follows the same pure-function precedent established by
 * /src/engine/bank/loans.ts and deposits.ts — every function here returns a
 * NEW `GameState` on any change, and the identical `state` reference,
 * unchanged, whenever there is nothing to do (so callers can detect a no-op
 * cheaply via `result === state`). `resolveDefault` is the one exception:
 * it always returns a new state (a player-committed choice always mutates
 * something), never a rejection — there is no "invalid choice" case once
 * TypeScript's literal union type is satisfied.
 *
 * ---------------------------------------------------------------------------
 * TWO trigger conditions, TWO cooperating functions, per TASK.md's own
 * suggested split
 * ---------------------------------------------------------------------------
 *   - `checkDefaultTrigger(state)` — a pure, read-only detector. Returns a
 *     `DefaultTriggerResult` describing WHICH condition fired (and, for the
 *     overdue-loan condition, which city's bank), or `null` if neither
 *     condition currently holds. Never mutates `state` and never sets
 *     `awaitingDefaultDecision` itself — it is a query, not a command.
 *   - `updateDefaultTrigger(state)` — the state-returning variant wired into
 *     the day-tick (`advanceDay`, turnLoop.ts). It first calls
 *     `updateDefaultTracking` (below) to keep the day-7-consecutive-days
 *     counter current for TODAY, then calls `checkDefaultTrigger` against
 *     the freshly-updated state and, if a trigger fires AND
 *     `awaitingDefaultDecision` isn't already set, sets it. Per TASK.md:
 *     "once true, leave it true until `resolveDefault` clears it — don't
 *     auto-clear it if the underlying condition later resolves itself,
 *     since the bank has already confronted the player."
 *
 * ---------------------------------------------------------------------------
 * The debt-to-net-worth CONSECUTIVE-DAYS counter — `debtOverThresholdSinceDay`
 * ---------------------------------------------------------------------------
 * `GameState.debtOverThresholdSinceDay` (types.ts) is `null` when debt is
 * NOT currently over `debtToNetWorthRatioTrigger` (2x) times net worth, or a
 * day number marking the day the CURRENT streak of being over-threshold
 * FIRST started. `updateDefaultTracking(state)` — intended to be called once
 * per day-tick, BEFORE `checkDefaultTrigger` looks at it for today — updates
 * this field with exactly three possible outcomes each day:
 *   1. Over-threshold today, counter wasn't running -> START it (set to
 *      `state.day`).
 *   2. NOT over-threshold today, counter WAS running -> RESET it (`null`) —
 *      the streak is broken; a later re-crossing starts a brand-new streak.
 *   3. Otherwise (already running and still over, OR not over and wasn't
 *      running) -> LEAVE IT ALONE (no-op, returns the identical `state`
 *      reference).
 *
 * `checkDefaultTrigger` then fires the `'debtRatio'` trigger once
 * `state.day - state.debtOverThresholdSinceDay >=
 * CONFIG.banking.default.debtToNetWorthTriggerDays` (7) — i.e. the streak
 * has been running for a full 7 DAYS SINCE it started (day
 * `debtOverThresholdSinceDay` itself is day 0 of the streak under this
 * formula; the trigger fires on the 8th calendar day of an unbroken streak).
 * This is the exact formula TASK.md's own T024 brief spells out
 * ("`state.day - state.debtOverThresholdSinceDay >= 7` means the trigger
 * fires"), so it is followed literally here rather than reinterpreted.
 *
 * ---------------------------------------------------------------------------
 * SURRENDER — v1 seizure-and-write-off interpretation (documented design
 * decision, per TASK.md's explicit invitation to interpret this branch)
 * ---------------------------------------------------------------------------
 * §9's "bank seizes deposits + cargo at 70% value until debt cleared" is not
 * literally modeled as an auction (there is no buyer, no partial-liquidation
 * UI, and no "seized but still owing" limbo state anywhere else in the
 * design). v1's concrete implementation:
 *   1. ALL deposit balances across EVERY bank account are seized (zeroed).
 *   2. ALL carried cargo is seized (zeroed), valued the SAME way
 *      `netWorth.ts`'s `calcNetWorth` values cargo — at the current city's
 *      last-known price per good (falling back to the good's `basePrice`
 *      when no price has ever been observed there).
 *   3. The combined total is valued at `seizureValueFraction` (0.7) —
 *      `calcSurrenderSeizedValue`, exported below and independently unit-
 *      tested, computes this exact number.
 *   4. That seized value is conceptually "applied" toward total outstanding
 *      debt (principal + accrued interest across every bank account) as far
 *      as it goes — but regardless of whether it fully covers that debt,
 *      EVERY loan is unconditionally cleared to `null` afterward. Two
 *      documented reasons this is the right v1 call, not a shortcut:
 *        - If seized value < debt: the shortfall is WRITTEN OFF by the bank
 *          rather than left as a lingering "you surrendered everything but
 *          still owe $X" state — the doc's own framing ("...until debt
 *          cleared") implies debt-clearing is the whole point of surrender,
 *          and leaving a partial-debt-limbo state would need a wholly new
 *          mechanic (partial default? repeat surrender?) the doc never
 *          describes.
 *        - If seized value > debt: the EXCESS is forfeited/absorbed by the
 *          bank as a punitive-seizure penalty, NOT refunded to the player
 *          as cash. This is deliberate: surrender is meant to read as a
 *          punishing, last-resort choice (hence the harsh repaymentRecord
 *          penalty alongside it), not a fair liquidation sale where the
 *          player nets out ahead. `state.cash` is therefore never touched
 *          by surrender at all.
 *   5. `repaymentRecord -= 0.5` (clamped to [-2, +2]), and the run
 *      CONTINUES — surrender never sets `gameOver`.
 *
 * ---------------------------------------------------------------------------
 * RESTRUCTURE — minimum-viable v1 scope (documented follow-up)
 * ---------------------------------------------------------------------------
 * §9's "debt refinanced at 2x interest + collector fee" describes an ONGOING
 * daily accrual change, not a one-time state mutation. `accrueLoanInterest`
 * (T023, loans.ts) already owns ALL daily loan-interest accrual; teaching it
 * to also apply 2x interest + a 0.5%/day-of-debt collector fee for
 * restructured loans is a natural, but LARGER, follow-up extension of that
 * file — explicitly flagged as future work, not built here. T024's own scope
 * (per TASK.md's acceptance bar) is:
 *   1. Mark every currently-active loan (across every bank account) with
 *      `loan.restructured = true` — a whole-portfolio flag, not a single
 *      loan, since §9 talks about "debt" (the whole balance) being
 *      refinanced and the collector fee is explicitly "% of debt" (total),
 *      not per-loan.
 *   2. `repaymentRecord -= 0.3` (clamped).
 *   3. Set `restructureRecheckDay = state.day + recheckAfterDays` (15) so a
 *      future day-tick (`checkRestructureRecheck`, below, wired into
 *      `advanceDay`) can re-run the debt-to-net-worth check and force
 *      `gameOver: true` if the player is still over-threshold at that point.
 *   4. Run CONTINUES for now (not an immediate game over) — restructure
 *      never sets `gameOver` itself; only a later failed recheck can.
 * `accrueLoanInterest` consuming the `restructured` flag to actually double
 * the rate and add the collector fee is the documented FOLLOW-UP (see the
 * flag's own doc comment in types.ts).
 *
 * ---------------------------------------------------------------------------
 * BANKRUPTCY
 * ---------------------------------------------------------------------------
 * Sets `gameOver: true`. No other state mutation — `state.peakNetWorth` (§1,
 * already tracked continuously by `updatePeakNetWorth`, T009) IS the final
 * score; there is nothing else to compute or store here.
 *
 * ---------------------------------------------------------------------------
 * checkRestructureRecheck — the "forced game-over after 15 more days" hook
 * ---------------------------------------------------------------------------
 * Wired into `advanceDay` (turnLoop.ts) as a small additive step, matching
 * the T021-T023 pattern. A no-op unless `state.restructureRecheckDay` is set
 * AND `state.day >= restructureRecheckDay`. When that day arrives: if debt
 * is STILL over `debtToNetWorthRatioTrigger` (2x) net worth, forces
 * `gameOver: true`; either way, clears `restructureRecheckDay` back to
 * `null` so the same recheck never fires twice.
 */

import { CONFIG } from '../config'
import { GOODS } from '../data/goods'
import { calcNetWorth } from '../netWorth'
import type { BankAccount, CityId, GameState } from '../types'

/** Clamps `value` into `[min, max]`. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** O(1) good-id -> basePrice lookup — same fallback role as netWorth.ts's
 * own private table (duplicated here rather than imported since
 * netWorth.ts doesn't export it; see that file for the identical
 * rationale). */
const BASE_PRICE_BY_GOOD_ID: Record<string, number> = Object.fromEntries(
  GOODS.map((good) => [good.id, good.basePrice]),
)

/**
 * Values carried cargo at the current city's last-known price per good
 * (falling back to the good's `basePrice` when never observed there) — the
 * exact same valuation rule `netWorth.ts`'s `calcNetWorth` uses for cargo,
 * duplicated here (rather than imported) because netWorth.ts doesn't expose
 * this piece as a standalone function. See this file header's SURRENDER
 * section for why this exact valuation is reused for seizure math too.
 */
function calcCargoValueAtLastKnownPrice(state: GameState): number {
  const pricesHere = state.priceStates[state.currentCity]
  let value = 0
  for (const goodId in state.cargo) {
    const holding = state.cargo[goodId]
    if (!holding) continue
    const lastSeenPrice = pricesHere?.[goodId]?.lastSeenPrice
    const unitPrice = lastSeenPrice ?? BASE_PRICE_BY_GOOD_ID[goodId] ?? 0
    value += holding.qty * unitPrice
  }
  return value
}

/** Sums `principal + accruedInterest` across every bank account's active
 * loan. Exported since it's a generically useful "how much debt do I have"
 * query (e.g. a future Bank screen), not just an internal default-flow
 * concern. */
export function calcTotalDebt(state: GameState): number {
  let debt = 0
  for (const cityId in state.bankAccounts) {
    const loan = state.bankAccounts[cityId]?.loan
    if (loan) debt += loan.principal + loan.accruedInterest
  }
  return debt
}

/** §9 trigger (b)'s underlying condition, checked fresh each day:
 * total debt > `debtToNetWorthRatioTrigger` (2) x current net worth. */
function isDebtOverThreshold(state: GameState): boolean {
  const netWorth = calcNetWorth(state)
  const debt = calcTotalDebt(state)
  return debt > CONFIG.banking.default.debtToNetWorthRatioTrigger * netWorth
}

// ---------------------------------------------------------------------------
// Trigger detection
// ---------------------------------------------------------------------------

/** Identifies WHICH §9 default condition fired. `cityId` is only present for
 * `'overdueLoan'` — `'debtRatio'` is a whole-portfolio condition. */
export interface DefaultTriggerResult {
  triggeredBy: 'overdueLoan' | 'debtRatio'
  cityId?: CityId
}

/**
 * Pure, read-only detector for §9's two default trigger conditions:
 *   (a) ANY active loan more than `overdueGraceDays` (15) days past its
 *       `termDays` (60) term — i.e. `state.day > loan.startDay +
 *       loan.termDays + overdueGraceDays`. Checked across every bank
 *       account; the FIRST overdue loan found (in `bankAccounts` key
 *       iteration order) is reported.
 *   (b) `state.debtOverThresholdSinceDay` has been running for at least
 *       `debtToNetWorthTriggerDays` (7) days — see file header for the
 *       exact formula and its rationale.
 *
 * Never mutates `state` and never touches `awaitingDefaultDecision` — see
 * `updateDefaultTrigger` for the state-returning variant that does. Returns
 * `null` if neither condition currently holds. Condition (a) is checked
 * first and takes priority when both happen to hold simultaneously.
 */
export function checkDefaultTrigger(state: GameState): DefaultTriggerResult | null {
  for (const cityId of Object.keys(state.bankAccounts)) {
    const loan = state.bankAccounts[cityId]?.loan
    if (!loan) continue
    const overdueDay = loan.startDay + loan.termDays + CONFIG.banking.default.overdueGraceDays
    if (state.day > overdueDay) {
      return { triggeredBy: 'overdueLoan', cityId }
    }
  }

  const since = state.debtOverThresholdSinceDay
  if (
    since !== null &&
    since !== undefined &&
    state.day - since >= CONFIG.banking.default.debtToNetWorthTriggerDays
  ) {
    return { triggeredBy: 'debtRatio' }
  }

  return null
}

/**
 * Updates `state.debtOverThresholdSinceDay` for TODAY — see file header's
 * "consecutive-days counter" section for the exact 3-outcome semantics
 * (start / reset / leave alone). Intended to be called ONCE PER DAY-TICK,
 * before `checkDefaultTrigger` is consulted for that same day (see
 * `updateDefaultTrigger`, which does exactly that).
 *
 * Pure function: returns a NEW `GameState` when the counter starts or
 * resets; returns the identical `state` reference, unchanged, otherwise.
 */
export function updateDefaultTracking(state: GameState): GameState {
  const over = isDebtOverThreshold(state)
  const since = state.debtOverThresholdSinceDay ?? null

  if (over && since === null) {
    return { ...state, debtOverThresholdSinceDay: state.day }
  }
  if (!over && since !== null) {
    return { ...state, debtOverThresholdSinceDay: null }
  }
  return state
}

/**
 * The state-returning variant wired into `advanceDay` (turnLoop.ts).
 * First refreshes the consecutive-days counter for today
 * (`updateDefaultTracking`), then checks both trigger conditions against
 * the freshly-updated state (`checkDefaultTrigger`). If a trigger fires AND
 * `awaitingDefaultDecision` isn't already set, sets it to the trigger
 * result. If it's already set, LEAVES IT ALONE — per §9/TASK.md, the flag,
 * once raised, is only ever cleared by `resolveDefault` (the player's
 * actual choice), never by the underlying condition resolving itself.
 *
 * Pure function: returns a NEW `GameState` whenever the tracking counter or
 * the awaiting-decision flag changes; returns the identical `state`
 * reference, unchanged, when neither does.
 */
export function updateDefaultTrigger(state: GameState): GameState {
  const tracked = updateDefaultTracking(state)

  if (tracked.awaitingDefaultDecision) {
    return tracked
  }

  const trigger = checkDefaultTrigger(tracked)
  if (!trigger) {
    return tracked
  }

  return { ...tracked, awaitingDefaultDecision: trigger }
}

// ---------------------------------------------------------------------------
// Surrender seizure valuation (exported for independent testing/future UI
// preview — see file header's SURRENDER section)
// ---------------------------------------------------------------------------

/**
 * Computes the total value the bank seizes under the Surrender branch: ALL
 * deposit balances across every bank account, PLUS ALL carried cargo
 * (valued via `calcCargoValueAtLastKnownPrice`), with the combined total
 * valued at `CONFIG.banking.default.surrender.seizureValueFraction` (0.7) —
 * §9: "seizes deposits + cargo at 70% value".
 *
 * This value is conceptually "applied" toward total outstanding debt inside
 * `resolveDefault('surrender', ...)`, but — per this file's documented
 * design decision — every loan is unconditionally cleared to `null`
 * regardless of whether this seized value fully covers total debt (shortfall
 * written off; excess forfeited to the bank, never refunded as cash). See
 * the file header for the full rationale.
 */
export function calcSurrenderSeizedValue(state: GameState): number {
  // 2026-08 bank redesign: a single pooled balance — see
  // bank/deposits.ts's file header.
  const totalDeposits = state.deposit ?? 0
  const cargoValue = calcCargoValueAtLastKnownPrice(state)
  return (totalDeposits + cargoValue) * CONFIG.banking.default.surrender.seizureValueFraction
}

// ---------------------------------------------------------------------------
// resolveDefault — the three player-choice branches
// ---------------------------------------------------------------------------

function resolveSurrender(state: GameState): GameState {
  const { repaymentRecordPenalty } = CONFIG.banking.default.surrender

  // See file header's SURRENDER section: seized value is computed
  // (`calcSurrenderSeizedValue`) purely for documentation/testability — it
  // does not branch the unconditional zero-out-and-write-off below.
  const clearedAccounts: Record<CityId, BankAccount> = {}
  for (const cityId in state.bankAccounts) {
    const account = state.bankAccounts[cityId]
    if (!account) continue
    clearedAccounts[cityId] = { ...account, loan: null }
  }

  return {
    ...state,
    bankAccounts: clearedAccounts,
    // 2026-08 bank redesign: zero the single pooled balance directly rather
    // than each account's own depositBalance — see bank/deposits.ts.
    deposit: 0,
    cargo: {},
    repaymentRecord: clamp(
      state.repaymentRecord + repaymentRecordPenalty,
      CONFIG.rank.repaymentRecordClamp.min,
      CONFIG.rank.repaymentRecordClamp.max,
    ),
    awaitingDefaultDecision: null,
  }
}

function resolveRestructure(state: GameState): GameState {
  const { repaymentRecordPenalty, recheckAfterDays } = CONFIG.banking.default.restructure

  const restructuredAccounts: Record<CityId, BankAccount> = {}
  for (const cityId in state.bankAccounts) {
    const account = state.bankAccounts[cityId]
    if (!account) continue
    restructuredAccounts[cityId] = account.loan
      ? { ...account, loan: { ...account.loan, restructured: true } }
      : account
  }

  return {
    ...state,
    bankAccounts: restructuredAccounts,
    repaymentRecord: clamp(
      state.repaymentRecord + repaymentRecordPenalty,
      CONFIG.rank.repaymentRecordClamp.min,
      CONFIG.rank.repaymentRecordClamp.max,
    ),
    restructureRecheckDay: state.day + recheckAfterDays,
    awaitingDefaultDecision: null,
  }
}

function resolveBankruptcy(state: GameState): GameState {
  return {
    ...state,
    gameOver: true,
    awaitingDefaultDecision: null,
  }
}

/**
 * Resolves an `awaitingDefaultDecision` prompt with the player's choice —
 * see the file header for each branch's exact semantics:
 *   - `'surrender'`  — seize deposits+cargo at 70%, clear all debt, -0.5
 *                       repaymentRecord, run continues.
 *   - `'restructure'` — flag all active loans `restructured`, -0.3
 *                        repaymentRecord, schedule a 15-day recheck, run
 *                        continues.
 *   - `'bankruptcy'`  — `gameOver: true`, run ends now (score =
 *                        `peakNetWorth`, already tracked).
 *
 * All three branches clear `awaitingDefaultDecision` back to `null`. Always
 * returns a NEW `GameState` (a committed player choice always mutates
 * something) — there is no rejection path once TypeScript's literal union
 * type is satisfied.
 */
export function resolveDefault(state: GameState, choice: 'surrender' | 'restructure' | 'bankruptcy'): GameState {
  switch (choice) {
    case 'surrender':
      return resolveSurrender(state)
    case 'restructure':
      return resolveRestructure(state)
    case 'bankruptcy':
      return resolveBankruptcy(state)
    default:
      return state
  }
}

// ---------------------------------------------------------------------------
// Restructure recheck — the "forced game-over after 15 more days" hook
// ---------------------------------------------------------------------------

/**
 * A no-op unless `state.restructureRecheckDay` is set AND `state.day >=
 * restructureRecheckDay`. When that day arrives: if total debt is STILL
 * over `debtToNetWorthRatioTrigger` (2x) net worth, forces `gameOver:
 * true`; either way, clears `restructureRecheckDay` back to `null` so the
 * same recheck never fires twice. Intended to be called ONCE PER DAY-TICK,
 * wired into `advanceDay` (turnLoop.ts) as a small additive step.
 *
 * Pure function: returns a NEW `GameState` whenever the recheck actually
 * runs (whichever way it resolves); returns the identical `state`
 * reference, unchanged, when the recheck day hasn't arrived yet (or none is
 * pending).
 */
export function checkRestructureRecheck(state: GameState): GameState {
  const recheckDay = state.restructureRecheckDay ?? null
  if (recheckDay === null || state.day < recheckDay) {
    return state
  }

  const stillOver = isDebtOverThreshold(state)
  return {
    ...state,
    restructureRecheckDay: null,
    ...(stillOver ? { gameOver: true } : {}),
  }
}
