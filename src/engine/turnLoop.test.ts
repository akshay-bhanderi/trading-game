import { describe, expect, it } from 'vitest'
import { CONFIG } from './config'
import { CITIES } from './data/cities'
import { GOODS } from './data/goods'
import { advanceDay } from './turnLoop'
import { buy, sell } from './actions/trade'
import { advanceTravelDay, travel } from './actions/travel'
import { stay } from './actions/stay'
import { createRng } from './rng'
import type { Event, GameState } from './types'

/**
 * Builds a minimal-but-valid `GameState`, following the same pattern as
 * /src/engine/actions/stay.test.ts, /src/engine/actions/travel.test.ts, and
 * /src/engine/netWorth.test.ts.
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

describe('advanceDay', () => {
  it('increments state.day by exactly 1', () => {
    const state = makeState({ day: 5 })
    const result = advanceDay(state)
    expect(result.day).toBe(6)
  })

  it('recomputes a price for every city x every good on the new day', () => {
    const state = makeState({ day: 1 })
    const result = advanceDay(state)

    for (const city of CITIES) {
      const cityStates = result.priceStates[city.id]
      expect(cityStates).toBeDefined()
      for (const good of GOODS) {
        const priceState = cityStates?.[good.id]
        expect(priceState).toBeDefined()
        expect(priceState?.currentPrice).toBeGreaterThan(0)
        expect(Number.isFinite(priceState?.currentPrice)).toBe(true)
      }
    }
  })

  it('never mutates the input state (returns a new object)', () => {
    const state = makeState({ day: 1 })
    const snapshot = JSON.parse(JSON.stringify(state))
    advanceDay(state)
    expect(state).toEqual(snapshot)
  })

  it('refreshes lastSeenPrice/lastSeenDay to the live value for the CURRENT city only, and freezes every other city from day 2 onward', () => {
    let state = makeState({ day: 1, currentCity: 'farrow' })

    // Day 1 -> 2: first-ever computation for every pair (documented edge
    // case in turnLoop.ts — every city seeds an initial lastSeen value here,
    // including cities the player hasn't visited; see file header).
    state = advanceDay(state)
    const saltmereGrainAfterDay2 = state.priceStates['saltmere']?.['grain']
    expect(saltmereGrainAfterDay2?.lastSeenDay).toBe(2)

    // Day 2 -> 3: the invariant that matters. Farrow (current city) should
    // refresh to day 3's live price. Saltmere (never visited) must NOT
    // change at all from its day-2 seeded value.
    state = advanceDay(state)

    const farrowGrain = state.priceStates['farrow']?.['grain']
    expect(farrowGrain?.lastSeenDay).toBe(3)
    expect(farrowGrain?.lastSeenPrice).toBe(farrowGrain?.currentPrice)

    const saltmereGrainAfterDay3 = state.priceStates['saltmere']?.['grain']
    expect(saltmereGrainAfterDay3?.lastSeenDay).toBe(saltmereGrainAfterDay2?.lastSeenDay)
    expect(saltmereGrainAfterDay3?.lastSeenPrice).toBe(saltmereGrainAfterDay2?.lastSeenPrice)

    // Day 3 -> 4: reconfirm the freeze holds over multiple subsequent days,
    // not just once.
    state = advanceDay(state)
    const saltmereGrainAfterDay4 = state.priceStates['saltmere']?.['grain']
    expect(saltmereGrainAfterDay4?.lastSeenDay).toBe(saltmereGrainAfterDay2?.lastSeenDay)
    expect(saltmereGrainAfterDay4?.lastSeenPrice).toBe(saltmereGrainAfterDay2?.lastSeenPrice)

    const farrowGrainAfterDay4 = state.priceStates['farrow']?.['grain']
    expect(farrowGrainAfterDay4?.lastSeenDay).toBe(4)
  })

  it('does NOT refresh lastSeenPrice/lastSeenDay for currentCity while travelInProgress is non-null, even though currentCity still points at the origin', () => {
    let state = makeState({ day: 1, currentCity: 'farrow' })
    state = advanceDay(state) // day 2: seed everything

    const farrowGrainBeforeTravel = state.priceStates['farrow']?.['grain']

    // Simulate "mid-travel" directly against advanceDay (travelInProgress
    // set, currentCity still 'farrow' per T013's design) without going
    // through travel.ts, to isolate advanceDay's own gating logic.
    state = {
      ...state,
      travelInProgress: { destinationCityId: 'saltmere', daysRemaining: 1, totalDays: 2 },
    }
    state = advanceDay(state) // day 3, but mid-travel: no refresh should occur

    const farrowGrainDuringTravel = state.priceStates['farrow']?.['grain']
    expect(farrowGrainDuringTravel?.lastSeenDay).toBe(farrowGrainBeforeTravel?.lastSeenDay)
    expect(farrowGrainDuringTravel?.lastSeenPrice).toBe(farrowGrainBeforeTravel?.lastSeenPrice)
  })

  it('updates peakNetWorth via updatePeakNetWorth (net worth can only ratchet upward)', () => {
    const state = makeState({ day: 1, cash: 1_000, peakNetWorth: 1_000 })
    const result = advanceDay(state)
    // Cash alone (1,000) never exceeds the existing peak (1,000) since
    // advanceDay doesn't touch cash — peak should stay exactly 1,000.
    expect(result.peakNetWorth).toBe(1_000)

    // Now simulate a jump in cash between two advanceDay calls (as trading
    // would cause) and confirm the peak ratchets up on the next call.
    const withMoreCash = { ...result, cash: 5_000 }
    const result2 = advanceDay(withMoreCash)
    expect(result2.peakNetWorth).toBe(5_000)
  })

  // ---------------------------------------------------------------------
  // T018 addition (additive only — does not modify/weaken any test above):
  // `advanceDay` now appends `resolveDueEvents`'s resolutions onto
  // `state.pendingResolutions` instead of discarding them (see this file's
  // updated header comment and types.ts's `pendingResolutions` field doc).
  // ---------------------------------------------------------------------
  it('T018: appends resolved events onto pendingResolutions instead of discarding them', () => {
    const dueEvent: Event = {
      id: 'evt-due-1',
      typeId: 'mineCollapse',
      affectedGoodIds: ['iron'],
      scope: { kind: 'global' },
      multiplierMin: 1.5,
      multiplierMax: 2.5,
      durationDaysMin: 4,
      durationDaysMax: 7,
      hiddenTruth: true,
      scheduledFireDay: 2,
      createdOnDay: 1,
      resolved: false,
      fired: null,
    }
    const state = makeState({ day: 1, activeEvents: [dueEvent] })

    const result = advanceDay(state)

    expect(result.day).toBe(2)
    expect(result.pendingResolutions).toHaveLength(1)
    expect(result.pendingResolutions?.[0]?.event.id).toBe('evt-due-1')
    expect(result.pendingResolutions?.[0]?.fired).toBe(true)

    // A day with nothing due leaves pendingResolutions untouched (still
    // holding the earlier entry — draining is newspaper.ts's job, not
    // advanceDay's).
    const result2 = advanceDay(result)
    expect(result2.pendingResolutions).toHaveLength(1)
  })

  it('is deterministic: replaying the same seed from the same starting state produces identical prices after many days', () => {
    const seed = 777
    let stateA = makeState({ day: 1, seed })
    let stateB = makeState({ day: 1, seed })

    for (let i = 0; i < 30; i++) {
      stateA = advanceDay(stateA)
      stateB = advanceDay(stateB)
    }

    expect(stateA.priceStates).toEqual(stateB.priceStates)
    expect(stateA.day).toBe(stateB.day)
  })
})

describe('stay() integration with advanceDay (T015 option (a))', () => {
  it('advancing via stay() also recomputes prices and tracks net worth, not just the day counter', () => {
    const farrow = CITIES.find((c) => c.id === 'farrow')
    if (!farrow) throw new Error('expected Farrow in CITIES')

    const state = makeState({ currentCity: 'farrow', cash: 100, day: 1 })
    const result = stay(state)

    expect(result.day).toBe(2)
    expect(result.cash).toBe(100 - farrow.hotelPerNight)
    // Prices were recomputed for the new day (previously, before T015,
    // stay() left priceStates completely untouched).
    expect(result.priceStates['farrow']?.['grain']).toBeDefined()
    expect(result.priceStates['farrow']?.['grain']?.lastSeenDay).toBe(2)
  })
})

describe('travel()/advanceTravelDay() integration with advanceDay (T015 option (a))', () => {
  it('a multi-day trip recomputes prices and advances the day on every leg, arriving with fresh destination prices', () => {
    const state = makeState({ currentCity: 'farrow', cash: 10_000, day: 1 })

    const started = travel(state, 'port-vela')
    expect(started.travelInProgress).not.toBeNull()

    const afterLeg1 = advanceTravelDay(started)
    expect(afterLeg1.day).toBe(2)
    expect(afterLeg1.currentCity).toBe('farrow') // not arrived yet (2-day trip)

    const afterLeg2 = advanceTravelDay(afterLeg1)
    expect(afterLeg2.day).toBe(3)
    expect(afterLeg2.currentCity).toBe('port-vela') // arrived
    const arrivedGrain = afterLeg2.priceStates['port-vela']?.['grain']
    expect(arrivedGrain?.lastSeenDay).toBe(3)
    expect(arrivedGrain?.lastSeenPrice).toBe(arrivedGrain?.currentPrice)
  })
})

// ---------------------------------------------------------------------------
// REQUIRED ACCEPTANCE TEST (T015 / TASK.md) — the "headless in Node"
// checkpoint the whole project's architecture depends on (§17: "The engine
// must run headless in Node for the §11 bot harness").
// ---------------------------------------------------------------------------
describe('headless 100-day simulation (no DOM, no React, /src/engine exports only)', () => {
  it('runs 100 simulated days, mixing buy/sell/travel/stay calls, without throwing', () => {
    const TARGET_DAYS = 100
    const STARTER_GOODS = ['grain', 'cotton', 'iron']
    const driverRng = createRng(13_579) // this test's own "driver" RNG —
    // deliberately separate from the engine's internal per-day RNG
    // (turnLoop.ts's createDayRng), exactly like a future bot (T025-T027)
    // would own its own decision RNG independent of the price engine's.

    let state = makeState({ day: 1 })

    const startingDay = state.day
    let iterations = 0

    while (state.day < startingDay + TARGET_DAYS) {
      iterations++

      if (state.travelInProgress !== null) {
        // Mid-trip: just let the day tick forward.
        state = advanceTravelDay(state)
        continue
      }

      // --- Occasionally trade before ending the day ---
      if (driverRng.next() < 0.7) {
        const goodId = driverRng.pick(STARTER_GOODS)
        const good = GOODS.find((g) => g.id === goodId)
        const unitPrice = state.priceStates[state.currentCity]?.[goodId]?.currentPrice ?? good?.basePrice ?? 10

        if (driverRng.next() < 0.6) {
          // Try a buy of a modest random quantity.
          const qty = driverRng.int(1, 5)
          state = buy(state, goodId, qty, unitPrice)
        } else {
          // Try to sell whatever's on hand (if anything).
          const owned = state.cargo[goodId]?.qty ?? 0
          if (owned > 0) {
            const qty = driverRng.int(1, owned)
            state = sell(state, goodId, qty, unitPrice)
          }
        }
      }

      // --- End the day: travel somewhere else, or stay ---
      if (driverRng.next() < 0.35) {
        const otherCities = state.unlockedCityIds.filter((id) => id !== state.currentCity)
        const destination = driverRng.pick(otherCities)
        const started = travel(state, destination)

        if (started !== state) {
          // Trip accepted — consume its first day this same iteration so
          // every loop iteration always advances exactly one day.
          state = advanceTravelDay(started)
        } else {
          // Travel rejected (e.g. insufficient cash for the fare) — fall
          // back to staying the night instead.
          const stayed = stay(state)
          state = stayed !== state ? stayed : advanceDay(state)
        }
      } else {
        const stayed = stay(state)
        // Safety fallback: if stay() itself is rejected (cash can't cover
        // the nightly rate), advance the day directly via advanceDay so the
        // simulation always makes forward progress rather than looping
        // forever — this still exercises the exact same day-advance
        // pipeline stay()/travel() delegate to.
        state = stayed !== state ? stayed : advanceDay(state)
      }
    }

    expect(state.day).toBe(startingDay + TARGET_DAYS)
    // Sanity: every iteration advances exactly one day (whichever branch is
    // taken), so the loop always terminates in exactly TARGET_DAYS steps —
    // this also guards against an accidental infinite loop in the driver.
    expect(iterations).toBe(TARGET_DAYS)
    expect(Number.isFinite(state.cash)).toBe(true)
    expect(Number.isFinite(state.peakNetWorth)).toBe(true)
  })

  it('runs a second, independently-seeded 100-day simulation without throwing (guards against flaky/seed-dependent crashes)', () => {
    const TARGET_DAYS = 100
    const STARTER_GOODS = ['grain', 'cotton', 'iron', 'salt', 'textiles']
    const driverRng = createRng(2_024_07_26)

    let state = makeState({
      day: 1,
      seed: 55,
      currentCity: 'copperfell',
      cash: CONFIG.difficulty.Expert.startingCash,
      difficulty: 'Expert',
    })

    const startingDay = state.day

    while (state.day < startingDay + TARGET_DAYS) {
      if (state.travelInProgress !== null) {
        state = advanceTravelDay(state)
        continue
      }

      if (driverRng.next() < 0.8) {
        const goodId = driverRng.pick(STARTER_GOODS)
        const good = GOODS.find((g) => g.id === goodId)
        const unitPrice = state.priceStates[state.currentCity]?.[goodId]?.currentPrice ?? good?.basePrice ?? 10
        const qty = driverRng.int(1, 8)
        state = driverRng.next() < 0.5 ? buy(state, goodId, qty, unitPrice) : sell(state, goodId, qty, unitPrice)
      }

      if (driverRng.next() < 0.4) {
        const otherCities = state.unlockedCityIds.filter((id) => id !== state.currentCity)
        const destination = driverRng.pick(otherCities)
        const started = travel(state, destination)
        state = started !== state ? advanceTravelDay(started) : advanceDay(state)
      } else {
        const stayed = stay(state)
        state = stayed !== state ? stayed : advanceDay(state)
      }
    }

    expect(state.day).toBe(startingDay + TARGET_DAYS)
    expect(Number.isFinite(state.cash)).toBe(true)
  })
})
