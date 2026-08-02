import { describe, expect, it } from 'vitest'
import { CONFIG } from '../config'
import {
  calcSurrenderSeizedValue,
  calcTotalDebt,
  checkDefaultTrigger,
  checkRestructureRecheck,
  resolveDefault,
  updateDefaultTracking,
  updateDefaultTrigger,
} from './default'
import type { GameState } from '../types'

/**
 * Builds a minimal-but-valid `GameState`, following the same pattern as
 * /src/engine/bank/loans.test.ts (T023).
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

describe('calcTotalDebt', () => {
  it('sums principal + accruedInterest across every bank account with an active loan', () => {
    const state = makeState({
      bankAccounts: {
        farrow: { cityId: 'farrow', loan: { principal: 800, accruedInterest: 50, startDay: 1, termDays: 60 } },
        saltmere: { cityId: 'saltmere', loan: { principal: 200, accruedInterest: 10, startDay: 1, termDays: 60 } },
        copperfell: { cityId: 'copperfell', loan: null },
      },
    })

    expect(calcTotalDebt(state)).toBe(1060)
  })
})

describe('checkDefaultTrigger — (a) overdue-loan condition', () => {
  it('does NOT trigger exactly at the boundary (day === startDay + termDays + overdueGraceDays)', () => {
    // startDay 1 + termDays 60 + overdueGraceDays 15 = day 76 exactly.
    const state = makeState({
      day: 76,
      bankAccounts: {
        farrow: { cityId: 'farrow', loan: { principal: 100, accruedInterest: 0, startDay: 1, termDays: 60 } },
      },
    })

    expect(checkDefaultTrigger(state)).toBeNull()
  })

  it('triggers one day past the boundary, identifying the overdue city', () => {
    const state = makeState({
      day: 77,
      bankAccounts: {
        farrow: { cityId: 'farrow', loan: { principal: 100, accruedInterest: 0, startDay: 1, termDays: 60 } },
      },
    })

    expect(checkDefaultTrigger(state)).toEqual({ triggeredBy: 'overdueLoan', cityId: 'farrow' })
  })

  it('ignores banks with no active loan', () => {
    const state = makeState({
      day: 1000,
      bankAccounts: {
        farrow: { cityId: 'farrow', loan: null },
      },
    })

    expect(checkDefaultTrigger(state)).toBeNull()
  })
})

describe('checkDefaultTrigger — (b) debt-ratio condition (via debtOverThresholdSinceDay)', () => {
  it('does NOT trigger at a 6-day diff', () => {
    const state = makeState({ day: 16, debtOverThresholdSinceDay: 10 })
    expect(checkDefaultTrigger(state)).toBeNull()
  })

  it('triggers at a 7-day diff, per the task-specified formula', () => {
    const state = makeState({ day: 17, debtOverThresholdSinceDay: 10 })
    expect(checkDefaultTrigger(state)).toEqual({ triggeredBy: 'debtRatio' })
  })

  it('does not trigger when the counter is not running (null)', () => {
    const state = makeState({ day: 5000, debtOverThresholdSinceDay: null })
    expect(checkDefaultTrigger(state)).toBeNull()
  })
})

describe('updateDefaultTracking', () => {
  // cash=300, no deposits, no cargo -> netWorth = 300 - debt.
  // debt=250 -> netWorth=50, 2x=100, 250 > 100 -> OVER threshold.
  // debt=150 -> netWorth=150, 2x=300, 150 > 300 is false -> UNDER threshold.
  const overLoan = { principal: 250, accruedInterest: 0, startDay: 1, termDays: 60 }
  const underLoan = { principal: 150, accruedInterest: 0, startDay: 1, termDays: 60 }

  it('STARTS the counter (sets debtOverThresholdSinceDay = today) when newly over-threshold', () => {
    const state = makeState({
      day: 5,
      cash: 300,
      debtOverThresholdSinceDay: null,
      bankAccounts: { farrow: { cityId: 'farrow', loan: overLoan } },
    })

    const result = updateDefaultTracking(state)

    expect(result).not.toBe(state)
    expect(result.debtOverThresholdSinceDay).toBe(5)
  })

  it('RESETS the counter (null) when debt drops back under threshold mid-streak', () => {
    const state = makeState({
      day: 10,
      cash: 300,
      debtOverThresholdSinceDay: 3,
      bankAccounts: { farrow: { cityId: 'farrow', loan: underLoan } },
    })

    const result = updateDefaultTracking(state)

    expect(result).not.toBe(state)
    expect(result.debtOverThresholdSinceDay).toBeNull()
  })

  it('LEAVES the counter alone (same reference) when already running and still over threshold', () => {
    const state = makeState({
      day: 8,
      cash: 300,
      debtOverThresholdSinceDay: 3,
      bankAccounts: { farrow: { cityId: 'farrow', loan: overLoan } },
    })

    const result = updateDefaultTracking(state)

    expect(result).toBe(state)
    expect(result.debtOverThresholdSinceDay).toBe(3)
  })

  it('LEAVES the counter alone (same reference) when not over threshold and wasn\'t running', () => {
    const state = makeState({
      day: 8,
      cash: 300,
      debtOverThresholdSinceDay: null,
      bankAccounts: { farrow: { cityId: 'farrow', loan: underLoan } },
    })

    const result = updateDefaultTracking(state)

    expect(result).toBe(state)
  })
})

describe('updateDefaultTrigger', () => {
  it('sets awaitingDefaultDecision once the debt-ratio streak reaches 7 days', () => {
    const overLoan = { principal: 250, accruedInterest: 0, startDay: 1, termDays: 60 }
    const state = makeState({
      day: 20,
      cash: 300,
      debtOverThresholdSinceDay: 13, // diff = 7
      bankAccounts: { farrow: { cityId: 'farrow', loan: overLoan } },
    })

    const result = updateDefaultTrigger(state)

    expect(result.awaitingDefaultDecision).toEqual({ triggeredBy: 'debtRatio' })
  })

  it('sets awaitingDefaultDecision for an overdue loan, identifying the city', () => {
    const state = makeState({
      day: 77,
      bankAccounts: {
        saltmere: { cityId: 'saltmere', loan: { principal: 100, accruedInterest: 0, startDay: 1, termDays: 60 } },
      },
    })

    const result = updateDefaultTrigger(state)

    expect(result.awaitingDefaultDecision).toEqual({ triggeredBy: 'overdueLoan', cityId: 'saltmere' })
  })

  it('never auto-clears an already-set awaitingDefaultDecision, even after the underlying condition resolves itself', () => {
    const overLoan = { principal: 250, accruedInterest: 0, startDay: 1, termDays: 60 }
    const state = makeState({
      day: 20,
      cash: 300,
      debtOverThresholdSinceDay: 13,
      bankAccounts: { farrow: { cityId: 'farrow', loan: overLoan } },
    })
    const afterTrigger = updateDefaultTrigger(state)
    expect(afterTrigger.awaitingDefaultDecision).toEqual({ triggeredBy: 'debtRatio' })

    // Next day, debt drops back under threshold (the condition "resolves
    // itself") — the flag must still remain set.
    const underLoan = { principal: 150, accruedInterest: 0, startDay: 1, termDays: 60 }
    const nextDayState: GameState = {
      ...afterTrigger,
      day: 21,
      bankAccounts: { farrow: { cityId: 'farrow', loan: underLoan } },
    }

    const result = updateDefaultTrigger(nextDayState)

    expect(result.awaitingDefaultDecision).toEqual({ triggeredBy: 'debtRatio' })
    // The underlying tracking counter itself DOES reset (it's independent
    // bookkeeping) — only the awaiting-decision flag is sticky.
    expect(result.debtOverThresholdSinceDay).toBeNull()
  })

  it('is a no-op (identical reference) when nothing changed and nothing triggers', () => {
    const state = makeState({ day: 1 })
    const result = updateDefaultTrigger(state)
    expect(result).toBe(state)
  })
})

describe('calcSurrenderSeizedValue', () => {
  it('matches a hand-computed example: (deposits + cargo value) * 0.7', () => {
    const state = makeState({
      currentCity: 'farrow',
      cash: 200,
      // 2026-08 bank redesign: a single pooled balance, not summed per city.
      deposit: 1_000,
      bankAccounts: {
        farrow: { cityId: 'farrow', loan: null },
        saltmere: { cityId: 'saltmere', loan: null },
      },
      cargo: { grain: { goodId: 'grain', qty: 50, avgBuyCost: 10, lots: [{ qty: 50, unitCost: 10 }] } },
      priceStates: {
        farrow: {
          grain: { cityId: 'farrow', goodId: 'grain', currentPrice: 10, lastSeenPrice: 10, lastSeenDay: 1, trendPosition: 0 },
        },
      },
    })

    // deposit (pooled): 1000; cargo: 50 * 10 = 500; total 1500 * 0.7 = 1050
    expect(calcSurrenderSeizedValue(state)).toBeCloseTo(1050, 6)
  })

  it('falls back to the good\'s basePrice when no price has ever been observed in the current city', () => {
    const state = makeState({
      currentCity: 'farrow',
      priceStates: {},
      cargo: { grain: { goodId: 'grain', qty: 10, avgBuyCost: 10, lots: [{ qty: 10, unitCost: 10 }] } },
    })

    // grain basePrice is $10 (data/goods.ts) -> 10 * 10 = 100
    expect(calcSurrenderSeizedValue(state)).toBeCloseTo(70, 6)
  })
})

describe('resolveDefault — surrender', () => {
  function surrenderState(loanPrincipal: number): GameState {
    return makeState({
      currentCity: 'farrow',
      cash: 200,
      repaymentRecord: 0.2,
      awaitingDefaultDecision: { triggeredBy: 'debtRatio' },
      // 2026-08 bank redesign: a single pooled balance, not summed per city.
      deposit: 1_000,
      bankAccounts: {
        farrow: {
          cityId: 'farrow',
          loan: { principal: loanPrincipal, accruedInterest: 50, startDay: 1, termDays: 60 },
        },
        saltmere: { cityId: 'saltmere', loan: null },
      },
      cargo: { grain: { goodId: 'grain', qty: 50, avgBuyCost: 10, lots: [{ qty: 50, unitCost: 10 }] } },
      priceStates: {
        farrow: {
          grain: { cityId: 'farrow', goodId: 'grain', currentPrice: 10, lastSeenPrice: 10, lastSeenDay: 1, trendPosition: 0 },
        },
      },
    })
  }

  it('zeroes ALL deposits and cargo, clears ALL loans, applies the -0.5 repaymentRecord penalty, and clears the awaiting flag — excess-seizure scenario (seized $1,050 > debt $850)', () => {
    const state = surrenderState(800) // debt = 800 + 50 = 850 < seizedValue 1050
    const result = resolveDefault(state, 'surrender')

    expect(result.bankAccounts['farrow']).toEqual({ cityId: 'farrow', loan: null })
    expect(result.bankAccounts['saltmere']).toEqual({ cityId: 'saltmere', loan: null })
    expect(result.deposit).toBe(0)
    expect(result.cargo).toEqual({})
    // Excess ($200) is forfeited to the bank, NOT refunded as cash.
    expect(result.cash).toBe(200)
    expect(result.repaymentRecord).toBeCloseTo(-0.3, 10)
    expect(result.awaitingDefaultDecision).toBeNull()
  })

  it('still fully clears the loan (write-off) in a shortfall scenario (seized $1,050 < debt $2,050)', () => {
    const state = surrenderState(2000) // debt = 2000 + 50 = 2050 > seizedValue 1050
    const result = resolveDefault(state, 'surrender')

    expect(result.bankAccounts['farrow']?.loan).toBeNull()
    expect(result.cash).toBe(200) // no cash mutation from surrender, regardless
  })

  it('clamps the repaymentRecord penalty at the -2 floor', () => {
    const state = surrenderState(800)
    state.repaymentRecord = -1.8
    const result = resolveDefault(state, 'surrender')

    expect(result.repaymentRecord).toBeGreaterThanOrEqual(CONFIG.rank.repaymentRecordClamp.min)
    expect(result.repaymentRecord).toBeCloseTo(-2, 10)
  })
})

describe('resolveDefault — restructure', () => {
  it('flags every active loan restructured, applies the -0.3 repaymentRecord penalty, schedules the 15-day recheck, and clears the awaiting flag', () => {
    const state = makeState({
      day: 50,
      repaymentRecord: 0.1,
      awaitingDefaultDecision: { triggeredBy: 'overdueLoan', cityId: 'farrow' },
      bankAccounts: {
        farrow: { cityId: 'farrow', loan: { principal: 500, accruedInterest: 20, startDay: 1, termDays: 60 } },
        saltmere: { cityId: 'saltmere', loan: null },
      },
    })

    const result = resolveDefault(state, 'restructure')

    expect(result.bankAccounts['farrow']?.loan).toEqual({
      principal: 500,
      accruedInterest: 20,
      startDay: 1,
      termDays: 60,
      restructured: true,
    })
    // Accounts with no loan are left untouched.
    expect(result.bankAccounts['saltmere']).toEqual({ cityId: 'saltmere', loan: null })
    expect(result.repaymentRecord).toBeCloseTo(-0.2, 10)
    expect(result.restructureRecheckDay).toBe(50 + CONFIG.banking.default.restructure.recheckAfterDays)
    expect(result.awaitingDefaultDecision).toBeNull()
    expect(result.gameOver).not.toBe(true)
  })
})

describe('resolveDefault — bankruptcy', () => {
  it('sets gameOver, clears the awaiting flag, and leaves peakNetWorth (the final score) untouched', () => {
    const state = makeState({
      peakNetWorth: 123_456,
      awaitingDefaultDecision: { triggeredBy: 'debtRatio' },
    })

    const result = resolveDefault(state, 'bankruptcy')

    expect(result.gameOver).toBe(true)
    expect(result.awaitingDefaultDecision).toBeNull()
    expect(result.peakNetWorth).toBe(123_456)
  })
})

describe('checkRestructureRecheck', () => {
  it('is a no-op before the recheck day arrives', () => {
    const state = makeState({ day: 50, restructureRecheckDay: 100 })
    const result = checkRestructureRecheck(state)
    expect(result).toBe(state)
  })

  it('is a no-op when no recheck is pending', () => {
    const state = makeState({ day: 500, restructureRecheckDay: null })
    const result = checkRestructureRecheck(state)
    expect(result).toBe(state)
  })

  it('forces gameOver when still over-threshold at the recheck day', () => {
    // cash=300, debt=250 -> netWorth=50, 2x=100, 250 > 100 -> over threshold.
    const state = makeState({
      day: 65,
      cash: 300,
      restructureRecheckDay: 65,
      bankAccounts: {
        farrow: { cityId: 'farrow', loan: { principal: 250, accruedInterest: 0, startDay: 1, termDays: 60 } },
      },
    })

    const result = checkRestructureRecheck(state)

    expect(result.gameOver).toBe(true)
    expect(result.restructureRecheckDay).toBeNull()
  })

  it('clears the pending recheck WITHOUT forcing gameOver when back under threshold', () => {
    // cash=300, debt=150 -> netWorth=150, 2x=300, 150 > 300 is false -> under threshold.
    const state = makeState({
      day: 66,
      cash: 300,
      restructureRecheckDay: 65,
      bankAccounts: {
        farrow: { cityId: 'farrow', loan: { principal: 150, accruedInterest: 0, startDay: 1, termDays: 60 } },
      },
    })

    const result = checkRestructureRecheck(state)

    expect(result.gameOver).not.toBe(true)
    expect(result.restructureRecheckDay).toBeNull()
  })
})
