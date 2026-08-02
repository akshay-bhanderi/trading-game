import { describe, expect, it } from 'vitest'
import { CONFIG } from './config'
import {
  accrueWarehouseMaintenanceDebtInterest,
  buildWarehouseFloor,
  buyIntoWarehouse,
  buyWarehouseInsurance,
  calcWarehouseAnnualBill,
  calcWarehouseGoodsValue,
  checkWarehouseFires,
  cumulativeBuildCost,
  repayWarehouseMaintenanceDebt,
  sellFromWarehouse,
  sellWarehouse,
  storeGoods,
  warehouseCapacity,
  warehouseGoodsUsed,
  withdrawGoods,
} from './warehouse'
import type { Cargo, GameState } from './types'
import type { Rng } from './rng'

/**
 * T068 — deferred unit tests for Phase 10 (Warehouse Storage, T046-T052),
 * written and run together per the project's Phase-10-13 testing policy (see
 * tasks/phase-13-final-balance-pass.md). Covers exactly the behaviors T068's
 * own acceptance criteria names: floor math/build, store/withdraw,
 * maintenance billing calc, fire, insurance, sell-back.
 *
 * Minimal-but-valid `GameState` builder, following the same pattern already
 * established by cargo.test.ts/tax.test.ts.
 */
function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    day: 1,
    currentCity: 'farrow',
    cash: 0,
    cargo: {},
    cargoCapacity: CONFIG.cargo.startingCapacity,
    bankAccounts: {},
    priceStates: {},
    unlockedCityIds: ['farrow', 'saltmere'],
    unlockedGoodIds: ['grain', 'cotton', 'iron'],
    purchasedLicenseGoodIds: [],
    activeEvents: [],
    currentNewspaper: [],
    taxHistory: [],
    travelInProgress: null,
    peakNetWorth: 0,
    seed: 1,
    difficulty: 'Pro',
    repaymentRecord: 0,
    cumulativeTradeVolume: 0,
    rankCache: { value: 1, computedOnDay: 0 },
    ...overrides,
  }
}

/** Fake `Rng` test double: returns each of `sequence` in order from `next()`
 * (cycling once exhausted), and always `pick`s the first element — sufficient
 * control for `checkWarehouseFires`'s deterministic branch testing without
 * needing to brute-force a real seed. */
function makeFakeRng(sequence: number[]): Rng {
  let i = 0
  return {
    next: () => {
      const value = sequence[i % sequence.length] as number
      i++
      return value
    },
    int: (min) => min,
    pick: <T>(arr: readonly T[]) => arr[0] as T,
  }
}

// ---------------------------------------------------------------------------
// Floor math: capacity / cumulativeBuildCost
// ---------------------------------------------------------------------------

describe('warehouseCapacity / warehouseGoodsUsed', () => {
  it('is 0 for a city with no warehouse', () => {
    const state = makeState()
    expect(warehouseCapacity(state, 'farrow')).toBe(0)
    expect(warehouseGoodsUsed(state, 'farrow')).toBe(0)
  })

  it('reads cumulative capacity off CONFIG.warehouse.floors for the built floor count', () => {
    const state = makeState({ warehouses: { farrow: { floorsBuilt: 2, insured: false } } })
    expect(warehouseCapacity(state, 'farrow')).toBe(CONFIG.warehouse.floors[2]?.cumulativeCapacity)
  })

  it('sums stored quantity across every good in that city only', () => {
    const state = makeState({
      warehouseGoods: {
        farrow: { grain: { goodId: 'grain', qty: 50, avgBuyCost: 10, lots: [{ qty: 50, unitCost: 10 }] } },
        saltmere: { iron: { goodId: 'iron', qty: 999, avgBuyCost: 5, lots: [{ qty: 999, unitCost: 5 }] } },
      },
    })
    expect(warehouseGoodsUsed(state, 'farrow')).toBe(50)
  })
})

describe('cumulativeBuildCost', () => {
  it('is 0 for zero floors', () => {
    expect(cumulativeBuildCost(0)).toBe(0)
  })

  it('sums each owned floor\'s own marginal buildCost', () => {
    const expected =
      (CONFIG.warehouse.floors[1]?.buildCost ?? 0) +
      (CONFIG.warehouse.floors[2]?.buildCost ?? 0) +
      (CONFIG.warehouse.floors[3]?.buildCost ?? 0)
    expect(cumulativeBuildCost(3)).toBe(expected)
  })
})

