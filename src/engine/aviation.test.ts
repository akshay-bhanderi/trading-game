import { describe, expect, it } from 'vitest'
import { CONFIG, YEAR_LENGTH_DAYS } from './config'
import {
  accruePlaneIncome,
  accruePlaneMaintenanceForDay,
  applyAviationSafetyIncidents,
  buyPlane,
  cancelMonthlyLease,
  isFuelPriceSpikeActive,
  isPlanePurchaseAvailable,
  planeDailyIncome,
  planeDailyMaintenance,
  planeDepreciatedValue,
  sellPlane,
  setPlaneStatus,
  terminateAnnualLease,
} from './aviation'
import type { EventResolution } from './events/resolution'
import type { Event, GameState, Plane } from './types'
import type { Rng } from './rng'

/**
 * T068 — deferred unit tests for Phase 12 (Aviation Leasing, T059-T066),
 * written together per the project's Phase-10-13 testing policy (see
 * tasks/phase-13-final-balance-pass.md). Covers exactly the behaviors T068's
 * own acceptance criteria names: purchase, status, income, cancellation,
 * personal-use bonus, depreciation, events.
 */
function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    day: 1,
    currentCity: 'farrow', // Small bank by default — override to a Medium+ city for purchase tests
    cash: 0,
    cargo: {},
    cargoCapacity: CONFIG.cargo.startingCapacity,
    bankAccounts: {},
    priceStates: {},
    unlockedCityIds: ['farrow', 'port-vela'],
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

function makePlane(overrides: Partial<Plane> = {}): Plane {
  return {
    id: 'plane-1',
    class: 'propFeeder',
    status: 'idle',
    purchaseCityId: 'port-vela',
    purchaseDay: 1,
    purchasePrice: CONFIG.aviation.classes.propFeeder.purchasePrice,
    ...overrides,
  }
}

/** Fake `Rng` test double — see warehouse.test.ts's identical helper for why
 * a hand-rolled double (not a real seed search) is used for deterministic
 * branch coverage of dice-roll logic. `pick` always returns the first
 * element, which is sufficient control for `applyAviationSafetyIncidents`'s
 * single-eligible-plane tests below. */
function makeFakeRng(pickIndex = 0): Rng {
  return {
    next: () => 0,
    int: (min) => min,
    pick: <T>(arr: readonly T[]) => arr[pickIndex] as T,
  }
}

function makeIncidentEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: 'evt-incident-1',
    typeId: 'aviationSafetyIncident',
    affectedGoodIds: [],
    scope: { kind: 'global' },
    multiplierMin: 1,
    multiplierMax: 1,
    durationDaysMin: 5,
    durationDaysMax: 10,
    hiddenTruth: true,
    scheduledFireDay: 10,
    createdOnDay: 7,
    resolved: true,
    fired: true,
    activeUntilDay: 17,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// isPlanePurchaseAvailable / buyPlane (T059/T060)
// ---------------------------------------------------------------------------

describe('isPlanePurchaseAvailable', () => {
  it('true at a Medium+ bank city (port-vela)', () => {
    expect(isPlanePurchaseAvailable(makeState({ currentCity: 'port-vela' }))).toBe(true)
  })

  it('false at a Small bank city (farrow)', () => {
    expect(isPlanePurchaseAvailable(makeState({ currentCity: 'farrow' }))).toBe(false)
  })
})

