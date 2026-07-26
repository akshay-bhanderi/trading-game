/**
 * Warehouse storage engine — Trade Winds of Selvara.
 *
 * Design doc reference: §14 "Warehouse Storage (per-city, floor-based)" —
 *   "A second, separate capacity system from Cargo (§2)... you can only
 *   buy/sell them while physically in that city. No remote trading, ever...
 *   one warehouse per city... up to 6 floors... built in order (can't skip
 *   ahead)... Maintenance across every owned warehouse/floor bills at
 *   year-end alongside tax; unpaid maintenance accrues as Small-bank-rate
 *   debt... Stored goods count toward net worth at last-known local price...
 *   Warehouse fire — low-probability, destroys 10-40% of one city's stored
 *   goods. Optional insurance (2%/year of stored goods' value, billed with
 *   maintenance) caps fire loss at 10%... Sell-back: the whole warehouse
 *   liquidates for 50% of total build cost."
 *
 * Pure TypeScript, zero React imports (see /src/engine/README.md).
 *
 * ---------------------------------------------------------------------------
 * Convention: follows the exact pure-function precedent established by
 * cargo.ts's `buyCargoUpgrade` / actions/stay.ts's `stay` / trade.ts's
 * `buy`/`sell` — on success every function here returns a NEW `GameState`;
 * on rejection (any validation failure) it returns the IDENTICAL `state`
 * reference, unchanged, with no throw and no mutation, so callers can detect
 * rejection cheaply via `result === state`.
 *
 * ---------------------------------------------------------------------------
 * JUDGMENT CALL — physical presence: required for goods movement, NOT for
 * ownership/financial actions
 * ---------------------------------------------------------------------------
 * §14's own opening paragraph is explicit that GOODS trading is presence-
 * gated ("you can only buy/sell them while physically in that city. No
 * remote trading, ever" — echoing §6's identical rule for the Market). So
 * `storeGoods`/`withdrawGoods` both require `state.currentCity === cityId`.
 *
 * `buildWarehouseFloor`/`buyWarehouseInsurance`/`sellWarehouse`, by contrast,
 * do NOT require presence. §14 frames ownership itself as a portfolio/
 * financial decision, not a goods transaction: "buildable in any city you've
 * unlocked... own warehouses in several cities at once — a distributed
 * storage network" — the whole point is managing several cities' warehouses
 * without needing to physically visit each one for every decision (§15
 * Hotel's near-identical "own hotels in as many cities as you want" phrasing
 * confirms this is the intended pattern for Phase 2's ownership systems in
 * general, not a one-off). `buildWarehouseFloor` only requires the target
 * city be in `state.unlockedCityIds` (mirroring "any city you've unlocked")
 * plus sufficient cash. This mirrors `ca.ts`'s `hireCA`, which similarly
 * treats a financial/administrative action as distinct from a goods
 * transaction, though CA hiring happens to ALSO require presence for a
 * different reason (it's gated by the CURRENT city's own bank tier, not by
 * §10's rules on remote trading).
 *
 * ---------------------------------------------------------------------------
 * DESIGN — `warehouseGoods` reuses `Cargo`'s FIFO-lot shape (cost-basis
 * preserving moves)
 * ---------------------------------------------------------------------------
 * `storeGoods`/`withdrawGoods` move goods between `state.cargo[goodId]` and
 * `state.warehouseGoods[cityId][goodId]` — NOT a sale (§10: only a Market
 * `sell()` realizes taxable profit; moving inventory into/out of storage
 * must never touch `realizedProfitThisFiscalYear`). Since a later real
 * Market sale (only reachable after `withdrawGoods` returns goods to
 * `state.cargo`) needs FIFO lots with intact `unitCost` to compute correct
 * realized profit (trade.ts's `sell`), `warehouseGoods` reuses the EXACT SAME
 * `Cargo`/`CargoHolding`/`CargoLot` shape `state.cargo` already uses, and
 * both `storeGoods`/`withdrawGoods` physically move whole/partial FIFO lots
 * (oldest-first, via the local `consumeFifo` helper below — the same walk
 * trade.ts's `sell()` already does, duplicated here in a form that returns
 * the CONSUMED lots themselves, with cost basis, rather than discarding them
 * into a single cost-basis number) rather than tracking a bare quantity.
 * This makes store->withdraw->sell round-trip to the exact same FIFO/tax
 * outcome as if the goods had simply stayed in cargo the whole time.
 *
 * ---------------------------------------------------------------------------
 * DESIGN — `withdrawGoods` DOES check cargo capacity (a documented
 * clarification of the task brief's "don't touch cargo capacity")
 * ---------------------------------------------------------------------------
 * "Don't touch cargo capacity" (T048) means neither function ever changes
 * `state.cargoCapacity` itself, and `storeGoods` frees cargo space without
 * counting against it. It does NOT mean `withdrawGoods` may violate the
 * cargo-capacity invariant that `buy()` (trade.ts) already enforces
 * everywhere else — withdrawing physically moves goods back into cargo, so
 * `cargoUsed(state) + qty <= state.cargoCapacity` is checked and enforced,
 * exactly like `buy()`'s own capacity check. Letting withdraw silently blow
 * past the cap would be an inconsistency bug, not a feature; the doc gives
 * no indication cargo's finite-capacity rule is meant to have a loophole via
 * the warehouse.
 *
 * ---------------------------------------------------------------------------
 * DESIGN — sell-back rejects if goods are still stored (task's own
 * recommendation)
 * ---------------------------------------------------------------------------
 * `sellWarehouse` rejects outright if `warehouseGoodsUsed(state, cityId) > 0`
 * — the task brief's own recommended resolution to the "are stored goods
 * forfeited or must they be withdrawn first" ambiguity, adopted verbatim: it
 * avoids inventing an arbitrary forfeiture/liquidation rule for goods that
 * would otherwise vanish from both `state.cargo` AND `state.warehouseGoods`
 * with no clean value accounting. The player must `withdrawGoods` everything
 * out first (which, per the presence rule above, means physically being in
 * that city) before `sellWarehouse` will succeed.
 *
 * ---------------------------------------------------------------------------
 * DESIGN — Warehouse fire: a DEDICATED daily roll, NOT the §7 event pipeline
 * ---------------------------------------------------------------------------
 * See eventTable.ts's file header ("T050 ADDITION") for the full rationale.
 * Summary: Warehouse fire's effect ("destroy 10-40% of stored goods") has no
 * representation in the `Event`/`computePrice` price-multiplier pipeline, so
 * rather than bolt a second effect kind onto that shared machinery for one
 * outlier event type, `checkWarehouseFires` below is a small, self-contained,
 * config-driven daily check — independent RNG substream (same per-`(seed,
 * day)`-hash pattern turnLoop.ts already uses for its other daily rolls),
 * wired directly into `advanceDay`. It never creates an `Event` record; it
 * reads `CONFIG.warehouse.fire.dailyProbability` per city-with-a-warehouse,
 * and on a hit, destroys `CONFIG.warehouse.fire.lossPct` (10-40%, uniform) of
 * every good currently stored there — or the fixed, capped
 * `insuredLossPct` (10%) instead, if that city's warehouse is insured (§14).
 * Destruction consumes FIFO lots oldest-first via the same `consumeFifo`
 * helper `storeGoods`/`withdrawGoods` use (cost basis of what's destroyed is
 * simply discarded — there is no "realized loss" tax concept for destroyed
 * inventory anywhere in §10, so this deliberately does NOT touch
 * `realizedProfitThisFiscalYear`).
 *
 * ---------------------------------------------------------------------------
 * DESIGN — warehouse maintenance/insurance billing lives HERE, deduction
 * happens in tax.ts
 * ---------------------------------------------------------------------------
 * `calcWarehouseAnnualBill` (below) computes ONE combined number — floor
 * maintenance summed across every owned floor in every city, PLUS a 2%/year
 * insurance premium on each insured city's CURRENT stored-goods value — but
 * does not deduct anything itself. `tax.ts`'s `runYearEnd` (T049) is the
 * sole place any deduction from cash/deposits happens (mirroring how it
 * already owns the tax deduction), and reads this function to fold the
 * warehouse bill into the SAME year-end tick, AFTER tax is already deducted
 * (a documented ordering choice — see tax.ts's own T049 addition for why).
 * Any of THIS bill's shortfall becomes/tops-up `state.warehouseMaintenanceDebt`
 * — a dedicated, Small-bank-rate debt bucket, structurally identical to (but
 * always kept SEPARATE from) `state.taxDebt`'s Huge-rate penalty debt. See
 * that field's own doc comment in types.ts for the full "why separate"
 * rationale — §14 is explicit these are two different rates/buckets.
 * `accrueWarehouseMaintenanceDebtInterest`/`repayWarehouseMaintenanceDebt`
 * below mirror `accrueTaxDebtInterest`/`repayTaxDebt` (tax.ts) almost
 * exactly, at `CONFIG.banking.loanInterestDailyRates.Small` instead of
 * `CONFIG.tax.forcedLoanPenaltyDailyRate` — and, matching `accrueTaxDebtInterest`'s
 * own precedent, this simple daily interest is NOT scaled by the difficulty
 * `loanInterestMultiplier` (§3): both forced-shortfall debts are modeled as a
 * fixed penalty/carrying rate the doc names explicitly, not an ordinary bank
 * loan whose rate difficulty is meant to modulate.
 *
 * ---------------------------------------------------------------------------
 * DESIGN — "cost" vs "cumulative build cost" for floors
 * ---------------------------------------------------------------------------
 * See config.ts's `WarehouseFloorTierConfig` doc comment: each floor's
 * `buildCost` is that floor's OWN marginal price (what `buildWarehouseFloor`
 * actually charges to go from `floorsBuilt = n-1` to `n`). `cumulativeBuildCost`
 * below sums every OWNED floor's own `buildCost` to get the total money ever
 * spent building up to the current floor count — this total (not any single
 * floor's price) is what `sellWarehouse`'s 50% salvage rate applies to, per
 * §14: "liquidates for 50% of total build cost".
 */

