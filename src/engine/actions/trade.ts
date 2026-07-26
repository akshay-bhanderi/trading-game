/**
 * Trade action (buy/sell) — Trade Winds of Selvara.
 *
 * Design doc references:
 *   - §2 "Cargo unit model" — 1 cargo slot = 1 unit of ANY commodity.
 *   - §10 "Taxable base = realized profit for the year (sum of sell proceeds
 *     - matched buy costs, FIFO)" — a forward reference. T012 does not
 *     compute or return realized profit itself; it only guarantees the FIFO
 *     lot ledger is consumed exactly right so a later caller (T030) can
 *     compute `qty * unitPrice - sum(consumed lots' qty * their unitCost)`.
 *
 * Pure TypeScript, zero React imports (see /src/engine/README.md).
 *
 * ---------------------------------------------------------------------------
 * Design decision: price is a CALLER-SUPPLIED parameter, not looked up
 * internally.
 * ---------------------------------------------------------------------------
 * This task (T012) predates the turn loop (T015), which is what will
 * eventually wire a live "current city market price" feed from the price
 * engine (/src/engine/priceEngine.ts, T008) into gameplay. Until that
 * wiring exists, `buy`/`sell` accept an explicit `unitPrice: number`
 * parameter — the caller (later the turn loop / UI, which will read
 * `state.priceStates[state.currentCity][goodId].currentPrice`) is
 * responsible for supplying the correct current-city live price. This file
 * never calls `computePrice` or reads `state.priceStates` itself.
 *
 * ---------------------------------------------------------------------------
 * Convention: follows the same pure-function precedent already established
 * by T011's `buyCargoUpgrade` (/src/engine/cargo.ts) and T014's `stay`
 * (/src/engine/actions/stay.ts) — on success this returns a NEW `GameState`;
 * on rejection (any validation failure) it returns the identical `state`
 * reference, unchanged, with no throw and no mutation, so callers can detect
 * rejection cheaply via `result === state`.
 *
 * ---------------------------------------------------------------------------
 * Design decision: avgBuyCost recompute-on-sell.
 * ---------------------------------------------------------------------------
 * After a sell consumes lots, `avgBuyCost` is RECOMPUTED from the remaining
 * lots (weighted average of what's left), so it always reflects the true
 * cost basis of what the player still holds. If the sell fully empties the
 * holding (no lots remain), `avgBuyCost` is left at its last-known value
 * rather than reset to 0 — see the next decision, since an emptied holding
 * is removed entirely anyway, this only matters transiently.
 *
 * ---------------------------------------------------------------------------
 * Design decision: empty-holding-after-full-sell.
 * ---------------------------------------------------------------------------
 * If a sell reduces a `CargoHolding`'s `qty` to 0 (all lots consumed), the
 * `CargoHolding` entry is REMOVED from `state.cargo` entirely (rather than
 * left behind as `{ qty: 0, lots: [] }`). Rationale: `cargoUsed` (T011)
 * already treats a missing entry and a qty-0 entry identically (it only
 * sums `qty`), so removing the entry is a harmless simplification that also
 * keeps `Object.keys(state.cargo)` an accurate "goods I currently own"
 * list for the UI (§12 Market screen), rather than accumulating stale
 * zero-qty entries for every good ever bought and fully sold.
 */

import { cargoUsed } from '../cargo'
import type { CargoHolding, CargoLot, GameState, GoodId } from '../types'

/**
 * Buys `qty` units of `goodId` at `unitPrice` (caller-supplied — see the
 * file-level doc comment on why price is not looked up internally).
 *
 * Validates:
 *   - `qty > 0`
 *   - `state.cash >= qty * unitPrice`
 *   - `cargoUsed(state) + qty <= state.cargoCapacity` (reuses T011's
 *     `cargoUsed` rather than reimplementing capacity accounting)
 *
 * On success: deducts `qty * unitPrice` from cash; appends a new FIFO lot
 * `{ qty, unitCost: unitPrice }` to `state.cargo[goodId].lots` (creating the
 * `CargoHolding` if this is the player's first-ever purchase of this good);
 * recomputes `qty` (sum of all lots) and `avgBuyCost` (weighted average
 * across all lots) on that holding; increments
 * `state.cumulativeTradeVolume` by `qty * unitPrice` (§8 rank formula input,
 * T021).
 *
 * Rejected (returns the identical `state` reference, unchanged) when any
 * validation fails.
 */