describe('buyPlane', () => {
  it('buys a plane at a Medium+ bank city, deducting price, appending an idle plane', () => {
    const price = CONFIG.aviation.classes.propFeeder.purchasePrice
    const state = makeState({ currentCity: 'port-vela', cash: price + 1_000, day: 5 })

    const result = buyPlane(state, 'port-vela', 'propFeeder')

    expect(result.cash).toBe(1_000)
    expect(result.planes).toHaveLength(1)
    expect(result.planes?.[0]).toMatchObject({
      class: 'propFeeder',
      status: 'idle',
      purchaseCityId: 'port-vela',
      purchaseDay: 5,
      purchasePrice: price,
    })
  })

  it('rejects when not physically present in cityId', () => {
    const state = makeState({ currentCity: 'farrow', cash: 10_000_000 })
    expect(buyPlane(state, 'port-vela', 'propFeeder')).toBe(state)
  })

  it('rejects at a sub-Medium bank city', () => {
    const state = makeState({ currentCity: 'farrow', cash: 10_000_000 })
    expect(buyPlane(state, 'farrow', 'propFeeder')).toBe(state)
  })

  it('rejects insufficient cash', () => {
    const state = makeState({ currentCity: 'port-vela', cash: CONFIG.aviation.classes.propFeeder.purchasePrice - 1 })
    expect(buyPlane(state, 'port-vela', 'propFeeder')).toBe(state)
  })

  it('has no fleet-size cap beyond cash on hand', () => {
    let state = makeState({ currentCity: 'port-vela', cash: CONFIG.aviation.classes.propFeeder.purchasePrice * 3 })
    state = buyPlane(state, 'port-vela', 'propFeeder')
    state = buyPlane(state, 'port-vela', 'propFeeder')
    state = buyPlane(state, 'port-vela', 'propFeeder')
    expect(state.planes).toHaveLength(3)
  })
})

// ---------------------------------------------------------------------------
// setPlaneStatus (T061/T062/T063)
// ---------------------------------------------------------------------------

describe('setPlaneStatus', () => {
  it('reassigns status freely between idle/leasedMonthly with no lock', () => {
    const state = makeState({ planes: [makePlane({ status: 'idle' })] })
    const result = setPlaneStatus(state, 'plane-1', 'leasedMonthly')
    expect(result.planes?.[0]?.status).toBe('leasedMonthly')
  })

  it('entering leasedAnnual sets annualLeaseStartDay to state.day', () => {
    const state = makeState({ day: 42, planes: [makePlane({ status: 'idle' })] })
    const result = setPlaneStatus(state, 'plane-1', 'leasedAnnual')
    expect(result.planes?.[0]?.annualLeaseStartDay).toBe(42)
  })

  it('rejects moving OFF leasedAnnual before the firm 90-day term completes', () => {
    const state = makeState({
      day: 50,
      planes: [makePlane({ status: 'leasedAnnual', annualLeaseStartDay: 10 })], // term ends day 100
    })
    const result = setPlaneStatus(state, 'plane-1', 'idle')
    expect(result).toBe(state)
  })

  it('allows moving OFF leasedAnnual once the firm term has completed', () => {
    const state = makeState({
      day: 100,
      planes: [makePlane({ status: 'leasedAnnual', annualLeaseStartDay: 10 })],
    })
    const result = setPlaneStatus(state, 'plane-1', 'idle')
    expect(result.planes?.[0]?.status).toBe('idle')
  })

  it('always allows reassigning to the SAME status, even mid leasedAnnual term (re-arming)', () => {
    const state = makeState({
      day: 50,
      planes: [makePlane({ status: 'leasedAnnual', annualLeaseStartDay: 10 })],
    })
    const result = setPlaneStatus(state, 'plane-1', 'leasedAnnual')
    expect(result).not.toBe(state)
    expect(result.planes?.[0]?.status).toBe('leasedAnnual')
  })

  it('rejects moving OFF leasedMonthly while a cancellation notice is pending', () => {
    const state = makeState({
      day: 5,
      planes: [makePlane({ status: 'leasedMonthly', monthlyLeaseCancelEffectiveDay: 8 })],
    })
    expect(setPlaneStatus(state, 'plane-1', 'idle')).toBe(state)
  })

  it('T063: setting status to personal arms armedPersonalUsePlaneId; re-arming an already-personal plane is allowed', () => {
    const state = makeState({ planes: [makePlane({ status: 'idle' })] })
    const armed = setPlaneStatus(state, 'plane-1', 'personal')
    expect(armed.armedPersonalUsePlaneId).toBe('plane-1')

    const reArmed = setPlaneStatus(armed, 'plane-1', 'personal')
    expect(reArmed.armedPersonalUsePlaneId).toBe('plane-1')
  })

  it('T063: moving a plane AWAY from personal clears its own armed pointer, but not another plane\'s', () => {
    const state = makeState({
      planes: [makePlane({ id: 'plane-1', status: 'personal' }), makePlane({ id: 'plane-2', status: 'idle' })],
      armedPersonalUsePlaneId: 'plane-1',
    })
    const result = setPlaneStatus(state, 'plane-1', 'idle')
    expect(result.armedPersonalUsePlaneId).toBeNull()
  })

  it('rejects an unknown planeId', () => {
    const state = makeState({ planes: [makePlane()] })
    expect(setPlaneStatus(state, 'no-such-plane', 'idle')).toBe(state)
  })
})

