import { describe, expect, it } from 'vitest'
import { GOODS } from './goods'

describe('GOODS data (T006, §5, full 11-good set since the 2026-08 Tier 3/4 expansion)', () => {
  it('has exactly 11 goods', () => {
    expect(GOODS).toHaveLength(11)
  })

  it('has unique ids', () => {
    const ids = GOODS.map((g) => g.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('uses the exact lowercase good ids expected by other data files', () => {
    const ids = GOODS.map((g) => g.id)
    expect(ids).toEqual([
      'grain',
      'cotton',
      'iron',
      'salt',
      'textiles',
      'spices',
      'fuel',
      'steel',
      'silk',
      'electronics',
      'rare-metals',
    ])
  })

  it('matches §5 table values exactly for each good', () => {
    const byId = Object.fromEntries(GOODS.map((g) => [g.id, g]))

    expect(byId.grain).toMatchObject({
      unlockCondition: { kind: 'start' },
      licenseFee: null,
      basePrice: 10,
      volatilityClass: 'Stable',
      dailyDriftPct: 0.04,
    })
    expect(byId.cotton).toMatchObject({
      unlockCondition: { kind: 'start' },
      licenseFee: null,
      basePrice: 16,
      volatilityClass: 'Stable',
      dailyDriftPct: 0.05,
    })
    expect(byId.iron).toMatchObject({
      unlockCondition: { kind: 'start' },
      licenseFee: null,
      basePrice: 25,
      volatilityClass: 'Low',
      dailyDriftPct: 0.07,
    })
    expect(byId.salt).toMatchObject({
      unlockCondition: { kind: 'tier', tier: 1, minDay: 5 },
      licenseFee: 200,
      basePrice: 14,
      volatilityClass: 'Stable',
      dailyDriftPct: 0.04,
    })
    expect(byId.textiles).toMatchObject({
      unlockCondition: { kind: 'tier', tier: 1, minDay: 5 },
      licenseFee: 400,
      basePrice: 40,
      volatilityClass: 'Low',
      dailyDriftPct: 0.08,
    })
    expect(byId.spices).toMatchObject({
      unlockCondition: { kind: 'tier', tier: 2 },
      licenseFee: 1_500,
      basePrice: 90,
      volatilityClass: 'Medium',
      dailyDriftPct: 0.12,
    })
    expect(byId.fuel).toMatchObject({
      unlockCondition: { kind: 'tier', tier: 2 },
      licenseFee: 2_500,
      basePrice: 60,
      volatilityClass: 'Medium',
      dailyDriftPct: 0.14,
    })
    expect(byId.steel).toMatchObject({
      unlockCondition: { kind: 'tier', tier: 2 },
      licenseFee: 4_000,
      basePrice: 120,
      volatilityClass: 'Medium',
      dailyDriftPct: 0.12,
    })
    expect(byId.silk).toMatchObject({
      unlockCondition: { kind: 'tier', tier: 2 },
      licenseFee: 10_000,
      basePrice: 300,
      volatilityClass: 'High',
      dailyDriftPct: 0.18,
    })
    expect(byId.electronics).toMatchObject({
      unlockCondition: { kind: 'tier', tier: 3 },
      licenseFee: 25_000,
      basePrice: 800,
      volatilityClass: 'High',
      dailyDriftPct: 0.22,
    })
    expect(byId['rare-metals']).toMatchObject({
      unlockCondition: { kind: 'city', cityId: 'kessler-mines' },
      licenseFee: 60_000,
      basePrice: 2_500,
      volatilityClass: 'Extreme',
      dailyDriftPct: 0.3,
    })
  })

  it('only start-tier goods have no license fee; all others charge one', () => {
    for (const good of GOODS) {
      if (good.unlockCondition.kind === 'start') {
        expect(good.licenseFee).toBeNull()
      } else {
        expect(good.licenseFee).not.toBeNull()
        expect(good.licenseFee).toBeGreaterThan(0)
      }
    }
  })
})
