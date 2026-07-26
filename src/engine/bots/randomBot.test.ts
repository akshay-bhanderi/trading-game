import { describe, expect, it } from 'vitest'
import { CONFIG } from '../config'
import { createRng } from '../rng'
import { randomBotStep } from './randomBot'
import type { GameState } from '../types'

/**
 * Builds a minimal-but-valid fresh `GameState`, following the same pattern
 * established by turnLoop.test.ts / stay.test.ts / travel.test.ts — Tier 1
 * cities unlocked, starter goods (Grain/Cotton/Iron) unlocked, empty cargo,
 * a fixed seed, and a difficulty-matched starting cash figure.
 */
function makeFreshState(overrides: Partial<GameState> = {}): GameState {
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

describe('randomBotStep', () => {
  it('mid-trip: delegates straight to advanceTravelDay, no trading/new-trip possible', () => {
    const state = makeFreshState({
      day: 1,
      currentCity: 'farrow',
      travelInProgress: { destinationCityId: 'saltmere', daysRemaining: 2, totalDays: 2 },
    })
    const rng = createRng(1)
    const result = randomBotStep(state, rng)

    // Still mid-trip (2-day trip, 1 leg consumed) — currentCity unchanged,
    // daysRemaining decremented, day advanced by 1.
    expect(result.day).toBe(2)
    expect(result.currentCity).toBe('farrow')
    expect(result.travelInProgress).not.toBeNull()
    expect(result.travelInProgress?.daysRemaining).toBe(1)
  })

  it('never throws across many different seeds and starting states', () => {
    for (let seed = 0; seed < 25; seed++) {
      const state = makeFreshState({ seed: seed * 7919 })
      const rng = createRng(seed)
      expect(() => randomBotStep(state, rng)).not.toThrow()
    }
  })

  // ---------------------------------------------------------------------
  // REQUIRED ACCEPTANCE CRITERION #2 (from the task brief): a single
  // randomBotStep call, when NOT mid-travel, always ends with EITHER
  // travelInProgress !== null (started a trip) OR day advanced by exactly 1
  // (stayed) — i.e. it always makes SOME day-ending choice.
  // ---------------------------------------------------------------------
  it('when not mid-travel, always ends with travelInProgress !== null OR day advanced by exactly 1', () => {
    for (let seed = 0; seed < 100; seed++) {
      const state = makeFreshState({ day: 10, seed: seed * 31 })
      const rng = createRng(seed)
      const result = randomBotStep(state, rng)

      const startedTravel = result.travelInProgress !== null
      const stayedExactlyOneDay = result.travelInProgress === null && result.day === state.day + 1

      expect(startedTravel || stayedExactlyOneDay).toBe(true)
    }
  })

  it('reaching a low-cash state still always advances the day (Stay-rejected fallback path)', () => {
    // Cash too low to afford Farrow's hotel (15/night) or any fare — forces
    // the last-resort advanceDay() fallback to be exercised.
    const state = makeFreshState({ day: 1, cash: 1 })
    const rng = createRng(999)
    const result = randomBotStep(state, rng)

    expect(result.day).toBe(2)
    expect(Number.isFinite(result.cash)).toBe(true)
  })

  it('is deterministic: the same seed/state always produces the same result', () => {
    const stateA = makeFreshState({ day: 1 })
    const stateB = makeFreshState({ day: 1 })

    const resultA = randomBotStep(stateA, createRng(2026))
    const resultB = randomBotStep(stateB, createRng(2026))

    expect(resultA).toEqual(resultB)
  })

  it('never mutates the input state (returns a new object / no aliasing)', () => {
    const state = makeFreshState({ day: 1 })
    const snapshot = JSON.parse(JSON.stringify(state))
    randomBotStep(state, createRng(42))
    expect(state).toEqual(snapshot)
  })

  // ---------------------------------------------------------------------
  // REQUIRED ACCEPTANCE CRITERION #1 (TASK.md T025 / this task's brief):
  // "Runs 90 simulated days without throwing in a smoke test." A single
  // randomBotStep call may only advance ONE travel-leg-day during a
  // multi-day trip, so the loop must run until `state.day` has advanced by
  // AT LEAST 90 — not a fixed 90 call count.
  // ---------------------------------------------------------------------
  describe('90-day headless smoke test (required acceptance criterion)', () => {
    function run90Days(seed: number, difficulty: 'Noob' | 'Pro' | 'Expert', startingCityId: string): GameState {
      const driverRng = createRng(seed)
      let state = makeFreshState({
        day: 1,
        seed: seed * 104_729,
        difficulty,
        currentCity: startingCityId,
        cash: CONFIG.difficulty[difficulty].startingCash,
        peakNetWorth: CONFIG.difficulty[difficulty].startingCash,
      })

      const startingDay = state.day
      const TARGET_DAYS = 90
      let iterations = 0
      const MAX_ITERATIONS = TARGET_DAYS * 10 // generous safety bound

      while (state.day < startingDay + TARGET_DAYS) {
        iterations++
        if (iterations > MAX_ITERATIONS) {
          throw new Error(`randomBotStep never reached day ${startingDay + TARGET_DAYS} (stuck at day ${state.day})`)
        }
        state = randomBotStep(state, driverRng)
      }

      return state
    }

    it('runs 90 simulated days without throwing (Pro, seed A)', () => {
      let result: GameState | undefined
      expect(() => {
        result = run90Days(13_579, 'Pro', 'farrow')
      }).not.toThrow()

      expect(result?.day).toBeGreaterThanOrEqual(91)
      expect(Number.isFinite(result?.cash)).toBe(true)
      expect(Number.isFinite(result?.peakNetWorth)).toBe(true)
    })

    it('runs 90 simulated days without throwing (Expert, seed B — different starting city/cash)', () => {
      let result: GameState | undefined
      expect(() => {
        result = run90Days(2_024_07_26, 'Expert', 'copperfell')
      }).not.toThrow()

      expect(result?.day).toBeGreaterThanOrEqual(91)
      expect(Number.isFinite(result?.cash)).toBe(true)
    })

    it('runs 90 simulated days without throwing (Noob, seed C — reliability re-run to guard against flakiness)', () => {
      let result: GameState | undefined
      expect(() => {
        result = run90Days(777, 'Noob', 'farrow')
      }).not.toThrow()

      expect(result?.day).toBeGreaterThanOrEqual(91)
      expect(Number.isFinite(result?.cash)).toBe(true)
    })

    it('runs 90 simulated days without throwing across a wide sweep of seeds (flakiness guard)', () => {
      for (let seed = 1; seed <= 15; seed++) {
        expect(() => run90Days(seed * 101, 'Pro', 'farrow')).not.toThrow()
      }
    })
  })
})
