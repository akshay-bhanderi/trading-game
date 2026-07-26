import { describe, expect, it } from 'vitest'
import { CONFIG } from '../config'
import { CITIES } from '../data/cities'
import { stay } from './stay'
import type { GameState } from '../types'

/**
 * Builds a minimal-but-valid `GameState` for stay-action tests, following the
 * same pattern as /src/engine/cargo.test.ts. Unlike the cargo tests, this
 * file DOES need a real `currentCity` id (to look up `hotelPerNight`), so it
 * imports `CITIES` from /src/engine/data/cities.ts (T005, already landed).
 */
function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    day: 1,
    currentCity: 'placeholder-city',
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

describe('stay', () => {
  it('deducts exactly Farrow\'s documented $15/night rate and advances day by 1', () => {
    const farrow = CITIES.find((c) => c.id === 'farrow')
    if (!farrow) throw new Error('expected Farrow in CITIES')
    expect(farrow.hotelPerNight).toBe(15)

    const state = makeState({ currentCity: 'farrow', cash: 100, day: 3 })
    const result = stay(state)

    expect(result).not.toBe(state)
    expect(result.cash).toBe(100 - farrow.hotelPerNight)
    expect(result.cash).toBe(85)
    expect(result.day).toBe(4)
  })

  it('deducts exactly Saltmere\'s documented $20/night rate and advances day by 1', () => {
    const saltmere = CITIES.find((c) => c.id === 'saltmere')
    if (!saltmere) throw new Error('expected Saltmere in CITIES')
    expect(saltmere.hotelPerNight).toBe(20)

    const state = makeState({ currentCity: 'saltmere', cash: 50, day: 7 })
    const result = stay(state)

    expect(result).not.toBe(state)
    expect(result.cash).toBe(50 - saltmere.hotelPerNight)
    expect(result.cash).toBe(30)
    expect(result.day).toBe(8)
  })

  it('rejects with no mutation when cash is insufficient for the nightly rate', () => {
    const farrow = CITIES.find((c) => c.id === 'farrow')
    if (!farrow) throw new Error('expected Farrow in CITIES')

    const state = makeState({ currentCity: 'farrow', cash: farrow.hotelPerNight - 1, day: 5 })
    const result = stay(state)

    // Rejected: identical reference, nothing changed.
    expect(result).toBe(state)
    expect(result.cash).toBe(farrow.hotelPerNight - 1)
    expect(result.day).toBe(5)
  })

  it('succeeds exactly at the boundary when cash equals the nightly rate', () => {
    const copperfell = CITIES.find((c) => c.id === 'copperfell')
    if (!copperfell) throw new Error('expected Copperfell in CITIES')

    const state = makeState({ currentCity: 'copperfell', cash: copperfell.hotelPerNight, day: 1 })
    const result = stay(state)

    expect(result).not.toBe(state)
    expect(result.cash).toBe(0)
    expect(result.day).toBe(2)
  })
})
