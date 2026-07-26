import { describe, expect, it } from 'vitest'
import { CONFIG } from './config'
import { CITIES } from './data/cities'
import { GOODS } from './data/goods'
import {
  applyMeanReversion,
  computePrice,
  computeTrendMultiplier,
  deriveCityGoodRole,
  resolveCityModifier,
  type PriceEventEffect,
} from './priceEngine'
import { createRng, type Rng } from './rng'
import type { City, Good, PriceState } from './types'

const { hardFloorMultiplier, hardCeilingMultiplier, meanReversion } = CONFIG.priceEngine

// Convenience lookups from the real v1 data (fixtures the design doc itself
// describes): Farrow produces Grain (producer), wants Iron (consumer), and
// is neutral toward, say, Textiles.
const farrow = CITIES.find((c) => c.id === 'farrow') as City
const copperfell = CITIES.find((c) => c.id === 'copperfell') as City
const silkden = CITIES.find((c) => c.id === 'silkden') as City
const grain = GOODS.find((g) => g.id === 'grain') as Good
const iron = GOODS.find((g) => g.id === 'iron') as Good
const silk = GOODS.find((g) => g.id === 'silk') as Good
const textiles = GOODS.find((g) => g.id === 'textiles') as Good

/** A fake Rng whose `next()` always returns the given constant. Used to
 * neutralize dailyNoise (0.5 -> noiseMultiplier === 1) in integration-style
 * tests that want to isolate a different part of the pipeline. */
function constantRng(value: number): Rng {
  return {
    next: () => value,
    int: (min) => min,
    pick: (arr) => arr[0] as never,
  }
}

describe('deriveCityGoodRole', () => {
  it('classifies a producer relationship from City.produces', () => {
    expect(deriveCityGoodRole(farrow, grain)).toBe('producer')
  })

  it('classifies a consumer relationship from City.wants', () => {
    expect(deriveCityGoodRole(farrow, iron)).toBe('consumer')
  })

  it('classifies neutral when the good is in neither list', () => {
    expect(deriveCityGoodRole(farrow, textiles)).toBe('neutral')
  })
})

describe('resolveCityModifier', () => {
  it('picks a modifier within the configured range for the resolved role', () => {
    const { role, modifier } = resolveCityModifier(42, farrow, grain)
    expect(role).toBe('producer')
    const range = CONFIG.priceEngine.cityModifierRanges.producer
    expect(modifier).toBeGreaterThanOrEqual(range.min)
    expect(modifier).toBeLessThanOrEqual(range.max)
  })

  it('is stable for the same (seed, city, good) regardless of how many other calls happened first', () => {
    const a = resolveCityModifier(7, silkden, silk)
    // Burn through a bunch of unrelated resolutions in between.
    resolveCityModifier(7, farrow, grain)
    resolveCityModifier(7, copperfell, iron)
    const b = resolveCityModifier(7, silkden, silk)
    expect(b).toEqual(a)
  })

  it('produces different modifiers for different seeds (not a hardcoded constant)', () => {
    const a = resolveCityModifier(1, farrow, grain)
    const b = resolveCityModifier(2, farrow, grain)
    expect(a.modifier).not.toBe(b.modifier)
  })
})

describe('computeTrendMultiplier', () => {
  it('is 1 at trend position 0 (sin(0) = 0)', () => {
    expect(computeTrendMultiplier(0, 30, 0.15)).toBe(1)
  })

  it('stays within [1 - amplitude, 1 + amplitude]', () => {
    const period = 30
    const amplitude = 0.15
    for (let pos = 0; pos < period * 3; pos++) {
      const m = computeTrendMultiplier(pos, period, amplitude)
      expect(m).toBeGreaterThanOrEqual(1 - amplitude - 1e-9)
      expect(m).toBeLessThanOrEqual(1 + amplitude + 1e-9)
    }
  })
})

