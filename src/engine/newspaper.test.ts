import { describe, expect, it } from 'vitest'
import { createRng } from './rng'
import { CONFIG } from './config'
import { scheduleEvent } from './events/eventEngine'
import { resolveDueEvents } from './events/resolution'
import { generateDailyPaper } from './newspaper'
import type { GameState } from './types'

/**
 * Minimal-but-valid `GameState` builder, following the same pattern already
 * established by turnLoop.test.ts (T015), eventEngine.test.ts/resolution.test.ts
 * (T016/T017).
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
    unlockedCityIds: ['farrow', 'saltmere', 'copperfell', 'millbrook'],
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

describe('generateDailyPaper — basic shape', () => {
  it('produces 2-4 discretionary stories on a typical day (nothing pending/unlocked), each with a valid sourceStyle', () => {
    const state = makeState({ day: 5 })
    const rng = createRng(99)

    const { stories } = generateDailyPaper(state, rng)

    expect(stories.length).toBeGreaterThanOrEqual(CONFIG.events.storiesPerDayMin)
    expect(stories.length).toBeLessThanOrEqual(CONFIG.events.storiesPerDayMax)

    for (const story of stories) {
      expect(['wire', 'gossip']).toContain(story.sourceStyle)
      expect(story.isResolution).toBe(false)
      expect(story.day).toBe(5)
      expect(typeof story.headline).toBe('string')
      expect(story.headline.length).toBeGreaterThan(0)
      expect(typeof story.body).toBe('string')
      expect(story.body.length).toBeGreaterThan(0)
    }
  })

  it('is a pure function: never mutates the input state', () => {
    const state = makeState({ day: 10 })
    const snapshot = JSON.parse(JSON.stringify(state))
    generateDailyPaper(state, createRng(7))
    expect(state).toEqual(snapshot)
  })

  it('across many seeds, the discretionary count always stays within the configured 2-4 range', () => {
    for (let seed = 0; seed < 100; seed++) {
      const state = makeState({ day: 3 })
      const { stories } = generateDailyPaper(state, createRng(seed))
      expect(stories.length).toBeGreaterThanOrEqual(2)
      expect(stories.length).toBeLessThanOrEqual(4)
    }
  })
})

describe('generateDailyPaper — resolution stories (non-negotiable, T018 acceptance bar)', () => {
  it('does NOT report a resolution the SAME day it resolved — it is held for the next call', () => {
    const rng = createRng(1)
    let state = makeState({ day: 10 })

    const { updatedState: scheduledState, event } = scheduleEvent(state, rng)
    state = { ...scheduledState, day: event.scheduledFireDay }

    const { state: afterResolve, resolutions } = resolveDueEvents(state, rng)
    expect(resolutions).toHaveLength(1)

    state = { ...afterResolve, pendingResolutions: [...(state.pendingResolutions ?? []), ...resolutions] }

    // SAME day as resolution: must NOT appear yet.
    const sameDayResult = generateDailyPaper(state, rng)
    expect(sameDayResult.stories.some((s) => s.isResolution)).toBe(false)
    expect(sameDayResult.state.pendingResolutions).toHaveLength(1)

    // NEXT day: must appear exactly once.
    const nextDayState = { ...sameDayResult.state, day: sameDayResult.state.day + 1 }
    const nextDayResult = generateDailyPaper(nextDayState, rng)
    const resolutionStories = nextDayResult.stories.filter((s) => s.isResolution)
    expect(resolutionStories).toHaveLength(1)
    expect(resolutionStories[0]?.relatedEventId).toBe(event.id)
    expect(nextDayResult.state.pendingResolutions).toHaveLength(0)
  })

  it('resolution stories are pinned first in the stories array', () => {
    let state = makeState({ day: 10 })
    const rng = createRng(2)

    const { updatedState: scheduledState, event } = scheduleEvent(state, rng)
    state = { ...scheduledState, day: event.scheduledFireDay }
    const { state: afterResolve, resolutions } = resolveDueEvents(state, rng)
    state = { ...afterResolve, day: afterResolve.day + 1, pendingResolutions: resolutions }

    const { stories } = generateDailyPaper(state, rng, { newlyUnlockedCityIds: ['port-vela'] })

    const firstNonResolutionIdx = stories.findIndex((s) => !s.isResolution)
    const lastResolutionIdx = stories.reduce(
      (acc, s, i) => (s.isResolution ? i : acc),
      -1,
    )
    // Every resolution story's index must be less than every non-resolution
    // story's index (resolutions sort first, per the T039 pinning contract).
    expect(lastResolutionIdx).toBeLessThan(firstNonResolutionIdx === -1 ? Infinity : firstNonResolutionIdx)
    expect(lastResolutionIdx).toBeGreaterThanOrEqual(0)
  })

  it('a fired event and a fizzled event produce CLEARLY DIFFERENT resolution text', () => {
    let state = makeState({ day: 10 })
    const rng = createRng(3)

    // Schedule two events; force resolution outcomes by direct construction
    // rather than relying on the hidden-truth RNG draw, to guarantee one
    // fires and one fizzles for this specific assertion.
    const scheduleResult = scheduleEvent(state, rng)
    state = scheduleResult.updatedState

    const firedEvent = { ...scheduleResult.event, id: 'fired-1', hiddenTruth: true, scheduledFireDay: 10 }
    const fizzledEvent = { ...scheduleResult.event, id: 'fizzled-1', hiddenTruth: false, scheduledFireDay: 10 }

    state = { ...state, day: 10, activeEvents: [firedEvent, fizzledEvent] }
    const { state: afterResolve, resolutions } = resolveDueEvents(state, rng)
    expect(resolutions).toHaveLength(2)

    state = { ...afterResolve, day: afterResolve.day + 1, pendingResolutions: resolutions }
    const { stories } = generateDailyPaper(state, rng)

    const resolutionStories = stories.filter((s) => s.isResolution)
    expect(resolutionStories).toHaveLength(2)

    const firedStory = resolutionStories.find((s) => s.relatedEventId === 'fired-1')
    const fizzledStory = resolutionStories.find((s) => s.relatedEventId === 'fizzled-1')
    expect(firedStory).toBeDefined()
    expect(fizzledStory).toBeDefined()
    expect(firedStory?.headline).not.toBe(fizzledStory?.headline)
    expect(firedStory?.body).not.toBe(fizzledStory?.body)
    // Sanity: the fired one reads as confirmed, the fizzled one reads as a
    // non-event — cheap heuristic check without over-specifying exact copy.
    expect(firedStory?.headline.toLowerCase()).toContain('confirmed')
    expect(fizzledStory?.headline.toLowerCase()).toContain('fizzles')
  })

  it('OVER MANY SIMULATED DAYS: resolution stories appear in EXACT 1:1 correspondence with resolved events — no more, no less, none missed', () => {
    const rng = createRng(2026)
    let state = makeState({ day: 1 })

    const TOTAL_DAYS = 300
    let totalResolved = 0
    let totalResolutionStories = 0
    const reportedEventIds = new Set<string>()

    for (let day = 1; day <= TOTAL_DAYS; day++) {
      state = { ...state, day }

      // Occasionally schedule a new event, mimicking the turn loop's own
      // event-scheduling cadence (not built here — T018 doesn't own
      // scheduling, just consumes resolutions).
      if (rng.next() < 0.5) {
        const { updatedState } = scheduleEvent(state, rng)
        state = updatedState
      }

      // Mimic turnLoop.ts's advanceDay wiring: resolve due events, then
      // APPEND them onto pendingResolutions (never overwrite).
      const { state: afterResolve, resolutions } = resolveDueEvents(state, rng)
      state = {
        ...afterResolve,
        pendingResolutions: [...(state.pendingResolutions ?? []), ...resolutions],
      }
      totalResolved += resolutions.length

      const { state: afterPaper, stories } = generateDailyPaper(state, rng)
      state = afterPaper

      const resolutionStories = stories.filter((s) => s.isResolution)
      totalResolutionStories += resolutionStories.length

      for (const story of resolutionStories) {
        const relatedId = story.relatedEventId
        expect(relatedId).not.toBeNull()
        // Never report the same event's resolution twice.
        expect(reportedEventIds.has(relatedId as string)).toBe(false)
        reportedEventIds.add(relatedId as string)
      }
    }

    // Every resolved event either already produced its one story, or is
    // still correctly sitting in the queue awaiting tomorrow's paper (only
    // possible for events that resolved on the very last simulated day) —
    // together these must account for every single resolution, exactly.
    const stillQueued = state.pendingResolutions?.length ?? 0
    expect(totalResolutionStories + stillQueued).toBe(totalResolved)
    // Sanity: this run actually exercised the pipeline with a meaningful
    // number of resolved events, not zero.
    expect(totalResolved).toBeGreaterThan(10)
  })
})

describe('generateDailyPaper — city-unlock headline (§4)', () => {
  it('includes a headline story for each newly unlocked city, on the correct day', () => {
    const state = makeState({ day: 42 })
    const rng = createRng(5)

    const { stories } = generateDailyPaper(state, rng, { newlyUnlockedCityIds: ['port-vela'] })

    const unlockStory = stories.find((s) => s.headline.includes('Port Vela'))
    expect(unlockStory).toBeDefined()
    expect(unlockStory?.day).toBe(42)
    expect(unlockStory?.isResolution).toBe(false)
    expect(unlockStory?.isFalseRumor).toBe(false)
    expect(unlockStory?.relatedEventId).toBeNull()
    expect(unlockStory?.headline).toBe('Trade routes to Port Vela now open to licensed merchants!')
  })

  it('produces no unlock headline when nothing newly unlocked', () => {
    const state = makeState({ day: 8 })
    const rng = createRng(6)
    const { stories } = generateDailyPaper(state, rng)
    expect(stories.some((s) => s.headline.includes('now open to licensed merchants'))).toBe(false)
  })

  it('supports multiple simultaneous unlocks, one headline each', () => {
    const state = makeState({ day: 8 })
    const rng = createRng(6)
    const { stories } = generateDailyPaper(state, rng, {
      newlyUnlockedCityIds: ['port-vela', 'ironvale'],
    })
    expect(stories.some((s) => s.headline.includes('Port Vela'))).toBe(true)
    expect(stories.some((s) => s.headline.includes('Ironvale'))).toBe(true)
  })
})

describe('generateDailyPaper — scheduled-event rumor announcement tracking', () => {
  it('never prints more than one rumor story for the same not-yet-due event, across many days', () => {
    let state = makeState({ day: 1 })
    const rng = createRng(11)

    const { updatedState, event } = scheduleEvent(state, rng)
    // Push the fire day far into the future so it never resolves during
    // this test — isolating just the rumor-announcement bookkeeping.
    const farFutureEvent = { ...event, scheduledFireDay: 1000 }
    state = { ...updatedState, activeEvents: [farFutureEvent] }

    let rumorStoryCount = 0
    for (let day = 1; day <= 60; day++) {
      state = { ...state, day }
      const { state: afterPaper, stories } = generateDailyPaper(state, rng)
      state = afterPaper
      rumorStoryCount += stories.filter((s) => s.relatedEventId === farFutureEvent.id && !s.isResolution).length
    }

    expect(rumorStoryCount).toBeLessThanOrEqual(1)
  })

  it('never reveals hiddenTruth or a concrete multiplier/duration number in rumor story text', () => {
    let state = makeState({ day: 1 })
    const rng = createRng(22)

    const { updatedState, event } = scheduleEvent(state, rng)
    const farFutureEvent = { ...event, scheduledFireDay: 1000, hiddenTruth: true }
    state = { ...updatedState, activeEvents: [farFutureEvent] }

    let foundRumor = false
    for (let day = 1; day <= 60 && !foundRumor; day++) {
      state = { ...state, day }
      const { state: afterPaper, stories } = generateDailyPaper(state, rng)
      state = afterPaper
      const rumor = stories.find((s) => s.relatedEventId === farFutureEvent.id && !s.isResolution)
      if (rumor) {
        foundRumor = true
        expect(rumor.headline).not.toMatch(/true|hiddenTruth/i)
        expect(rumor.body).not.toMatch(/\d+%/)
      }
    }

    expect(foundRumor).toBe(true)
  })
})
