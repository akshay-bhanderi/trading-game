import { describe, expect, it } from 'vitest'
import { CONFIG } from './config'
import { CITIES } from './data/cities'
import {
  accruePassiveHotelRevenue,
  buildOrUpgradeHotel,
  computeHotelLicenseFeeOwed,
  cumulativeInvested,
  getDailyRevenue,
  getNextTierIndex,
  getNextUpgradeCost,
  getOwnedTier,
  getTierName,
  isEpidemicActiveInCity,
  isHotelOwnedByPlayer,
  listOwnedHotels,
  sellHotel,
} from './hotel'
import type { City, Event, GameState } from './types'

/**
 * T068 — deferred unit tests for Phase 11 (Hotel Ownership, T053-T058),
 * written together per the project's Phase-10-13 testing policy (see
 * tasks/phase-13-final-balance-pass.md). Covers exactly the behaviors T068's
 * own acceptance criteria names: build/upgrade, revenue, epidemic-pause,
 * license, sell-back.
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
    unlockedCityIds: ['farrow', 'saltmere'],
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

const FARROW = CITIES.find((c) => c.id === 'farrow') as City

function makeEpidemic(overrides: Partial<Event> = {}): Event {
  return {
    id: 'evt-epidemic-1',
    typeId: 'epidemic',
    affectedGoodIds: [],
    scope: { kind: 'city', cityId: 'farrow' },
    multiplierMin: 0.85,
    multiplierMax: 0.85,
    durationDaysMin: 8,
    durationDaysMax: 8,
    hiddenTruth: true,
    scheduledFireDay: 10,
    createdOnDay: 7,
    resolved: true,
    fired: true,
    activeUntilDay: 18,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tier lookups
// ---------------------------------------------------------------------------

describe('tier lookups', () => {
  it('getOwnedTier / isHotelOwnedByPlayer: null/false when unowned, tier index when owned', () => {
    const state = makeState()
    expect(getOwnedTier(state, 'farrow')).toBeNull()
    expect(isHotelOwnedByPlayer(state, 'farrow')).toBe(false)

    const owned = makeState({ hotels: { farrow: { tier: 1 } } })
    expect(getOwnedTier(owned, 'farrow')).toBe(1)
    expect(isHotelOwnedByPlayer(owned, 'farrow')).toBe(true)
  })

  it('getNextTierIndex: 0 (Inn) when unowned, currentTier+1 when owned, null once at the top tier (Resort)', () => {
    expect(getNextTierIndex(makeState(), 'farrow')).toBe(0)
    expect(getNextTierIndex(makeState({ hotels: { farrow: { tier: 0 } } }), 'farrow')).toBe(1)
    expect(getNextTierIndex(makeState({ hotels: { farrow: { tier: CONFIG.hotel.tiers.length - 1 } } }), 'farrow')).toBeNull()
  })

  it('getTierName returns the display name at each index', () => {
    expect(getTierName(0)).toBe('Inn')
    expect(getTierName(3)).toBe('Resort')
  })

  it('getNextUpgradeCost: marginal cost x city.hotelPerNight, null at the top tier', () => {
    const cost = getNextUpgradeCost(makeState(), FARROW)
    expect(cost).toBe((CONFIG.hotel.tiers[0]?.buildOrUpgradeCostMultiplier as number) * FARROW.hotelPerNight)

    const atTop = getNextUpgradeCost(makeState({ hotels: { farrow: { tier: CONFIG.hotel.tiers.length - 1 } } }), FARROW)
    expect(atTop).toBeNull()
  })

  it('cumulativeInvested sums every marginal tier cost from 0 up to and including tierIndex', () => {
    const expected =
      ((CONFIG.hotel.tiers[0]?.buildOrUpgradeCostMultiplier as number) +
        (CONFIG.hotel.tiers[1]?.buildOrUpgradeCostMultiplier as number)) *
      FARROW.hotelPerNight
    expect(cumulativeInvested(FARROW, 1)).toBeCloseTo(expected, 6)
  })

  it('getDailyRevenue: this tier\'s OWN flat rate (not additive across tiers), null if unowned', () => {
    expect(getDailyRevenue(makeState(), FARROW)).toBeNull()
    const owned = makeState({ hotels: { farrow: { tier: 1 } } })
    expect(getDailyRevenue(owned, FARROW)).toBe((CONFIG.hotel.tiers[1]?.passiveRevenueMultiplier as number) * FARROW.hotelPerNight)
  })
})

// ---------------------------------------------------------------------------
// buildOrUpgradeHotel (T054)
// ---------------------------------------------------------------------------

describe('buildOrUpgradeHotel', () => {
  it('builds a fresh Inn (tier 0), deducting exactly the marginal cost', () => {
    const cost = (CONFIG.hotel.tiers[0]?.buildOrUpgradeCostMultiplier as number) * FARROW.hotelPerNight
    const state = makeState({ cash: cost + 500 })
    const result = buildOrUpgradeHotel(state, 'farrow')
    expect(result.cash).toBe(500)
    expect(result.hotels?.farrow).toEqual({ tier: 0 })
  })

  it('upgrades to the next tier, charging only the MARGINAL cost (not cumulative)', () => {
    const marginalCost = (CONFIG.hotel.tiers[1]?.buildOrUpgradeCostMultiplier as number) * FARROW.hotelPerNight
    const state = makeState({ cash: marginalCost, hotels: { farrow: { tier: 0 } } })
    const result = buildOrUpgradeHotel(state, 'farrow')
    expect(result.cash).toBe(0)
    expect(result.hotels?.farrow).toEqual({ tier: 1 })
  })

  it('rejects when not physically present in cityId', () => {
    const state = makeState({ currentCity: 'saltmere', cash: 10_000_000 })
    expect(buildOrUpgradeHotel(state, 'farrow')).toBe(state)
  })

  it('rejects insufficient cash', () => {
    const cost = (CONFIG.hotel.tiers[0]?.buildOrUpgradeCostMultiplier as number) * FARROW.hotelPerNight
    const state = makeState({ cash: cost - 1 })
    expect(buildOrUpgradeHotel(state, 'farrow')).toBe(state)
  })

  it('rejects once already at the top tier (Resort)', () => {
    const state = makeState({ cash: 100_000_000, hotels: { farrow: { tier: CONFIG.hotel.tiers.length - 1 } } })
    expect(buildOrUpgradeHotel(state, 'farrow')).toBe(state)
  })
})

// ---------------------------------------------------------------------------
// accruePassiveHotelRevenue (T055/T056)
// ---------------------------------------------------------------------------

describe('accruePassiveHotelRevenue', () => {
  it('credits every owned hotel\'s daily revenue, regardless of currentCity/travel state', () => {
    const state = makeState({
      currentCity: 'saltmere', // not farrow — revenue still accrues (§15)
      cash: 0,
      hotels: { farrow: { tier: 0 } },
    })
    const result = accruePassiveHotelRevenue(state)
    const expected = (CONFIG.hotel.tiers[0]?.passiveRevenueMultiplier as number) * FARROW.hotelPerNight
    expect(result.cash).toBeCloseTo(expected, 6)
  })

  it('sums revenue across multiple owned hotels', () => {
    const saltmere = CITIES.find((c) => c.id === 'saltmere') as City
    const state = makeState({ hotels: { farrow: { tier: 0 }, saltmere: { tier: 1 } } })
    const result = accruePassiveHotelRevenue(state)
    const expected =
      (CONFIG.hotel.tiers[0]?.passiveRevenueMultiplier as number) * FARROW.hotelPerNight +
      (CONFIG.hotel.tiers[1]?.passiveRevenueMultiplier as number) * saltmere.hotelPerNight
    expect(result.cash).toBeCloseTo(expected, 6)
  })

  it('T056: pauses revenue for a city with an active fired epidemic covering the current day', () => {
    const state = makeState({
      day: 12,
      hotels: { farrow: { tier: 0 } },
      activeEvents: [makeEpidemic({ scheduledFireDay: 10, activeUntilDay: 18 })],
    })
    const result = accruePassiveHotelRevenue(state)
    expect(result).toBe(state) // zero revenue this tick -> no-op contract
  })

  it('T056: resumes revenue once the epidemic window ends', () => {
    const state = makeState({
      day: 20, // past activeUntilDay: 18
      hotels: { farrow: { tier: 0 } },
      activeEvents: [makeEpidemic({ scheduledFireDay: 10, activeUntilDay: 18 })],
    })
    const result = accruePassiveHotelRevenue(state)
    expect(result.cash).toBeGreaterThan(0)
  })

  it('is a no-op with no owned hotels', () => {
    const state = makeState()
    expect(accruePassiveHotelRevenue(state)).toBe(state)
  })
})

describe('isEpidemicActiveInCity', () => {
  it('matches only a FIRED epidemic scoped to that exact city, within its active window', () => {
    const epidemic = makeEpidemic({ scheduledFireDay: 10, activeUntilDay: 18 })
    expect(isEpidemicActiveInCity('farrow', 12, [epidemic])).toBe(true)
    expect(isEpidemicActiveInCity('farrow', 9, [epidemic])).toBe(false) // before it fires
    expect(isEpidemicActiveInCity('farrow', 18, [epidemic])).toBe(false) // window end is exclusive
    expect(isEpidemicActiveInCity('saltmere', 12, [epidemic])).toBe(false) // different city
  })

  it('ignores an unfired (still-scheduled) epidemic', () => {
    const epidemic = makeEpidemic({ fired: false })
    expect(isEpidemicActiveInCity('farrow', 12, [epidemic])).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// computeHotelLicenseFeeOwed (T057)
// ---------------------------------------------------------------------------

describe('computeHotelLicenseFeeOwed', () => {
  it('sums the annual license fee for every owned hotel at its OWN tier', () => {
    const saltmere = CITIES.find((c) => c.id === 'saltmere') as City
    const state = makeState({ hotels: { farrow: { tier: 0 }, saltmere: { tier: 2 } } })
    const expected =
      (CONFIG.hotel.tiers[0]?.annualLicenseFeeMultiplier as number) * FARROW.hotelPerNight +
      (CONFIG.hotel.tiers[2]?.annualLicenseFeeMultiplier as number) * saltmere.hotelPerNight
    expect(computeHotelLicenseFeeOwed(state)).toBeCloseTo(expected, 6)
  })

  it('is 0 with no hotels owned', () => {
    expect(computeHotelLicenseFeeOwed(makeState())).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// sellHotel (T057)
// ---------------------------------------------------------------------------

describe('sellHotel', () => {
  it('pays 50% of cumulative invested and removes the city\'s hotel entry entirely', () => {
    const state = makeState({ cash: 0, hotels: { farrow: { tier: 1 } } })
    const result = sellHotel(state, 'farrow')
    const expectedPayout = cumulativeInvested(FARROW, 1) * CONFIG.hotel.sellBackFraction
    expect(result.cash).toBeCloseTo(expectedPayout, 6)
    expect(result.hotels?.farrow).toBeUndefined()
  })

  it('rejects when not physically present in cityId', () => {
    const state = makeState({ currentCity: 'saltmere', hotels: { farrow: { tier: 0 } } })
    expect(sellHotel(state, 'farrow')).toBe(state)
  })

  it('rejects a city with no hotel owned', () => {
    const state = makeState()
    expect(sellHotel(state, 'farrow')).toBe(state)
  })

  it('a rebuild after selling starts fresh at tier 0 (Inn), not a "tier -1" sentinel', () => {
    const state = makeState({ cash: 1_000_000, hotels: { farrow: { tier: 3 } } })
    const sold = sellHotel(state, 'farrow')
    const rebuilt = buildOrUpgradeHotel(sold, 'farrow')
    expect(rebuilt.hotels?.farrow).toEqual({ tier: 0 })
  })
})

describe('listOwnedHotels', () => {
  it('resolves every owned hotel against CITIES, skipping unresolvable ids defensively', () => {
    const state = makeState({ hotels: { farrow: { tier: 0 }, saltmere: { tier: 2 } } })
    const list = listOwnedHotels(state)
    expect(list).toHaveLength(2)
    expect(list.map((h) => h.city.id).sort()).toEqual(['farrow', 'saltmere'])
  })

  it('is empty with no hotels owned', () => {
    expect(listOwnedHotels(makeState())).toEqual([])
  })
})