// ---------------------------------------------------------------------------
// cancelMonthlyLease / terminateAnnualLease (T062)
// ---------------------------------------------------------------------------

describe('cancelMonthlyLease', () => {
  it('sets monthlyLeaseCancelEffectiveDay to day + notice-days', () => {
    const state = makeState({ day: 20, planes: [makePlane({ status: 'leasedMonthly' })] })
    const result = cancelMonthlyLease(state, 'plane-1')
    expect(result.planes?.[0]?.monthlyLeaseCancelEffectiveDay).toBe(20 + CONFIG.aviation.monthlyLeaseCancelNoticeDays)
  })

  it('rejects a plane not currently leasedMonthly', () => {
    const state = makeState({ planes: [makePlane({ status: 'idle' })] })
    expect(cancelMonthlyLease(state, 'plane-1')).toBe(state)
  })

  it('rejects a second cancellation call while one is already pending (does not restart the notice)', () => {
    const state = makeState({
      day: 20,
      planes: [makePlane({ status: 'leasedMonthly', monthlyLeaseCancelEffectiveDay: 23 })],
    })
    expect(cancelMonthlyLease(state, 'plane-1')).toBe(state)
  })
})

describe('terminateAnnualLease', () => {
  it('charges 50% of remaining-term revenue as a penalty and reverts the plane to idle', () => {
    const purchasePrice = CONFIG.aviation.classes.propFeeder.purchasePrice
    const state = makeState({
      day: 55, // 45 days into a 90-day term that started day 10 -> 45 remaining
      cash: 100_000,
      planes: [makePlane({ status: 'leasedAnnual', annualLeaseStartDay: 10, purchasePrice })],
    })

    const result = terminateAnnualLease(state, 'plane-1')

    const dailyRevenue = (purchasePrice * CONFIG.aviation.classes.propFeeder.annualLeaseRatePctOfPrice) / YEAR_LENGTH_DAYS
    const remainingDays = 10 + YEAR_LENGTH_DAYS - 55
    const expectedPenalty = remainingDays * dailyRevenue * CONFIG.aviation.annualLeaseEarlyTerminationPenaltyPct

    expect(result.cash).toBeCloseTo(100_000 - expectedPenalty, 6)
    expect(result.planes?.[0]?.status).toBe('idle')
    expect(result.planes?.[0]?.annualLeaseStartDay).toBeUndefined()
  })

  it('can drive cash negative (an intentional escape hatch, never rejected for insufficient cash)', () => {
    const state = makeState({
      day: 55,
      cash: 0,
      planes: [makePlane({ status: 'leasedAnnual', annualLeaseStartDay: 10 })],
    })
    const result = terminateAnnualLease(state, 'plane-1')
    expect(result.cash).toBeLessThan(0)
  })

  it('rejects a plane not currently on an Annual lease', () => {
    const state = makeState({ planes: [makePlane({ status: 'idle' })] })
    expect(terminateAnnualLease(state, 'plane-1')).toBe(state)
  })
})

