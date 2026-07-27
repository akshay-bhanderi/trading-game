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
 * Formula (matches §4 exactly, extended by T048/§14 and T064/§16 — see those
 * additions' own doc comments below for the warehouse/plane terms):
 *   netWorth = cash
 *            + sum(all bankAccounts' depositBalance)
 *            + sum(carried goods valued at last-known price)
 *            + sum(warehouse-stored goods valued at each city's own
 *              last-known price, §14)
 *            + sum(owned planes' current depreciated value, §16)
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
 *
 * ---------------------------------------------------------------------------
 * T048 addition (§14 Warehouse Storage) — stored goods valued at EACH CITY'S
 * OWN last-known price, not `state.currentCity`'s
 * ---------------------------------------------------------------------------
 * `state.warehouseGoods` (see /src/engine/warehouse.ts's file header) is
 * keyed by the city each holding physically sits in — unlike carried cargo,
 * which travels with the player and has no city of its own (hence the
 * current-city fallback above), a warehouse IS tied to one specific city.
 * §14 says stored goods count toward net worth "at last-known local price" —
 * "local" here unambiguously means THAT city's own price history, valued via
 * `warehouse.ts`'s `calcWarehouseGoodsValue(state, cityId)` (which applies
 * the identical basePrice-fallback rule as above, per city). This file sums
 * that helper's result across EVERY city the player owns a warehouse in —
 * including cities the player isn't currently standing in — since §14
 * intentionally makes stored goods visible to net worth regardless of where
 * the player currently is (that's the whole point of a "distributed storage
 * network... without committing cargo space"). This does not conflict with
 * §6's "never leak live remote prices" invariant: `calcWarehouseGoodsValue`
 * only ever reads `lastSeenPrice` (never `currentPrice`), exactly like this
 * file's own cargo-valuation loop above.
 *
 * ---------------------------------------------------------------------------
 * T064 addition (§16 Aviation) — owned planes count toward net worth at
 * their current DEPRECIATED value
 * ---------------------------------------------------------------------------
 * §16: "a plane's value for net worth (§4) and for sale starts at 90% of
 * purchase price and depreciates 2%/game-year, floored at 40%." Every plane
 * in `state.planes` contributes `planeDepreciatedValue(plane, state.day)`
 * (aviation.ts) to the formula below, added alongside cash/deposits/goods
 * and before debt is subtracted — planes are an ASSET like cargo or
 * deposits, not a liability, regardless of their current lease status
 * (Idle/Leased/Personal all count the same toward net worth; only the sale
 * price differs from lease income, and neither is relevant to THIS
 * calculation). `state.planes ?? []` mirrors every other optional-array
 * field's read convention elsewhere in this codebase.
 *
 * ---------------------------------------------------------------------------
 * T067 addition — `calcPhase2AssetValue`: a separate "how much is tied up in
 * Phase 2" lens, NOT folded into `calcNetWorth` above
 * ---------------------------------------------------------------------------
 * The §11 bot harness (T028) needs to see whether §14-§16 actually move net
 * worth once a bot opportunistically invests in them (T067's newsBot
 * extension). `calcPhase2AssetValue` reports the current BOOK VALUE held
 * across all three systems: warehouse build equity (`cumulativeBuildCost` —
 * what was paid in, not the 50% sell-back price, mirroring how plane value
 * above is counted at its depreciated value, not its liquidation-fee-adjusted
 * resale price) plus currently-stored warehouse goods, hotel cumulative
 * investment (`cumulativeInvested`, same paid-in-not-sell-back-halved
 * treatment), and plane depreciated value.
 *
 * Deliberately NOT wired into `calcNetWorth` itself: hotel investment was
 * never part of the §4 net-worth formula (only warehouse goods and plane
 * value were, via T048/T064 above), and changing that formula is a T068
 * balance decision, not something to slip in silently as a side effect of a
 * bot-harness reporting task. This function OVERLAPS with `calcNetWorth` on
 * purpose (warehouse goods value and plane value are counted by both) — it
 * answers a different question ("how much of what I have is Phase 2
 * assets?"), not "what should be added on top of net worth?"
 */

import { CITIES } from './data/cities'
import { GOODS } from './data/goods'
import { calcWarehouseGoodsValue, cumulativeBuildCost } from './warehouse'
import { cumulativeInvested } from './hotel'
import { planeDepreciatedValue } from './aviation'
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

  // T048 addition — see file header. Sums every city's stored warehouse
  // goods at THAT city's own last-known price (not just `state.currentCity`'s).
  let warehouseGoodsValue = 0
  if (state.warehouseGoods) {
    for (const cityId of Object.keys(state.warehouseGoods)) {
      warehouseGoodsValue += calcWarehouseGoodsValue(state, cityId)
    }
  }

  // T064 addition — see file header. Sums every owned plane's current
  // depreciated value.
  let planesValue = 0
  for (const plane of state.planes ?? []) {
    planesValue += planeDepreciatedValue(plane, state.day)
  }

  return state.cash + deposits + goodsValue + warehouseGoodsValue + planesValue - debt
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

/**
 * Book value currently held across the three Phase 2 systems (§14 Warehouse,
 * §15 Hotel, §16 Aviation) — see this file's own T067 doc-comment section
 * above for why this is a SEPARATE lens from `calcNetWorth`, not an addend to
 * it. Used by the §11 bot harness (T028/T067) to report a "Phase 2 asset
 * value" stat alongside net worth, so a balance pass (T068) can see how much
 * of a bot's net worth actually comes from these systems.
 */
export function calcPhase2AssetValue(state: GameState): number {
  let warehouseValue = 0
  if (state.warehouses) {
    for (const cityId of Object.keys(state.warehouses)) {
      const warehouse = state.warehouses[cityId]
      if (!warehouse || warehouse.floorsBuilt <= 0) continue
      warehouseValue += cumulativeBuildCost(warehouse.floorsBuilt)
      warehouseValue += calcWarehouseGoodsValue(state, cityId)
    }
  }

  let hotelValue = 0
  if (state.hotels) {
    for (const cityId of Object.keys(state.hotels)) {
      const holding = state.hotels[cityId]
      if (!holding) continue
      const city = CITIES.find((c) => c.id === cityId)
      if (!city) continue
      hotelValue += cumulativeInvested(city, holding.tier)
    }
  }

  let planeValue = 0
  for (const plane of state.planes ?? []) {
    planeValue += planeDepreciatedValue(plane, state.day)
  }

  return warehouseValue + hotelValue + planeValue
}