// ---------------------------------------------------------------------------
// REQUIRED (a): mean reversion pulls a price >2.2x base*cityMod back by
// ~10%/day. Tested on the isolated pure `applyMeanReversion` step so the
// assertion is exact and never flaky (no noise/trend/floor/ceiling in play).
// ---------------------------------------------------------------------------
describe('applyMeanReversion — required test (a): pulls an overpriced market back', () => {
  it('pulls previousPrice > 2.2x base*cityMod toward base by ~10%/day', () => {
    const base = 100 // basePriceWithCityModifier
    const previousPrice = 3.5 * base // well above the 2.2x trigger
    const rawPrice = base // today's "no memory" price sits near base

    const result = applyMeanReversion(previousPrice, rawPrice, base)

    const gapToBase = previousPrice - base
    const actualPull = previousPrice - result
    const pullFraction = actualPull / gapToBase

    // Exact formula: result = previousPrice + pullRate*(rawPrice - previousPrice)
    expect(result).toBeCloseTo(previousPrice + meanReversion.pullRatePerDay * (rawPrice - previousPrice), 9)
    // Moved DOWN, toward base.
    expect(result).toBeLessThan(previousPrice)
    expect(result).toBeGreaterThan(base)
    // ~10%/day pull (exact here since rawPrice === base).
    expect(pullFraction).toBeCloseTo(meanReversion.pullRatePerDay, 9)
  })

  it('still pulls by ~10%/day even with today\'s trend/noise perturbing rawPrice slightly off base', () => {
    const base = 200
    const previousPrice = 3.0 * base // > 2.2x trigger
    const gapToBase = previousPrice - base

    // rawPrice perturbed +-15% around base (bounds of trend amplitude) to
    // simulate a realistic "no memory" price on a given day.
    for (const rawPrice of [base * 0.85, base * 1.0, base * 1.15]) {
      const result = applyMeanReversion(previousPrice, rawPrice, base)
      const pullFraction = (previousPrice - result) / gapToBase
      // Roughly 10%/day: allow a band around the target rate since rawPrice
      // isn't pinned exactly to base.
      expect(pullFraction).toBeGreaterThan(0.08)
      expect(pullFraction).toBeLessThan(0.12)
    }
  })
})

// ---------------------------------------------------------------------------
// REQUIRED (b): same for <0.45x — price pulled UP by ~10%/day.
// ---------------------------------------------------------------------------
describe('applyMeanReversion — required test (b): pulls an underpriced market back up', () => {
  it('pulls previousPrice < 0.45x base*cityMod toward base by ~10%/day', () => {
    const base = 100
    const previousPrice = 0.15 * base // well below the 0.45x trigger
    const rawPrice = base

    const result = applyMeanReversion(previousPrice, rawPrice, base)

    const gapToBase = base - previousPrice
    const actualPull = result - previousPrice
    const pullFraction = actualPull / gapToBase

    expect(result).toBeCloseTo(previousPrice + meanReversion.pullRatePerDay * (rawPrice - previousPrice), 9)
    // Moved UP, toward base.
    expect(result).toBeGreaterThan(previousPrice)
    expect(result).toBeLessThan(base)
    expect(pullFraction).toBeCloseTo(meanReversion.pullRatePerDay, 9)
  })

  it('still pulls up by ~10%/day even with trend/noise perturbing rawPrice slightly off base', () => {
    const base = 50
    const previousPrice = 0.2 * base // < 0.45x trigger
    const gapToBase = base - previousPrice

    for (const rawPrice of [base * 0.85, base * 1.0, base * 1.15]) {
      const result = applyMeanReversion(previousPrice, rawPrice, base)
      const pullFraction = (result - previousPrice) / gapToBase
      expect(pullFraction).toBeGreaterThan(0.08)
      expect(pullFraction).toBeLessThan(0.12)
    }
  })
})

describe('applyMeanReversion — no-op inside the trigger band', () => {
  it('passes rawPrice through unchanged when previousPrice is within [0.45x, 2.2x]', () => {
    const base = 100
    for (const previousPrice of [base * 0.45, base * 1.0, base * 2.2, base * 1.8]) {
      const rawPrice = base * 1.05
      expect(applyMeanReversion(previousPrice, rawPrice, base)).toBe(rawPrice)
    }
  })
})

