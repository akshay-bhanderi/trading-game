import { describe, expect, it } from 'vitest'
import { CONFIG } from '../config'
import { CITIES } from '../data/cities'
import { calcFare, getTravelDays } from '../travel'
import { advanceTravelDay, travel } from './travel'
import type { GameState, PriceState } from '../types'

/**
 * Builds a minimal-but-valid `GameState` for travel-action tests, following
 * the same pattern as /src/engine/actions/stay.test.ts and
 * /src/engine/cargo.test.ts.
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

function makePriceState(cityId: string, goodId: string, price: number, day: number): PriceState {
  return {
    cityId,
    goodId,
    currentPrice: price,
    lastSeenPrice: price,
    lastSeenDay: day,
    trendPosition: 0,
  }
}

// Farrow (Tier 1) -> Port Vela (Tier 2) is a 2-day cross-tier trip in v1's
// distance matrix (see /src/engine/travel.test.ts for the same pairing).
const ORIGIN = 'farrow'
const DESTINATION = 'port-vela'

describe('travel + advanceTravelDay', () => {
  it('traveling 2 days: origin prices stay frozen at last-seen values; currentCity/travelInProgress only update after the SECOND advanceTravelDay call', () => {
    const destinationCity = CITIES.find((c) => c.id === DESTINATION)
    if (!destinationCity) throw new Error('expected Port Vela in CITIES')

    const days = getTravelDays(ORIGIN, DESTINATION)
    expect(days).toBe(2)

    const priceStates = {
      [ORIGIN]: { grain: makePriceState(ORIGIN, 'grain', 10, 1) },
      [DESTINATION]: { grain: makePriceState(DESTINATION, 'grain', 12, 1) },
    }

    const fare = calcFare(days, destinationCity.tier, 0)
    const initialCash = fare + 500

    const state = makeState({
      currentCity: ORIGIN,
      cash: initialCash,
      day: 1,
      priceStates,
    })

    // --- Start the trip ---
    const started = travel(state, DESTINATION)

    expect(started).not.toBe(state)
    expect(started.cash).toBe(initialCash - fare)
    expect(started.travelInProgress).toEqual({
      destinationCityId: DESTINATION,
      daysRemaining: 2,
      totalDays: 2,
    })
    // Still physically in the origin city — travel() never touches currentCity.
    expect(started.currentCity).toBe(ORIGIN)
    // priceStates untouched (same reference) — travel() never mutates prices.
    expect(started.priceStates).toBe(state.priceStates)

    // --- Advance day 1 of 2: not arrived yet ---
    const afterDay1 = advanceTravelDay(started)

    expect(afterDay1).not.toBe(started)
    expect(afterDay1.day).toBe(2)
    expect(afterDay1.currentCity).toBe(ORIGIN) // NOT the destination yet
    expect(afterDay1.travelInProgress).toEqual({
      destinationCityId: DESTINATION,
      daysRemaining: 1,
      totalDays: 2,
    })
    // Origin's price is still exactly what it was last seen at — frozen.
    expect(afterDay1.priceStates[ORIGIN]?.grain?.lastSeenPrice).toBe(10)
    expect(afterDay1.priceStates[ORIGIN]?.grain?.lastSeenDay).toBe(1)
    expect(afterDay1.priceStates).toBe(started.priceStates)

    // --- Advance day 2 of 2: arrival ---
    const afterDay2 = advanceTravelDay(afterDay1)

    expect(afterDay2).not.toBe(afterDay1)
    expect(afterDay2.day).toBe(3)
    expect(afterDay2.currentCity).toBe(DESTINATION) // arrived
    expect(afterDay2.travelInProgress).toBeNull()
    // Still no price mutation performed by these functions — that's the
    // turn loop's (T015/T008's) job, out of scope here.
    expect(afterDay2.priceStates).toBe(afterDay1.priceStates)
    expect(afterDay2.priceStates[ORIGIN]?.grain?.lastSeenPrice).toBe(10)
    expect(afterDay2.priceStates[DESTINATION]?.grain?.lastSeenPrice).toBe(12)
  })

  it('rejects starting a new trip while one is already in progress, with no mutation', () => {
    const state = makeState({
      currentCity: ORIGIN,
      cash: 10_000,
      travelInProgress: { destinationCityId: DESTINATION, daysRemaining: 1, totalDays: 2 },
    })

    const result = travel(state, 'silkden')

    expect(result).toBe(state)
    expect(result.cash).toBe(10_000)
    expect(result.travelInProgress).toEqual({
      destinationCityId: DESTINATION,
      daysRemaining: 1,
      totalDays: 2,
    })
  })

  it('rejects starting a trip when cash is insufficient for the fare, with no mutation', () => {
    const destinationCity = CITIES.find((c) => c.id === DESTINATION)
    if (!destinationCity) throw new Error('expected Port Vela in CITIES')

    const days = getTravelDays(ORIGIN, DESTINATION)
    const fare = calcFare(days, destinationCity.tier, 0)

    const state = makeState({
      currentCity: ORIGIN,
      cash: fare - 1,
      day: 5,
    })

    const result = travel(state, DESTINATION)

    expect(result).toBe(state)
    expect(result.cash).toBe(fare - 1)
    expect(result.travelInProgress).toBeNull()
    expect(result.currentCity).toBe(ORIGIN)
    expect(result.day).toBe(5)
  })

  it('rejects travel to an unknown city id, with no mutation', () => {
    const state = makeState({ currentCity: ORIGIN, cash: 10_000 })
    const result = travel(state, 'nonexistent-city')
    expect(result).toBe(state)
  })

  it('succeeds exactly at the boundary when cash equals the fare', () => {
    const destinationCity = CITIES.find((c) => c.id === DESTINATION)
    if (!destinationCity) throw new Error('expected Port Vela in CITIES')

    const days = getTravelDays(ORIGIN, DESTINATION)
    const fare = calcFare(days, destinationCity.tier, 0)

    const state = makeState({ currentCity: ORIGIN, cash: fare })
    const result = travel(state, DESTINATION)

    expect(result).not.toBe(state)
    expect(result.cash).toBe(0)
  })

  it('doubles the fare when cargo used exceeds 60% of capacity, matching calcFare directly', () => {
    const destinationCity = CITIES.find((c) => c.id === DESTINATION)
    if (!destinationCity) throw new Error('expected Port Vela in CITIES')

    const days = getTravelDays(ORIGIN, DESTINATION)
    const cargoCapacity = 100
    const cargo = { grain: { goodId: 'grain', qty: 70, avgBuyCost: 0, lots: [] } } // 70% used
    const cargoUsedPct = 70 / cargoCapacity
    const expectedFare = calcFare(days, destinationCity.tier, cargoUsedPct)

    const state = makeState({
      currentCity: ORIGIN,
      cash: expectedFare,
      cargoCapacity,
      cargo,
    })

    const result = travel(state, DESTINATION)

    expect(result).not.toBe(state)
    expect(result.cash).toBe(0)
    expect(expectedFare).toBe(calcFare(days, destinationCity.tier, 0) * CONFIG.travel.cargoDoublingFactor)
  })

  it('advanceTravelDay rejects with no mutation when no trip is in progress', () => {
    const state = makeState({ currentCity: ORIGIN, travelInProgress: null, day: 9 })
    const result = advanceTravelDay(state)
    expect(result).toBe(state)
    expect(result.day).toBe(9)
    expect(result.currentCity).toBe(ORIGIN)
  })

  it('a 1-day trip requires exactly one travel() + one advanceTravelDay() call to arrive', () => {
    // Farrow -> Saltmere is same-tier (Tier 1), so 1 day per the distance matrix.
    const days = getTravelDays('farrow', 'saltmere')
    expect(days).toBe(1)

    const saltmere = CITIES.find((c) => c.id === 'saltmere')
    if (!saltmere) throw new Error('expected Saltmere in CITIES')
    const fare = calcFare(days, saltmere.tier, 0)

    const state = makeState({ currentCity: 'farrow', cash: fare, day: 1 })

    const started = travel(state, 'saltmere')
    // Not arrived yet even though it's a 1-day trip — travel() never advances.
    expect(started.currentCity).toBe('farrow')
    expect(started.travelInProgress).toEqual({
      destinationCityId: 'saltmere',
      daysRemaining: 1,
      totalDays: 1,
    })

    const arrived = advanceTravelDay(started)
    expect(arrived.currentCity).toBe('saltmere')
    expect(arrived.travelInProgress).toBeNull()
    expect(arrived.day).toBe(2)
  })
})
