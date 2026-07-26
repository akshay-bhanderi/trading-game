import { describe, expect, it } from 'vitest'
import { CONFIG } from './config'
import { accrueTaxDebtInterest, repayTaxDebt, runYearEnd } from './tax'
import type { GameState } from './types'

/**
 * Builds a minimal-but-valid `GameState` for tax-engine tests, following the
 * same pattern as /src/engine/bank/deposits.test.ts and
 * /src/engine/actions/trade.test.ts.
 */
function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    day: 90,
    currentCity: 'farrow',
    cash: 0,
    cargo: {},
    cargoCapacity: CONFIG.cargo.startingCapacity,
    bankAccounts: {},
    priceStates: {},
    unlockedCityIds: ['farrow'],
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

describe('runYearEnd — defensive no-op', () => {
  it('does nothing (returns the identical state reference) on a non-year-end day', () => {
    const state = makeState({ day: 91, realizedProfitThisFiscalYear: 5000 })
    const result = runYearEnd(state)
    expect(result).toBe(state)
  })
})

describe('runYearEnd — profitable year', () => {
  it('taxes realized profit + deposit interest at the flat 30% no-CA rate, deducts from cash, records history, resets accumulators', () => {
    const state = makeState({
      day: 90,
      cash: 50_000,
      realizedProfitThisFiscalYear: 10_000,
      depositInterestThisFiscalYear: 500,
    })

    const result = runYearEnd(state)

    const expectedTax = 0.3 * (10_000 + 500)
    expect(expectedTax).toBeCloseTo(3_150, 6)

    expect(result.cash).toBeCloseTo(50_000 - expectedTax, 6)
    expect(result.taxDebt ?? null).toBeNull()
    expect(result.taxHistory).toHaveLength(1)
    expect(result.taxHistory[0]).toEqual({
      fiscalYear: 1,
      yearEndDay: 90,
      realizedProfit: 10_000,
      depositInterestEarned: 500,
      taxPaid: expectedTax,
      caTierActive: 'none',
      forcedLoanTriggered: false,
    })

    // Fiscal-year accumulators reset for the new year.
    expect(result.realizedProfitThisFiscalYear).toBe(0)
    expect(result.depositInterestThisFiscalYear).toBe(0)
  })

  it('falls back to draining deposits when cash alone is insufficient, and never goes negative', () => {
    const state = makeState({
      day: 90,
      cash: 1_000,
      bankAccounts: {
        farrow: { cityId: 'farrow', depositBalance: 5_000, loan: null },
      },
      realizedProfitThisFiscalYear: 10_000,
      depositInterestThisFiscalYear: 0,
    })

    const result = runYearEnd(state)

    const expectedTax = 0.3 * 10_000 // 3,000
    expect(result.cash).toBe(0) // 1,000 all used
    // Remaining 2,000 drained from the farrow deposit.
    expect(result.bankAccounts['farrow']?.depositBalance).toBeCloseTo(5_000 - (expectedTax - 1_000), 6)
    expect(result.taxDebt ?? null).toBeNull()
    expect(result.taxHistory[0]?.taxPaid).toBeCloseTo(expectedTax, 6)
    expect(result.taxHistory[0]?.forcedLoanTriggered).toBe(false)
  })

  it('computes a whole fiscalYear number from state.day / yearLengthDays (day 180 -> year 2)', () => {
    const state = makeState({ day: 180, cash: 100_000 })
    const result = runYearEnd(state)
    expect(result.taxHistory[0]?.fiscalYear).toBe(2)
    expect(result.taxHistory[0]?.yearEndDay).toBe(180)
  })

  it('clamps a negative taxable base (a losing year) to $0 tax rather than a refund', () => {
    const state = makeState({
      day: 90,
      cash: 1_000,
      realizedProfitThisFiscalYear: -5_000,
      depositInterestThisFiscalYear: 100,
    })

    const result = runYearEnd(state)

    expect(result.taxHistory[0]?.taxPaid).toBe(0)
    expect(result.cash).toBe(1_000)
    expect(result.taxDebt ?? null).toBeNull()
  })
})

