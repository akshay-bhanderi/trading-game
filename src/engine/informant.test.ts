import { describe, expect, it } from 'vitest'
import { createRng } from './rng'
import { CONFIG } from './config'
import {
  buyInformantTip,
  calcTipAccuracy,
  calcTipPrice,
  isInformantAvailable,
} from './informant'
import { CITIES } from './data/cities'
import { GOODS } from './data/goods'
import type { GameState } from './types'

/**
 * Minimal-but-valid `GameState` builder, following the same pattern already
 * established by events/eventEngine.test.ts (T016) and other engine tests —
 * fills every field with an innocuous placeholder.
 */
function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    day: 1,
    currentCity: 'farrow',
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

describe('data sanity — Medium+ bank cities in v1', () => {
  it('exactly Port Vela, Ironvale, Silkden are Medium (no Large/Huge city exists in v1)', () => {
    const mediumPlus = CITIES.filter((c) => c.bankSize === 'Medium' || c.bankSize === 'Large' || c.bankSize === 'Huge')
    expect(mediumPlus.map((c) => c.id).sort()).toEqual(['ironvale', 'port-vela', 'silkden'])
    expect(CITIES.some((c) => c.bankSize === 'Large' || c.bankSize === 'Huge')).toBe(false)
  })
})

describe('isInformantAvailable', () => {
  it('is false in a Small-bank city (Farrow)', () => {
    const state = makeState({ currentCity: 'farrow' })
    expect(isInformantAvailable(state)).toBe(false)
  })

  it('is true in each of the three Medium-bank cities (Port Vela, Ironvale, Silkden)', () => {
    for (const cityId of ['port-vela', 'ironvale', 'silkden']) {
      expect(isInformantAvailable(makeState({ currentCity: cityId }))).toBe(true)
    }
  })

  it('is false and does not throw for an unknown/unreachable city id (e.g. Novara Heights, out of v1 scope)', () => {
    const state = makeState({ currentCity: 'novara-heights' })
    expect(() => isInformantAvailable(state)).not.toThrow()
    expect(isInformantAvailable(state)).toBe(false)
  })
})

describe('calcTipPrice', () => {
  it('applies the $500 floor at low net worth', () => {
    // cash-only net worth of $10,000 -> 1% = $100, below the $500 floor.
    const state = makeState({ currentCity: 'port-vela', cash: 10_000 })
    expect(calcTipPrice(state)).toBe(500)
  })

  it('applies 1% of net worth once it dominates the floor (net worth $200k -> $2,000 tip)', () => {
    const state = makeState({ currentCity: 'port-vela', cash: 200_000 })
    expect(calcTipPrice(state)).toBe(2_000)
  })

  it('matches CONFIG constants exactly (max(floor, pct*netWorth))', () => {
    const state = makeState({ currentCity: 'port-vela', cash: 1_000_000 })
    const expected = Math.max(
      CONFIG.events.insider.tipPriceFloor,
      CONFIG.events.insider.tipPricePctOfNetWorth * 1_000_000,
    )
    expect(calcTipPrice(state)).toBe(expected)
  })
})

describe('calcTipAccuracy', () => {
  it('reflects the difficulty rumor-accuracy bonus: Noob (+0.15) is higher than Expert (-0.10) from the same base', () => {
    const noobState = makeState({ currentCity: 'port-vela', difficulty: 'Noob' })
    const proState = makeState({ currentCity: 'port-vela', difficulty: 'Pro' })
    const expertState = makeState({ currentCity: 'port-vela', difficulty: 'Expert' })

    const noobAccuracy = calcTipAccuracy(noobState)
    const proAccuracy = calcTipAccuracy(proState)
    const expertAccuracy = calcTipAccuracy(expertState)

    expect(noobAccuracy).toBeCloseTo(CONFIG.events.insider.baseAccuracy + 0.15, 10)
    expect(proAccuracy).toBeCloseTo(CONFIG.events.insider.baseAccuracy, 10)
    expect(expertAccuracy).toBeCloseTo(CONFIG.events.insider.baseAccuracy - 0.1, 10)

    expect(noobAccuracy).toBeGreaterThan(proAccuracy)
    expect(proAccuracy).toBeGreaterThan(expertAccuracy)
  })

  it('uses the generic (non-Novara) base accuracy for every v1-reachable city, since Novara Heights does not exist in v1 data', () => {
    for (const city of CITIES) {
      const accuracy = calcTipAccuracy(makeState({ currentCity: city.id, difficulty: 'Pro' }))
      expect(accuracy).toBeCloseTo(CONFIG.events.insider.baseAccuracy, 10)
    }
  })

  it('would apply the Novara bonus accuracy if that city ever existed (generic lookup, forward-compatible) and does not throw', () => {
    const state = makeState({ currentCity: 'novara-heights', difficulty: 'Pro' })
    expect(() => calcTipAccuracy(state)).not.toThrow()
    // Novara isn't in CITIES in v1, so this falls back to the generic base
    // accuracy (documented behavior) rather than the Novara bonus rate.
    expect(calcTipAccuracy(state)).toBeCloseTo(CONFIG.events.insider.baseAccuracy, 10)
  })

  it('always returns a value clamped to [0, 1]', () => {
    for (const difficulty of ['Noob', 'Pro', 'Expert'] as const) {
      for (const city of CITIES) {
        const accuracy = calcTipAccuracy(makeState({ currentCity: city.id, difficulty }))
        expect(accuracy).toBeGreaterThanOrEqual(0)
        expect(accuracy).toBeLessThanOrEqual(1)
      }
    }
  })
})

