import { describe, expect, it } from 'vitest'
import { CONFIG } from '../config'
import { createRng } from '../rng'
import { greedyBotStep } from './greedyBot'
import type { GameState, PriceState } from '../types'

/**
 * Builds a minimal-but-valid `GameState`, following the same pattern as
 * turnLoop.test.ts / stay.test.ts / travel.test.ts / netWorth.test.ts.
 */
function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    day: 1,
    currentCity: 'farrow',
    cash: CONFIG.difficulty.Pro.startingCash,
    cargo: {},
    cargoCapacity: CONFIG.cargo.startingCapacity,
    bankAccounts: {},
    priceStates: {},
    unlockedCityIds: ['farrow', 'saltmere', 'copperfell', 'millbrook'],
    unlockedGoodIds: ['grain', 'cotton', 'iron'],
    purchasedLicenseGoodIds: [],
    activeEvents: [],
    currentNewspaper: [],
    taxHistory: [],
    travelInProgress: null,
    peakNetWorth: CONFIG.difficulty.Pro.startingCash,
    seed: 424242,
    difficulty: 'Pro',
    repaymentRecord: 0,
    cumulativeTradeVolume: 0,
    rankCache: { value: 1, computedOnDay: 0 },
    ...overrides,
  }
}

function priceState(cityId: string, goodId: string, currentPrice: number): PriceState {
  return {
    cityId,
    goodId,
    currentPrice,
    lastSeenPrice: currentPrice,
    lastSeenDay: 1,
    trendPosition: 0,
  }
}

describe('greedyBotStep — "cheapest relative to base" buy selection', () => {
  it('buys the good priced well BELOW its base, not the one priced well ABOVE it', () => {
    // grain: basePrice 10 -> currentPrice 3 => ratio 0.3 (unusually cheap)
    // cotton: basePrice 16 -> currentPrice 40 => ratio 2.5 (unusually dear)
    const state = makeState({
      day: 1,
      currentCity: 'farrow',
      unlockedGoodIds: ['grain', 'cotton'],
      priceStates: {
        farrow: {
          grain: priceState('farrow', 'grain', 3),
          cotton: priceState('farrow', 'cotton', 40),
        },
      },
    })

    const rng = createRng(1)
    const result = greedyBotStep(state, rng)

    expect(result.cargo['grain']?.qty).toBeGreaterThan(0)
    expect(result.cargo['cotton']).toBeUndefined()
  })

  it('treats a good with no observed PriceState entry for this city as unavailable (never fabricates a price)', () => {
    // Only grain has a price recorded for farrow; cotton has none at all.
    const state = makeState({
      day: 1,
      currentCity: 'farrow',
      unlockedGoodIds: ['grain', 'cotton'],
      priceStates: {
        farrow: {
          grain: priceState('farrow', 'grain', 5),
        },
      },
    })

    const rng = createRng(2)
    const result = greedyBotStep(state, rng)

    // Only grain could have been bought (cotton had no price to evaluate).
    expect(result.cargo['cotton']).toBeUndefined()
  })

  it('never reads a non-current city\'s currentPrice — buying is confined to state.currentCity', () => {
    // Saltmere has a screaming-cheap grain price, but the bot is in Farrow
    // and Farrow has no grain price recorded at all. If the bot cheated by
    // reading Saltmere's live price, it would buy grain; it must not.
    const state = makeState({
      day: 1,
      currentCity: 'farrow',
      unlockedGoodIds: ['grain'],
      priceStates: {
        saltmere: {
          grain: priceState('saltmere', 'grain', 0.5),
        },
      },
    })

    const rng = createRng(3)
    const result = greedyBotStep(state, rng)

    expect(result.cargo['grain']).toBeUndefined()
  })
})

