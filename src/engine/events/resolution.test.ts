import { describe, expect, it } from 'vitest'
import { createRng } from '../rng'
import { computePrice } from '../priceEngine'
import { CITIES } from '../data/cities'
import { GOODS } from '../data/goods'
import { CONFIG } from '../config'
import { getActiveEventEffectsFor, resolveDueEvents, resolveEvent } from './resolution'
import type { Event, GameState } from '../types'

/**
 * Minimal-but-valid `GameState` builder, following the same pattern already
 * established by eventEngine.test.ts (T016) and turnLoop.test.ts (T015).
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

/** A concrete, already-scheduled (but unresolved) Event fixture — mirrors
 * what T016's `scheduleEvent` would have produced, targeting Iron globally
 * with a wide multiplier/duration range so resolution has real room to draw
 * a concrete value from. */
function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: 'evt-test-1',
    typeId: 'mineCollapse',
    affectedGoodIds: ['iron'],
    scope: { kind: 'global' },
    multiplierMin: 1.5,
    multiplierMax: 2.5,
    durationDaysMin: 4,
    durationDaysMax: 7,
    hiddenTruth: true,
    scheduledFireDay: 10,
    createdOnDay: 7,
    resolved: false,
    fired: null,
    ...overrides,
  }
}

describe('resolveEvent', () => {
  it('a fired event (hiddenTruth true) resolves fired=true with a concrete duration/multiplier/activeUntilDay in range', () => {
    const rng = createRng(42)
    for (let i = 0; i < 50; i++) {
      const event = makeEvent({ hiddenTruth: true })
      const resolved = resolveEvent(event, rng)

      expect(resolved.resolved).toBe(true)
      expect(resolved.fired).toBe(true)
      expect(resolved.resolvedDurationDays).toBeGreaterThanOrEqual(event.durationDaysMin)
      expect(resolved.resolvedDurationDays).toBeLessThanOrEqual(event.durationDaysMax)
      expect(resolved.activeUntilDay).toBe(event.scheduledFireDay + (resolved.resolvedDurationDays as number))
      expect(resolved.resolvedMultiplier).toBeGreaterThanOrEqual(event.multiplierMin)
      expect(resolved.resolvedMultiplier).toBeLessThanOrEqual(event.multiplierMax)
    }
  })

  it('a fizzled event (hiddenTruth false) resolves fired=false with no duration/multiplier/activeUntilDay set', () => {
    const rng = createRng(43)
    const event = makeEvent({ hiddenTruth: false })
    const resolved = resolveEvent(event, rng)

    expect(resolved.resolved).toBe(true)
    expect(resolved.fired).toBe(false)
    expect(resolved.resolvedDurationDays).toBeUndefined()
    expect(resolved.activeUntilDay).toBeUndefined()
    expect(resolved.resolvedMultiplier).toBeUndefined()
  })

  it('does not mutate the input event (pure function)', () => {
    const rng = createRng(44)
    const event = makeEvent({ hiddenTruth: true })
    const snapshot = { ...event }
    resolveEvent(event, rng)
    expect(event).toEqual(snapshot)
  })

  it('over many draws, resolvedDurationDays and resolvedMultiplier actually vary (not constant)', () => {
    const rng = createRng(45)
    const durations = new Set<number>()
    const multipliers = new Set<number>()

    for (let i = 0; i < 50; i++) {
      const resolved = resolveEvent(makeEvent({ hiddenTruth: true }), rng)
      durations.add(resolved.resolvedDurationDays as number)
      multipliers.add(resolved.resolvedMultiplier as number)
    }

    expect(durations.size).toBeGreaterThan(1)
    expect(multipliers.size).toBeGreaterThan(1)
  })
})

