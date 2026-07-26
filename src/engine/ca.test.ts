import { describe, expect, it } from 'vitest'
import { CONFIG } from './config'
import { hireCA, isCAHiringAvailable } from './ca'
import { runYearEnd } from './tax'
import type { GameState } from './types'

/** Same minimal-fixture pattern as tax.test.ts. */
function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    day: 90,
    currentCity: 'farrow',
    cash: 0,
    cargo: {},
    cargoCapacity: CONFIG.cargo.startingCapacity,
    bankAccounts: {},
    priceStates: {},
    unlockedCityIds: ['farrow', 'port-vela'],
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

describe('isCAHiringAvailable', () => {
  it('is false at a Small-bank city (Farrow)', () => {
    expect(isCAHiringAvailable(makeState({ currentCity: 'farrow' }))).toBe(false)
  })

  it('is true at a Medium-bank city (Port Vela)', () => {
    expect(isCAHiringAvailable(makeState({ currentCity: 'port-vela' }))).toBe(true)
  })
})

describe('hireCA — gating', () => {
  it('rejects hiring at a Small-bank city, even with ample cash', () => {
    const state = makeState({ currentCity: 'farrow', cash: 1_000_000 })
    const result = hireCA(state, 'junior')
    expect(result).toBe(state)
  })

  it('rejects hiring when cash is below the tier annual fee', () => {
    const state = makeState({ currentCity: 'port-vela', cash: 1_000 })
    const result = hireCA(state, 'junior') // fee = $25,000
    expect(result).toBe(state)
  })

  it('succeeds at a Medium+ bank city with sufficient cash: deducts the fee, records the tier', () => {
    const state = makeState({ currentCity: 'port-vela', cash: 30_000 })
    const result = hireCA(state, 'junior')
    expect(result).not.toBe(state)
    expect(result.cash).toBe(30_000 - CONFIG.tax.caTiers.junior.annualFee)
    expect(result.hiredCATierThisFiscalYear).toBe('junior')
  })
})

describe('hireCA + runYearEnd — blended rate per tier', () => {
  const cases: Array<{ tier: 'junior' | 'senior' | 'elite' }> = [{ tier: 'junior' }, { tier: 'senior' }, { tier: 'elite' }]

  for (const { tier } of cases) {
    it(`${tier}: blends the tier rate below cap with the above-cap rate for profit exceeding it`, () => {
      const tierConfig = CONFIG.tax.caTiers[tier]
      const cap = tierConfig.profitCap as number
      const overage = 200_000
      const realizedProfit = cap + overage

      let state = makeState({
        currentCity: 'port-vela',
        cash: tierConfig.annualFee + realizedProfit, // ample cash to cover fee + tax
        realizedProfitThisFiscalYear: realizedProfit,
        depositInterestThisFiscalYear: 0,
      })

      state = hireCA(state, tier)
      expect(state.hiredCATierThisFiscalYear).toBe(tier)

      const result = runYearEnd(state)

      const expectedTax = cap * tierConfig.taxRate + overage * tierConfig.aboveCapTaxRate
      const record = result.taxHistory[result.taxHistory.length - 1]
      expect(record?.caTierActive).toBe(tier)
      expect(record?.taxPaid).toBeCloseTo(expectedTax, 6)

      // §10: hiring is "effective that fiscal year" only — must re-hire (and
      // re-pay) for the next year.
      expect(result.hiredCATierThisFiscalYear).toBe('none')
    })
  }

  it('no CA hired (default): flat 30% rate applies with no cap, regardless of profit size', () => {
    const realizedProfit = 50_000_000 // comfortably above every tier's cap
    const state = makeState({
      currentCity: 'port-vela',
      cash: realizedProfit,
      realizedProfitThisFiscalYear: realizedProfit,
      depositInterestThisFiscalYear: 0,
    })

    const result = runYearEnd(state)

    const record = result.taxHistory[0]
    expect(record?.caTierActive).toBe('none')
    expect(record?.taxPaid).toBeCloseTo(realizedProfit * CONFIG.tax.noCaRate, 6)
  })
})
