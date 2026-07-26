import { describe, expect, it } from 'vitest'
import { CONFIG } from '../config'
import { buy, sell } from './trade'
import type { GameState } from '../types'

/**
 * Builds a minimal-but-valid `GameState` for trade-action tests, following
 * the same pattern as /src/engine/cargo.test.ts and
 * /src/engine/actions/stay.test.ts. Deliberately does NOT import
 * `/src/engine/data/cities.ts` or `/src/engine/data/goods.ts` (owned by
 * concurrent tasks) — trade logic only cares about `cash`, `cargo`, and
 * `cargoCapacity`, so every other field is filled with an innocuous
 * placeholder that satisfies the `GameState` shape.
 */
function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    day: 1,
    currentCity: 'placeholder-city',
    cash: 0,
    cargo: {},
    cargoCapacity: CONFIG.cargo.startingCapacity,
    bankAccounts: {},
    priceStates: {},
    unlockedCityIds: [],
    unlockedGoodIds: [],
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

describe('buy', () => {
  it('creates a new CargoHolding with a single FIFO lot on first purchase', () => {
    const state = makeState({ cash: 1000 })
    const result = buy(state, 'grain', 10, 10)

    expect(result).not.toBe(state)
    expect(result.cash).toBe(900)
    expect(result.cargo.grain).toEqual({
      goodId: 'grain',
      qty: 10,
      avgBuyCost: 10,
      lots: [{ qty: 10, unitCost: 10 }],
    })
  })

  it('appends a new lot (does not merge) on a second buy at a different price, and recomputes weighted avgBuyCost', () => {
    const state = makeState({ cash: 1000 })
    const afterFirst = buy(state, 'grain', 10, 10) // 10 units @ $10
    const afterSecond = buy(afterFirst, 'grain', 20, 16) // 20 units @ $16

    expect(afterSecond.cash).toBe(1000 - 100 - 320)
    expect(afterSecond.cargo.grain?.lots).toEqual([
      { qty: 10, unitCost: 10 },
      { qty: 20, unitCost: 16 },
    ])
    expect(afterSecond.cargo.grain?.qty).toBe(30)
    // Weighted avg: (10*10 + 20*16) / 30 = (100 + 320) / 30 = 14
    expect(afterSecond.cargo.grain?.avgBuyCost).toBe(14)
  })

  it('increments cumulativeTradeVolume by qty * unitPrice on buy', () => {
    const state = makeState({ cash: 1000, cumulativeTradeVolume: 500 })
    const result = buy(state, 'grain', 10, 10)
    expect(result.cumulativeTradeVolume).toBe(500 + 100)
  })

  it('rejects qty <= 0 with no mutation', () => {
    const state = makeState({ cash: 1000 })
    const result = buy(state, 'grain', 0, 10)
    expect(result).toBe(state)
    const resultNeg = buy(state, 'grain', -5, 10)
    expect(resultNeg).toBe(state)
  })

  it('rejects when cash is insufficient, with no mutation', () => {
    const state = makeState({ cash: 99 })
    const result = buy(state, 'grain', 10, 10) // costs 100
    expect(result).toBe(state)
    expect(result.cash).toBe(99)
    expect(result.cargo.grain).toBeUndefined()
  })

  it('rejects a buy that would exceed cargo capacity, with no mutation', () => {
    const state = makeState({ cash: 100_000, cargoCapacity: 5 })
    const result = buy(state, 'grain', 6, 10)
    expect(result).toBe(state)
    expect(result.cash).toBe(100_000)
    expect(result.cargo.grain).toBeUndefined()
  })

  it('allows a buy that exactly fills remaining cargo capacity', () => {
    const state = makeState({ cash: 100_000, cargoCapacity: 5, cargo: { iron: { goodId: 'iron', qty: 2, avgBuyCost: 25, lots: [{ qty: 2, unitCost: 25 }] } } })
    const result = buy(state, 'grain', 3, 10)
    expect(result).not.toBe(state)
    expect(result.cargo.grain?.qty).toBe(3)
  })
})