describe('resolveDueEvents', () => {
  it('only resolves events due today, leaving not-yet-due events untouched (resolved:false, fired:null, same object reference)', () => {
    const dueEvent = makeEvent({ id: 'due', scheduledFireDay: 5 })
    const futureEvent = makeEvent({ id: 'future', scheduledFireDay: 8 })
    const state = makeState({ day: 5, activeEvents: [dueEvent, futureEvent] })

    const { state: nextState, resolutions } = resolveDueEvents(state, createRng(1))

    expect(resolutions).toHaveLength(1)
    expect(resolutions[0]?.event.id).toBe('due')

    const resolvedDue = nextState.activeEvents.find((e) => e.id === 'due')
    expect(resolvedDue?.resolved).toBe(true)

    const untouchedFuture = nextState.activeEvents.find((e) => e.id === 'future')
    expect(untouchedFuture).toBe(futureEvent) // same reference, completely untouched
    expect(untouchedFuture?.resolved).toBe(false)
    expect(untouchedFuture?.fired).toBeNull()
  })

  it('never re-resolves an already-resolved event', () => {
    const alreadyResolved: Event = {
      ...makeEvent({ id: 'already', scheduledFireDay: 5, hiddenTruth: true }),
      resolved: true,
      fired: true,
      resolvedDurationDays: 6,
      activeUntilDay: 11,
      resolvedMultiplier: 2.0,
    }
    const state = makeState({ day: 5, activeEvents: [alreadyResolved] })

    const { state: nextState, resolutions } = resolveDueEvents(state, createRng(2))

    expect(resolutions).toHaveLength(0)
    const stillSame = nextState.activeEvents.find((e) => e.id === 'already')
    expect(stillSame).toBe(alreadyResolved) // untouched, same reference
  })

  it('returns the same state reference (no allocation) when nothing is due today', () => {
    const futureEvent = makeEvent({ id: 'future', scheduledFireDay: 99 })
    const state = makeState({ day: 5, activeEvents: [futureEvent] })

    const { state: nextState, resolutions } = resolveDueEvents(state, createRng(3))

    expect(resolutions).toHaveLength(0)
    expect(nextState).toBe(state)
  })

  it('resolves multiple due events on the same day independently, one resolution record each', () => {
    const eventA = makeEvent({ id: 'a', scheduledFireDay: 20, hiddenTruth: true })
    const eventB = makeEvent({ id: 'b', scheduledFireDay: 20, hiddenTruth: false })
    const state = makeState({ day: 20, activeEvents: [eventA, eventB] })

    const { state: nextState, resolutions } = resolveDueEvents(state, createRng(4))

    expect(resolutions).toHaveLength(2)
    const resolvedA = nextState.activeEvents.find((e) => e.id === 'a')
    const resolvedB = nextState.activeEvents.find((e) => e.id === 'b')
    expect(resolvedA?.fired).toBe(true)
    expect(resolvedB?.fired).toBe(false)
  })
})