describe('runYearEnd — shortfall becomes a forced tax-debt loan', () => {
  it('drains cash and deposits to exactly 0 and records the exact shortfall as taxDebt.principal', () => {
    const state = makeState({
      day: 90,
      cash: 1_000,
      bankAccounts: {
        farrow: { cityId: 'farrow', depositBalance: 500, loan: null },
      },
      realizedProfitThisFiscalYear: 10_000,
      depositInterestThisFiscalYear: 0,
    })

    const result = runYearEnd(state)

    const taxOwed = 0.3 * 10_000 // 3,000
    const availableFunds = 1_000 + 500 // 1,500
    const expectedShortfall = taxOwed - availableFunds // 1,500

    expect(result.cash).toBe(0)
    expect(result.bankAccounts['farrow']?.depositBalance).toBe(0)
    expect(result.taxDebt).not.toBeNull()
    expect(result.taxDebt?.principal).toBeCloseTo(expectedShortfall, 6)
    expect(result.taxDebt?.accruedInterest).toBe(0)
    expect(result.taxDebt?.startDay).toBe(90)

    expect(result.taxHistory[0]?.forcedLoanTriggered).toBe(true)
    expect(result.taxHistory[0]?.taxPaid).toBeCloseTo(availableFunds, 6)
  })

  it('tops up an existing taxDebt on a second consecutive shortfall year, keeping the original startDay', () => {
    let state = makeState({
      day: 90,
      cash: 0,
      realizedProfitThisFiscalYear: 10_000, // tax owed 3,000, fully unpaid
    })
    state = runYearEnd(state)
    expect(state.taxDebt?.principal).toBeCloseTo(3_000, 6)
    expect(state.taxDebt?.startDay).toBe(90)

    // Second year-end, still no cash, another shortfall.
    state = { ...state, day: 180, cash: 0, realizedProfitThisFiscalYear: 5_000 }
    state = runYearEnd(state)

    expect(state.taxDebt?.principal).toBeCloseTo(3_000 + 0.3 * 5_000, 6)
    expect(state.taxDebt?.startDay).toBe(90) // unchanged — original shortfall day
  })
})

describe('runYearEnd — Noob first-tax-year waiver', () => {
  it('waives tax entirely on a Noob game\'s first year-end even with a large profit, but still records a $0 TaxRecord and resets accumulators', () => {
    const state = makeState({
      day: 90,
      difficulty: 'Noob',
      cash: 10_000,
      realizedProfitThisFiscalYear: 1_000_000,
      depositInterestThisFiscalYear: 10_000,
    })

    const result = runYearEnd(state)

    expect(result.cash).toBe(10_000) // untouched
    expect(result.taxDebt ?? null).toBeNull()
    expect(result.taxHistory).toHaveLength(1)
    expect(result.taxHistory[0]).toEqual({
      fiscalYear: 1,
      yearEndDay: 90,
      realizedProfit: 1_000_000,
      depositInterestEarned: 10_000,
      taxPaid: 0,
      caTierActive: 'none',
      forcedLoanTriggered: false,
    })
    expect(result.realizedProfitThisFiscalYear).toBe(0)
    expect(result.depositInterestThisFiscalYear).toBe(0)
  })

  it('taxes normally on a Noob game\'s SECOND year-end (day 180)', () => {
    const state = makeState({
      day: 180,
      difficulty: 'Noob',
      cash: 100_000,
      realizedProfitThisFiscalYear: 10_000,
      depositInterestThisFiscalYear: 0,
    })

    const result = runYearEnd(state)

    const expectedTax = 0.3 * 10_000
    expect(result.taxHistory[0]?.fiscalYear).toBe(2)
    expect(result.taxHistory[0]?.taxPaid).toBeCloseTo(expectedTax, 6)
    expect(result.cash).toBeCloseTo(100_000 - expectedTax, 6)
  })

  it('taxes normally on a non-Noob (Pro) game\'s first year-end', () => {
    const state = makeState({
      day: 90,
      difficulty: 'Pro',
      cash: 100_000,
      realizedProfitThisFiscalYear: 10_000,
      depositInterestThisFiscalYear: 0,
    })

    const result = runYearEnd(state)
    expect(result.taxHistory[0]?.taxPaid).toBeCloseTo(3_000, 6)
  })
})