import { CONFIG } from './config'
import { cargoUsed } from './cargo'
import { GOODS } from './data/goods'
import type { Rng } from './rng'
import type { Cargo, CargoHolding, CargoLot, CityId, GameState, GoodId, WarehouseState } from './types'

// ---------------------------------------------------------------------------
// Small local helpers — intentionally duplicated (rather than imported) from
// trade.ts's private `sumLots`/`weightedAvgCost` and its inline FIFO-walk,
// since trade.ts doesn't export them and this file needs a variant that
// returns the CONSUMED lots themselves (with cost basis intact), not just a
// summed cost — see file header. Same tiny-duplication precedent
// turnLoop.ts already sets for its own per-day RNG hash helper.
// ---------------------------------------------------------------------------

function sumLots(lots: CargoLot[]): number {
  return lots.reduce((sum, lot) => sum + lot.qty, 0)
}

function weightedAvgCost(lots: CargoLot[]): number {
  const totalQty = sumLots(lots)
  if (totalQty === 0) return 0
  const totalCost = lots.reduce((sum, lot) => sum + lot.qty * lot.unitCost, 0)
  return totalCost / totalQty
}

/** Consumes `qty` units from `lots`, OLDEST LOT FIRST (FIFO), returning both
 * the lots actually consumed (their own cost basis intact — needed by
 * `storeGoods`/`withdrawGoods` to move inventory without losing FIFO tax
 * history) and whatever lots remain untouched/partially-consumed. Caller is
 * responsible for having already validated `sumLots(lots) >= qty`. */
