import { describe, expect, it } from 'vitest'
import { createRng } from '../rng'
import { scheduleEvent } from './eventEngine'
import { EVENT_TABLE } from './eventTable'
import { CONFIG } from '../config'
import type { GameState } from '../types'

/**
 * Minimal-but-valid `GameState` builder, following the same pattern already
 * established by cargo.test.ts (T011) — fills every field with an
 * innocuous placeholder so this file doesn't need to depend on how other
 * concurrent tasks construct a "real" fresh game.
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

describe('scheduleEvent', () => {
  it('always schedules a fire day strictly 2-4 days after the current day, across many seeds/days', () => {
    let checked = 0
    for (let seed = 0; seed < 200; seed++) {
      for (const day of [0, 1, 5, 42, 999]) {
        const rng = createRng(seed * 7919 + day)
        const state = makeState({ day })
        const { event } = scheduleEvent(state, rng)

        const delta = event.scheduledFireDay - event.createdOnDay
        expect(delta).toBeGreaterThanOrEqual(CONFIG.events.scheduleWindowMinDays)
        expect(delta).toBeLessThanOrEqual(CONFIG.events.scheduleWindowMaxDays)
        expect(event.createdOnDay).toBe(day)
        expect(event.scheduledFireDay).toBe(day + delta)
        checked++
      }
    }
    // Sanity check the loop actually ran as many cases as intended.
    expect(checked).toBe(200 * 5)
  })

  it('grows activeEvents by exactly one entry and leaves the original state unchanged', () => {
    const rng = createRng(12345)
    const originalEvents = [] as GameState['activeEvents']
    const state = makeState({ day: 10, activeEvents: originalEvents })

    const { event, updatedState } = scheduleEvent(state, rng)

    // Original state untouched (pure-function convention).
    expect(state.activeEvents).toBe(originalEvents)
    expect(state.activeEvents).toHaveLength(0)
    expect(state.day).toBe(10)

    // New state is a distinct object with exactly one more event.
    expect(updatedState).not.toBe(state)
    expect(updatedState.activeEvents).not.toBe(state.activeEvents)
    expect(updatedState.activeEvents).toHaveLength(1)
    expect(updatedState.activeEvents[0]).toBe(event)
  })

  it('produces an Event with a valid typeId, unresolved/unfired status, and a boolean hiddenTruth', () => {
    const rng = createRng(999)
    const state = makeState({ day: 3 })
    const { event } = scheduleEvent(state, rng)

    expect(EVENT_TABLE[event.typeId]).toBeDefined()
    expect(event.resolved).toBe(false)
    expect(event.fired).toBeNull()
    expect(typeof event.hiddenTruth).toBe('boolean')
    expect(event.multiplierMax).toBeGreaterThanOrEqual(event.multiplierMin)
    expect(event.durationDaysMax).toBeGreaterThanOrEqual(event.durationDaysMin)
    expect(Array.isArray(event.affectedGoodIds)).toBe(true)
  })

  it('assigns a unique id per scheduled event, even across repeated calls same day', () => {
    const rng = createRng(42)
    let state = makeState({ day: 7 })
    const ids = new Set<string>()

    for (let i = 0; i < 50; i++) {
      const result = scheduleEvent(state, rng)
      expect(ids.has(result.event.id)).toBe(false)
      ids.add(result.event.id)
      state = result.updatedState
    }

    expect(state.activeEvents).toHaveLength(50)
  })

  it('same seed reproduces an identical scheduled event (determinism)', () => {
    const stateA = makeState({ day: 20 })
    const stateB = makeState({ day: 20 })

    const resultA = scheduleEvent(stateA, createRng(555))
    const resultB = scheduleEvent(stateB, createRng(555))

    expect(resultA.event).toEqual(resultB.event)
  })

  it('over many draws, produces both true and false hiddenTruth outcomes (not a constant)', () => {
    const rng = createRng(31415)
    let state = makeState({ day: 1 })
    let sawTrue = false
    let sawFalse = false

    for (let i = 0; i < 100; i++) {
      const result = scheduleEvent(state, rng)
      if (result.event.hiddenTruth) sawTrue = true
      else sawFalse = true
      state = result.updatedState
    }

    expect(sawTrue).toBe(true)
    expect(sawFalse).toBe(true)
  })

  it('resolves government tariff scope to a tier actually present in CITIES (1 or 2 in v1)', () => {
    const rng = createRng(77)
    let state = makeState({ day: 1 })
    let found = false

    for (let i = 0; i < 200 && !found; i++) {
      const result = scheduleEvent(state, rng)
      state = result.updatedState
      if (result.event.typeId === 'governmentTariff') {
        found = true
        expect(result.event.scope.kind).toBe('tier')
        if (result.event.scope.kind === 'tier') {
          expect([1, 2]).toContain(result.event.scope.tier)
        }
      }
    }

    expect(found).toBe(true)
  })
})
