import { describe, expect, it } from 'vitest'
import { CONFIG } from './config'
import { GOODS } from './data/goods'
import { calcNetWorth, updatePeakNetWorth } from './netWorth'
import type { BankAccount, Cargo, GameState } from './types'

/**
 * Builds a minimal-but-valid `GameState` for net-worth tests, following the
 * same pattern as /src/engine/cargo.test.ts and /src/engine/actions/stay.test.ts.
 * Only `data/goods.ts` is imported (already landed, T006) — deliberately does
 * NOT depend on the concurrently-edited `actions/trade.ts` or
 * `actions/travel.ts` files.
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

function makeCargo(holdings: Record<string, number>): Cargo {
  const cargo: Cargo = {}
  for (const [goodId, qty] of Object.entries(holdings)) {
    cargo[goodId] = { goodId, qty, avgBuyCost: 0, lots: [{ qty, unitCost: 0 }] }
  }
  return cargo
}

function makeBankAccount(overrides: Partial<BankAccount> = {}): BankAccount {
  return {
    cityId: 'placeholder-city',
    depositBalance: 0,
    loan: null,
    ...overrides,
  }
}

describe('calcNetWorth', () => {
  it('equals cash exactly in the pure cash-only case (no goods, no deposits, no debt)', () => {
    const state = makeState({ cash: 12_345 })
    expect(calcNetWorth(state)).toBe(12_345)
  })

  it('adds deposits across multiple bank cities to cash when there are still no goods/debt', () => {
    const state = makeState({
      cash: 1_000,
      bankAccounts: {
        farrow: makeBankAccount({ cityId: 'farrow', depositBalance: 500 }),
        saltmere: makeBankAccount({ cityId: 'saltmere', depositBalance: 250 }),
      },
    })
    expect(calcNetWorth(state)).toBe(1_000 + 500 + 250)
  })

  it('values carried cargo at the CURRENT city\'s last-known (last-seen) price', () => {
    const grain = GOODS.find((g) => g.id === 'grain')
    if (!grain) throw new Error('expected grain in GOODS')

    const state = makeState({
      currentCity: 'farrow',
      cash: 100,
      cargo: makeCargo({ grain: 10 }),
      priceStates: {
        farrow: {
          grain: {
            cityId: 'farrow',
            goodId: 'grain',
            currentPrice: 999, // deliberately different — must NOT be used
            lastSeenPrice: 12,
            lastSeenDay: 3,
            trendPosition: 0,
          },
        },
      },
    })

    // 100 cash + 10 units * $12 last-seen price = 220. The stale/last-known
    // price (12) is used, not the live `currentPrice` (999).
    expect(calcNetWorth(state)).toBe(100 + 10 * 12)
  })

  it('falls back to the good\'s data-file basePrice when no price has ever been seen for it in the current city', () => {
    const iron = GOODS.find((g) => g.id === 'iron')
    if (!iron) throw new Error('expected iron in GOODS')

    const state = makeState({
      currentCity: 'copperfell',
      cash: 0,
      cargo: makeCargo({ iron: 5 }),
      priceStates: {}, // nothing observed anywhere yet
    })

    expect(calcNetWorth(state)).toBe(5 * iron.basePrice)
  })

  it('allows net worth to go negative when outstanding debt exceeds assets (no clamping to 0)', () => {
    const state = makeState({
      cash: 100,
      bankAccounts: {
        farrow: makeBankAccount({
          cityId: 'farrow',
          depositBalance: 50,
          loan: { principal: 5_000, accruedInterest: 200, startDay: 1, termDays: 60 },
        }),
      },
    })

    // 100 cash + 50 deposit - (5,000 principal + 200 accrued interest) = -5,050
    expect(calcNetWorth(state)).toBe(-5_050)
  })

  it('sums debt across multiple banks with active loans alongside deposits and cargo', () => {
    const state = makeState({
      currentCity: 'farrow',
      cash: 1_000,
      cargo: makeCargo({ grain: 4 }),
      priceStates: {
        farrow: {
          grain: {
            cityId: 'farrow',
            goodId: 'grain',
            currentPrice: 50,
            lastSeenPrice: 10,
            lastSeenDay: 1,
            trendPosition: 0,
          },
        },
      },
      bankAccounts: {
        farrow: makeBankAccount({
          cityId: 'farrow',
          depositBalance: 200,
          loan: { principal: 300, accruedInterest: 10, startDay: 1, termDays: 60 },
        }),
        saltmere: makeBankAccount({
          cityId: 'saltmere',
          depositBalance: 0,
          loan: { principal: 100, accruedInterest: 5, startDay: 1, termDays: 60 },
        }),
      },
    })

    // 1,000 cash + 200 deposit + (4 * 10) cargo value - (300+10) - (100+5)
    expect(calcNetWorth(state)).toBe(1_000 + 200 + 40 - 310 - 105)
  })
})

describe('updatePeakNetWorth', () => {
  it('raises peakNetWorth when current net worth exceeds it', () => {
    const state = makeState({ cash: 500, peakNetWorth: 100 })
    const result = updatePeakNetWorth(state)

    expect(result).not.toBe(state)
    expect(result.peakNetWorth).toBe(500)
  })

  it('leaves peakNetWorth unchanged (and returns the identical reference) when current net worth is lower', () => {
    const state = makeState({ cash: 50, peakNetWorth: 1_000 })
    const result = updatePeakNetWorth(state)

    expect(result).toBe(state)
    expect(result.peakNetWorth).toBe(1_000)
  })

  it('leaves peakNetWorth unchanged when current net worth exactly equals it', () => {
    const state = makeState({ cash: 250, peakNetWorth: 250 })
    const result = updatePeakNetWorth(state)

    expect(result).toBe(state)
    expect(result.peakNetWorth).toBe(250)
  })

  it('can record a negative peak when a fresh game somehow starts underwater (still no clamping)', () => {
    const state = makeState({
      cash: 0,
      peakNetWorth: 0,
      bankAccounts: {
        farrow: makeBankAccount({
          cityId: 'farrow',
          loan: { principal: 10, accruedInterest: 0, startDay: 1, termDays: 60 },
        }),
      },
    })
    // Net worth here is -10, which is NOT > the initial peak of 0, so the
    // peak should stay at 0 (peak tracks the historical maximum, it never
    // moves down) — this asserts the "no clamping inside calcNetWorth AND
    // peak-tracking still behaves as a max()" combination explicitly.
    const result = updatePeakNetWorth(state)
    expect(result).toBe(state)
    expect(result.peakNetWorth).toBe(0)
  })
})