function consumeFifo(lots: CargoLot[], qty: number): { consumedLots: CargoLot[]; remainingLots: CargoLot[] } {
  let remainingToConsume = qty
  const consumedLots: CargoLot[] = []
  const remainingLots: CargoLot[] = []

  for (const lot of lots) {
    if (remainingToConsume <= 0) {
      remainingLots.push(lot)
      continue
    }

    if (lot.qty <= remainingToConsume) {
      consumedLots.push(lot)
      remainingToConsume -= lot.qty
    } else {
      consumedLots.push({ qty: remainingToConsume, unitCost: lot.unitCost })
      remainingLots.push({ qty: lot.qty - remainingToConsume, unitCost: lot.unitCost })
      remainingToConsume = 0
    }
  }

  return { consumedLots, remainingLots }
}

/** O(1) good-id -> basePrice lookup, same fallback technique netWorth.ts uses
 * for valuing cargo with no observed price yet — duplicated here (rather
 * than imported) since netWorth.ts doesn't export its copy; see this file's
 * `calcWarehouseGoodsValue` for where it's used. */
const BASE_PRICE_BY_GOOD_ID: Record<string, number> = Object.fromEntries(
  GOODS.map((good) => [good.id, good.basePrice]),
)

// ---------------------------------------------------------------------------
// Capacity / cost lookups
// ---------------------------------------------------------------------------

