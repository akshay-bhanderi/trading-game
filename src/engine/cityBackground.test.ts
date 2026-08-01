import { describe, expect, it } from 'vitest'
import { createCityNightRng, nightProbabilityForTravelDays, rollIsNight } from './cityBackground'

describe('nightProbabilityForTravelDays', () => {
  it('maps 1/2/3-day trips to 25%/50%/75%', () => {
    expect(nightProbabilityForTravelDays(1)).toBeCloseTo(0.25)
    expect(nightProbabilityForTravelDays(2)).toBeCloseTo(0.5)
    expect(nightProbabilityForTravelDays(3)).toBeCloseTo(0.75)
  })

  it('clamps defensively for out-of-range trip lengths instead of throwing', () => {
    expect(nightProbabilityForTravelDays(0)).toBeCloseTo(0.25)
    expect(nightProbabilityForTravelDays(-5)).toBeCloseTo(0.25)
    expect(nightProbabilityForTravelDays(10)).toBeCloseTo(0.75)
  })
})

describe('createCityNightRng / rollIsNight', () => {
  it('same (seed, key) always produces the identical roll', () => {
    const a = rollIsNight(createCityNightRng(42, 'day:5'), 0.5)
    const b = rollIsNight(createCityNightRng(42, 'day:5'), 0.5)
    expect(a).toBe(b)
  })

  it('different keys under the same seed draw from independent streams', () => {
    const seed = 42
    const results = Array.from({ length: 50 }, (_, i) => rollIsNight(createCityNightRng(seed, `day:${i}`), 0.5))
    // A broken derivation (e.g. ignoring `key`) would produce either all-true
    // or all-false — a real per-key stream should show both outcomes.
    expect(results.some((v) => v === true)).toBe(true)
    expect(results.some((v) => v === false)).toBe(true)
  })

  it('roughly honors the requested probability over many independent keys', () => {
    const seed = 1
    const n = 4000
    const nightCount = Array.from({ length: n }, (_, i) => rollIsNight(createCityNightRng(seed, `k:${i}`), 0.25)).filter(
      Boolean,
    ).length
    const rate = nightCount / n
    expect(rate).toBeGreaterThan(0.2)
    expect(rate).toBeLessThan(0.3)
  })

  it('probability 0 never rolls night; probability 1 always does', () => {
    for (let i = 0; i < 100; i++) {
      expect(rollIsNight(createCityNightRng(7, `zero:${i}`), 0)).toBe(false)
      expect(rollIsNight(createCityNightRng(7, `one:${i}`), 1)).toBe(true)
    }
  })
})