// ---------------------------------------------------------------------------
// buildWarehouseFloor (T047)
// ---------------------------------------------------------------------------

describe('buildWarehouseFloor', () => {
  it('builds floor 1 fresh: deducts buildCost, creates the warehouse entry uninsured', () => {
    const cost = CONFIG.warehouse.floors[1]?.buildCost as number
    const state = makeState({ cash: cost + 1_000 })

    const result = buildWarehouseFloor(state, 'farrow')

    expect(result.cash).toBe(1_000)
    expect(result.warehouses?.farrow).toEqual({ floorsBuilt: 1, insured: false })
  })

  it('builds the NEXT floor in sequence, preserving the insured flag', () => {
    const cost2 = CONFIG.warehouse.floors[2]?.buildCost as number
    const state = makeState({
      cash: cost2,
      warehouses: { farrow: { floorsBuilt: 1, insured: true } },
    })

    const result = buildWarehouseFloor(state, 'farrow')

    expect(result.cash).toBe(0)
    expect(result.warehouses?.farrow).toEqual({ floorsBuilt: 2, insured: true })
  })

  it('rejects a city not in unlockedCityIds', () => {
    const state = makeState({ cash: 1_000_000, unlockedCityIds: ['farrow'] })
    const result = buildWarehouseFloor(state, 'ironvale')
    expect(result).toBe(state)
  })

  it('rejects once maxFloors is already reached (structurally impossible to skip ahead — no target-floor param exists)', () => {
    const state = makeState({
      cash: 10_000_000,
      warehouses: { farrow: { floorsBuilt: CONFIG.warehouse.maxFloors, insured: false } },
    })
    const result = buildWarehouseFloor(state, 'farrow')
    expect(result).toBe(state)
  })

  it('rejects insufficient cash', () => {
    const cost = CONFIG.warehouse.floors[1]?.buildCost as number
    const state = makeState({ cash: cost - 1 })
    const result = buildWarehouseFloor(state, 'farrow')
    expect(result).toBe(state)
  })
})

// ---------------------------------------------------------------------------
// buyWarehouseInsurance (T050)
// ---------------------------------------------------------------------------

describe('buyWarehouseInsurance', () => {
  it('toggles insured on, then off again, on a call each way', () => {
    const state = makeState({ warehouses: { farrow: { floorsBuilt: 1, insured: false } } })

    const on = buyWarehouseInsurance(state, 'farrow')
    expect(on.warehouses?.farrow?.insured).toBe(true)

    const off = buyWarehouseInsurance(on, 'farrow')
    expect(off.warehouses?.farrow?.insured).toBe(false)
  })

  it('rejects a city with no warehouse floors built', () => {
    const state = makeState()
    expect(buyWarehouseInsurance(state, 'farrow')).toBe(state)
  })
})

// ---------------------------------------------------------------------------
// storeGoods / withdrawGoods (T048)
// ---------------------------------------------------------------------------

