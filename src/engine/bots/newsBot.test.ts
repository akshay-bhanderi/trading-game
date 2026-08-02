import { describe, expect, it } from 'vitest'
import { CONFIG } from '../config'
import { CITIES } from '../data/cities'
import { createRng } from '../rng'
import type { Event, GameState } from '../types'
import { analyzeRumorSignals, buyIntoRumor, maybeInvestInPhase2Assets, maybeRepayLoan, newsBotStep } from './newsBot'

/**
 * Builds a minimal-but-valid `GameState`, following the same pattern as
 * /src/engine/turnLoop.test.ts and /src/engine/bank/loans.test.ts.
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

// ---------------------------------------------------------------------------
// REQUIRED ACCEPTANCE TEST (TASK.md T027) — 90-day smoke test, fixed seed.
// Same pattern as T025/T026's smoke tests and turnLoop.test.ts's headless
// simulation: loop `newsBotStep` until `state.day` has advanced >= 90,
// asserting no exceptions.
// ---------------------------------------------------------------------------
describe('newsBotStep smoke test', () => {
  it('runs 90 simulated days without throwing (fixed seed)', () => {
    const TARGET_DAYS = 90
    let state = makeState({ day: 1, seed: 13_579 })
    const rng = createRng(24_680)

    const startingDay = state.day
    let iterations = 0

    expect(() => {
      while (state.day < startingDay + TARGET_DAYS) {
        state = newsBotStep(state, rng)
        iterations++
        // Guard against a runaway/non-terminating loop masking as "it never
        // threw" — every call should advance the day by exactly 1.
        if (iterations > TARGET_DAYS * 5) {
          throw new Error('newsBotStep did not advance the day as expected')
        }
      }
    }).not.toThrow()

    expect(state.day).toBeGreaterThanOrEqual(startingDay + TARGET_DAYS)
    expect(Number.isFinite(state.cash)).toBe(true)
    expect(Number.isFinite(state.peakNetWorth)).toBe(true)
  })

  it('runs a second, independently-seeded 90-day simulation without throwing (guards against flaky/seed-dependent crashes)', () => {
    const TARGET_DAYS = 90
    let state = makeState({
      day: 1,
      seed: 909_090,
      currentCity: 'copperfell',
      cash: CONFIG.difficulty.Expert.startingCash,
      difficulty: 'Expert',
    })
    const rng = createRng(112_233)
    const startingDay = state.day

    expect(() => {
      let iterations = 0
      while (state.day < startingDay + TARGET_DAYS) {
        state = newsBotStep(state, rng)
        iterations++
        if (iterations > TARGET_DAYS * 5) {
          throw new Error('newsBotStep did not advance the day as expected')
        }
      }
    }).not.toThrow()

    expect(state.day).toBeGreaterThanOrEqual(startingDay + TARGET_DAYS)
  })

  it('populates state.currentNewspaper after a single step (bot calls generateDailyPaper itself)', () => {
    const state = makeState({ day: 1 })
    const rng = createRng(1)

    const result = newsBotStep(state, rng)

    expect(result.currentNewspaper.length).toBeGreaterThan(0)
    for (const story of result.currentNewspaper) {
      expect(story.day).toBe(state.day)
      expect(['wire', 'gossip']).toContain(story.sourceStyle)
    }
  })
})

// ---------------------------------------------------------------------------
// analyzeRumorSignals — direction/confidence derivation from newspaper
// stories.
// ---------------------------------------------------------------------------
describe('analyzeRumorSignals', () => {
  const upEvent: Event = {
    id: 'evt-drought-1',
    typeId: 'droughtCropFailure',
    affectedGoodIds: ['grain'],
    scope: { kind: 'city', cityId: 'farrow' },
    multiplierMin: 1.6,
    multiplierMax: 2.2,
    durationDaysMin: 4,
    durationDaysMax: 6,
    hiddenTruth: true,
    scheduledFireDay: 5,
    createdOnDay: 2,
    resolved: false,
    fired: null,
  }

  const downEvent: Event = {
    id: 'evt-harvest-1',
    typeId: 'bumperHarvest',
    affectedGoodIds: ['cotton'],
    scope: { kind: 'city', cityId: 'farrow' },
    multiplierMin: 0.5,
    multiplierMax: 0.7,
    durationDaysMin: 4,
    durationDaysMax: 6,
    hiddenTruth: true,
    scheduledFireDay: 5,
    createdOnDay: 2,
    resolved: false,
    fired: null,
  }

  it('produces an "up" high-confidence signal for a wire rumor tied to a real event predicting a price rise', () => {
    const state = makeState({ currentCity: 'farrow', activeEvents: [upEvent] })
    const signals = analyzeRumorSignals(state, [
      {
        id: 'story-1',
        day: 3,
        headline: 'Wire report: whispers of drought / crop failure near Farrow',
        body: 'Word is spreading.',
        sourceStyle: 'wire',
        relatedEventId: upEvent.id,
        isResolution: false,
        isFalseRumor: false,
      },
    ])

    expect(signals).toHaveLength(1)
    expect(signals[0]).toEqual({ goodId: 'grain', direction: 'up', confidence: 'high' })
  })

  it('produces a "down" low-confidence signal for a gossip rumor tied to a real event predicting a price fall', () => {
    const state = makeState({ currentCity: 'farrow', activeEvents: [downEvent] })
    const signals = analyzeRumorSignals(state, [
      {
        id: 'story-2',
        day: 3,
        headline: 'Bazaar gossip: whispers of bumper harvest near Farrow',
        body: 'Word is spreading.',
        sourceStyle: 'gossip',
        relatedEventId: downEvent.id,
        isResolution: false,
        isFalseRumor: false,
      },
    ])

    expect(signals).toHaveLength(1)
    expect(signals[0]).toEqual({ goodId: 'cotton', direction: 'down', confidence: 'low' })
  })

  it('ignores resolution stories, false rumors, and rumors scoped to a different city', () => {
    const elsewhereEvent: Event = { ...upEvent, id: 'evt-elsewhere', scope: { kind: 'city', cityId: 'saltmere' } }
    const state = makeState({ currentCity: 'farrow', activeEvents: [upEvent, elsewhereEvent] })

    const signals = analyzeRumorSignals(state, [
      {
        id: 'res-1',
        day: 3,
        headline: 'Drought: confirmed in Farrow',
        body: 'Confirmed.',
        sourceStyle: 'wire',
        relatedEventId: upEvent.id,
        isResolution: true,
        isFalseRumor: false,
      },
      {
        id: 'false-1',
        day: 3,
        headline: 'Wire report: Grain in Farrow set to surge',
        body: 'Unconfirmed.',
        sourceStyle: 'wire',
        relatedEventId: null,
        isResolution: false,
        isFalseRumor: true,
      },
      {
        id: 'elsewhere-1',
        day: 3,
        headline: 'Wire report: whispers of drought near Saltmere',
        body: 'Word is spreading.',
        sourceStyle: 'wire',
        relatedEventId: elsewhereEvent.id,
        isResolution: false,
        isFalseRumor: false,
      },
    ])

    expect(signals).toHaveLength(0)
  })

  it('does not produce a signal for a good the bot cannot yet trade (unlocked but no license purchased)', () => {
    const spiceEvent: Event = { ...upEvent, id: 'evt-spice', affectedGoodIds: ['spices'] }
    const state = makeState({
      currentCity: 'farrow',
      activeEvents: [spiceEvent],
      unlockedGoodIds: ['grain', 'cotton', 'iron', 'spices'],
      purchasedLicenseGoodIds: [], // spices license NOT purchased
    })

    const signals = analyzeRumorSignals(state, [
      {
        id: 'story-3',
        day: 3,
        headline: 'Wire report: spice trouble near Farrow',
        body: 'Word is spreading.',
        sourceStyle: 'wire',
        relatedEventId: spiceEvent.id,
        isResolution: false,
        isFalseRumor: false,
      },
    ])

    expect(signals).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// REQUIRED ACCEPTANCE TEST (TASK.md T027) — the bot is CAPABLE of taking a
// loan under favorable conditions. Per the task brief, directly unit-testing
// the factored-out `buyIntoRumor` helper (rather than seed-hunting for the
// exact newspaper RNG roll that produces a matching high-confidence wire
// rumor within a 90-day run) is the documented, deliberately-chosen fallback
// here — it exercises exactly the same loan-taking code path `newsBotStep`
// itself calls, without depending on newspaper RNG content.
// ---------------------------------------------------------------------------
describe('buyIntoRumor — loan-taking under favorable conditions', () => {
  it('takes a loan at the current city bank to fund a position when cash alone cannot cover a high-confidence target', () => {
    const state = makeState({
      currentCity: 'farrow', // Small bank, baseCap $1,000 at rank 1
      cash: 200,
      cargo: {},
      cargoCapacity: 40,
      bankAccounts: {},
      priceStates: {
        farrow: {
          grain: { cityId: 'farrow', goodId: 'grain', currentPrice: 70, lastSeenPrice: 70, lastSeenDay: 1, trendPosition: 0 },
        },
      },
    })

    // T029: HIGH_CONFIDENCE_TARGET_SPEND_FRACTION is now 1.3 (was 1.5) — see
    // newsBot.ts's own T029 comment for why. Target spend = 1.3 * 200 = 260 ->
    // targetQty = min(40, floor(260/70)) = 3 -> targetCost = 210 > cash (200)
    // -> shortfall = 10, well within the Small-bank/rank-1 cap of $1,000.
    const result = buyIntoRumor(state, { goodId: 'grain', direction: 'up', confidence: 'high' })

    expect(result).not.toBe(state)
    expect(result.bankAccounts['farrow']?.loan).not.toBeNull()
    expect(result.bankAccounts['farrow']?.loan?.principal).toBeGreaterThan(0)
    expect(result.cargo['grain']?.qty).toBe(3)
    // Cash: started with 200, +loan principal, -cost of 3 units at 70 each.
    const loanPrincipal = result.bankAccounts['farrow']?.loan?.principal ?? 0
    expect(result.cash).toBeCloseTo(200 + loanPrincipal - 210, 6)
  })

  it('does NOT take a loan for a low-confidence (gossip) signal, even if cash alone cannot cover the smaller target', () => {
    const state = makeState({
      currentCity: 'farrow',
      cash: 10,
      cargo: {},
      cargoCapacity: 40,
      bankAccounts: {},
      priceStates: {
        farrow: {
          grain: { cityId: 'farrow', goodId: 'grain', currentPrice: 100, lastSeenPrice: 100, lastSeenDay: 1, trendPosition: 0 },
        },
      },
    })

    // Low-confidence target spend = 0.35 * 10 = 3.5 -> floor(3.5/100) = 0 ->
    // targetQty is 0, so the function bails out before any loan logic runs.
    const result = buyIntoRumor(state, { goodId: 'grain', direction: 'up', confidence: 'low' })

    expect(result).toBe(state)
    expect(result.bankAccounts['farrow']).toBeUndefined()
  })

  it('falls back to a cash-only purchase when takeLoan is rejected (bank already has an active loan)', () => {
    const state = makeState({
      currentCity: 'farrow',
      cash: 200,
      cargo: {},
      cargoCapacity: 40,
      bankAccounts: {
        farrow: {
          cityId: 'farrow',
          loan: { principal: 500, accruedInterest: 0, startDay: 1, termDays: 60 },
        },
      },
      priceStates: {
        farrow: {
          grain: { cityId: 'farrow', goodId: 'grain', currentPrice: 100, lastSeenPrice: 100, lastSeenDay: 1, trendPosition: 0 },
        },
      },
    })

    const result = buyIntoRumor(state, { goodId: 'grain', direction: 'up', confidence: 'high' })

    // takeLoan rejected (one active loan per bank already) -> loan unchanged,
    // bot buys only what cash affords: floor(200/100) = 2 units.
    expect(result.bankAccounts['farrow']?.loan?.principal).toBe(500)
    expect(result.cargo['grain']?.qty).toBe(2)
    expect(result.cash).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// maybeRepayLoan — opportunistic repayment heuristic.
// ---------------------------------------------------------------------------
describe('maybeRepayLoan', () => {
  it('repays 50% of spare cash (above the $2,000 reserve) toward an active loan at the current city', () => {
    const state = makeState({
      currentCity: 'farrow',
      cash: 10_000,
      bankAccounts: {
        farrow: {
          cityId: 'farrow',
          loan: { principal: 3_000, accruedInterest: 0, startDay: 1, termDays: 60 },
        },
      },
    })

    // spare = 10,000 - 2,000 = 8,000; repayment = 0.5 * 8,000 = 4,000, but
    // outstanding debt is only 3,000, so repayLoan caps it there.
    const result = maybeRepayLoan(state)

    expect(result).not.toBe(state)
    expect(result.bankAccounts['farrow']?.loan).toBeNull()
    expect(result.cash).toBe(10_000 - 3_000)
  })

  it('does nothing when cash does not exceed the reserve', () => {
    const state = makeState({
      currentCity: 'farrow',
      cash: 1_500,
      bankAccounts: {
        farrow: {
          cityId: 'farrow',
          loan: { principal: 3_000, accruedInterest: 0, startDay: 1, termDays: 60 },
        },
      },
    })

    const result = maybeRepayLoan(state)
    expect(result).toBe(state)
  })

  it('does nothing when there is no active loan at the current city', () => {
    const state = makeState({ currentCity: 'farrow', cash: 10_000, bankAccounts: {} })
    const result = maybeRepayLoan(state)
    expect(result).toBe(state)
  })
})

// ---------------------------------------------------------------------------
// maybeInvestInPhase2Assets — T067 deferred tests (see file header's "T067
// ADDITION" section and tasks/phase-13-final-balance-pass.md's T068 entry).
// ---------------------------------------------------------------------------
describe('maybeInvestInPhase2Assets', () => {
  const FARROW = CITIES.find((c) => c.id === 'farrow') as { hotelPerNight: number }
  const WAREHOUSE_FLOOR_1_COST = CONFIG.warehouse.floors[1]?.buildCost as number
  const HOTEL_INN_COST_FARROW = (CONFIG.hotel.tiers[0]?.buildOrUpgradeCostMultiplier as number) * FARROW.hotelPerNight
  const PLANE_COST = CONFIG.aviation.classes.propFeeder.purchasePrice
  const PHASE2_MULTIPLE = 20 // mirrors newsBot.ts's own PHASE2_AFFORDABILITY_MULTIPLE (T068 re-tune)

  it('does nothing when cash clears no candidate\'s affordability bar', () => {
    const state = makeState({ currentCity: 'farrow', cash: WAREHOUSE_FLOOR_1_COST * PHASE2_MULTIPLE - 1 })
    expect(maybeInvestInPhase2Assets(state)).toBe(state)
  })

  it('builds a warehouse floor once cash clears ITS bar, even though the hotel/plane bars are not yet cleared', () => {
    const state = makeState({ currentCity: 'farrow', cash: WAREHOUSE_FLOOR_1_COST * PHASE2_MULTIPLE })
    const result = maybeInvestInPhase2Assets(state)
    expect(result.warehouses?.farrow).toEqual({ floorsBuilt: 1, insured: false })
    expect(result.cash).toBe(state.cash - WAREHOUSE_FLOOR_1_COST)
  })

  it('picks the CHEAPEST affordable candidate when several clear their bars (warehouse over hotel)', () => {
    const state = makeState({ currentCity: 'farrow', cash: HOTEL_INN_COST_FARROW * PHASE2_MULTIPLE })
    const result = maybeInvestInPhase2Assets(state)
    // Both warehouse floor 1 and the hotel Inn are affordable — warehouse is
    // cheaper, so it (not the hotel) is the one actually bought.
    expect(result.warehouses?.farrow).toEqual({ floorsBuilt: 1, insured: false })
    expect(result.hotels?.farrow).toBeUndefined()
  })

  it('buys the hotel once the warehouse is already maxed out (so warehouse is no longer a candidate)', () => {
    const state = makeState({
      currentCity: 'farrow',
      cash: HOTEL_INN_COST_FARROW * PHASE2_MULTIPLE,
      warehouses: { farrow: { floorsBuilt: CONFIG.warehouse.maxFloors, insured: false } },
    })
    const result = maybeInvestInPhase2Assets(state)
    expect(result.hotels?.farrow).toEqual({ tier: 0 })
  })

  it('buys and monthly-leases the cheapest plane class at a Medium+ bank city once warehouse/hotel are maxed', () => {
    const state = makeState({
      currentCity: 'port-vela',
      unlockedCityIds: ['farrow', 'saltmere', 'copperfell', 'millbrook', 'port-vela'],
      cash: PLANE_COST * PHASE2_MULTIPLE,
      warehouses: { 'port-vela': { floorsBuilt: CONFIG.warehouse.maxFloors, insured: false } },
      hotels: { 'port-vela': { tier: CONFIG.hotel.tiers.length - 1 } },
    })
    const result = maybeInvestInPhase2Assets(state)
    expect(result.planes).toHaveLength(1)
    expect(result.planes?.[0]?.class).toBe('propFeeder')
    expect(result.planes?.[0]?.status).toBe('leasedMonthly')
  })

  it('never considers buying a plane at a Small-bank city, no matter how much cash is available', () => {
    const state = makeState({
      currentCity: 'farrow', // Small bank
      cash: 100_000_000,
      warehouses: { farrow: { floorsBuilt: CONFIG.warehouse.maxFloors, insured: false } },
      hotels: { farrow: { tier: CONFIG.hotel.tiers.length - 1 } },
    })
    const result = maybeInvestInPhase2Assets(state)
    expect(result).toBe(state) // warehouse/hotel maxed, plane unavailable here -> no candidates at all
  })

  it('takes at most ONE Phase 2 action per call, never stacking multiple purchases in one day', () => {
    const state = makeState({ currentCity: 'farrow', cash: 100_000_000 })
    const result = maybeInvestInPhase2Assets(state)
    const boughtWarehouse = result.warehouses?.farrow?.floorsBuilt === 1
    const boughtHotel = result.hotels?.farrow?.tier === 0
    const boughtPlane = (result.planes?.length ?? 0) === 1
    // Exactly one of the three candidates was actually purchased this call.
    expect([boughtWarehouse, boughtHotel, boughtPlane].filter(Boolean)).toHaveLength(1)
  })

  it('is a no-op when currentCity does not resolve to a known City (defensive)', () => {
    const state = makeState({ currentCity: 'nowhere' as GameState['currentCity'], cash: 100_000_000 })
    expect(maybeInvestInPhase2Assets(state)).toBe(state)
  })
})