/** Total warehouse storage capacity currently built in `cityId` — 0 if the
 * player owns no warehouse there. */
export function warehouseCapacity(state: GameState, cityId: CityId): number {
  const floorsBuilt = state.warehouses?.[cityId]?.floorsBuilt ?? 0
  if (floorsBuilt <= 0) return 0
  return CONFIG.warehouse.floors[floorsBuilt]?.cumulativeCapacity ?? 0
}

/** Sums units currently stored in `cityId`'s warehouse across ALL goods —
 * mirrors cargo.ts's `cargoUsed`, one level deeper (per-city). */
export function warehouseGoodsUsed(state: GameState, cityId: CityId): number {
  const cityGoods = state.warehouseGoods?.[cityId]
  if (!cityGoods) return 0

  let total = 0
  for (const goodId in cityGoods) {
    const holding = cityGoods[goodId]
    if (holding) total += holding.qty
  }
  return total
}

/** Total money ever spent building up to `floorsBuilt` floors — sum of each
 * owned floor's own marginal `buildCost` (see file header's "cost vs
 * cumulative build cost" section). Used by `sellWarehouse`'s 50% salvage. */
export function cumulativeBuildCost(floorsBuilt: number): number {
  let total = 0
  for (let floor = 1; floor <= floorsBuilt; floor++) {
    total += CONFIG.warehouse.floors[floor]?.buildCost ?? 0
  }
  return total
}

/** Values everything stored in `cityId`'s warehouse at that CITY'S OWN
 * last-known price (§14: "at last-known LOCAL price" — deliberately NOT
 * `state.currentCity`'s price, unlike how `netWorth.ts` values carried
 * cargo, since a warehouse is tied to one specific city and its own price
 * history is the only one that makes sense for goods sitting there). Falls
 * back to the good's `basePrice` when no price has ever been observed in
 * that city (mirrors `netWorth.ts`'s identical fallback rationale). Used by
 * both `calcWarehouseAnnualBill`'s insurance-premium calculation and
 * `netWorth.ts`'s own T048 extension. */
export function calcWarehouseGoodsValue(state: GameState, cityId: CityId): number {
  const cityGoods = state.warehouseGoods?.[cityId]
  if (!cityGoods) return 0

  const pricesHere = state.priceStates[cityId]

  let value = 0
  for (const goodId in cityGoods) {
    const holding = cityGoods[goodId]
    if (!holding) continue
    const lastSeenPrice = pricesHere?.[goodId]?.lastSeenPrice
    const unitPrice = lastSeenPrice ?? BASE_PRICE_BY_GOOD_ID[goodId] ?? 0
    value += holding.qty * unitPrice
  }
  return value
}

/**
 * Sums annual floor maintenance (every owned floor, every city) PLUS annual
 * insurance premiums (2% of current stored value, every INSURED city) into
 * one combined "warehouse bill" number — see file header for why this file
 * only COMPUTES the bill while `tax.ts`'s `runYearEnd` owns actually
 * deducting it (T049/T050).
 */
export function calcWarehouseAnnualBill(state: GameState): number {
  if (!state.warehouses) return 0

  let total = 0
  for (const cityId of Object.keys(state.warehouses)) {
    const warehouse = state.warehouses[cityId]
    if (!warehouse || warehouse.floorsBuilt <= 0) continue

    for (let floor = 1; floor <= warehouse.floorsBuilt; floor++) {
      total += CONFIG.warehouse.floors[floor]?.annualMaintenance ?? 0
    }

    if (warehouse.insured) {
      total += calcWarehouseGoodsValue(state, cityId) * CONFIG.warehouse.fire.insuranceAnnualRatePctOfStoredValue
    }
  }
  return total
}

// ---------------------------------------------------------------------------
// Ownership: build / sell-back / insurance toggle
// ---------------------------------------------------------------------------