// ---------------------------------------------------------------------------
// Integration check: the full computePrice pipeline actually wires
// applyMeanReversion in using the PREVIOUS day's settled price, with noise
// neutralized via a constant fake Rng so the pull is visible cleanly against
// preClampPrice (before floor/ceiling, which would otherwise clip it).
// ---------------------------------------------------------------------------
describe('computePrice — mean reversion wired end-to-end', () => {
  it('pulls an inherited overpriced state back down via preClampPrice', () => {
    const seed = 4242
    const day = 10
    const noiseNeutralRng = constantRng(0.5) // noiseMultiplier === 1

    // Resolve this pair's real basePriceWithCityModifier first so we can
    // fabricate a previous state that is unambiguously > 2.2x it.
    const first = computePrice(farrow, grain, 1, seed, noiseNeutralRng, undefined)
    const base = first.basePriceWithCityModifier

    const inheritedState: PriceState = {
      cityId: farrow.id,
      goodId: grain.id,
      currentPrice: base * 3.5,
      lastSeenPrice: base * 3.5,
      lastSeenDay: day - 1,
      trendPosition: 0, // sin(2pi*1/period) is small regardless; noise is neutralized anyway
    }

    const result = computePrice(farrow, grain, day, seed, noiseNeutralRng, inheritedState)

    expect(result.preClampPrice).toBeLessThan(inheritedState.currentPrice)
    expect(result.preClampPrice).toBeGreaterThan(base) // pulled toward, not past, base
    const pullFraction = (inheritedState.currentPrice - result.preClampPrice) / (inheritedState.currentPrice - base)
    expect(pullFraction).toBeGreaterThan(0.08)
    expect(pullFraction).toBeLessThan(0.12)
  })

  it('does not trigger reversion when there is no previous state (first-ever computation)', () => {
    const seed = 99
    const result = computePrice(farrow, grain, 1, seed, constantRng(0.5), undefined)
    // With no memory, previousPrice defaults to rawPrice itself, so
    // preClampPrice === rawPrice exactly (reversion is a strict no-op).
    const base = result.basePriceWithCityModifier
    // rawPrice should be very close to base given neutral noise; confirm no
    // reversion distortion occurred by checking preClampPrice sits within
    // the trend amplitude band around base.
    expect(result.preClampPrice).toBeGreaterThanOrEqual(base * (1 - CONFIG.priceEngine.trendAmplitudePct) - 1e-6)
    expect(result.preClampPrice).toBeLessThanOrEqual(base * (1 + CONFIG.priceEngine.trendAmplitudePct) + 1e-6)
  })
})