describe('sell — FIFO lot consumption', () => {
  it('partial sell consumes only part of the oldest lot, leaving newer lots exactly untouched', () => {
    let state = makeState({ cash: 1000 })
    state = buy(state, 'grain', 10, 10) // lot A: 10 @ $10
    state = buy(state, 'grain', 20, 16) // lot B: 20 @ $16
    state = buy(state, 'grain', 5, 20) // lot C: 5 @ $20

    const result = sell(state, 'grain', 4, 25) // consume 4 of lot A only

    expect(result.cargo.grain?.lots).toEqual([
      { qty: 6, unitCost: 10 }, // lot A: 10 - 4 = 6 remaining, same unitCost
      { qty: 20, unitCost: 16 }, // lot B untouched
      { qty: 5, unitCost: 20 }, // lot C untouched
    ])
    expect(result.cargo.grain?.qty).toBe(31)
    expect(result.cash).toBe(state.cash + 4 * 25)
  })

  it('sell that crosses a lot boundary fully consumes the oldest lot and partially consumes the next', () => {
    let state = makeState({ cash: 1000 })
    state = buy(state, 'grain', 10, 10) // lot A: 10 @ $10
    state = buy(state, 'grain', 20, 16) // lot B: 20 @ $16
    state = buy(state, 'grain', 5, 20) // lot C: 5 @ $20

    const result = sell(state, 'grain', 15, 25) // consumes all of A (10) + 5 of B

    expect(result.cargo.grain?.lots).toEqual([
      { qty: 15, unitCost: 16 }, // lot B: 20 - 5 = 15 remaining
      { qty: 5, unitCost: 20 }, // lot C untouched
    ])
    expect(result.cargo.grain?.qty).toBe(20)

    // Verify exact consumed-lot detail for realized-profit computation (T030):
    // consumed = 10 units @ $10 (lot A, fully) + 5 units @ $16 (lot B, partially)
    const consumedCostBasis = 10 * 10 + 5 * 16
    const proceeds = 15 * 25
    const realizedProfit = proceeds - consumedCostBasis
    expect(realizedProfit).toBe(proceeds - 180)
  })

  it('a sell that fully empties the holding removes the CargoHolding entry entirely', () => {
    let state = makeState({ cash: 1000 })
    state = buy(state, 'grain', 10, 10)
    state = buy(state, 'grain', 5, 12)

    const result = sell(state, 'grain', 15, 20)

    expect(result.cargo.grain).toBeUndefined()
    expect('grain' in result.cargo).toBe(false)
  })

  it('recomputes avgBuyCost from remaining lots after a partial sell', () => {
    let state = makeState({ cash: 1000 })
    state = buy(state, 'grain', 10, 10) // lot A: 10 @ $10
    state = buy(state, 'grain', 10, 20) // lot B: 10 @ $20
    // avgBuyCost currently (100+200)/20 = 15

    const result = sell(state, 'grain', 10, 50) // fully consumes lot A only
    // remaining: lot B, 10 @ $20 -> avg = 20
    expect(result.cargo.grain?.avgBuyCost).toBe(20)
  })
})

describe('sell — validation', () => {
  it('rejects qty <= 0 with no mutation', () => {
    let state = makeState({ cash: 1000 })
    state = buy(state, 'grain', 10, 10)
    const result = sell(state, 'grain', 0, 10)
    expect(result).toBe(state)
    const resultNeg = sell(state, 'grain', -1, 10)
    expect(resultNeg).toBe(state)
  })

  it('rejects selling more than owned, with no state mutation', () => {
    let state = makeState({ cash: 1000 })
    state = buy(state, 'grain', 10, 10)

    const result = sell(state, 'grain', 11, 20)

    expect(result).toBe(state)
    expect(result.cargo.grain?.qty).toBe(10)
    expect(result.cash).toBe(state.cash)
  })

  it('rejects selling a good never owned, with no state mutation', () => {
    const state = makeState({ cash: 0 })
    const result = sell(state, 'iron', 1, 25)
    expect(result).toBe(state)
  })

  it('increments cumulativeTradeVolume by qty * unitPrice on sell', () => {
    let state = makeState({ cash: 1000, cumulativeTradeVolume: 200 })
    state = buy(state, 'grain', 10, 10)
    const cumBeforeSell = state.cumulativeTradeVolume
    const result = sell(state, 'grain', 5, 30)
    expect(result.cumulativeTradeVolume).toBe(cumBeforeSell + 5 * 30)
  })
})

describe('sell — realizedProfitThisFiscalYear accumulation (T030)', () => {
  it('accumulates FIFO-matched realized profit across multiple sells against a hand-computed example', () => {
    let state = makeState({ cash: 1000 })
    state = buy(state, 'grain', 10, 10) // lot A: 10 @ $10
    state = buy(state, 'grain', 20, 16) // lot B: 20 @ $16
    state = buy(state, 'grain', 5, 20) // lot C: 5 @ $20

    // Sell 1: 15 units @ $25 -> consumes all of lot A (10 @ $10) + 5 of lot B (@ $16)
    // realized = 15*25 - (10*10 + 5*16) = 375 - 180 = 195
    const afterFirstSell = sell(state, 'grain', 15, 25)
    expect(afterFirstSell.realizedProfitThisFiscalYear).toBe(195)

    // Sell 2: 10 units @ $30 -> consumes remaining 15 of lot B (@ $16), only 10 taken
    // realized = 10*30 - 10*16 = 300 - 160 = 140
    const afterSecondSell = sell(afterFirstSell, 'grain', 10, 30)
    expect(afterSecondSell.realizedProfitThisFiscalYear).toBe(195 + 140)
  })

  it('defaults a missing prior realizedProfitThisFiscalYear to 0 before accumulating', () => {
    let state = makeState({ cash: 1000 })
    expect(state.realizedProfitThisFiscalYear).toBeUndefined()
    state = buy(state, 'grain', 10, 10)
    const result = sell(state, 'grain', 10, 15)
    expect(result.realizedProfitThisFiscalYear).toBe(10 * 15 - 10 * 10) // 50
  })

  it('accounts for realized LOSSES too (a sell below cost basis produces a negative delta)', () => {
    let state = makeState({ cash: 1000, realizedProfitThisFiscalYear: 100 })
    state = buy(state, 'grain', 10, 20)
    const result = sell(state, 'grain', 10, 12) // sold below cost -> loss of 80
    expect(result.realizedProfitThisFiscalYear).toBe(100 - 80)
  })

  it('does not accumulate realized profit on a rejected sell', () => {
    const state = makeState({ cash: 1000, realizedProfitThisFiscalYear: 50 })
    const result = sell(state, 'iron', 1, 25) // never owned -> rejected
    expect(result).toBe(state)
    expect(result.realizedProfitThisFiscalYear).toBe(50)
  })
})