export function buy(state: GameState, goodId: GoodId, qty: number, unitPrice: number): GameState {
  if (qty <= 0) return state

  const cost = qty * unitPrice
  if (state.cash < cost) return state
  if (cargoUsed(state) + qty > state.cargoCapacity) return state

  const existing = state.cargo[goodId]
  const lots: CargoLot[] = existing ? [...existing.lots, { qty, unitCost: unitPrice }] : [{ qty, unitCost: unitPrice }]

  const holding: CargoHolding = {
    goodId,
    qty: sumLots(lots),
    avgBuyCost: weightedAvgCost(lots),
    lots,
  }

  return {
    ...state,
    cash: state.cash - cost,
    cargo: { ...state.cargo, [goodId]: holding },
    cumulativeTradeVolume: state.cumulativeTradeVolume + cost,
  }
}

/**
 * Sells `qty` units of `goodId` at `unitPrice` (caller-supplied — see the
 * file-level doc comment on why price is not looked up internally).
 *
 * Validates:
 *   - `qty > 0`
 *   - the player owns at least `qty` units of that good
 *     (`state.cargo[goodId]?.qty >= qty`)
 *
 * On success: consumes `qty` units from `state.cargo[goodId].lots`, OLDEST
 * LOT FIRST (FIFO) — fully-consumed lots are removed, a partially-consumed
 * lot has its `qty` reduced, and lots not reached are left byte-for-byte
 * untouched. Adds `qty * unitPrice` to cash. Recomputes `avgBuyCost` from
 * the remaining lots (see file-level doc comment on this decision), or, if
 * the holding is now fully emptied, removes the `CargoHolding` entry from
 * `state.cargo` entirely (see file-level doc comment on this decision).
 * Increments `state.cumulativeTradeVolume` by `qty * unitPrice` (sell
 * proceeds count as volume too, per the task brief).
 *
 * Rejected (returns the identical `state` reference, unchanged) when any
 * validation fails.
 */
export function sell(state: GameState, goodId: GoodId, qty: number, unitPrice: number): GameState {
  if (qty <= 0) return state

  const holding = state.cargo[goodId]
  if (!holding || holding.qty < qty) return state

  let remainingToConsume = qty
  const remainingLots: CargoLot[] = []

  for (const lot of holding.lots) {
    if (remainingToConsume <= 0) {
      // This lot and everything after it is untouched.
      remainingLots.push(lot)
      continue
    }

    if (lot.qty <= remainingToConsume) {
      // Fully consumed — drop it, keep walking.
      remainingToConsume -= lot.qty
    } else {
      // Partially consumed — keep the remainder at the same unit cost.
      remainingLots.push({ qty: lot.qty - remainingToConsume, unitCost: lot.unitCost })
      remainingToConsume = 0
    }
  }

  const proceeds = qty * unitPrice
  const newCargo = { ...state.cargo }

  if (remainingLots.length === 0) {
    // Holding fully emptied — remove the entry entirely (see doc comment).
    delete newCargo[goodId]
  } else {
    newCargo[goodId] = {
      goodId,
      qty: sumLots(remainingLots),
      avgBuyCost: weightedAvgCost(remainingLots),
      lots: remainingLots,
    }
  }

  return {
    ...state,
    cash: state.cash + proceeds,
    cargo: newCargo,
    cumulativeTradeVolume: state.cumulativeTradeVolume + proceeds,
  }
}

function sumLots(lots: CargoLot[]): number {
  return lots.reduce((sum, lot) => sum + lot.qty, 0)
}

/** Weighted average unit cost across all lots, for UI display (§12). */
function weightedAvgCost(lots: CargoLot[]): number {
  const totalQty = sumLots(lots)
  if (totalQty === 0) return 0
  const totalCost = lots.reduce((sum, lot) => sum + lot.qty * lot.unitCost, 0)
  return totalCost / totalQty
}