// ---------------------------------------------------------------------------
// REQUIRED (c): floor/ceiling are NEVER violated — randomized stress test
// across many days and many seeds, for every city/good combination.
// ---------------------------------------------------------------------------
describe('computePrice — required test (c): hard floor/ceiling never violated', () => {
  it('keeps every computed price within [0.3x, 4x] of base*cityModifier across 12 seeds x 500 days x every city/good pair', () => {
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
    const days = 500
    let checkedCount = 0
    // Accumulate any violation instead of calling `expect` per iteration —
    // with 12 seeds x 8 cities x 9 goods x 500 days (~432k computations),
    // per-iteration matcher calls dominate the runtime far more than the
    // actual price computation does. A single assertion at the end keeps
    // the exact same coverage (every one of those ~432k prices is still
    // checked) while running in a small fraction of the time, and still
    // reports the first offending case if the invariant is ever broken.
    const violations: string[] = []

    for (const seed of seeds) {
      // A harness-only rng used purely to decide today's (fake) event
      // multiplier for this stress test — NOT the price engine's own noise
      // stream, which gets its own dedicated Rng per city/good pair below.
      const eventHarnessRng = createRng(seed * 7919 + 1)

      for (const city of CITIES) {
        for (const good of GOODS) {
          const rng = createRng(seed)
          let previousState: PriceState | undefined = undefined

          for (let day = 1; day <= days; day++) {
            // Occasionally throw an extreme, adversarial event multiplier
            // at the pipeline to make sure the hard clamp holds even under
            // pressure well beyond normal trend/noise ranges.
            let activeEvents: PriceEventEffect[] | undefined
            if (eventHarnessRng.next() < 0.3) {
              const extreme = eventHarnessRng.next() < 0.5
              const multiplier = extreme
                ? eventHarnessRng.next() * 19 + 1 // up to ~20x
                : eventHarnessRng.next() * 0.9 + 0.05 // down to ~0.05x
              activeEvents = [{ multiplier }]
            }

            const result = computePrice(city, good, day, seed, rng, previousState, activeEvents)
            checkedCount++

            const expectedFloor = result.basePriceWithCityModifier * hardFloorMultiplier
            const expectedCeiling = result.basePriceWithCityModifier * hardCeilingMultiplier
            const EPS = 1e-6
            if (
              result.price < result.floor - EPS ||
              result.price > result.ceiling + EPS ||
              Math.abs(result.floor - expectedFloor) > EPS ||
              Math.abs(result.ceiling - expectedCeiling) > EPS
            ) {
              violations.push(
                `seed=${seed} city=${city.id} good=${good.id} day=${day} price=${result.price} floor=${result.floor} ceiling=${result.ceiling}`,
              )
            }

            previousState = result.nextState
          }
        }
      }
    }

    // Sanity: we actually exercised the full breadth described (12 seeds x
    // 500 days x every city/good pair).
    expect(checkedCount).toBe(seeds.length * days * CITIES.length * GOODS.length)
    expect(violations).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// REQUIRED (d): same seed reproduces an identical price sequence.
// ---------------------------------------------------------------------------
describe('computePrice — required test (d): deterministic reproduction from the same seed', () => {
  it('produces an identical full sequence of prices/states when replayed with the same seed', () => {
    const seed = 20260726
    const days = 200
    const pairs: Array<[City, Good]> = [
      [farrow, grain],
      [farrow, iron],
      [copperfell, iron],
      [silkden, silk],
    ]

    function runSequence(): ComputedSequenceEntry[] {
      const out: ComputedSequenceEntry[] = []
      for (const [city, good] of pairs) {
        const rng = createRng(seed)
        let previousState: PriceState | undefined = undefined
        for (let day = 1; day <= days; day++) {
          const result = computePrice(city, good, day, seed, rng, previousState)
          out.push({
            cityId: city.id,
            goodId: good.id,
            day,
            price: result.price,
            preClampPrice: result.preClampPrice,
            nextState: result.nextState,
          })
          previousState = result.nextState
        }
      }
      return out
    }

    interface ComputedSequenceEntry {
      cityId: string
      goodId: string
      day: number
      price: number
      preClampPrice: number
      nextState: PriceState
    }

    const runA = runSequence()
    const runB = runSequence()

    expect(runA).toEqual(runB)
    // Not a vacuous check: make sure we actually produced a non-trivial
    // sequence and that prices vary day to day (i.e. this isn't accidentally
    // testing a constant/degenerate output).
    expect(runA.length).toBe(pairs.length * days)
    const distinctPrices = new Set(runA.map((e) => e.price))
    expect(distinctPrices.size).toBeGreaterThan(10)
  })

  it('different seeds produce a different price sequence for the same city/good/day run', () => {
    const days = 60

    function runWithSeed(seed: number): number[] {
      const rng = createRng(seed)
      let previousState: PriceState | undefined = undefined
      const prices: number[] = []
      for (let day = 1; day <= days; day++) {
        const result = computePrice(farrow, grain, day, seed, rng, previousState)
        prices.push(result.price)
        previousState = result.nextState
      }
      return prices
    }

    const seqA = runWithSeed(111)
    const seqB = runWithSeed(222)
    expect(seqA).not.toEqual(seqB)
  })
})