describe('greedyBotStep — sell / travel / fallback behavior', () => {
  it('falls back to Stay (day still advances) when cargo is empty and nothing is tradeable here', () => {
    const state = makeState({
      day: 1,
      currentCity: 'farrow',
      unlockedGoodIds: [],
      priceStates: {},
    })

    const rng = createRng(4)
    const result = greedyBotStep(state, rng)

    expect(result.day).toBe(2)
    expect(Object.keys(result.cargo)).toHaveLength(0)
  })

  it('mid-trip: only advances the travel day, takes no buy/sell action', () => {
    const state = makeState({
      day: 1,
      currentCity: 'farrow',
      travelInProgress: { destinationCityId: 'saltmere', daysRemaining: 2, totalDays: 2 },
    })

    const rng = createRng(5)
    const result = greedyBotStep(state, rng)

    expect(result.day).toBe(2)
    expect(result.travelInProgress?.daysRemaining).toBe(1)
    expect(result.currentCity).toBe('farrow') // not arrived yet
  })

  it('sells a held good once standing in what it remembers as that good\'s best-known price city', () => {
    // Bot is in Saltmere holding salt; Saltmere's live salt price (40) is
    // higher than Farrow's remembered price (10) for the same good, so
    // Saltmere is salt's best-remembered city and the bot should cash in.
    //
    // Uses 'salt' (not 'grain') and day 1 deliberately: `greedyBotStep`
    // always runs `checkGoodUnlocks` first (per the file header), which
    // would instantly re-add any `{kind:'start'}` good like grain/cotton/
    // iron to `unlockedGoodIds` regardless of the fixture's override,
    // making it tradeable again and defeating this test's attempt to
    // isolate the SELL step from the BUY step. Salt's unlock condition is
    // `{kind:'tier', tier:1, minDay:5}` (§5), so at day 1 it stays
    // NOT tradeable no matter what `checkGoodUnlocks` does, guaranteeing
    // the BUY step is a no-op here and only the SELL step is exercised.
    const state = makeState({
      day: 1,
      currentCity: 'saltmere',
      cargo: {
        salt: { goodId: 'salt', qty: 10, avgBuyCost: 5, lots: [{ qty: 10, unitCost: 5 }] },
      },
      unlockedGoodIds: [],
      priceStates: {
        farrow: { salt: priceState('farrow', 'salt', 10) },
        saltmere: { salt: priceState('saltmere', 'salt', 40) },
      },
    })

    const rng = createRng(6)
    const result = greedyBotStep(state, rng)

    expect(result.cargo['salt']).toBeUndefined() // fully sold
    expect(result.cash).toBeGreaterThan(state.cash) // proceeds credited
  })
})

// ---------------------------------------------------------------------------
// REQUIRED ACCEPTANCE TEST (T026 / TASK.md) — smoke test: 90 simulated days
// without throwing, same pattern as T025's randomBot requirement.
// ---------------------------------------------------------------------------
describe('greedyBotStep — 90-day smoke test (required acceptance test)', () => {
  it('runs 90 simulated days without throwing', () => {
    const TARGET_DAYS = 90
    const rng = createRng(99_001)

    let state = makeState({ day: 1 })
    const startingDay = state.day
    let iterations = 0

    expect(() => {
      while (state.day < startingDay + TARGET_DAYS) {
        state = greedyBotStep(state, rng)
        iterations++
        // Guard against any unforeseen infinite loop in this test itself.
        if (iterations > TARGET_DAYS * 5) break
      }
    }).not.toThrow()

    expect(state.day).toBeGreaterThanOrEqual(startingDay + TARGET_DAYS)
    expect(Number.isFinite(state.cash)).toBe(true)
    expect(Number.isFinite(state.peakNetWorth)).toBe(true)
  })

  it('runs a second, independently-seeded 90-day simulation from a different starting city without throwing', () => {
    const TARGET_DAYS = 90
    const rng = createRng(2_024_07_26)

    let state = makeState({
      day: 1,
      seed: 55,
      currentCity: 'copperfell',
      cash: CONFIG.difficulty.Expert.startingCash,
      difficulty: 'Expert',
    })
    const startingDay = state.day
    let iterations = 0

    expect(() => {
      while (state.day < startingDay + TARGET_DAYS) {
        state = greedyBotStep(state, rng)
        iterations++
        if (iterations > TARGET_DAYS * 5) break
      }
    }).not.toThrow()

    expect(state.day).toBeGreaterThanOrEqual(startingDay + TARGET_DAYS)
    expect(Number.isFinite(state.cash)).toBe(true)
  })
})