describe('buyInformantTip', () => {
  it('rejects (returns null) in a Small-bank city (Farrow) even with ample cash', () => {
    const state = makeState({ currentCity: 'farrow', cash: 10_000_000 })
    const result = buyInformantTip(state, createRng(1))
    expect(result).toBeNull()
  })

  it('rejects (returns null) with insufficient cash in a Medium-bank city', () => {
    const state = makeState({ currentCity: 'port-vela', cash: 1 })
    const result = buyInformantTip(state, createRng(1))
    expect(result).toBeNull()
  })

  it('succeeds in a Medium-bank city (Port Vela), deducting exactly calcTipPrice and returning tip info', () => {
    const state = makeState({ currentCity: 'port-vela', cash: 200_000, day: 5 })
    const price = calcTipPrice(state)

    const result = buyInformantTip(state, createRng(42))
    expect(result).not.toBeNull()
    if (!result) return // narrows for TS

    expect(result.state.cash).toBe(state.cash - price)
    // Original state left untouched (pure-function convention).
    expect(state.cash).toBe(200_000)

    const { tip } = result
    expect(typeof tip.accurateHint).toBe('boolean')
    expect(GOODS.some((g) => g.id === tip.hintedGoodId)).toBe(true)
    expect(CITIES.some((c) => c.id === tip.hintedCityId)).toBe(true)
    expect(['up', 'down']).toContain(tip.hintedDirection)

    // The underlying event was genuinely scheduled into state (reuses T016's
    // scheduleEvent) and will resolve through the normal T017/T018 pipeline.
    expect(result.state.activeEvents).toContain(tip.event)
    expect(tip.event.scheduledFireDay).toBeGreaterThan(state.day)
    expect(tip.event.resolved).toBe(false)
  })

  it('same seed reproduces an identical tip purchase (determinism)', () => {
    const stateA = makeState({ currentCity: 'ironvale', cash: 50_000, day: 3 })
    const stateB = makeState({ currentCity: 'ironvale', cash: 50_000, day: 3 })

    const resultA = buyInformantTip(stateA, createRng(999))
    const resultB = buyInformantTip(stateB, createRng(999))

    expect(resultA).toEqual(resultB)
  })

  it('over many purchases, produces both accurate and inaccurate hints (not a constant)', () => {
    let state = makeState({ currentCity: 'silkden', cash: 100_000_000, difficulty: 'Pro', day: 1 })
    const rng = createRng(2024)
    let sawAccurate = false
    let sawInaccurate = false

    for (let i = 0; i < 200 && (!sawAccurate || !sawInaccurate); i++) {
      const result = buyInformantTip(state, rng)
      expect(result).not.toBeNull()
      if (!result) break
      if (result.tip.accurateHint) sawAccurate = true
      else sawInaccurate = true
      state = result.state
      // Keep cash topped up so the loop never spuriously rejects on price.
      state = { ...state, cash: 100_000_000 }
    }

    expect(sawAccurate).toBe(true)
    expect(sawInaccurate).toBe(true)
  })

  it('an inaccurate hint always deviates in direction from the true (derivable) direction', () => {
    let state = makeState({ currentCity: 'port-vela', cash: 100_000_000, difficulty: 'Pro', day: 1 })
    const rng = createRng(777)
    let checkedInaccurate = 0

    for (let i = 0; i < 100; i++) {
      const result = buyInformantTip(state, rng)
      if (!result) break
      const { tip } = result
      const trueDirection = (tip.event.multiplierMin + tip.event.multiplierMax) / 2 >= 1 ? 'up' : 'down'

      if (tip.accurateHint) {
        expect(tip.hintedDirection).toBe(trueDirection)
      } else {
        expect(tip.hintedDirection).not.toBe(trueDirection)
        checkedInaccurate++
      }

      state = { ...result.state, cash: 100_000_000 }
    }

    // Sanity: the RNG stream actually produced at least one inaccurate hint
    // in this run, so the assertion above wasn't vacuous.
    expect(checkedInaccurate).toBeGreaterThan(0)
  })
})