/**
 * Buys the next warehouse floor in sequence for `cityId` (T047).
 *
 * Validates:
 *   - `cityId` is in `state.unlockedCityIds` (§14: "buildable in any city
 *     you've unlocked" — no presence requirement, see file header)
 *   - the city hasn't already reached `CONFIG.warehouse.maxFloors` (6)
 *   - `state.cash >= ` the NEXT floor's `buildCost` (skip-ahead is
 *     structurally impossible: there is no target-floor parameter, exactly
 *     mirroring cargo.ts's `buyCargoUpgrade` design)
 *
 * On success: deducts that floor's `buildCost` from cash, increments
 * `state.warehouses[cityId].floorsBuilt` by 1 (creating the entry, with
 * `insured: false`, if this is the player's first floor in this city).
 *
 * Rejected (returns the identical `state` reference, unchanged) when any
 * validation fails.
 */
export function buildWarehouseFloor(state: GameState, cityId: CityId): GameState {
  if (!state.unlockedCityIds.includes(cityId)) return state

  const existing = state.warehouses?.[cityId]
  const currentFloors = existing?.floorsBuilt ?? 0
  if (currentFloors >= CONFIG.warehouse.maxFloors) return state

  const nextFloor = currentFloors + 1
  const tier = CONFIG.warehouse.floors[nextFloor]
  if (!tier) return state // defensive — should never happen given the maxFloors check above

  if (state.cash < tier.buildCost) return state

  const warehouseState: WarehouseState = {
    floorsBuilt: nextFloor,
    insured: existing?.insured ?? false,
  }

  return {
    ...state,
    cash: state.cash - tier.buildCost,
    warehouses: { ...state.warehouses, [cityId]: warehouseState },
  }
}

/**
 * Toggles the optional fire-insurance policy for `cityId`'s warehouse
 * (T050) — ON if currently off, OFF if currently on. A single toggle
 * function (rather than separate buy/cancel functions) matches T052's UI as
 * an "insurance toggle" switch. The premium itself (2%/year of stored value)
 * is never charged HERE — it's billed at year-end alongside maintenance
 * (see `calcWarehouseAnnualBill` / tax.ts's `runYearEnd`), so turning
 * insurance on mid-year costs nothing until the next year-end statement, and
 * turning it off immediately stops it being billed from then on.
 *
 * Rejected (returns the identical `state` reference, unchanged) when the
 * player owns no warehouse floors in `cityId` yet (nothing to insure).
 */
export function buyWarehouseInsurance(state: GameState, cityId: CityId): GameState {
  const existing = state.warehouses?.[cityId]
  if (!existing || existing.floorsBuilt <= 0) return state

  return {
    ...state,
    warehouses: { ...state.warehouses, [cityId]: { ...existing, insured: !existing.insured } },
  }
}

/**
 * Liquidates ALL floors of `cityId`'s warehouse for 50% of its total
 * cumulative build cost (T051, §14).
 *
 * Validates:
 *   - the player owns at least one floor there
 *   - `warehouseGoodsUsed(state, cityId) === 0` — see file header's
 *     "sell-back rejects if goods are still stored" design decision;
 *     withdraw everything first (`withdrawGoods`, which requires physical
 *     presence)
 *
 * On success: adds `cumulativeBuildCost(floorsBuilt) *
 * CONFIG.warehouse.sellBackFraction` to cash, and removes the city's entry
 * from `state.warehouses` entirely (equivalent to `floorsBuilt: 0`,
 * `insured: false` per that type's own "missing === zero" convention).
 * Any outstanding `state.warehouseMaintenanceDebt` is left untouched — that
 * debt is a standing obligation independent of current warehouse ownership,
 * exactly like `taxDebt` persists regardless of the player's current CA/cash
 * standing.
 *
 * Rejected (returns the identical `state` reference, unchanged) when either
 * validation fails.
 */
export function sellWarehouse(state: GameState, cityId: CityId): GameState {
  const existing = state.warehouses?.[cityId]
  if (!existing || existing.floorsBuilt <= 0) return state
  if (warehouseGoodsUsed(state, cityId) > 0) return state

  const proceeds = cumulativeBuildCost(existing.floorsBuilt) * CONFIG.warehouse.sellBackFraction

  const newWarehouses = { ...state.warehouses }
  delete newWarehouses[cityId]

  return {
    ...state,
    cash: state.cash + proceeds,
    warehouses: newWarehouses,
  }
}