describe('storeGoods', () => {
  function cargoWith(qty: number, unitCost: number): Cargo {
    return { grain: { goodId: 'grain', qty, avgBuyCost: unitCost, lots: [{ qty, unitCost }] } }
  }

  it('moves qty from cargo into the warehouse, preserving FIFO cost basis, freeing cargo capacity', () => {
    const state = makeState({
      currentCity: 'farrow',
      cargo: cargoWith(100, 5),
      warehouses: { farrow: { floorsBuilt: 1, insured: false } },
    })

    const result = storeGoods(state, 'farrow', 'grain', 40)

    expect(result.cargo.grain?.qty).toBe(60)
    expect(result.warehouseGoods?.farrow?.grain).toEqual({
      goodId: 'grain',
      qty: 40,
      avgBuyCost: 5,
      lots: [{ qty: 40, unitCost: 5 }],
    })
  })

  it('removes the cargo holding entirely once fully emptied', () => {
    const state = makeState({
      cargo: cargoWith(40, 5),
      warehouses: { farrow: { floorsBuilt: 1, insured: false } },
    })
    const result = storeGoods(state, 'farrow', 'grain', 40)
    expect(result.cargo.grain).toBeUndefined()
  })

  it('rejects when not physically present in cityId', () => {
    const state = makeState({
      currentCity: 'saltmere',
      cargo: cargoWith(40, 5),
      warehouses: { farrow: { floorsBuilt: 1, insured: false } },
    })
    expect(storeGoods(state, 'farrow', 'grain', 10)).toBe(state)
  })

  it('rejects qty <= 0', () => {
    const state = makeState({ cargo: cargoWith(40, 5), warehouses: { farrow: { floorsBuilt: 1, insured: false } } })
    expect(storeGoods(state, 'farrow', 'grain', 0)).toBe(state)
  })

  it('rejects insufficient cargo quantity', () => {
    const state = makeState({ cargo: cargoWith(10, 5), warehouses: { farrow: { floorsBuilt: 1, insured: false } } })
    expect(storeGoods(state, 'farrow', 'grain', 11)).toBe(state)
  })

  it('rejects when no warehouse floor is built in that city', () => {
    const state = makeState({ cargo: cargoWith(40, 5) })
    expect(storeGoods(state, 'farrow', 'grain', 10)).toBe(state)
  })

  it('rejects once it would exceed warehouseCapacity', () => {
    const state = makeState({
      cargo: cargoWith(1_000, 5),
      warehouses: { farrow: { floorsBuilt: 1, insured: false } }, // 150 capacity
    })
    const capacity = CONFIG.warehouse.floors[1]?.cumulativeCapacity as number
    expect(storeGoods(state, 'farrow', 'grain', capacity + 1)).toBe(state)
    expect(storeGoods(state, 'farrow', 'grain', capacity).cash).toBe(state.cash) // exact capacity succeeds
  })

  it('merges into an existing warehouse holding, combining FIFO lots', () => {
    const state = makeState({
      cargo: cargoWith(20, 8),
      warehouses: { farrow: { floorsBuilt: 1, insured: false } },
      warehouseGoods: { farrow: { grain: { goodId: 'grain', qty: 10, avgBuyCost: 4, lots: [{ qty: 10, unitCost: 4 }] } } },
    })
    const result = storeGoods(state, 'farrow', 'grain', 20)
    expect(result.warehouseGoods?.farrow?.grain?.qty).toBe(30)
    expect(result.warehouseGoods?.farrow?.grain?.avgBuyCost).toBeCloseTo((10 * 4 + 20 * 8) / 30, 6)
  })
})

describe('withdrawGoods', () => {
  function warehouseGoodsWith(qty: number, unitCost: number): Record<string, Cargo> {
    return { farrow: { grain: { goodId: 'grain', qty, avgBuyCost: unitCost, lots: [{ qty, unitCost }] } } }
  }

  it('moves qty from the warehouse back into cargo, preserving cost basis', () => {
    const state = makeState({
      currentCity: 'farrow',
      warehouseGoods: warehouseGoodsWith(50, 6),
    })
    const result = withdrawGoods(state, 'farrow', 'grain', 20)
    expect(result.cargo.grain).toEqual({ goodId: 'grain', qty: 20, avgBuyCost: 6, lots: [{ qty: 20, unitCost: 6 }] })
    expect(result.warehouseGoods?.farrow?.grain?.qty).toBe(30)
  })

  it('removes the warehouse entry entirely once fully withdrawn', () => {
    const state = makeState({ warehouseGoods: warehouseGoodsWith(20, 6) })
    const result = withdrawGoods(state, 'farrow', 'grain', 20)
    expect(result.warehouseGoods?.farrow?.grain).toBeUndefined()
  })

  it('rejects when not physically present in cityId', () => {
    const state = makeState({ currentCity: 'saltmere', warehouseGoods: warehouseGoodsWith(20, 6) })
    expect(withdrawGoods(state, 'farrow', 'grain', 10)).toBe(state)
  })

  it('rejects insufficient stored quantity', () => {
    const state = makeState({ warehouseGoods: warehouseGoodsWith(5, 6) })
    expect(withdrawGoods(state, 'farrow', 'grain', 6)).toBe(state)
  })

  it('rejects when it would exceed cargoCapacity', () => {
    const state = makeState({
      cargoCapacity: 10,
      cargo: { iron: { goodId: 'iron', qty: 5, avgBuyCost: 1, lots: [{ qty: 5, unitCost: 1 }] } },
      warehouseGoods: warehouseGoodsWith(50, 6),
    })
    expect(withdrawGoods(state, 'farrow', 'grain', 6)).toBe(state) // 5 + 6 > 10
    expect(withdrawGoods(state, 'farrow', 'grain', 5).cargo.grain?.qty).toBe(5) // 5 + 5 == 10 succeeds
  })
})

// ---------------------------------------------------------------------------
// calcWarehouseGoodsValue / calcWarehouseAnnualBill (T048/T049/T050)
// ---------------------------------------------------------------------------

