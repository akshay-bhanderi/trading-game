/**
 * Bank deposits — Trade Winds of Selvara.
 *
 * Design doc reference: §9 "Deposits" —
 *   "Any bank, no cap, from day 1. Interest compounds daily... Money
 *   deposited is safe from all events... simplification for v1: ... deposits
 *   /loans live at the specific city's bank; you must be in that city to
 *   transact with it."
 *
 * Pure TypeScript, zero React imports (see /src/engine/README.md).
 *
 * ---------------------------------------------------------------------------
 * Convention: follows the same pure-function precedent already established
 * by /src/engine/actions/trade.ts's `buy`/`sell` and /src/engine/actions/
 * stay.ts's `stay` — on success this returns a NEW `GameState`; on rejection
 * (any validation failure) it returns the identical `state` reference,
 * unchanged, with no throw and no mutation, so callers can detect rejection
 * cheaply via `result === state`.
 *
 * ---------------------------------------------------------------------------
 * v1 simplification: no cross-city banking.
 * ---------------------------------------------------------------------------
 * `deposit`/`withdraw` both ONLY succeed while `state.currentCity === cityId`
 * — the player must be physically standing in the city whose bank they want
 * to transact with. There is deliberately no "one global bank account per
 * bank-size class" or cross-city routing in v1 (§9's explicit call-out) —
 * this creates the "real routing decisions" the design doc calls for.
 */

import { CONFIG } from '../config'
import { CITIES } from '../data/cities'
import type { BankAccount, CityId, GameState } from '../types'

/**
 * Deposits `amount` cash into `cityId`'s bank account.
 *
 * Validates:
 *   - `state.currentCity === cityId` (v1's no-cross-city-banking rule)
 *   - `amount > 0`
 *   - `state.cash >= amount`
 *
 * On success: deducts `amount` from `state.cash`, adds `amount` to
 * `state.bankAccounts[cityId].depositBalance` — creating the `BankAccount`
 * entry (with `loan: null`) if this is the player's first-ever deposit at
 * this city's bank.
 *
 * Rejected (returns the identical `state` reference, unchanged) when any
 * validation fails.
 */
export function deposit(state: GameState, cityId: CityId, amount: number): GameState {
  if (state.currentCity !== cityId) return state
  if (amount <= 0) return state
  if (state.cash < amount) return state

  const existing = state.bankAccounts[cityId]
  const account: BankAccount = existing
    ? { ...existing, depositBalance: existing.depositBalance + amount }
    : { cityId, depositBalance: amount, loan: null }

  return {
    ...state,
    cash: state.cash - amount,
    bankAccounts: { ...state.bankAccounts, [cityId]: account },
  }
}

/**
 * Withdraws `amount` cash from `cityId`'s bank account back into
 * `state.cash`.
 *
 * Validates:
 *   - `state.currentCity === cityId` (v1's no-cross-city-banking rule)
 *   - `amount > 0`
 *   - the account already exists and `depositBalance >= amount`
 *
 * On success: deducts `amount` from `depositBalance`, adds `amount` to
 * `state.cash`.
 *
 * Rejected (returns the identical `state` reference, unchanged) when any
 * validation fails — including when the city has no `BankAccount` entry yet
 * (nothing to withdraw from).
 */
export function withdraw(state: GameState, cityId: CityId, amount: number): GameState {
  if (state.currentCity !== cityId) return state
  if (amount <= 0) return state

  const existing = state.bankAccounts[cityId]
  if (!existing || existing.depositBalance < amount) return state

  const account: BankAccount = { ...existing, depositBalance: existing.depositBalance - amount }

  return {
    ...state,
    cash: state.cash + amount,
    bankAccounts: { ...state.bankAccounts, [cityId]: account },
  }
}

/**
 * Compounds daily deposit interest for EVERY city in `state.bankAccounts`
 * that has a non-zero `depositBalance`, at that city's bank-size daily rate
 * (`CONFIG.banking.depositInterestDailyRates`, reused verbatim — see
 * /src/engine/config.ts, not redefined here).
 *
 * `newBalance = depositBalance * (1 + rate)`, where `rate` is looked up via
 * `CITIES.find(c => c.id === cityId)?.bankSize`. If a `cityId` in
 * `bankAccounts` can't be resolved to a known `City` (shouldn't happen in
 * practice — every `BankAccount` is created via `deposit`, which requires
 * `state.currentCity === cityId`, itself always a real city id), that
 * account is defensively skipped/no-op'd rather than throwing.
 *
 * Intended to be called ONCE PER DAY-TICK — see /src/engine/turnLoop.ts's
 * `advanceDay`, which wires this in as a separate, additive step.
 *
 * Pure function: returns a NEW `GameState` on any change; returns the
 * identical `state` reference, unchanged, when there is nothing to accrue
 * (no accounts, or every account's `depositBalance` is 0).
 */
export function accrueDepositInterest(state: GameState): GameState {
  let changed = false
  const newAccounts: Record<CityId, BankAccount> = { ...state.bankAccounts }

  for (const cityId of Object.keys(state.bankAccounts)) {
    const account = state.bankAccounts[cityId]
    if (!account || account.depositBalance <= 0) continue

    const city = CITIES.find((c) => c.id === cityId)
    if (!city) continue // defensive — should never happen, see doc comment above

    const rate = CONFIG.banking.depositInterestDailyRates[city.bankSize]
    newAccounts[cityId] = { ...account, depositBalance: account.depositBalance * (1 + rate) }
    changed = true
  }

  if (!changed) return state

  return { ...state, bankAccounts: newAccounts }
}
