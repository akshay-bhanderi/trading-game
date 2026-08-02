/**
 * Bank deposits — Trade Winds of Selvara.
 *
 * ---------------------------------------------------------------------------
 * USER-REQUESTED REDESIGN (2026-08): pooled/global deposits, replacing the
 * original §9 "no cross-city banking" model
 * ---------------------------------------------------------------------------
 * §9's original v1 text ("deposits/loans live at the specific city's bank;
 * you must be in that city to transact with it") was a deliberate v1
 * simplification, but real-world play found it confusing — a deposit made
 * in one city was invisible (and unreachable) from every other city, which
 * read as a bug ("I deposited $1,000 and it disappeared") rather than the
 * intended routing decision. Per explicit user direction, deposits now live
 * as ONE pooled balance (`GameState.deposit`) reachable from any city's Bank
 * popup — "a modern bank": deposit or withdraw from anywhere, capped only by
 * how much is actually in the account. Interest is a single flat rate
 * (`CONFIG.banking.globalDepositInterestDailyRate`) rather than varying by
 * which bank you happened to deposit at — the user's explicit choice over
 * "best bank you've ever used" or "local city's rate" alternatives, since a
 * pooled balance has no single city to attribute a rate to.
 *
 * Loans are UNAFFECTED by this redesign — see bank/loans.ts, still per-city,
 * presence-gated, capped by that city's bank size × rank, exactly as §9
 * originally specified. Only deposits pooled.
 *
 * Pure TypeScript, zero React imports (see /src/engine/README.md).
 *
 * Convention: follows the same pure-function precedent already established
 * by /src/engine/actions/trade.ts's `buy`/`sell` — on success this returns a
 * NEW `GameState`; on rejection (any validation failure) it returns the
 * identical `state` reference, unchanged, with no throw and no mutation, so
 * callers can detect rejection cheaply via `result === state`.
 */

import { CONFIG } from '../config'
import type { GameState } from '../types'

/**
 * Deposits `amount` cash into the player's pooled bank balance.
 *
 * Validates:
 *   - `amount > 0`
 *   - `state.cash >= amount`
 *
 * On success: deducts `amount` from `state.cash`, adds `amount` to
 * `state.deposit` (defaulting the prior balance to `0` if unset).
 *
 * Rejected (returns the identical `state` reference, unchanged) when any
 * validation fails.
 */
export function deposit(state: GameState, amount: number): GameState {
  if (amount <= 0) return state
  if (state.cash < amount) return state

  return {
    ...state,
    cash: state.cash - amount,
    deposit: (state.deposit ?? 0) + amount,
  }
}

/**
 * Withdraws `amount` cash from the player's pooled bank balance back into
 * `state.cash`.
 *
 * Validates:
 *   - `amount > 0`
 *   - `(state.deposit ?? 0) >= amount`
 *
 * On success: deducts `amount` from `state.deposit`, adds `amount` to
 * `state.cash`.
 *
 * Rejected (returns the identical `state` reference, unchanged) when any
 * validation fails.
 */
export function withdraw(state: GameState, amount: number): GameState {
  if (amount <= 0) return state

  const balance = state.deposit ?? 0
  if (balance < amount) return state

  return {
    ...state,
    cash: state.cash + amount,
    deposit: balance - amount,
  }
}

/**
 * Compounds one day of deposit interest on the pooled balance, at the flat
 * `CONFIG.banking.globalDepositInterestDailyRate`.
 *
 * `newBalance = balance * (1 + rate)`.
 *
 * Intended to be called ONCE PER DAY-TICK — see /src/engine/turnLoop.ts's
 * `advanceDay`, which wires this in as a separate, additive step.
 *
 * Pure function: returns a NEW `GameState` on any change; returns the
 * identical `state` reference, unchanged, when there is nothing to accrue
 * (balance is 0 or unset). Also accumulates the interest earned onto
 * `state.depositInterestThisFiscalYear` (§10 taxable base — see
 * `runYearEnd`, tax.ts, the sole reader, which resets this field to `0` at
 * each fiscal year-end).
 */
export function accrueDepositInterest(state: GameState): GameState {
  const balance = state.deposit ?? 0
  if (balance <= 0) return state

  const interestEarned = balance * CONFIG.banking.globalDepositInterestDailyRate

  return {
    ...state,
    deposit: balance + interestEarned,
    depositInterestThisFiscalYear: (state.depositInterestThisFiscalYear ?? 0) + interestEarned,
  }
}