// ---------------------------------------------------------------------------
// Store / withdraw goods (T048)
// ---------------------------------------------------------------------------

/**
 * Moves `qty` units of `goodId` from the player's cargo into `cityId`'s
 * warehouse (T048).
 *
 * Validates:
 *   - `state.currentCity === cityId` (§14: no remote trading — see file
 *     header)
 *   - `qty > 0`
 *   - the player owns at least `qty` units of `goodId` in cargo
 *   - the city has at least one warehouse floor built
 *   - `warehouseGoodsUsed(state, cityId) + qty <= warehouseCapacity(state,
 *     cityId)` — the built floors' cumulative capacity
 *
 * On success: consumes `qty` units from `state.cargo[goodId]`'s FIFO lots
 * (oldest first — removing the holding entirely if fully emptied, mirroring
 * trade.ts's `sell()`), and appends those SAME lots (cost basis intact) onto
 * `state.warehouseGoods[cityId][goodId]`. Does NOT touch `cargoCapacity`,
 * `cumulativeTradeVolume`, or `realizedProfitThisFiscalYear` — this is an
 * inventory relocation, not a trade (see file header).
 *
 * Rejected (returns the identical `state` reference, unchanged) when any
 * validation fails.
 */
export function storeGoods(state: GameState, cityId: CityId, goodId: GoodId, qty: number): GameState {
  if (state.currentCity !== cityId) return state
  if (qty <= 0) return state

  const floorsBuilt = state.warehouses?.[cityId]?.floorsBuilt ?? 0
  if (floorsBuilt <= 0) return state

  const holding = state.cargo[goodId]
  if (!holding || holding.qty < qty) return state

  const capacity = warehouseCapacity(state, cityId)
  if (warehouseGoodsUsed(state, cityId) + qty > capacity) return state

  const { consumedLots, remainingLots } = consumeFifo(holding.lots, qty)

  const newCargo = { ...state.cargo }
  if (remainingLots.length === 0) {
    delete newCargo[goodId]
  } else {
    newCargo[goodId] = {
      goodId,
      qty: sumLots(remainingLots),
      avgBuyCost: weightedAvgCost(remainingLots),
      lots: remainingLots,
    }
  }

  const cityWarehouseGoods = state.warehouseGoods?.[cityId] ?? {}
  const existingWarehouseHolding = cityWarehouseGoods[goodId]
  const mergedLots = existingWarehouseHolding ? [...existingWarehouseHolding.lots, ...consumedLots] : consumedLots
  const newWarehouseHolding: CargoHolding = {
    goodId,
    qty: sumLots(mergedLots),
    avgBuyCost: weightedAvgCost(mergedLots),
    lots: mergedLots,
  }

  return {
    ...state,
    cargo: newCargo,
    warehouseGoods: {
      ...state.warehouseGoods,
      [cityId]: { ...cityWarehouseGoods, [goodId]: newWarehouseHolding },
    },
  }
}

/**
 * Moves `qty` units of `goodId` from `cityId`'s warehouse back into the
 * player's cargo (T048) — the reverse of `storeGoods`.
 *
 * Validates:
 *   - `state.currentCity === cityId` (§14: no remote trading)
 *   - `qty > 0`
 *   - at least `qty` units of `goodId` are stored in that warehouse
 *   - `cargoUsed(state) + qty <= state.cargoCapacity` — see file header's
 *     "withdrawGoods DOES check cargo capacity" design decision
 *
 * On success: consumes `qty` units from `state.warehouseGoods[cityId][goodId]`'s
 * FIFO lots (oldest first, removing the entry entirely if fully emptied),
 * and appends those same lots (cost basis intact) onto `state.cargo[goodId]`.
 *
 * Rejected (returns the identical `state` reference, unchanged) when any
 * validation fails.
 */