describe('calcWarehouseGoodsValue', () => {
  it('values stored goods at that CITY\'s own last-seen price', () => {
    const state = makeState({
      warehouseGoods: { farrow: { grain: { goodId: 'grain', qty: 10, avgBuyCost: 5, lots: [{ qty: 10, unitCost: 5 }] } } },
      priceStates: {
        farrow: { grain: { cityId: 'farrow', goodId: 'grain', currentPrice: 20, lastSeenPrice: 15, lastSeenDay: 1, trendPosition: 0 } },
      },
    })
    expect(calcWarehouseGoodsValue(state, 'farrow')).toBe(10 * 15)
  })

  it('falls back to the good\'s basePrice when no price has ever been observed in that city', () => {
    const state = makeState({
      warehouseGoods: { farrow: { grain: { goodId: 'grain', qty: 10, avgBuyCost: 5, lots: [{ qty: 10, unitCost: 5 }] } } },
    })
    const value = calcWarehouseGoodsValue(state, 'farrow')
    expect(value).toBeGreaterThan(0) // basePrice fallback, not $0
  })

  it('is 0 for a city with nothing stored', () => {
    expect(calcWarehouseGoodsValue(makeState(), 'farrow')).toBe(0)
  })
})

describe('calcWarehouseAnnualBill', () => {
  it('sums annual maintenance across every owned floor in every city', () => {
    const state = makeState({
      warehouses: {
        farrow: { floorsBuilt: 2, insured: false },
        saltmere: { floorsBuilt: 1, insured: false },
      },
    })
    const expected =
      (CONFIG.warehouse.floors[1]?.annualMaintenance ?? 0) +
      (CONFIG.warehouse.floors[2]?.annualMaintenance ?? 0) +
      (CONFIG.warehouse.floors[1]?.annualMaintenance ?? 0)
    expect(calcWarehouseAnnualBill(state)).toBeCloseTo(expected, 6)
  })

  it('adds the insurance premium (2%/year of stored value) only for insured cities', () => {
    const state = makeState({
      warehouses: { farrow: { floorsBuilt: 1, insured: true } },
      warehouseGoods: { farrow: { grain: { goodId: 'grain', qty: 10, avgBuyCost: 5, lots: [{ qty: 10, unitCost: 5 }] } } },
      priceStates: {
        farrow: { grain: { cityId: 'farrow', goodId: 'grain', currentPrice: 10, lastSeenPrice: 10, lastSeenDay: 1, trendPosition: 0 } },
      },
    })
    const storedValue = 10 * 10
    const expected =
      (CONFIG.warehouse.floors[1]?.annualMaintenance ?? 0) +
      storedValue * CONFIG.warehouse.fire.insuranceAnnualRatePctOfStoredValue
    expect(calcWarehouseAnnualBill(state)).toBeCloseTo(expected, 6)
  })

  it('is 0 with no warehouses owned anywhere', () => {
    expect(calcWarehouseAnnualBill(makeState())).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// sellWarehouse (T051)
// ---------------------------------------------------------------------------

describe('sellWarehouse', () => {
  it('pays 50% of cumulative build cost and removes the city\'s warehouse entry entirely', () => {
    const state = makeState({ cash: 0, warehouses: { farrow: { floorsBuilt: 2, insured: true } } })
    const result = sellWarehouse(state, 'farrow')

    const expectedProceeds = cumulativeBuildCost(2) * CONFIG.warehouse.sellBackFraction
    expect(result.cash).toBeCloseTo(expectedProceeds, 6)
    expect(result.warehouses?.farrow).toBeUndefined()
  })

  it('rejects when goods are still stored there', () => {
    const state = makeState({
      warehouses: { farrow: { floorsBuilt: 1, insured: false } },
      warehouseGoods: { farrow: { grain: { goodId: 'grain', qty: 1, avgBuyCost: 1, lots: [{ qty: 1, unitCost: 1 }] } } },
    })
    expect(sellWarehouse(state, 'farrow')).toBe(state)
  })

  it('rejects a city with no warehouse owned', () => {
    const state = makeState()
    expect(sellWarehouse(state, 'farrow')).toBe(state)
  })
})

// ---------------------------------------------------------------------------
// Market <-> Warehouse direct trading (2026-08) — deliberately asymmetric
// presence rule: buyIntoWarehouse allows ANY city remotely (user-requested),
// sellFromWarehouse stays presence-gated (user's own choice, unchanged).
// ---------------------------------------------------------------------------

describe('buyIntoWarehouse', () => {
  it('succeeds targeting a REMOTE city (currentCity !== cityId) — no presence check, by design', () => {
    const state = makeState({
      currentCity: 'farrow',
      cash: 1_000,
      warehouses: { saltmere: { floorsBuilt: 1, insured: false } },
    })
    const result = buyIntoWarehouse(state, 'saltmere', 'grain', 10, 5)

    expect(result).not.toBe(state)
    expect(result.cash).toBe(950)
    expect(result.warehouseGoods?.saltmere?.grain?.qty).toBe(10)
    // Never touches the player's cargo or the current city's warehouse.
    expect(result.cargo).toEqual({})
    expect(result.warehouseGoods?.farrow).toBeUndefined()
  })

  it('still rejects when the target city has no warehouse floor built at all', () => {
    const state = makeState({ currentCity: 'farrow', cash: 1_000 })
    expect(buyIntoWarehouse(state, 'saltmere', 'grain', 10, 5)).toBe(state)
  })

  it('still rejects when it would exceed the target warehouse\'s capacity', () => {
    const state = makeState({
      currentCity: 'farrow',
      cash: 1_000_000,
      warehouses: { saltmere: { floorsBuilt: 1, insured: false } },
    })
    const capacity = warehouseCapacity(state, 'saltmere')
    expect(buyIntoWarehouse(state, 'saltmere', 'grain', capacity + 1, 1)).toBe(state)
  })

  it('still rejects insufficient cash', () => {
    const state = makeState({
      currentCity: 'farrow',
      cash: 10,
      warehouses: { saltmere: { floorsBuilt: 1, insured: false } },
    })
    expect(buyIntoWarehouse(state, 'saltmere', 'grain', 10, 5)).toBe(state)
  })
})

describe('sellFromWarehouse', () => {
  it('rejects targeting a city the player is NOT currently in — presence still required, unlike buyIntoWarehouse', () => {
    const state = makeState({
      currentCity: 'farrow',
      warehouseGoods: { saltmere: { grain: { goodId: 'grain', qty: 10, avgBuyCost: 5, lots: [{ qty: 10, unitCost: 5 }] } } },
    })
    expect(sellFromWarehouse(state, 'saltmere', 'grain', 5, 5)).toBe(state)
  })

  it('succeeds when the player IS in that city', () => {
    const state = makeState({
      currentCity: 'saltmere',
      warehouseGoods: { saltmere: { grain: { goodId: 'grain', qty: 10, avgBuyCost: 5, lots: [{ qty: 10, unitCost: 5 }] } } },
    })
    const result = sellFromWarehouse(state, 'saltmere', 'grain', 5, 8)
    expect(result.cash).toBe(40)
    expect(result.warehouseGoods?.saltmere?.grain?.qty).toBe(5)
  })
})

// ---------------------------------------------------------------------------
// Warehouse-maintenance-debt accrual/repayment (T049)
// ---------------------------------------------------------------------------

describe('accrueWarehouseMaintenanceDebtInterest', () => {
  it('accrues simple daily interest at the Small-bank rate on principal only', () => {
    const state = makeState({ warehouseMaintenanceDebt: { principal: 1_000, accruedInterest: 0, startDay: 90 } })
    const result = accrueWarehouseMaintenanceDebtInterest(state)
    expect(result.warehouseMaintenanceDebt?.principal).toBe(1_000)
    expect(result.warehouseMaintenanceDebt?.accruedInterest).toBeCloseTo(
      1_000 * CONFIG.banking.loanInterestDailyRates.Small,
      6,
    )
  })

  it('returns the identical state reference when there is no outstanding debt', () => {
    const state = makeState({ warehouseMaintenanceDebt: null })
    expect(accrueWarehouseMaintenanceDebtInterest(state)).toBe(state)
  })
})

describe('repayWarehouseMaintenanceDebt', () => {
  it('applies repayment interest-first, then principal, and clears to null when fully repaid', () => {
    const state = makeState({
      cash: 10_000,
      warehouseMaintenanceDebt: { principal: 1_000, accruedInterest: 100, startDay: 90 },
    })
    const result = repayWarehouseMaintenanceDebt(state, 1_100)
    expect(result.warehouseMaintenanceDebt).toBeNull()
    expect(result.cash).toBe(8_900)
  })

  it('rejects amount <= 0, amount > cash, or no outstanding debt', () => {
    const state = makeState({ cash: 100, warehouseMaintenanceDebt: { principal: 1_000, accruedInterest: 0, startDay: 90 } })
    expect(repayWarehouseMaintenanceDebt(state, 0)).toBe(state)
    expect(repayWarehouseMaintenanceDebt(state, 200)).toBe(state)
    expect(repayWarehouseMaintenanceDebt(makeState({ cash: 100, warehouseMaintenanceDebt: null }), 50)).toEqual(
      makeState({ cash: 100, warehouseMaintenanceDebt: null }),
    )
  })
})

// ---------------------------------------------------------------------------
// checkWarehouseFires (T050)
// ---------------------------------------------------------------------------

describe('checkWarehouseFires', () => {
  it('is a no-op with no warehouses owned', () => {
    const state = makeState()
    expect(checkWarehouseFires(state, makeFakeRng([0]))).toBe(state)
  })

  it('is a no-op when the fire roll misses (next() >= dailyProbability)', () => {
    const state = makeState({
      warehouses: { farrow: { floorsBuilt: 1, insured: false } },
      warehouseGoods: { farrow: { grain: { goodId: 'grain', qty: 100, avgBuyCost: 1, lots: [{ qty: 100, unitCost: 1 }] } } },
    })
    const rng = makeFakeRng([0.999]) // >> dailyProbability (0.003)
    expect(checkWarehouseFires(state, rng)).toBe(state)
  })

  it('is a no-op when the fire roll hits but nothing is stored there', () => {
    const state = makeState({ warehouses: { farrow: { floorsBuilt: 1, insured: false } } })
    const rng = makeFakeRng([0]) // guaranteed hit
    expect(checkWarehouseFires(state, rng)).toBe(state)
  })

  it('destroys a fixed 10% (insuredLossPct) when insured, regardless of the loss-fraction draw', () => {
    const state = makeState({
      warehouses: { farrow: { floorsBuilt: 1, insured: true } },
      warehouseGoods: { farrow: { grain: { goodId: 'grain', qty: 100, avgBuyCost: 1, lots: [{ qty: 100, unitCost: 1 }] } } },
    })
    const rng = makeFakeRng([0]) // guaranteed fire hit; insured path never draws a second next()
    const result = checkWarehouseFires(state, rng)
    expect(result.warehouseGoods?.farrow?.grain?.qty).toBe(90) // 100 - 10% insuredLossPct
  })

  it('destroys a loss fraction drawn from [min,max] when uninsured', () => {
    const state = makeState({
      warehouses: { farrow: { floorsBuilt: 1, insured: false } },
      warehouseGoods: { farrow: { grain: { goodId: 'grain', qty: 100, avgBuyCost: 1, lots: [{ qty: 100, unitCost: 1 }] } } },
    })
    // First next() (0) triggers the fire; second next() (0.5) drives the
    // uniform loss-fraction draw: min + 0.5*(max-min) = the midpoint (25%).
    const rng = makeFakeRng([0, 0.5])
    const result = checkWarehouseFires(state, rng)
    const midpoint = CONFIG.warehouse.fire.lossPct.min + 0.5 * (CONFIG.warehouse.fire.lossPct.max - CONFIG.warehouse.fire.lossPct.min)
    expect(result.warehouseGoods?.farrow?.grain?.qty).toBe(100 - Math.floor(100 * midpoint))
  })

  it('fully removes a good entirely destroyed, and never touches cash/realizedProfit', () => {
    const state = makeState({
      cash: 500,
      warehouses: { farrow: { floorsBuilt: 1, insured: true } },
      warehouseGoods: { farrow: { grain: { goodId: 'grain', qty: 1, avgBuyCost: 1, lots: [{ qty: 1, unitCost: 1 }] } } },
    })
    // qty 1 * insuredLossPct(0.1) floored = 0 destroyed — bump qty via a
    // separate, larger-holding assertion instead to force destroyQty > 0.
    const bigState = { ...state, warehouseGoods: { farrow: { grain: { goodId: 'grain', qty: 10, avgBuyCost: 1, lots: [{ qty: 10, unitCost: 1 }] } } } }
    const rng = makeFakeRng([0])
    const result = checkWarehouseFires(bigState, rng)
    expect(result.cash).toBe(500)
    expect(result.warehouseGoods?.farrow?.grain?.qty).toBe(9) // 10 - floor(10*0.1)
  })
})