// ---------------------------------------------------------------------------
// planeDailyIncome / accruePlaneIncome (T061/T062/T065)
// ---------------------------------------------------------------------------

describe('planeDailyIncome', () => {
  it('idle/personal earn $0', () => {
    expect(planeDailyIncome(makePlane({ status: 'idle' }), 1)).toBe(0)
    expect(planeDailyIncome(makePlane({ status: 'personal' }), 1)).toBe(0)
  })

  it('leasedMonthly earns purchasePrice * monthlyRate / leaseDaysPerMonth', () => {
    const plane = makePlane({ status: 'leasedMonthly' })
    const expected =
      (plane.purchasePrice * CONFIG.aviation.classes.propFeeder.monthlyLeaseRatePctOfPrice) / CONFIG.aviation.leaseDaysPerMonth
    expect(planeDailyIncome(plane, 5)).toBeCloseTo(expected, 6)
  })

  it('leasedAnnual earns purchasePrice * annualRate / YEAR_LENGTH_DAYS', () => {
    const plane = makePlane({ status: 'leasedAnnual', annualLeaseStartDay: 1 })
    const expected = (plane.purchasePrice * CONFIG.aviation.classes.propFeeder.annualLeaseRatePctOfPrice) / YEAR_LENGTH_DAYS
    expect(planeDailyIncome(plane, 5)).toBeCloseTo(expected, 6)
  })

  it('a grounded plane earns $0 regardless of status, until groundedUntilDay', () => {
    const plane = makePlane({ status: 'leasedMonthly', groundedUntilDay: 20 })
    expect(planeDailyIncome(plane, 15)).toBe(0)
    expect(planeDailyIncome(plane, 20)).toBeGreaterThan(0) // grounding over
  })
})

describe('accruePlaneIncome', () => {
  it('credits daily income across every owned plane per its status', () => {
    const state = makeState({
      cash: 0,
      planes: [makePlane({ id: 'a', status: 'leasedMonthly' }), makePlane({ id: 'b', status: 'idle' })],
    })
    const result = accruePlaneIncome(state)
    const expected = planeDailyIncome(state.planes?.[0] as Plane, state.day)
    expect(result.cash).toBeCloseTo(expected, 6)
  })

  it('auto-reverts a leasedMonthly plane to idle once its cancellation notice elapses, crediting income right up to that day', () => {
    const state = makeState({ day: 23, planes: [makePlane({ status: 'leasedMonthly', monthlyLeaseCancelEffectiveDay: 23 })] })
    const result = accruePlaneIncome(state)
    expect(result.planes?.[0]?.status).toBe('idle')
    expect(result.planes?.[0]?.monthlyLeaseCancelEffectiveDay).toBeUndefined()
    expect(result.cash).toBe(0) // no income credited THIS tick, the revert tick
  })

  it('auto-reverts a leasedAnnual plane to idle once the firm term naturally completes', () => {
    const state = makeState({ day: 100, planes: [makePlane({ status: 'leasedAnnual', annualLeaseStartDay: 10 })] })
    const result = accruePlaneIncome(state)
    expect(result.planes?.[0]?.status).toBe('idle')
    expect(result.planes?.[0]?.annualLeaseStartDay).toBeUndefined()
  })

  it('clears an expired grounding and resumes income the same day it lifts', () => {
    const state = makeState({ day: 20, planes: [makePlane({ status: 'leasedMonthly', groundedUntilDay: 20 })] })
    const result = accruePlaneIncome(state)
    expect(result.planes?.[0]?.groundedUntilDay).toBeUndefined()
  })

  it('is a no-op with no planes', () => {
    const state = makeState({ planes: [] })
    expect(accruePlaneIncome(state)).toBe(state)
  })
})

// ---------------------------------------------------------------------------
// Fuel price spike surcharge / maintenance (T064/T065)
// ---------------------------------------------------------------------------

