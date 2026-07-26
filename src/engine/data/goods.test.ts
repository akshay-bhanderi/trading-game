import { describe, expect, it } from 'vitest'
import { GOODS } from './goods'

describe('GOODS data (T006, §5)', () => {
  it('has exactly 9 v1 goods', () => {
    expect(GOODS).toHaveLength(9)
  })

  it('has unique ids', () => {
    const ids = GOODS.map((g) => g.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('uses the exact lowercase good ids expected by other v1 data files', () => {
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
    ])
  })

  it('excludes Electronics and Rare Metals (§13 authoritative over §5 ambiguity)', () => {
    const ids = GOODS.map((g) => g.id)
    expect(ids).not.toContain('electronics')
    expect(ids).not.toContain('rare-metals')
    expect(ids).not.toContain('rareMetals')
    const names = GOODS.map((g) => g.name.toLowerCase())
    expect(names).not.toContain('electronics')
    expect(names).not.toContain('rare metals')
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
