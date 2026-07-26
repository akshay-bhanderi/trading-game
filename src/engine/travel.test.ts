import { describe, expect, it } from 'vitest'
import { calcFare, getTravelDays } from './travel'
import { CITIES } from './data/cities'
import { TRAVEL } from './config'

describe('getTravelDays', () => {
  it('returns 1 day for a same-tier trip (Farrow -> Saltmere, both Tier 1)', () => {
    expect(getTravelDays('farrow', 'saltmere')).toBe(1)
  })

  it('returns 2 days for a cross-tier trip (Farrow Tier 1 -> Port Vela Tier 2)', () => {
    expect(getTravelDays('farrow', 'port-vela')).toBe(2)
  })

  it('returns 0 for the same city (never actually traveled, but well-defined)', () => {
    expect(getTravelDays('farrow', 'farrow')).toBe(0)
  })

  it('covers all 8x8 city pairs and matches the same-tier/adjacent-tier rule', () => {
    expect(CITIES).toHaveLength(8)
    for (const from of CITIES) {
      for (const to of CITIES) {
        const days = getTravelDays(from.id, to.id)
        if (from.id === to.id) {
          expect(days).toBe(0)
        } else if (from.tier === to.tier) {
          expect(days).toBe(1)
        } else {
          expect(days).toBe(2)
        }
      }
    }
  })

  it('throws for an unknown city id', () => {
    expect(() => getTravelDays('farrow', 'nonexistent-city')).toThrow()
  })
})

describe('calcFare', () => {
  it('matches the raw formula by hand-calculation at cargoUsedPct=0 (no doubling)', () => {
    // fare = fareBaseRatePerDay(10) * days(2) * (1 + destinationTier(2) * fareTierMultiplier(0.5))
    //      = 10 * 2 * (1 + 1) = 40
    const days = 2
    const destinationTier = 2
    const expected =
      TRAVEL.fareBaseRatePerDay * days * (1 + destinationTier * TRAVEL.fareTierMultiplier)
    expect(expected).toBe(40)
    expect(calcFare(days, destinationTier, 0)).toBe(expected)
  })

  it('matches the raw formula for a Tier 1 destination at cargoUsedPct=0', () => {
    // fare = 10 * 1 * (1 + 1 * 0.5) = 15
    const expected = TRAVEL.fareBaseRatePerDay * 1 * (1 + 1 * TRAVEL.fareTierMultiplier)
    expect(expected).toBe(15)
    expect(calcFare(1, 1, 0)).toBe(expected)
  })

  it('exactly doubles the fare when cargoUsedPct crosses the 0.6 threshold', () => {
    const days = 2
    const destinationTier = 2
    const baseFare =
      TRAVEL.fareBaseRatePerDay * days * (1 + destinationTier * TRAVEL.fareTierMultiplier)

    const underThreshold = calcFare(days, destinationTier, TRAVEL.cargoDoublingThresholdPct)
    const atThreshold = calcFare(days, destinationTier, TRAVEL.cargoDoublingThresholdPct - 0.01)
    const overThreshold = calcFare(days, destinationTier, TRAVEL.cargoDoublingThresholdPct + 0.01)

    // Exactly at the threshold (0.6) is NOT ">" it, so no doubling yet.
    expect(underThreshold).toBe(baseFare)
    expect(atThreshold).toBe(baseFare)
    expect(overThreshold).toBe(baseFare * TRAVEL.cargoDoublingFactor)
    expect(overThreshold).toBe(underThreshold * TRAVEL.cargoDoublingFactor)
  })

  it('applies doubling for a fully-loaded (100%) cargo trip', () => {
    const days = 3
    const destinationTier = 1
    const baseFare =
      TRAVEL.fareBaseRatePerDay * days * (1 + destinationTier * TRAVEL.fareTierMultiplier)
    expect(calcFare(days, destinationTier, 1)).toBe(baseFare * TRAVEL.cargoDoublingFactor)
  })
})