function makeWarScare(overrides: Partial<Event> = {}): Event {
  return {
    id: 'evt-warscare-1',
    typeId: 'warScare',
    affectedGoodIds: ['steel', 'fuel'],
    scope: { kind: 'global' },
    multiplierMin: 1.4,
    multiplierMax: 1.8,
    durationDaysMin: 5,
    durationDaysMax: 8,
    hiddenTruth: true,
    scheduledFireDay: 10,
    createdOnDay: 7,
    resolved: true,
    fired: true,
    activeUntilDay: 17,
    ...overrides,
  }
}

describe('isFuelPriceSpikeActive', () => {
  it('true when a fired, currently-active event affects the fuel good', () => {
    const state = makeState({ day: 12, activeEvents: [makeWarScare()] })
    expect(isFuelPriceSpikeActive(state)).toBe(true)
  })

  it('false once the event\'s active window has ended', () => {
    const state = makeState({ day: 20, activeEvents: [makeWarScare({ activeUntilDay: 17 })] })
    expect(isFuelPriceSpikeActive(state)).toBe(false)
  })

  it('false for an event that does not affect fuel', () => {
    const state = makeState({ day: 12, activeEvents: [makeWarScare({ affectedGoodIds: ['steel'] })] })
    expect(isFuelPriceSpikeActive(state)).toBe(false)
  })
})

describe('planeDailyMaintenance / accruePlaneMaintenanceForDay', () => {
  it('bills 0.3%/month of purchase price per day, for every plane regardless of status/grounding', () => {
    const plane = makePlane({ status: 'idle', groundedUntilDay: 999 })
    const expected =
      (plane.purchasePrice * CONFIG.aviation.maintenanceMonthlyRatePctOfPrice) / CONFIG.aviation.leaseDaysPerMonth
    expect(planeDailyMaintenance(plane, false)).toBeCloseTo(expected, 6)
  })

  it('applies the +30% fuel-spike surcharge when active', () => {
    const plane = makePlane()
    const base = planeDailyMaintenance(plane, false)
    const surcharged = planeDailyMaintenance(plane, true)
    expect(surcharged).toBeCloseTo(base * (1 + CONFIG.aviation.events.fuelSpikeMaintenanceSurchargePct), 6)
  })

  it('accrues into planeMaintenanceOwedThisFiscalYear, additively across days', () => {
    let state = makeState({ planes: [makePlane()] })
    state = accruePlaneMaintenanceForDay(state)
    const oneDay = state.planeMaintenanceOwedThisFiscalYear as number
    state = accruePlaneMaintenanceForDay(state)
    expect(state.planeMaintenanceOwedThisFiscalYear).toBeCloseTo(oneDay * 2, 6)
  })

  it('is a no-op with no planes', () => {
    const state = makeState({ planes: [] })
    expect(accruePlaneMaintenanceForDay(state)).toBe(state)
  })
})

// ---------------------------------------------------------------------------
// applyAviationSafetyIncidents — grounding (T065)
// ---------------------------------------------------------------------------

describe('applyAviationSafetyIncidents', () => {
  function resolutionFor(event: Event): EventResolution {
    return { event, fired: true }
  }

  it('grounds one eligible (leased) plane on a fired incident, setting groundedUntilDay to activeUntilDay', () => {
    const state = makeState({ planes: [makePlane({ status: 'leasedMonthly' })] })
    const incident = makeIncidentEvent({ activeUntilDay: 17 })
    const result = applyAviationSafetyIncidents(state, [resolutionFor(incident)], makeFakeRng())
    expect(result.planes?.[0]?.groundedUntilDay).toBe(17)
  })

  it('never grounds an Idle or Personal plane (not eligible)', () => {
    const state = makeState({ planes: [makePlane({ status: 'idle' })] })
    const incident = makeIncidentEvent()
    const result = applyAviationSafetyIncidents(state, [resolutionFor(incident)], makeFakeRng())
    expect(result).toBe(state) // no eligible plane -> documented no-op
  })

  it('never re-grounds an already-grounded plane', () => {
    const state = makeState({ planes: [makePlane({ status: 'leasedMonthly', groundedUntilDay: 50 })] })
    const incident = makeIncidentEvent({ activeUntilDay: 17 })
    const result = applyAviationSafetyIncidents(state, [resolutionFor(incident)], makeFakeRng())
    expect(result).toBe(state) // no eligible (ungrounded) plane -> no-op
  })

  it('ignores unfired resolutions and non-incident event types', () => {
    const state = makeState({ planes: [makePlane({ status: 'leasedMonthly' })] })
    const notFired: EventResolution = { event: makeIncidentEvent(), fired: false }
    const wrongType: EventResolution = { event: makeWarScare(), fired: true }
    const result = applyAviationSafetyIncidents(state, [notFired, wrongType], makeFakeRng())
    expect(result).toBe(state)
  })

  it('is a no-op with no planes at all', () => {
    const state = makeState({ planes: [] })
    const incident = makeIncidentEvent()
    expect(applyAviationSafetyIncidents(state, [resolutionFor(incident)], makeFakeRng())).toBe(state)
  })
})

