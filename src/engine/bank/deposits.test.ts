import { describe, expect, it } from 'vitest'
import { CONFIG } from '../config'
import { accrueDepositInterest, deposit, withdraw } from './deposits'
import type { GameState } from '../types'

/**
 * Builds a minimal-but-valid `GameState`, following the same pattern as
 * /src/engine/turnLoop.test.ts and /src/engine/actions/stay.test.ts.
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

describe('deposit', () => {
  it('deposits into the pooled state.deposit balance on the player\'s first-ever deposit', () => {
    const state = makeState({ cash: 5_000, deposit: undefined })
    const result = deposit(state, 1_000)

    expect(result).not.toBe(state)
    expect(result.cash).toBe(4_000)
    expect(result.deposit).toBe(1_000)
  })

  it('adds onto an existing pooled balance rather than replacing it', () => {
    const state = makeState({ cash: 5_000, deposit: 500 })
    const result = deposit(state, 200)

    expect(result.deposit).toBe(700)
    expect(result.cash).toBe(4_800)
  })

  it('succeeds from any city — deposits are no longer gated by currentCity', () => {
    // The old v1 model required state.currentCity === cityId; the pooled
    // redesign has no cityId param at all and no presence check whatsoever.
    const state = makeState({ currentCity: 'farrow', cash: 5_000, deposit: 0 })
    const result = deposit(state, 1_000)

    expect(result).not.toBe(state)
    expect(result.cash).toBe(4_000)
    expect(result.deposit).toBe(1_000)
  })

  it('rejects when amount <= 0', () => {
    const state = makeState({ cash: 5_000 })
    expect(deposit(state, 0)).toBe(state)
    expect(deposit(state, -50)).toBe(state)
  })

  it('rejects insufficient cash', () => {
    const state = makeState({ cash: 100 })
    const result = deposit(state, 101)

    expect(result).toBe(state)
    expect(result.cash).toBe(100)
  })
})

describe('withdraw', () => {
  it('moves money from the pooled deposit balance back into cash', () => {
    const state = makeState({ cash: 100, deposit: 1_000 })
    const result = withdraw(state, 400)

    expect(result.cash).toBe(500)
    expect(result.deposit).toBe(600)
  })

  it('succeeds from any city — withdrawals are no longer gated by currentCity', () => {
    const state = makeState({ currentCity: 'saltmere', cash: 100, deposit: 1_000 })
    const result = withdraw(state, 400)

    expect(result).not.toBe(state)
    expect(result.cash).toBe(500)
    expect(result.deposit).toBe(600)
  })

  it('rejects when there is nothing deposited yet (deposit unset, defaults to 0)', () => {
    const state = makeState({ cash: 100, deposit: undefined })
    const result = withdraw(state, 50)

    expect(result).toBe(state)
  })

  it('rejects insufficient balance', () => {
    const state = makeState({ cash: 100, deposit: 300 })
    const result = withdraw(state, 301)

    expect(result).toBe(state)
    expect(result.deposit).toBe(300)
  })

  it('rejects when amount <= 0', () => {
    const state = makeState({ deposit: 300 })
    expect(withdraw(state, 0)).toBe(state)
    expect(withdraw(state, -10)).toBe(state)
  })
})

describe('accrueDepositInterest', () => {
  it('matches a hand-computed compounding value over multiple days at the single flat globalDepositInterestDailyRate', () => {
    let state = makeState({ deposit: 10_000 })

    const DAYS = 10
    const rate = CONFIG.banking.globalDepositInterestDailyRate
    expect(rate).toBeCloseTo(0.0014, 10)

    for (let i = 0; i < DAYS; i++) {
      state = accrueDepositInterest(state)
    }

    const expected = 10_000 * Math.pow(1 + rate, DAYS)
    expect(state.deposit).toBeCloseTo(expected, 6)
  })

  it('applies the same flat rate regardless of which city the player is currently in', () => {
    // The pooled balance has no per-city bank-size rate anymore — the same
    // flat rate applies no matter state.currentCity.
    const rate = CONFIG.banking.globalDepositInterestDailyRate

    const farrowState = makeState({ currentCity: 'farrow', deposit: 1_000 })
    const portVelaState = makeState({ currentCity: 'port-vela', deposit: 1_000 })

    const farrowResult = accrueDepositInterest(farrowState)
    const portVelaResult = accrueDepositInterest(portVelaState)

    expect(farrowResult.deposit).toBeCloseTo(1_000 * (1 + rate), 6)
    expect(portVelaResult.deposit).toBeCloseTo(1_000 * (1 + rate), 6)
  })

  it('does not mutate the input state (returns a new object)', () => {
    const state = makeState({ deposit: 1_000 })
    const snapshot = JSON.parse(JSON.stringify(state))
    accrueDepositInterest(state)
    expect(state).toEqual(snapshot)
  })

  it('returns the identical state reference when the balance is zero', () => {
    const state = makeState({ deposit: 0 })
    const result = accrueDepositInterest(state)

    expect(result).toBe(state)
  })

  it('returns the identical state reference when deposit is unset (defaults to 0)', () => {
    const state = makeState({ deposit: undefined })
    const result = accrueDepositInterest(state)

    expect(result).toBe(state)
  })
})

describe('accrueDepositInterest — depositInterestThisFiscalYear accumulation (T030)', () => {
  it('accumulates the exact interest amount credited on the pooled balance in a single call', () => {
    const state = makeState({ deposit: 2_000 })

    const result = accrueDepositInterest(state)

    const expectedInterest = 2_000 * CONFIG.banking.globalDepositInterestDailyRate
    expect(result.depositInterestThisFiscalYear).toBeCloseTo(expectedInterest, 6)
  })

  it('defaults a missing prior depositInterestThisFiscalYear to 0 before accumulating', () => {
    const state = makeState({ deposit: 10_000 })
    expect(state.depositInterestThisFiscalYear).toBeUndefined()

    const result = accrueDepositInterest(state)

    expect(result.depositInterestThisFiscalYear).toBeCloseTo(
      10_000 * CONFIG.banking.globalDepositInterestDailyRate,
      6,
    )
  })

  it('accumulates across multiple days on top of a pre-existing running total', () => {
    let state = makeState({
      depositInterestThisFiscalYear: 50,
      deposit: 10_000,
    })

    state = accrueDepositInterest(state)
    state = accrueDepositInterest(state)

    // Day 1 interest: 10,000 * rate. Day 2 interest: (10,000 + day1 interest) * rate.
    const rate = CONFIG.banking.globalDepositInterestDailyRate
    const day1Interest = 10_000 * rate
    const day2Interest = (10_000 + day1Interest) * rate
    expect(state.depositInterestThisFiscalYear).toBeCloseTo(50 + day1Interest + day2Interest, 6)
  })

  it('does not accumulate when there is nothing to accrue (identical state reference)', () => {
    const state = makeState({
      depositInterestThisFiscalYear: 20,
      deposit: 0,
    })
    const result = accrueDepositInterest(state)
    expect(result).toBe(state)
    expect(result.depositInterestThisFiscalYear).toBe(20)
  })
})
