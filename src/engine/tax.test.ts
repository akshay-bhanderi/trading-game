import { describe, expect, it } from 'vitest'
import { CONFIG } from './config'
import { CITIES } from './data/cities'
import { accrueTaxDebtInterest, repayTaxDebt, runYearEnd } from './tax'
import type { City, GameState } from './types'

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
      // T068 fix: these three fields (added by the Phase 10-12 merges,
      // T049/T057/T064) were missing from this pre-existing exact-equality
      // assertion — it silently broke the moment tax.ts started always
      // populating them (0/0/0 here, since this fixture owns no hotels/
      // planes). See tasks/phase-13-final-balance-pass.md's T068 entry.
      hotelLicenseFeesPaid: 0,
      planeMaintenanceOwed: 0,
      planeMaintenancePaid: 0,
    })

    // Fiscal-year accumulators reset for the new year.
    expect(result.realizedProfitThisFiscalYear).toBe(0)
    expect(result.depositInterestThisFiscalYear).toBe(0)
  })

  it('falls back to draining the pooled deposit when cash alone is insufficient, and never goes negative', () => {
    const state = makeState({
      day: 90,
      cash: 1_000,
      // 2026-08 bank redesign: a single pooled state.deposit balance, not a
      // per-city bankAccounts[cityId].depositBalance — see bank/deposits.ts.
      deposit: 5_000,
      realizedProfitThisFiscalYear: 10_000,
      depositInterestThisFiscalYear: 0,
    })

    const result = runYearEnd(state)

    const expectedTax = 0.3 * 10_000 // 3,000
    expect(result.cash).toBe(0) // 1,000 all used
    // Remaining 2,000 drained from the pooled deposit.
    expect(result.deposit).toBeCloseTo(5_000 - (expectedTax - 1_000), 6)
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
  it('drains cash and the pooled deposit to exactly 0 and records the exact shortfall as taxDebt.principal', () => {
    const state = makeState({
      day: 90,
      cash: 1_000,
      deposit: 500,
      realizedProfitThisFiscalYear: 10_000,
      depositInterestThisFiscalYear: 0,
    })

    const result = runYearEnd(state)

    const taxOwed = 0.3 * 10_000 // 3,000
    const availableFunds = 1_000 + 500 // 1,500
    const expectedShortfall = taxOwed - availableFunds // 1,500

    expect(result.cash).toBe(0)
    expect(result.deposit).toBe(0)
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
      // T068 fix — see the identical note on the "profitable year" test above.
      hotelLicenseFeesPaid: 0,
      planeMaintenanceOwed: 0,
      planeMaintenancePaid: 0,
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

/**
 * T068 — deferred tests for the Phase 2 year-end billing hooks
 * (T049/T050 Warehouse, T057 Hotel, T064 Aviation) merged into `runYearEnd`
 * during Phases 10-12. Covers exactly what tax.ts's own file header
 * documents: plane maintenance billed ALONGSIDE tax from one combined pool,
 * then hotel license fee as a second sequential pass, then warehouse
 * maintenance+insurance as a third — each shortfall landing in the right
 * debt bucket (tax+hotel share `taxDebt`; warehouse gets its own
 * `warehouseMaintenanceDebt`), and none of it touched by the Noob
 * first-tax-year waiver (that waiver is tax-bill-only per §3).
 */
const FARROW = CITIES.find((c) => c.id === 'farrow') as City

describe('runYearEnd — T064 plane maintenance billed alongside tax (combined pool)', () => {
  it('deducts tax + planeMaintenanceOwedThisFiscalYear together from the same cash/deposits pool', () => {
    const state = makeState({
      day: 90,
      cash: 100_000,
      realizedProfitThisFiscalYear: 10_000,
      planeMaintenanceOwedThisFiscalYear: 2_000,
    })

    const result = runYearEnd(state)

    const taxOwed = 0.3 * 10_000
    expect(result.cash).toBeCloseTo(100_000 - taxOwed - 2_000, 6)
    expect(result.taxHistory[0]?.planeMaintenanceOwed).toBe(2_000)
    expect(result.taxHistory[0]?.planeMaintenancePaid).toBeCloseTo(2_000, 6)
    expect(result.planeMaintenanceOwedThisFiscalYear).toBe(0)
  })

  it('on a shortfall, attributes payment to TAX first (up to its own owed amount), remainder to plane maintenance', () => {
    const state = makeState({
      day: 90,
      cash: 3_500, // tax owed 3,000 + plane maintenance 2,000 = 5,000 combined, short by 1,500
      realizedProfitThisFiscalYear: 10_000,
      planeMaintenanceOwedThisFiscalYear: 2_000,
    })

    const result = runYearEnd(state)

    expect(result.cash).toBe(0)
    expect(result.taxHistory[0]?.taxPaid).toBeCloseTo(3_000, 6) // tax paid in full first
    expect(result.taxHistory[0]?.planeMaintenancePaid).toBeCloseTo(500, 6) // remainder
    expect(result.taxDebt?.principal).toBeCloseTo(1_500, 6) // the 1,500 shortfall
    expect(result.taxHistory[0]?.forcedLoanTriggered).toBe(true)
  })

  it('plane maintenance is NEVER waived by the Noob first-tax-year waiver, even though tax itself is', () => {
    const state = makeState({
      day: 90,
      difficulty: 'Noob',
      cash: 10_000,
      realizedProfitThisFiscalYear: 1_000_000, // would owe a huge tax, but waived
      planeMaintenanceOwedThisFiscalYear: 3_000,
    })

    const result = runYearEnd(state)

    expect(result.taxHistory[0]?.taxPaid).toBe(0) // tax waived
    expect(result.taxHistory[0]?.planeMaintenancePaid).toBeCloseTo(3_000, 6) // maintenance still billed
    expect(result.cash).toBeCloseTo(10_000 - 3_000, 6)
  })

  it('treats an absent planeMaintenanceOwedThisFiscalYear as 0 (no planes owned)', () => {
    const state = makeState({ day: 90, cash: 50_000, realizedProfitThisFiscalYear: 10_000 })
    const result = runYearEnd(state)
    expect(result.taxHistory[0]?.planeMaintenanceOwed).toBe(0)
    expect(result.taxHistory[0]?.planeMaintenancePaid).toBe(0)
  })
})

describe('runYearEnd — T057 hotel annual license fee (second sequential pass)', () => {
  it('deducts the hotel fee from whatever cash/deposits remain AFTER tax, as a separate TaxRecord field', () => {
    const hotelFee = (CONFIG.hotel.tiers[0]?.annualLicenseFeeMultiplier as number) * FARROW.hotelPerNight
    const state = makeState({
      day: 90,
      cash: 100_000,
      realizedProfitThisFiscalYear: 10_000,
      hotels: { farrow: { tier: 0 } },
    })

    const result = runYearEnd(state)

    const taxOwed = 0.3 * 10_000
    expect(result.cash).toBeCloseTo(100_000 - taxOwed - hotelFee, 6)
    expect(result.taxHistory[0]?.hotelLicenseFeesPaid).toBeCloseTo(hotelFee, 6)
  })

  it('a hotel-fee shortfall rolls into the SAME taxDebt bucket tax uses (not a separate one)', () => {
    const hotelFee = (CONFIG.hotel.tiers[0]?.annualLicenseFeeMultiplier as number) * FARROW.hotelPerNight
    const state = makeState({
      day: 90,
      cash: 0, // tax owed is 0 (no profit) but the hotel fee still can't be paid
      realizedProfitThisFiscalYear: 0,
      hotels: { farrow: { tier: 0 } },
    })

    const result = runYearEnd(state)

    expect(result.taxDebt?.principal).toBeCloseTo(hotelFee, 6)
    expect(result.warehouseMaintenanceDebt ?? null).toBeNull() // stays in the tax bucket, not warehouse's
    expect(result.taxHistory[0]?.forcedLoanTriggered).toBe(true)
  })

  it('is never waived by the Noob first-tax-year waiver', () => {
    const hotelFee = (CONFIG.hotel.tiers[0]?.annualLicenseFeeMultiplier as number) * FARROW.hotelPerNight
    const state = makeState({
      day: 90,
      difficulty: 'Noob',
      cash: 100_000,
      realizedProfitThisFiscalYear: 1_000_000,
      hotels: { farrow: { tier: 0 } },
    })
    const result = runYearEnd(state)
    expect(result.taxHistory[0]?.taxPaid).toBe(0) // tax waived
    expect(result.taxHistory[0]?.hotelLicenseFeesPaid).toBeCloseTo(hotelFee, 6) // fee still billed
  })

  it('treats no owned hotels as a $0 fee', () => {
    const state = makeState({ day: 90, cash: 50_000, realizedProfitThisFiscalYear: 10_000 })
    const result = runYearEnd(state)
    expect(result.taxHistory[0]?.hotelLicenseFeesPaid).toBe(0)
  })
})

describe('runYearEnd — T049/T050 warehouse maintenance + insurance (third sequential pass, SEPARATE debt bucket)', () => {
  it('deducts the warehouse bill from whatever remains AFTER tax and the hotel fee', () => {
    const warehouseBill = CONFIG.warehouse.floors[1]?.annualMaintenance as number
    const state = makeState({
      day: 90,
      cash: 100_000,
      realizedProfitThisFiscalYear: 10_000,
      warehouses: { farrow: { floorsBuilt: 1, insured: false } },
    })

    const result = runYearEnd(state)

    const taxOwed = 0.3 * 10_000
    expect(result.cash).toBeCloseTo(100_000 - taxOwed - warehouseBill, 6)
  })

  it('a warehouse-bill shortfall becomes warehouseMaintenanceDebt, NOT taxDebt', () => {
    const state = makeState({
      day: 90,
      cash: 0,
      realizedProfitThisFiscalYear: 0, // no tax owed
      warehouses: { farrow: { floorsBuilt: 1, insured: false } },
    })

    const result = runYearEnd(state)

    const warehouseBill = CONFIG.warehouse.floors[1]?.annualMaintenance as number
    expect(result.warehouseMaintenanceDebt?.principal).toBeCloseTo(warehouseBill, 6)
    expect(result.taxDebt ?? null).toBeNull() // stays in warehouse's own bucket
  })

  it('tops up an existing warehouseMaintenanceDebt, keeping the original startDay', () => {
    let state = makeState({
      day: 90,
      cash: 0,
      warehouses: { farrow: { floorsBuilt: 1, insured: false } },
    })
    state = runYearEnd(state)
    const firstPrincipal = state.warehouseMaintenanceDebt?.principal as number
    expect(state.warehouseMaintenanceDebt?.startDay).toBe(90)

    state = { ...state, day: 180, cash: 0 }
    state = runYearEnd(state)

    expect(state.warehouseMaintenanceDebt?.principal).toBeCloseTo(firstPrincipal * 2, 6)
    expect(state.warehouseMaintenanceDebt?.startDay).toBe(90) // unchanged
  })

  it('is never waived by the Noob first-tax-year waiver', () => {
    const warehouseBill = CONFIG.warehouse.floors[1]?.annualMaintenance as number
    const state = makeState({
      day: 90,
      difficulty: 'Noob',
      cash: 100_000,
      realizedProfitThisFiscalYear: 1_000_000,
      warehouses: { farrow: { floorsBuilt: 1, insured: false } },
    })
    const result = runYearEnd(state)
    expect(result.cash).toBeCloseTo(100_000 - warehouseBill, 6) // tax waived, warehouse bill still charged
  })

  it('treats no owned warehouses as a $0 bill', () => {
    const state = makeState({ day: 90, cash: 50_000, realizedProfitThisFiscalYear: 10_000 })
    const result = runYearEnd(state)
    expect(result.warehouseMaintenanceDebt ?? null).toBeNull()
  })
})

describe('runYearEnd — all three Phase 2 bills combined with tax, in one year-end', () => {
  it('bills plane maintenance (combined w/ tax), hotel fee, and warehouse bill all in the documented order, each landing in the right bucket on a full-shortfall run', () => {
    const hotelFee = (CONFIG.hotel.tiers[0]?.annualLicenseFeeMultiplier as number) * FARROW.hotelPerNight
    const warehouseBill = CONFIG.warehouse.floors[1]?.annualMaintenance as number

    const state = makeState({
      day: 90,
      cash: 0,
      realizedProfitThisFiscalYear: 10_000, // tax owed 3,000
      planeMaintenanceOwedThisFiscalYear: 1_000,
      hotels: { farrow: { tier: 0 } },
      warehouses: { farrow: { floorsBuilt: 1, insured: false } },
    })

    const result = runYearEnd(state)

    expect(result.cash).toBe(0)
    // Tax + plane maintenance (combined 4,000) and the hotel fee both land in taxDebt.
    expect(result.taxDebt?.principal).toBeCloseTo(3_000 + 1_000 + hotelFee, 6)
    // Warehouse's bill lands in its OWN separate bucket.
    expect(result.warehouseMaintenanceDebt?.principal).toBeCloseTo(warehouseBill, 6)
  })
})
