import { describe, expect, it } from 'vitest'
import { CONFIG } from '../config'
import { accrueLoanInterest, rankFactor, repayLoan, takeLoan } from './loans'
import type { GameState } from '../types'

/**
 * Builds a minimal-but-valid `GameState`, following the same pattern as
 * /src/engine/bank/deposits.test.ts (T022).
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

describe('rankFactor', () => {
  it('is 1x at rank 1 and matches §9\'s "each rank ×1.8" progression', () => {
    expect(rankFactor(1)).toBe(1)
    expect(rankFactor(2)).toBeCloseTo(1.8, 10)
    expect(rankFactor(3)).toBeCloseTo(1.8 * 1.8, 10)
  })

  it('rank 10 is approximately 198x, per §9\'s stated approximation', () => {
    expect(rankFactor(10)).toBeCloseTo(1.8 ** 9, 10)
    expect(rankFactor(10)).toBeGreaterThan(190)
    expect(rankFactor(10)).toBeLessThan(210)
  })
})

describe('takeLoan', () => {
  it('issues a loan up to exactly the cap (rank 1, Small bank: $1,000 * 1.8^0 = $1,000)', () => {
    const state = makeState({ currentCity: 'farrow', cash: 500, rankCache: { value: 1, computedOnDay: 0 } })
    const result = takeLoan(state, 'farrow', 1_000)

    expect(result).not.toBe(state)
    expect(result.cash).toBe(1_500)
    expect(result.bankAccounts['farrow']).toEqual({
      cityId: 'farrow',
      depositBalance: 0,
      loan: { principal: 1_000, accruedInterest: 0, startDay: 1, termDays: CONFIG.banking.loanTermDays },
    })
  })

  it('rejects (no mutation) an amount exceeding the rank-scaled cap (rank 1, Small bank: cap = $1,000, requesting $1,001)', () => {
    const state = makeState({ currentCity: 'farrow', cash: 500, rankCache: { value: 1, computedOnDay: 0 } })
    const result = takeLoan(state, 'farrow', 1_001)

    expect(result).toBe(state)
    expect(result.cash).toBe(500)
    expect(result.bankAccounts['farrow']).toBeUndefined()
  })

  it('scales the cap up with a higher cached rank (rank 3, Small bank: cap = 1000 * 1.8^2 = 3240)', () => {
    const state = makeState({ currentCity: 'farrow', cash: 0, rankCache: { value: 3, computedOnDay: 0 } })

    expect(takeLoan(state, 'farrow', 3_240)).not.toBe(state)
    expect(takeLoan(state, 'farrow', 3_241)).toBe(state)
  })

  it('uses the cached rankCache.value, not a freshly recomputed rank', () => {
    // Give the state huge net worth (which would drive a fresh computeRank()
    // way up) but keep the CACHED rank pinned low at 1 — the cap must follow
    // the stale cache, not the fresh value, per this file's documented
    // cached-vs-fresh design decision.
    const state = makeState({
      currentCity: 'farrow',
      cash: 10_000_000,
      cumulativeTradeVolume: 10_000_000,
      rankCache: { value: 1, computedOnDay: 0 },
    })

    // Cap at cached rank 1 on a Small bank is exactly $1,000.
    expect(takeLoan(state, 'farrow', 1_000)).not.toBe(state)
    expect(takeLoan(state, 'farrow', 1_001)).toBe(state)
  })

  it('rejects (no mutation) when state.currentCity !== cityId', () => {
    const state = makeState({ currentCity: 'farrow', cash: 500 })
    const result = takeLoan(state, 'saltmere', 500)

    expect(result).toBe(state)
    expect(result.bankAccounts['saltmere']).toBeUndefined()
  })

  it('rejects when amount <= 0', () => {
    const state = makeState({ currentCity: 'farrow' })
    expect(takeLoan(state, 'farrow', 0)).toBe(state)
    expect(takeLoan(state, 'farrow', -100)).toBe(state)
  })

  it('rejects a second loan at a bank that already has an active loan (one active loan per bank)', () => {
    const state = makeState({
      currentCity: 'farrow',
      bankAccounts: {
        farrow: {
          cityId: 'farrow',
          depositBalance: 0,
          loan: { principal: 500, accruedInterest: 0, startDay: 1, termDays: 60 },
        },
      },
    })
    const result = takeLoan(state, 'farrow', 100)

    expect(result).toBe(state)
  })

  it('rejects a brand-new 4th bank loan once 3 DIFFERENT banks already carry active loans', () => {
    const activeLoan = { principal: 100, accruedInterest: 0, startDay: 1, termDays: 60 }
    const state = makeState({
      currentCity: 'millbrook',
      cash: 100,
      rankCache: { value: 5, computedOnDay: 0 }, // generous cap, not the blocker under test
      bankAccounts: {
        farrow: { cityId: 'farrow', depositBalance: 0, loan: activeLoan },
        saltmere: { cityId: 'saltmere', depositBalance: 0, loan: activeLoan },
        copperfell: { cityId: 'copperfell', depositBalance: 0, loan: activeLoan },
      },
    })

    const result = takeLoan(state, 'millbrook', 100)

    expect(result).toBe(state)
    expect(result.bankAccounts['millbrook']).toBeUndefined()
  })

  it('allows a 4th bank loan when one of the existing 3 has already been fully repaid (loan: null)', () => {
    const activeLoan = { principal: 100, accruedInterest: 0, startDay: 1, termDays: 60 }
    const state = makeState({
      currentCity: 'millbrook',
      cash: 0,
      rankCache: { value: 5, computedOnDay: 0 },
      bankAccounts: {
        farrow: { cityId: 'farrow', depositBalance: 0, loan: null },
        saltmere: { cityId: 'saltmere', depositBalance: 0, loan: activeLoan },
        copperfell: { cityId: 'copperfell', depositBalance: 0, loan: activeLoan },
      },
    })

    const result = takeLoan(state, 'millbrook', 100)

    expect(result).not.toBe(state)
    expect(result.bankAccounts['millbrook']?.loan).not.toBeNull()
  })
})

describe('accrueLoanInterest', () => {
  it('matches a hand-computed SIMPLE interest value over N days (Medium bank, 0.7%/day, Pro difficulty 1.0x): $5,000 * 0.007 * 10 = $350 exactly', () => {
    // ironvale is a Medium-bank city (see /src/engine/data/cities.ts).
    let state = makeState({
      currentCity: 'ironvale',
      difficulty: 'Pro',
      bankAccounts: {
        ironvale: {
          cityId: 'ironvale',
          depositBalance: 0,
          loan: { principal: 5_000, accruedInterest: 0, startDay: 1, termDays: 60 },
        },
      },
    })

    const DAYS = 10
    for (let i = 0; i < DAYS; i++) {
      state = accrueLoanInterest(state)
    }

    // Simple interest: no compounding drift, so this should be exact —
    // still using toBeCloseTo defensively for floating-point safety.
    expect(state.bankAccounts['ironvale']?.loan?.accruedInterest).toBeCloseTo(350, 6)
    // Principal must stay FIXED — simple interest never grows the principal.
    expect(state.bankAccounts['ironvale']?.loan?.principal).toBe(5_000)
  })

  it('applies the difficulty loan-interest multiplier (Expert 1.25x)', () => {
    let state = makeState({
      currentCity: 'ironvale',
      difficulty: 'Expert',
      bankAccounts: {
        ironvale: {
          cityId: 'ironvale',
          depositBalance: 0,
          loan: { principal: 5_000, accruedInterest: 0, startDay: 1, termDays: 60 },
        },
      },
    })

    state = accrueLoanInterest(state)

    const expected = 5_000 * CONFIG.banking.loanInterestDailyRates.Medium * CONFIG.difficulty.Expert.loanInterestMultiplier
    expect(state.bankAccounts['ironvale']?.loan?.accruedInterest).toBeCloseTo(expected, 6)
  })

  it('skips accounts with no active loan, and returns the identical state reference when nothing to accrue', () => {
    const state = makeState({
      bankAccounts: { farrow: { cityId: 'farrow', depositBalance: 1_000, loan: null } },
    })
    const result = accrueLoanInterest(state)

    expect(result).toBe(state)
  })

  it('does not mutate the input state (returns a new object)', () => {
    const state = makeState({
      bankAccounts: {
        farrow: {
          cityId: 'farrow',
          depositBalance: 0,
          loan: { principal: 1_000, accruedInterest: 0, startDay: 1, termDays: 60 },
        },
      },
    })
    const snapshot = JSON.parse(JSON.stringify(state))
    accrueLoanInterest(state)
    expect(state).toEqual(snapshot)
  })
})

describe('repayLoan', () => {
  it('pays down accruedInterest FIRST, then principal with any remainder', () => {
    const state = makeState({
      currentCity: 'farrow',
      cash: 1_000,
      bankAccounts: {
        farrow: {
          cityId: 'farrow',
          depositBalance: 0,
          loan: { principal: 500, accruedInterest: 50, startDay: 1, termDays: 60 },
        },
      },
    })

    // Pay 60: should clear all 50 of accruedInterest, then 10 off principal.
    const result = repayLoan(state, 'farrow', 60)

    expect(result.bankAccounts['farrow']?.loan).toEqual({
      principal: 490,
      accruedInterest: 0,
      startDay: 1,
      termDays: 60,
    })
    expect(result.cash).toBe(940)
  })

  it('bumps repaymentRecord by +0.1 on a full ON-TIME repayment (day within term) and clears the loan', () => {
    const state = makeState({
      currentCity: 'farrow',
      day: 30,
      cash: 1_000,
      repaymentRecord: 0,
      bankAccounts: {
        farrow: {
          cityId: 'farrow',
          depositBalance: 0,
          loan: { principal: 500, accruedInterest: 20, startDay: 1, termDays: 60 }, // term ends day 61
        },
      },
    })

    const result = repayLoan(state, 'farrow', 520)

    expect(result.bankAccounts['farrow']?.loan).toBeNull()
    expect(result.repaymentRecord).toBeCloseTo(0.1, 10)
    expect(result.cash).toBe(480)
  })

  it('clears the loan on a full LATE repayment (past term) but does NOT bump repaymentRecord', () => {
    const state = makeState({
      currentCity: 'farrow',
      day: 100, // well past startDay 1 + termDays 60 = day 61
      cash: 1_000,
      repaymentRecord: 0,
      bankAccounts: {
        farrow: {
          cityId: 'farrow',
          depositBalance: 0,
          loan: { principal: 500, accruedInterest: 20, startDay: 1, termDays: 60 },
        },
      },
    })

    const result = repayLoan(state, 'farrow', 520)

    expect(result.bankAccounts['farrow']?.loan).toBeNull()
    expect(result.repaymentRecord).toBe(0)
  })

  it('does NOT bump repaymentRecord on a PARTIAL repayment, even within term', () => {
    const state = makeState({
      currentCity: 'farrow',
      day: 10,
      cash: 1_000,
      repaymentRecord: 0,
      bankAccounts: {
        farrow: {
          cityId: 'farrow',
          depositBalance: 0,
          loan: { principal: 500, accruedInterest: 20, startDay: 1, termDays: 60 },
        },
      },
    })

    const result = repayLoan(state, 'farrow', 100)

    expect(result.bankAccounts['farrow']?.loan).not.toBeNull()
    expect(result.repaymentRecord).toBe(0)
  })

  it('clamps the repaymentRecord bump so it never exceeds the +2 ceiling', () => {
    const state = makeState({
      currentCity: 'farrow',
      day: 5,
      cash: 1_000,
      repaymentRecord: 1.95,
      bankAccounts: {
        farrow: {
          cityId: 'farrow',
          depositBalance: 0,
          loan: { principal: 100, accruedInterest: 0, startDay: 1, termDays: 60 },
        },
      },
    })

    const result = repayLoan(state, 'farrow', 100)

    expect(result.repaymentRecord).toBeLessThanOrEqual(CONFIG.rank.repaymentRecordClamp.max)
    expect(result.repaymentRecord).toBeCloseTo(2, 10)
  })

  it('rejects (no mutation) when there is no active loan at that bank', () => {
    const state = makeState({
      currentCity: 'farrow',
      cash: 1_000,
      bankAccounts: { farrow: { cityId: 'farrow', depositBalance: 0, loan: null } },
    })
    const result = repayLoan(state, 'farrow', 100)

    expect(result).toBe(state)
  })

  it('rejects (no mutation) when state.currentCity !== cityId', () => {
    const state = makeState({
      currentCity: 'farrow',
      cash: 1_000,
      bankAccounts: {
        saltmere: {
          cityId: 'saltmere',
          depositBalance: 0,
          loan: { principal: 100, accruedInterest: 0, startDay: 1, termDays: 60 },
        },
      },
    })
    const result = repayLoan(state, 'saltmere', 100)

    expect(result).toBe(state)
  })

  it('rejects when amount <= 0', () => {
    const state = makeState({
      currentCity: 'farrow',
      cash: 1_000,
      bankAccounts: {
        farrow: {
          cityId: 'farrow',
          depositBalance: 0,
          loan: { principal: 100, accruedInterest: 0, startDay: 1, termDays: 60 },
        },
      },
    })
    expect(repayLoan(state, 'farrow', 0)).toBe(state)
    expect(repayLoan(state, 'farrow', -10)).toBe(state)
  })

  it('rejects when amount exceeds available cash', () => {
    const state = makeState({
      currentCity: 'farrow',
      cash: 50,
      bankAccounts: {
        farrow: {
          cityId: 'farrow',
          depositBalance: 0,
          loan: { principal: 100, accruedInterest: 0, startDay: 1, termDays: 60 },
        },
      },
    })
    const result = repayLoan(state, 'farrow', 51)

    expect(result).toBe(state)
  })

  it('never applies/charges more than the outstanding debt on an overpayment', () => {
    const state = makeState({
      currentCity: 'farrow',
      cash: 1_000,
      repaymentRecord: 0,
      day: 5,
      bankAccounts: {
        farrow: {
          cityId: 'farrow',
          depositBalance: 0,
          loan: { principal: 100, accruedInterest: 0, startDay: 1, termDays: 60 },
        },
      },
    })

    const result = repayLoan(state, 'farrow', 500)

    expect(result.bankAccounts['farrow']?.loan).toBeNull()
    expect(result.cash).toBe(900) // only the $100 owed was deducted, not the full $500
    expect(result.repaymentRecord).toBeCloseTo(0.1, 10)
  })
})
