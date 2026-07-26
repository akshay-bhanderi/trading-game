/**
 * Net worth calculation + peak net worth tracking — Trade Winds of Selvara.
 *
 * Design doc reference:
 *   §4 — "Cities unlock by net worth (cash + deposits + goods at last-known
 *   prices - debt)."
 *   §1 — "Score = peak net worth ever reached" during the run.
 *
 * Pure TypeScript, zero React imports (see /src/engine/README.md).
 *
 * Formula (matches §4 exactly):
 *   netWorth = cash
 *            + sum(all bankAccounts' depositBalance)
 *            + sum(carried goods valued at last-known price)
 *            − sum(all bankAccounts' outstanding debt)
 *
 * where "outstanding debt" for a bank account is `loan.principal +
 * loan.accruedInterest` when `loan` is non-null, and 0 when there is no
 * active loan there (§9's BankAccount shape already enforces at most one
 * loan per bank).
 *
 * Valuing carried goods — design decision (documented per the task brief):
 * `state.cargo` (what the player is physically carrying right now) does not
 * carry a city of its own; it travels with the player. §4's "goods at
 * last-known prices" is written from the perspective of the *last city that
 * price was observed in*, so the only price information directly relevant
 * to something currently in your hold is the player's CURRENT city's
 * last-seen price for that good (`state.priceStates[state.currentCity]?.[goodId]?.lastSeenPrice`)
 * — that's the freshest, most defensible "last-known price" available for
 * cargo that isn't tied to any particular city.
 *
 * Fallback when no price has ever been observed for that good in the
 * current city (e.g. a good bought elsewhere and carried into a city never
 * visited before, or a synthetic test fixture): fall back to the good's
 * data-file `basePrice` (`/src/engine/data/goods.ts`). This is chosen over
 * falling back to 0 because valuing held inventory at $0 would understate
 * net worth for something the player demonstrably paid real cash for and
 * still owns; `basePrice` is a reasonable, deterministic stand-in absent any
 * observed market price. In practice this edge case should rarely matter in
 * a real run — cargo starts empty at day 1 before any price has been seen —
 * but it matters for constructing minimal test fixtures, so the behavior is
 * made explicit and consistent here rather than left to chance.
 */

import { GOODS } from './data/goods'
import type { GameState } from './types'

/** O(1) good-id -> basePrice lookup, built once from the goods data file. */
const BASE_PRICE_BY_GOOD_ID: Record<string, number> = Object.fromEntries(
  GOODS.map((good) => [good.id, good.basePrice]),
)

/**
 * Computes the player's current net worth per §4's formula:
 * cash + deposits + (carried goods valued at the current city's last-known
 * price) − outstanding bank debt. May be negative (see module doc /
 * `updatePeakNetWorth` — no clamping to 0 anywhere in this file).
 */
export function calcNetWorth(state: GameState): number {
  let deposits = 0
  let debt = 0
  for (const cityId in state.bankAccounts) {
    const account = state.bankAccounts[cityId]
    if (!account) continue
    deposits += account.depositBalance
    if (account.loan) {
      debt += account.loan.principal + account.loan.accruedInterest
    }
  }

  const pricesHere = state.priceStates[state.currentCity]

  let goodsValue = 0
  for (const goodId in state.cargo) {
    const holding = state.cargo[goodId]
    if (!holding) continue
    const lastSeenPrice = pricesHere?.[goodId]?.lastSeenPrice
    const unitPrice = lastSeenPrice ?? BASE_PRICE_BY_GOOD_ID[goodId] ?? 0
    goodsValue += holding.qty * unitPrice
  }

  return state.cash + deposits + goodsValue - debt
}

/**
 * Updates `state.peakNetWorth` to the higher of its current value and the
 * freshly-computed net worth. Returns a NEW `GameState` (does not mutate),
 * matching the pure-function convention established by `cargo.ts`/`stay.ts`.
 *
 * Intended to be called once per day-tick, wired into the turn loop by T015
 * (not built here — this file only provides the pure helper).
 */
export function updatePeakNetWorth(state: GameState): GameState {
  const netWorth = calcNetWorth(state)
  if (netWorth <= state.peakNetWorth) {
    return state
  }
  return {
    ...state,
    peakNetWorth: netWorth,
  }
}