describe('accrueTaxDebtInterest', () => {
  it('accrues simple daily interest at the Huge-rate penalty (1.2%/day) on principal only', () => {
    const state = makeState({
      taxDebt: { principal: 10_000, accruedInterest: 0, startDay: 90 },
    })

    const result = accrueTaxDebtInterest(state)

    expect(result.taxDebt?.principal).toBe(10_000) // unchanged — simple interest
    expect(result.taxDebt?.accruedInterest).toBeCloseTo(10_000 * CONFIG.tax.forcedLoanPenaltyDailyRate, 6)
  })

  it('accumulates across multiple days without compounding the principal', () => {
    let state = makeState({
      taxDebt: { principal: 10_000, accruedInterest: 0, startDay: 90 },
    })

    for (let i = 0; i < 5; i++) {
      state = accrueTaxDebtInterest(state)
    }

    expect(state.taxDebt?.principal).toBe(10_000)
    expect(state.taxDebt?.accruedInterest).toBeCloseTo(10_000 * CONFIG.tax.forcedLoanPenaltyDailyRate * 5, 6)
  })

  it('returns the identical state reference when there is no outstanding tax debt', () => {
    const state = makeState({ taxDebt: null })
    const result = accrueTaxDebtInterest(state)
    expect(result).toBe(state)
  })
})

describe('repayTaxDebt', () => {
  it('applies repayment to accruedInterest first, then principal', () => {
    const state = makeState({
      cash: 1_000,
      taxDebt: { principal: 5_000, accruedInterest: 200, startDay: 90 },
    })

    const result = repayTaxDebt(state, 300)

    expect(result.cash).toBe(700)
    expect(result.taxDebt?.accruedInterest).toBe(0) // 200 paid off
    expect(result.taxDebt?.principal).toBe(5_000 - 100) // remaining 100 hits principal
  })

  it('fully clears taxDebt back to null on full repayment', () => {
    const state = makeState({
      cash: 10_000,
      taxDebt: { principal: 5_000, accruedInterest: 200, startDay: 90 },
    })

    const result = repayTaxDebt(state, 5_200)

    expect(result.taxDebt).toBeNull()
    expect(result.cash).toBe(10_000 - 5_200)
  })

  it('never charges more cash than the outstanding debt actually owed (excess ignored)', () => {
    const state = makeState({
      cash: 10_000,
      taxDebt: { principal: 5_000, accruedInterest: 200, startDay: 90 },
    })

    const result = repayTaxDebt(state, 9_000) // way more than the 5,200 owed

    expect(result.taxDebt).toBeNull()
    expect(result.cash).toBe(10_000 - 5_200) // only the actual debt was deducted
  })

  it('rejects (no mutation) when there is no outstanding tax debt', () => {
    const state = makeState({ cash: 1_000, taxDebt: null })
    const result = repayTaxDebt(state, 100)
    expect(result).toBe(state)
  })

  it('rejects amount <= 0', () => {
    const state = makeState({
      cash: 1_000,
      taxDebt: { principal: 5_000, accruedInterest: 200, startDay: 90 },
    })
    expect(repayTaxDebt(state, 0)).toBe(state)
    expect(repayTaxDebt(state, -50)).toBe(state)
  })

  it('rejects amount > state.cash', () => {
    const state = makeState({
      cash: 100,
      taxDebt: { principal: 5_000, accruedInterest: 200, startDay: 90 },
    })
    const result = repayTaxDebt(state, 101)
    expect(result).toBe(state)
  })

  it('does not touch repaymentRecord (tax debt is not a Loan)', () => {
    const state = makeState({
      cash: 10_000,
      repaymentRecord: 0,
      taxDebt: { principal: 5_000, accruedInterest: 200, startDay: 90 },
    })
    const result = repayTaxDebt(state, 5_200)
    expect(result.repaymentRecord).toBe(0)
  })
})
