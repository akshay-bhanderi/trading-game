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
  it('creates a new BankAccount entry on the player\'s first-ever deposit at a city', () => {
    const state = makeState({ currentCity: 'farrow', cash: 5_000, bankAccounts: {} })
    const result = deposit(state, 'farrow', 1_000)

    expect(result).not.toBe(state)
    expect(result.cash).toBe(4_000)
    expect(result.bankAccounts['farrow']).toEqual({
      cityId: 'farrow',
      depositBalance: 1_000,
      loan: null,
    })
  })

  it('adds onto an existing BankAccount\'s depositBalance rather than replacing it', () => {
    const state = makeState({
      currentCity: 'farrow',
      cash: 5_000,
      bankAccounts: { farrow: { cityId: 'farrow', depositBalance: 500, loan: null } },
    })
    const result = deposit(state, 'farrow', 200)

    expect(result.bankAccounts['farrow']?.depositBalance).toBe(700)
    expect(result.cash).toBe(4_800)
  })

  it('rejects (no mutation) when state.currentCity !== cityId', () => {
    const state = makeState({ currentCity: 'farrow', cash: 5_000, bankAccounts: {} })
    const result = deposit(state, 'saltmere', 1_000)

    expect(result).toBe(state)
    expect(result.cash).toBe(5_000)
    expect(result.bankAccounts['saltmere']).toBeUndefined()
  })

  it('rejects when amount <= 0', () => {
    const state = makeState({ currentCity: 'farrow', cash: 5_000 })
    expect(deposit(state, 'farrow', 0)).toBe(state)
    expect(deposit(state, 'farrow', -50)).toBe(state)
  })

  it('rejects insufficient cash', () => {
    const state = makeState({ currentCity: 'farrow', cash: 100 })
    const result = deposit(state, 'farrow', 101)

    expect(result).toBe(state)
    expect(result.cash).toBe(100)
  })
})

describe('withdraw', () => {
  it('moves money from depositBalance back into cash', () => {
    const state = makeState({
      currentCity: 'farrow',
      cash: 100,
      bankAccounts: { farrow: { cityId: 'farrow', depositBalance: 1_000, loan: null } },
    })
    const result = withdraw(state, 'farrow', 400)

    expect(result.cash).toBe(500)
    expect(result.bankAccounts['farrow']?.depositBalance).toBe(600)
  })

  it('rejects (no mutation) when state.currentCity !== cityId', () => {
    const state = makeState({
      currentCity: 'farrow',
      cash: 100,
      bankAccounts: { saltmere: { cityId: 'saltmere', depositBalance: 1_000, loan: null } },
    })
    const result = withdraw(state, 'saltmere', 400)

    expect(result).toBe(state)
    expect(result.cash).toBe(100)
    expect(result.bankAccounts['saltmere']?.depositBalance).toBe(1_000)
  })

  it('rejects when the account does not exist yet', () => {
    const state = makeState({ currentCity: 'farrow', cash: 100, bankAccounts: {} })
    const result = withdraw(state, 'farrow', 50)

    expect(result).toBe(state)
  })

  it('rejects insufficient balance', () => {
    const state = makeState({
      currentCity: 'farrow',
      cash: 100,
      bankAccounts: { farrow: { cityId: 'farrow', depositBalance: 300, loan: null } },
    })
    const result = withdraw(state, 'farrow', 301)

    expect(result).toBe(state)
    expect(result.bankAccounts['farrow']?.depositBalance).toBe(300)
  })

  it('rejects when amount <= 0', () => {
    const state = makeState({
      currentCity: 'farrow',
      bankAccounts: { farrow: { cityId: 'farrow', depositBalance: 300, loan: null } },
    })
    expect(withdraw(state, 'farrow', 0)).toBe(state)
    expect(withdraw(state, 'farrow', -10)).toBe(state)
  })
})

describe('accrueDepositInterest', () => {
  it('matches a hand-computed compounding value over multiple days (Medium bank, rate 0.0014/day)', () => {
    // port-vela is a Medium-bank city (see /src/engine/data/cities.ts).
    let state = makeState({
      currentCity: 'port-vela',
      bankAccounts: { 'port-vela': { cityId: 'port-vela', depositBalance: 10_000, loan: null } },
    })

    const DAYS = 10
    const rate = CONFIG.banking.depositInterestDailyRates.Medium
    expect(rate).toBeCloseTo(0.0014, 10)

    for (let i = 0; i < DAYS; i++) {
      state = accrueDepositInterest(state)
    }

    const expected = 10_000 * Math.pow(1 + 0.0014, DAYS)
    expect(state.bankAccounts['port-vela']?.depositBalance).toBeCloseTo(expected, 6)
  })

  it('accrues independently per city at each city\'s own bank-size rate', () => {
    // farrow = Small (0.001/day), port-vela = Medium (0.0014/day).
    const state = makeState({
      bankAccounts: {
        farrow: { cityId: 'farrow', depositBalance: 1_000, loan: null },
        'port-vela': { cityId: 'port-vela', depositBalance: 1_000, loan: null },
      },
    })

    const result = accrueDepositInterest(state)

    expect(result.bankAccounts['farrow']?.depositBalance).toBeCloseTo(1_000 * 1.001, 6)
    expect(result.bankAccounts['port-vela']?.depositBalance).toBeCloseTo(1_000 * 1.0014, 6)
  })

  it('does not mutate the input state (returns a new object)', () => {
    const state = makeState({
      bankAccounts: { farrow: { cityId: 'farrow', depositBalance: 1_000, loan: null } },
    })
    const snapshot = JSON.parse(JSON.stringify(state))
    accrueDepositInterest(state)
    expect(state).toEqual(snapshot)
  })

  it('skips accounts with a zero depositBalance, and returns the identical state reference when nothing to accrue', () => {
    const state = makeState({
      bankAccounts: { farrow: { cityId: 'farrow', depositBalance: 0, loan: null } },
    })
    const result = accrueDepositInterest(state)

    expect(result).toBe(state)
  })

  it('returns the identical state reference when bankAccounts is empty', () => {
    const state = makeState({ bankAccounts: {} })
    const result = accrueDepositInterest(state)

    expect(result).toBe(state)
  })
})