export function withdrawGoods(state: GameState, cityId: CityId, goodId: GoodId, qty: number): GameState {
  if (state.currentCity !== cityId) return state
  if (qty <= 0) return state

  const holding = state.warehouseGoods?.[cityId]?.[goodId]
  if (!holding || holding.qty < qty) return state

  if (cargoUsed(state) + qty > state.cargoCapacity) return state

  const { consumedLots, remainingLots } = consumeFifo(holding.lots, qty)

  const cityWarehouseGoods = { ...(state.warehouseGoods?.[cityId] ?? {}) }
  if (remainingLots.length === 0) {
    delete cityWarehouseGoods[goodId]
  } else {
    cityWarehouseGoods[goodId] = {
      goodId,
      qty: sumLots(remainingLots),
      avgBuyCost: weightedAvgCost(remainingLots),
      lots: remainingLots,
    }
  }

  const existingCargoHolding = state.cargo[goodId]
  const mergedLots = existingCargoHolding ? [...existingCargoHolding.lots, ...consumedLots] : consumedLots
  const newCargoHolding: CargoHolding = {
    goodId,
    qty: sumLots(mergedLots),
    avgBuyCost: weightedAvgCost(mergedLots),
    lots: mergedLots,
  }

  return {
    ...state,
    cargo: { ...state.cargo, [goodId]: newCargoHolding },
    warehouseGoods: { ...state.warehouseGoods, [cityId]: cityWarehouseGoods },
  }
}

// ---------------------------------------------------------------------------
// Warehouse-maintenance-shortfall debt accrual/repayment (T049) — mirrors
// tax.ts's `accrueTaxDebtInterest`/`repayTaxDebt` almost exactly, at the
// Small-bank daily rate instead of the Huge-rate tax penalty (see file
// header for the full rationale on why these MUST stay separate buckets).
// ---------------------------------------------------------------------------

/**
 * Accrues one day of SIMPLE daily interest on
 * `state.warehouseMaintenanceDebt.principal`, at
 * `CONFIG.banking.loanInterestDailyRates.Small` (0.9%/day) — NOT scaled by
 * the difficulty `loanInterestMultiplier` (see file header). Intended to be
 * called ONCE PER DAY-TICK, unconditionally, alongside
 * `accrueTaxDebtInterest` — see turnLoop.ts's `advanceDay`.
 *
 * Pure function: returns a NEW `GameState` when `state.warehouseMaintenanceDebt`
 * is non-null; returns the identical `state` reference, unchanged, otherwise.
 */
export function accrueWarehouseMaintenanceDebtInterest(state: GameState): GameState {
  if (!state.warehouseMaintenanceDebt) return state

  const interestToday = state.warehouseMaintenanceDebt.principal * CONFIG.banking.loanInterestDailyRates.Small

  return {
    ...state,
    warehouseMaintenanceDebt: {
      ...state.warehouseMaintenanceDebt,
      accruedInterest: state.warehouseMaintenanceDebt.accruedInterest + interestToday,
    },
  }
}

/**
 * Repays `amount` of cash toward the outstanding
 * `state.warehouseMaintenanceDebt` — interest-first, exactly mirroring
 * `repayTaxDebt` (tax.ts). See that function's own doc comment for the full
 * behavior (capped-at-outstanding-debt application, full-clear-to-null
 * semantics); the only difference here is which debt bucket is touched.
 *
 * Rejected (returns the identical `state` reference, unchanged) when there is
 * no outstanding warehouse debt, `amount <= 0`, or `amount > state.cash`.
 */
export function repayWarehouseMaintenanceDebt(state: GameState, amount: number): GameState {
  if (!state.warehouseMaintenanceDebt) return state
  if (amount <= 0) return state
  if (amount > state.cash) return state

  const debt = state.warehouseMaintenanceDebt
  const outstanding = debt.accruedInterest + debt.principal
  const applied = Math.min(amount, outstanding)

  const interestPaydown = Math.min(applied, debt.accruedInterest)
  const remainderAfterInterest = applied - interestPaydown
  const principalPaydown = Math.min(remainderAfterInterest, debt.principal)

  const newAccruedInterest = debt.accruedInterest - interestPaydown
  const newPrincipal = debt.principal - principalPaydown
  const fullyRepaid = newAccruedInterest === 0 && newPrincipal === 0

  return {
    ...state,
    cash: state.cash - applied,
    warehouseMaintenanceDebt: fullyRepaid
      ? null
      : { ...debt, accruedInterest: newAccruedInterest, principal: newPrincipal },
  }
}