describe('getActiveEventEffectsFor', () => {
  const farrow = CITIES.find((c) => c.id === 'farrow')
  const copperfell = CITIES.find((c) => c.id === 'copperfell')
  const iron = GOODS.find((g) => g.id === 'iron')
  const grain = GOODS.find((g) => g.id === 'grain')
  if (!farrow || !copperfell || !iron || !grain) {
    throw new Error('expected farrow/copperfell/iron/grain in v1 data')
  }

  it('a fired global event affecting iron contributes an effect for iron in any city, within its active window', () => {
    const fired: Event = {
      ...makeEvent({ scope: { kind: 'global' } }),
      resolved: true,
      fired: true,
      resolvedDurationDays: 5,
      activeUntilDay: 15, // scheduledFireDay(10) + 5
      resolvedMultiplier: 1.8,
    }

    const dayBefore = getActiveEventEffectsFor(farrow, iron, 9, [fired])
    const dayActive = getActiveEventEffectsFor(farrow, iron, 12, [fired])
    const dayAfter = getActiveEventEffectsFor(farrow, iron, 15, [fired]) // exclusive end

    expect(dayBefore).toEqual([])
    expect(dayActive).toEqual([{ multiplier: 1.8 }])
    expect(dayAfter).toEqual([])
  })

  it('a fizzled event never contributes an effect, even "during" its would-be window', () => {
    const fizzled: Event = {
      ...makeEvent({ scope: { kind: 'global' } }),
      resolved: true,
      fired: false,
    }

    expect(getActiveEventEffectsFor(farrow, iron, 12, [fizzled])).toEqual([])
  })

  it('an unresolved event never contributes an effect', () => {
    const unresolved = makeEvent({ scope: { kind: 'global' } })
    expect(getActiveEventEffectsFor(farrow, iron, 12, [unresolved])).toEqual([])
  })

  it('a city-scoped event only contributes for the matching city', () => {
    const fired: Event = {
      ...makeEvent({ scope: { kind: 'city', cityId: 'copperfell' }, affectedGoodIds: ['iron'] }),
      resolved: true,
      fired: true,
      resolvedDurationDays: 5,
      activeUntilDay: 15,
      resolvedMultiplier: 2.0,
    }

    expect(getActiveEventEffectsFor(copperfell, iron, 12, [fired])).toEqual([{ multiplier: 2.0 }])
    expect(getActiveEventEffectsFor(farrow, iron, 12, [fired])).toEqual([])
  })

  it('a tier-scoped event only contributes for cities of that tier', () => {
    const fired: Event = {
      ...makeEvent({ scope: { kind: 'tier', tier: 1 }, affectedGoodIds: ['iron'] }),
      resolved: true,
      fired: true,
      resolvedDurationDays: 5,
      activeUntilDay: 15,
      resolvedMultiplier: 1.6,
    }
    const portVela = CITIES.find((c) => c.id === 'port-vela') // tier 2
    if (!portVela) throw new Error('expected port-vela in v1 data')

    expect(getActiveEventEffectsFor(farrow, iron, 12, [fired])).toEqual([{ multiplier: 1.6 }]) // tier 1
    expect(getActiveEventEffectsFor(copperfell, iron, 12, [fired])).toEqual([{ multiplier: 1.6 }]) // tier 1
    expect(getActiveEventEffectsFor(portVela, iron, 12, [fired])).toEqual([]) // tier 2, no match
  })

  it('only contributes for goods in affectedGoodIds', () => {
    const fired: Event = {
      ...makeEvent({ scope: { kind: 'global' }, affectedGoodIds: ['iron'] }),
      resolved: true,
      fired: true,
      resolvedDurationDays: 5,
      activeUntilDay: 15,
      resolvedMultiplier: 1.8,
    }

    expect(getActiveEventEffectsFor(farrow, iron, 12, [fired])).toEqual([{ multiplier: 1.8 }])
    expect(getActiveEventEffectsFor(farrow, grain, 12, [fired])).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// REQUIRED ACCEPTANCE TESTS (T017 / TASK.md) — a "fired" event measurably
// shifts price relative to a "fizzled"/control run, isolating JUST the
// activeEvents parameter's effect using the SAME seed/day/rng-state.
// ---------------------------------------------------------------------------
describe('fired vs fizzled event price effect (isolated via computePrice)', () => {
  const farrow = CITIES.find((c) => c.id === 'farrow')
  const iron = GOODS.find((g) => g.id === 'iron')
  if (!farrow || !iron) throw new Error('expected farrow/iron in v1 data')

  const seed = 9001
  const day = 12

  const computeIronPrice = (activeEvents: ReturnType<typeof getActiveEventEffectsFor>): number => {
    // Fresh rng per call, same seed/state-of-stream, so the ONLY difference
    // between the fired and fizzled runs below is the activeEvents argument.
    const rng = createRng(seed)
    return computePrice(farrow, iron, day, seed, rng, undefined, activeEvents).price
  }

  it('a fired event (scheduled -> resolved via resolveEvent) measurably raises the affected price vs a fizzled control, same seed/day', () => {
    const scheduled = makeEvent({
      affectedGoodIds: ['iron'],
      scope: { kind: 'global' },
      multiplierMin: 1.5,
      multiplierMax: 2.5,
      scheduledFireDay: day,
      hiddenTruth: true,
    })
    const fizzledScheduled = { ...scheduled, hiddenTruth: false }

    const resolutionRng = createRng(555)
    const fired = resolveEvent(scheduled, resolutionRng)
    const fizzled = resolveEvent(fizzledScheduled, createRng(555))

    expect(fired.fired).toBe(true)
    expect(fizzled.fired).toBe(false)

    const firedEffects = getActiveEventEffectsFor(farrow, iron, day, [fired])
    const fizzledEffects = getActiveEventEffectsFor(farrow, iron, day, [fizzled])

    expect(firedEffects.length).toBe(1)
    expect(fizzledEffects.length).toBe(0)

    const firedPrice = computeIronPrice(firedEffects)
    const fizzledPrice = computeIronPrice(fizzledEffects)

    // Fired multiplier is always > 1 (range 1.5-2.5), fizzled contributes no
    // multiplier at all (neutral) -> fired price must be measurably higher,
    // well beyond ordinary noise/trend variance (noise/trend alone can't
    // account for a >=1.5x jump given iron's "Low" volatility class).
    expect(firedPrice).toBeGreaterThan(fizzledPrice)
    expect(firedPrice / fizzledPrice).toBeGreaterThan(1.3)
  })

  it('a fizzled event applies NO price shift at all relative to a true control (no event) run', () => {
    const scheduled = makeEvent({
      affectedGoodIds: ['iron'],
      scope: { kind: 'global' },
      scheduledFireDay: day,
      hiddenTruth: false,
    })
    const fizzled = resolveEvent(scheduled, createRng(777))
    expect(fizzled.fired).toBe(false)

    const fizzledEffects = getActiveEventEffectsFor(farrow, iron, day, [fizzled])
    expect(fizzledEffects).toEqual([])

    const noEventPrice = computeIronPrice([])
    const fizzledPrice = computeIronPrice(fizzledEffects)

    expect(fizzledPrice).toBe(noEventPrice)
  })

  it('over a randomized stress test, fired events always land price strictly above the no-event control', () => {
    for (let i = 0; i < 30; i++) {
      const testSeed = 1000 + i
      const scheduled = makeEvent({
        affectedGoodIds: ['iron'],
        scope: { kind: 'global' },
        multiplierMin: 1.5,
        multiplierMax: 2.5,
        scheduledFireDay: day,
        hiddenTruth: true,
      })
      const fired = resolveEvent(scheduled, createRng(testSeed))
      const firedEffects = getActiveEventEffectsFor(farrow, iron, day, [fired])

      const rngNoEvent = createRng(testSeed)
      const noEventPrice = computePrice(farrow, iron, day, testSeed, rngNoEvent, undefined, []).price

      const rngFired = createRng(testSeed)
      const firedPrice = computePrice(farrow, iron, day, testSeed, rngFired, undefined, firedEffects).price

      expect(firedPrice).toBeGreaterThan(noEventPrice)
    }
  })
})
