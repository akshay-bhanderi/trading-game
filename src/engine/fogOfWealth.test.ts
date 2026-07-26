import { describe, expect, it } from 'vitest'
import { CONFIG } from './config'
import { describeRumorSubject } from './fogOfWealth'
import { createRng } from './rng'

/**
 * T019 — Fog of wealth. Per TASK.md's explicit requirement: take the SAME
 * underlying rumor (same city id, same good ids) and call
 * `describeRumorSubject` with a mocked net worth from each of the three
 * bands in turn, asserting the text becomes progressively vaguer.
 */
describe('describeRumorSubject — progressive vagueness across net-worth bands', () => {
  const cityId = 'farrow'
  const cityName = 'Farrow'
  const goodIds = ['grain']
  const goodName = 'Grain'

  it('low net worth ($10k, band 1): names the EXACT city AND exact good', () => {
    const text = describeRumorSubject({ cityId, goodIds, netWorth: 10_000 })
    expect(text).toContain(cityName)
    expect(text.toLowerCase()).toContain(goodName.toLowerCase())
  })

  it('mid net worth ($200k, band 2): names the good but NOT the exact city', () => {
    const text = describeRumorSubject({ cityId, goodIds, netWorth: 200_000 })
    expect(text.toLowerCase()).toContain(goodName.toLowerCase())
    expect(text).not.toContain(cityName)
  })

  it('high net worth ($1M, band 3): names NEITHER the exact good NOR the exact city', () => {
    const text = describeRumorSubject({ cityId, goodIds, netWorth: 1_000_000 })
    expect(text.toLowerCase()).not.toContain(goodName.toLowerCase())
    expect(text).not.toContain(cityName)
  })

  it('the three bands, for the identical rumor, produce strictly different text', () => {
    const low = describeRumorSubject({ cityId, goodIds, netWorth: 10_000 })
    const mid = describeRumorSubject({ cityId, goodIds, netWorth: 200_000 })
    const high = describeRumorSubject({ cityId, goodIds, netWorth: 1_000_000 })
    expect(low).not.toBe(mid)
    expect(mid).not.toBe(high)
    expect(low).not.toBe(high)
  })
})

describe('describeRumorSubject — exact boundary values', () => {
  const cityId = 'copperfell'
  const cityName = 'Copperfell'
  const goodIds = ['iron']
  const goodName = 'Iron'

  it('netWorth exactly at exactDetailBelowNetWorth ($50,000): band 1 is "< 50k", so $50k itself is ALREADY band 2 (good name present, city name absent)', () => {
    const text = describeRumorSubject({
      cityId,
      goodIds,
      netWorth: CONFIG.events.fogOfWealth.exactDetailBelowNetWorth,
    })
    expect(text.toLowerCase()).toContain(goodName.toLowerCase())
    expect(text).not.toContain(cityName)
  })

  it('netWorth just below exactDetailBelowNetWorth ($49,999): still band 1 (exact city + good)', () => {
    const text = describeRumorSubject({
      cityId,
      goodIds,
      netWorth: CONFIG.events.fogOfWealth.exactDetailBelowNetWorth - 1,
    })
    expect(text).toContain(cityName)
    expect(text.toLowerCase()).toContain(goodName.toLowerCase())
  })

  it('netWorth exactly at regionOnlyBelowNetWorth ($500,000): band 3 is "> 500k", so $500k itself is STILL band 2 (good name present, no exact city)', () => {
    const text = describeRumorSubject({
      cityId,
      goodIds,
      netWorth: CONFIG.events.fogOfWealth.regionOnlyBelowNetWorth,
    })
    expect(text.toLowerCase()).toContain(goodName.toLowerCase())
    expect(text).not.toContain(cityName)
  })

  it('netWorth just above regionOnlyBelowNetWorth ($500,001): band 3 (directional only — no good, no city)', () => {
    const text = describeRumorSubject({
      cityId,
      goodIds,
      netWorth: CONFIG.events.fogOfWealth.regionOnlyBelowNetWorth + 1,
    })
    expect(text.toLowerCase()).not.toContain(goodName.toLowerCase())
    expect(text).not.toContain(cityName)
  })
})

describe('describeRumorSubject — misc behavior', () => {
  it('is pure / deterministic without an rng: same inputs, same output, repeatedly', () => {
    const params = { cityId: 'silkden', goodIds: ['silk'], netWorth: 900_000 }
    const a = describeRumorSubject(params)
    const b = describeRumorSubject(params)
    expect(a).toBe(b)
  })

  it('band 3 direction phrase varies when an rng is supplied (not hardcoded to one phrase)', () => {
    const seen = new Set<string>()
    for (let seed = 0; seed < 50; seed++) {
      const text = describeRumorSubject({
        cityId: 'ironvale',
        goodIds: ['steel'],
        netWorth: 1_000_000,
        rng: createRng(seed),
      })
      seen.add(text)
    }
    expect(seen.size).toBeGreaterThan(1)
  })

  it('handles a missing cityId gracefully at every band (no city to reveal in the first place)', () => {
    const low = describeRumorSubject({ goodIds: ['fuel'], netWorth: 0 })
    const mid = describeRumorSubject({ goodIds: ['fuel'], netWorth: 100_000 })
    const high = describeRumorSubject({ goodIds: ['fuel'], netWorth: 900_000 })
    expect(low.toLowerCase()).toContain('fuel')
    expect(mid.toLowerCase()).toContain('fuel')
    expect(high.toLowerCase()).not.toContain('fuel')
  })

  it('band 3 groups multiple goods into their sector labels, still with no good name', () => {
    const text = describeRumorSubject({ goodIds: ['iron', 'steel'], netWorth: 900_000 })
    expect(text).toContain('industrial metals')
    expect(text.toLowerCase()).not.toContain('iron')
  })

  it('an unknown city id falls back to the default region phrase at band 2 rather than throwing', () => {
    expect(() =>
      describeRumorSubject({ cityId: 'nonexistent-city', goodIds: ['grain'], netWorth: 100_000 }),
    ).not.toThrow()
  })
})