// ---------------------------------------------------------------------------
// Depreciation / resale (T064)
// ---------------------------------------------------------------------------

describe('planeDepreciatedValue', () => {
  it('starts at 90% of purchase price on day of purchase', () => {
    const plane = makePlane({ purchaseDay: 10, purchasePrice: 100_000 })
    expect(planeDepreciatedValue(plane, 10)).toBeCloseTo(100_000 * CONFIG.aviation.depreciation.startingValuePct, 6)
  })

  it('depreciates continuously (fractional years), not in yearly steps', () => {
    const plane = makePlane({ purchaseDay: 0, purchasePrice: 100_000 })
    const halfYear = planeDepreciatedValue(plane, YEAR_LENGTH_DAYS / 2)
    const fullYear = planeDepreciatedValue(plane, YEAR_LENGTH_DAYS)
    expect(halfYear).toBeGreaterThan(fullYear)
    expect(halfYear).toBeLessThan(100_000 * CONFIG.aviation.depreciation.startingValuePct)
  })

  it('floors at floorValuePct no matter how many years have elapsed', () => {
    const plane = makePlane({ purchaseDay: 0, purchasePrice: 100_000 })
    const farFuture = planeDepreciatedValue(plane, YEAR_LENGTH_DAYS * 1000)
    expect(farFuture).toBeCloseTo(100_000 * CONFIG.aviation.depreciation.floorValuePct, 6)
  })
})

describe('sellPlane', () => {
  it('pays depreciated value minus the liquidation fee, and removes the plane', () => {
    const state = makeState({ day: 10, cash: 0, planes: [makePlane({ purchaseDay: 10, purchasePrice: 100_000 })] })
    const result = sellPlane(state, 'plane-1')
    const expected = planeDepreciatedValue(state.planes?.[0] as Plane, 10) * (1 - CONFIG.aviation.liquidationFeePct)
    expect(result.cash).toBeCloseTo(expected, 6)
    expect(result.planes).toHaveLength(0)
  })

  it('clears armedPersonalUsePlaneId if it pointed at the now-sold plane', () => {
    const state = makeState({ planes: [makePlane()], armedPersonalUsePlaneId: 'plane-1' })
    const result = sellPlane(state, 'plane-1')
    expect(result.armedPersonalUsePlaneId).toBeNull()
  })

  it('does NOT also charge the annual-lease-termination penalty, even mid-term', () => {
    const state = makeState({
      day: 50,
      cash: 0,
      planes: [makePlane({ status: 'leasedAnnual', annualLeaseStartDay: 10, purchaseDay: 10 })],
    })
    const result = sellPlane(state, 'plane-1')
    expect(result.cash).toBeGreaterThan(0) // sale proceeds only, no penalty deduction
  })

  it('rejects an unknown planeId', () => {
    const state = makeState({ planes: [makePlane()] })
    expect(sellPlane(state, 'no-such-plane')).toBe(state)
  })
})
