import { describe, expect, it } from 'vitest'
import { CONFIG } from './config'
import { computeRank, computeRankFromInputs, maybeRecomputeRank } from './rank'
import type { GameState, RankInputs } from './types'

/**
 * Builds a minimal-but-valid `GameState`, following the same pattern as
 * /src/engine/turnLoop.test.ts and other engine test files.
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
    unlockedCityIds: ['farrow'],
    unlockedGoodIds: [],
    purchasedLicenseGoodIds: [],
    activeEvents: [],
    currentNewspaper: [],
    taxHistory: [],
    travelInProgress: null,
    peakNetWorth: CONFIG.difficulty.Pro.startingCash,
    seed: 1,
    difficulty: 'Pro',
    repaymentRecord: 0,
    cumulativeTradeVolume: 0,
    rankCache: { value: 1, computedOnDay: 0 },
    ...overrides,
  }
}

describe('computeRankFromInputs', () => {
  // -------------------------------------------------------------------------
  // Independent hand-computed check of the exact §8 formula:
  //   score = 0.5*log10(netWorth+1) + 0.3*log10(volume+1)
  //         + 1.5*repaymentRecord   + 0.2*log10(daysSurvived+1)
  //   rank  = clamp(floor(score), 1, 10)
  //
  // Inputs: netWorth=50000, cumulativeTradeVolume=100000, repaymentRecord=1.0,
  // daysSurvived=30.
  //
  //   0.5 * log10(50001)  = 0.5 * 4.6989787 = 2.3494893
  //   0.3 * log10(100001) = 0.3 * 5.0000043 = 1.5000013
  //   1.5 * 1.0            =                 1.5
  //   0.2 * log10(31)      = 0.2 * 1.4913617 = 0.2982723
  //   -------------------------------------------------
  //   score  = 2.3494893 + 1.5000013 + 1.5 + 0.2982723 = 5.6477630
  //   floor(score) = 5, clamp(5, 1, 10) = 5
  // -------------------------------------------------------------------------
  it('matches a hand-computed example (netWorth=50000, volume=100000, repayment=1.0, days=30 -> rank 5)', () => {
    const inputs: RankInputs = {
      netWorth: 50_000,
      cumulativeTradeVolume: 100_000,
      repaymentRecord: 1.0,
      daysSurvived: 30,
    }
    expect(computeRankFromInputs(inputs)).toBe(5)
  })

  // -------------------------------------------------------------------------
  // Low-end clamp: every term at its floor.
  //   0.5*log10(1) + 0.3*log10(1) + 1.5*(-2) + 0.2*log10(1)
  //   = 0 + 0 + (-3) + 0 = -3
  //   floor(-3) = -3, clamp(-3, 1, 10) = 1
  // -------------------------------------------------------------------------
  it('clamps to rank 1 for very low inputs (score goes negative)', () => {
    const inputs: RankInputs = {
      netWorth: 0,
      cumulativeTradeVolume: 0,
      repaymentRecord: -2,
      daysSurvived: 0,
    }
    expect(computeRankFromInputs(inputs)).toBe(1)
  })

  it('clamps repaymentRecord defensively even if it somehow drifted outside [-2, +2]', () => {
    // repaymentRecord passed in already out-of-range (e.g. -5) — the formula
    // must still clamp it to -2 per CONFIG.rank.repaymentRecordClamp, giving
    // the exact same score/rank as passing -2 directly.
    const outOfRange: RankInputs = {
      netWorth: 0,
      cumulativeTradeVolume: 0,
      repaymentRecord: -5,
      daysSurvived: 0,
    }
    const atClamp: RankInputs = {
      netWorth: 0,
      cumulativeTradeVolume: 0,
      repaymentRecord: -2,
      daysSurvived: 0,
    }
    expect(computeRankFromInputs(outOfRange)).toBe(computeRankFromInputs(atClamp))
    expect(computeRankFromInputs(outOfRange)).toBe(1)
  })

  // -------------------------------------------------------------------------
  // High-end clamp: massive net worth/volume/days plus max repayment record.
  //   0.5*log10(1e12+1) ~= 0.5*12 = 6
  //   0.3*log10(1e12+1) ~= 0.3*12 = 3.6
  //   1.5*2.0            =         3
  //   0.2*log10(100001) ~= 0.2*5  = 1.0000009
  //   score ~= 13.6 -> floor 13 -> clamp(13, 1, 10) = 10
  // -------------------------------------------------------------------------
  it('caps at rank 10 for very high inputs', () => {
    const inputs: RankInputs = {
      netWorth: 1_000_000_000_000,
      cumulativeTradeVolume: 1_000_000_000_000,
      repaymentRecord: 2,
      daysSurvived: 100_000,
    }
    expect(computeRankFromInputs(inputs)).toBe(10)
  })

  it('never produces NaN/-Infinity for a very negative net worth (debt exceeding assets)', () => {
    const inputs: RankInputs = {
      netWorth: -1_000_000,
      cumulativeTradeVolume: 0,
      repaymentRecord: 0,
      daysSurvived: 1,
    }
    const rank = computeRankFromInputs(inputs)
    expect(Number.isFinite(rank)).toBe(true)
    expect(rank).toBe(1)
  })
})

describe('computeRank(state)', () => {
  it('derives inputs from GameState (cash-only net worth, state.day as daysSurvived) and matches computeRankFromInputs', () => {
    const state = makeState({
      day: 30,
      cash: 50_000,
      cumulativeTradeVolume: 100_000,
      repaymentRecord: 1.0,
    })
    // Cash-only, no deposits/debt/cargo -> calcNetWorth(state) === state.cash.
    expect(computeRank(state)).toBe(5)
  })
})

describe('maybeRecomputeRank', () => {
  it('is a no-op before 7 days have elapsed since the last computation', () => {
    const state = makeState({ day: 6, rankCache: { value: 3, computedOnDay: 0 } })
    const result = maybeRecomputeRank(state)
    expect(result).toBe(state) // identical reference, per the pure no-op convention
    expect(result.rankCache).toEqual({ value: 3, computedOnDay: 0 })
  })

  it('recomputes at exactly 7 days elapsed', () => {
    const state = makeState({
      day: 7,
      cash: 50_000,
      cumulativeTradeVolume: 100_000,
      repaymentRecord: 1.0,
      rankCache: { value: 1, computedOnDay: 0 },
    })
    const result = maybeRecomputeRank(state)
    expect(result).not.toBe(state)
    expect(result.rankCache.computedOnDay).toBe(7)
    expect(result.rankCache.value).toBe(computeRank(state))
  })

  it('does not recompute again on a subsequent day within the new cadence window', () => {
    const first = maybeRecomputeRank(makeState({ day: 7, rankCache: { value: 1, computedOnDay: 0 } }))
    expect(first.rankCache.computedOnDay).toBe(7)

    const stillWithinWindow = { ...first, day: 10 }
    const second = maybeRecomputeRank(stillWithinWindow)
    expect(second).toBe(stillWithinWindow)
  })
})