// ---------------------------------------------------------------------------
// Warehouse fire (T050) — see file header's "dedicated daily roll" design
// decision for why this is NOT routed through the §7 event pipeline.
// ---------------------------------------------------------------------------

/**
 * Rolls, once per city that owns at least one warehouse floor, whether a
 * fire destroys part of that city's stored goods TODAY.
 *
 * For each such city, draws one `rng.next()` against
 * `CONFIG.warehouse.fire.dailyProbability`. On a hit (and only if that city
 * actually has anything stored — an empty warehouse catching fire is a
 * harmless non-event): destroys `CONFIG.warehouse.fire.insuredLossPct` (10%,
 * fixed) of every stored good if that city's warehouse is insured, or a
 * fresh uniform draw from `CONFIG.warehouse.fire.lossPct` (10-40%) if not.
 * The SAME loss fraction (rounded down to whole units per good via
 * `Math.floor`) is applied to every good stored in that city, consuming FIFO
 * lots oldest-first via `consumeFifo` — cost basis of destroyed units is
 * simply discarded (no tax concept applies to destroyed inventory, see file
 * header).
 *
 * Cities are visited in `Object.keys(state.warehouses)` order (deterministic
 * given a fixed insertion history, same convention `tax.ts`'s `runYearEnd`
 * already uses for its own multi-account iteration) — each city's roll
 * consumes exactly one `rng.next()` from the shared `rng` (plus one more for
 * the loss-fraction draw, only when that city's roll hits and it's
 * uninsured), so the exact same `(seed, day)` always produces the exact same
 * outcome across every city, in a fixed, reproducible order.
 *
 * Intended to be called ONCE PER DAY-TICK, using its own dedicated RNG
 * substream (see turnLoop.ts's `createWarehouseFireRng`) — independent of the
 * day's other RNG streams (price noise, event scheduling/resolution), so how
 * many warehouses the player owns never shifts any of those other draws.
 *
 * Pure function: returns a NEW `GameState` only when at least one fire
 * actually destroyed at least one unit somewhere; returns the identical
 * `state` reference, unchanged, on an ordinary day where nothing burns
 * (mirrors `accrueLoanInterest`'s "no-op returns the same reference"
 * convention).
 */
export function checkWarehouseFires(state: GameState, rng: Rng): GameState {
  if (!state.warehouses) return state

  let changed = false
  const newWarehouseGoods: Record<CityId, Cargo> = { ...state.warehouseGoods }

  for (const cityId of Object.keys(state.warehouses)) {
    const warehouse = state.warehouses[cityId]
    if (!warehouse || warehouse.floorsBuilt <= 0) continue

    const fires = rng.next() < CONFIG.warehouse.fire.dailyProbability
    if (!fires) continue

    const cityGoods = state.warehouseGoods?.[cityId]
    if (!cityGoods) continue // nothing stored — a fire here is a non-event

    const lossPct = warehouse.insured
      ? CONFIG.warehouse.fire.insuredLossPct
      : CONFIG.warehouse.fire.lossPct.min +
        rng.next() * (CONFIG.warehouse.fire.lossPct.max - CONFIG.warehouse.fire.lossPct.min)

    const newCityGoods: Cargo = {}
    let cityChanged = false

    for (const goodId of Object.keys(cityGoods)) {
      const holding = cityGoods[goodId]
      if (!holding || holding.qty <= 0) continue

      const destroyQty = Math.floor(holding.qty * lossPct)
      if (destroyQty <= 0) {
        newCityGoods[goodId] = holding
        continue
      }

      cityChanged = true
      const { remainingLots } = consumeFifo(holding.lots, destroyQty)
      if (remainingLots.length > 0) {
        newCityGoods[goodId] = {
          goodId,
          qty: sumLots(remainingLots),
          avgBuyCost: weightedAvgCost(remainingLots),
          lots: remainingLots,
        }
      }
      // else: fully destroyed — simply omitted (matches trade.ts's
      // "remove fully-emptied holding entirely" convention).
    }

    if (cityChanged) {
      newWarehouseGoods[cityId] = newCityGoods
      changed = true
    }
  }

  if (!changed) return state

  return { ...state, warehouseGoods: newWarehouseGoods }
}
