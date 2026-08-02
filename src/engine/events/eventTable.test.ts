import { describe, expect, it } from 'vitest'
import { GOODS } from '../data/goods'
import { EVENT_TABLE, EVENT_TYPE_IDS, PRICE_EVENT_TYPE_IDS } from './eventTable'
import type { EventTypeId } from '../types'

/** §7's original 11 base event types. */
const BASE_EVENT_TYPE_IDS: EventTypeId[] = [
  'bumperHarvest',
  'droughtCropFailure',
  'mineCollapse',
  'workersStrike',
  'warScare',
  'techBreakthrough',
  'newDepositDiscovered',
  'shipSinkingRouteClosed',
  'festivalSeason',
  'governmentTariff',
  'epidemic',
]

/**
 * T068 addition — Phase 2 added two non-price event-table entries
 * (`warehouseFire`, T050; `aviationSafetyIncident`, T065) that were never
 * folded into this test file's fixed type-id lists when Phases 10/12 landed
 * (deferred per the project's Phase-10-13 testing policy — see
 * tasks/phase-13-final-balance-pass.md). `ALL_EVENT_TYPE_IDS` below is the
 * FULL current table (13 entries); `BASE_EVENT_TYPE_IDS` above stays scoped
 * to just §7's original 11 for the tests that only make sense against the
 * price-effect table.
 */
const ALL_EVENT_TYPE_IDS: EventTypeId[] = [...BASE_EVENT_TYPE_IDS, 'warehouseFire', 'aviationSafetyIncident']

const REAL_GOOD_IDS = new Set(GOODS.map((g) => g.id))

describe('EVENT_TABLE', () => {
  it('data-defines the 11 base §7 event types plus 2 Phase 2 additions (13 total)', () => {
    expect(EVENT_TYPE_IDS).toHaveLength(13)
    expect(Object.keys(EVENT_TABLE)).toHaveLength(13)
    for (const typeId of BASE_EVENT_TYPE_IDS) {
      expect(EVENT_TYPE_IDS).toContain(typeId)
    }
  })

  it('has a record for every EventTypeId literal', () => {
    for (const typeId of ALL_EVENT_TYPE_IDS) {
      expect(EVENT_TABLE[typeId]).toBeDefined()
      expect(EVENT_TABLE[typeId].typeId).toBe(typeId)
    }
  })

  it('has no duplicate/extraneous keys beyond the 11 known types', () => {
    const keys = Object.keys(EVENT_TABLE).sort()
    expect(keys).toEqual([...ALL_EVENT_TYPE_IDS].sort())
  })

  it('every event type has a well-formed multiplier/duration/scope rule', () => {
    for (const typeId of ALL_EVENT_TYPE_IDS) {
      const def = EVENT_TABLE[typeId]
      expect(def.durationDays.min).toBeGreaterThan(0)
      expect(def.durationDays.max).toBeGreaterThanOrEqual(def.durationDays.min)

      if (def.multiplier.kind === 'single') {
        expect(def.multiplier.range.max).toBeGreaterThanOrEqual(def.multiplier.range.min)
        expect(def.multiplier.range.min).toBeGreaterThan(0)
      } else {
        expect(def.multiplier.increase.min).toBeGreaterThan(1)
        expect(def.multiplier.decrease.max).toBeLessThan(1)
      }

      expect(def.docNote.length).toBeGreaterThan(0)
    }
  })

  it('resolvable v1 event types reference real GOODS ids in their fixed goods list', () => {
    for (const typeId of ALL_EVENT_TYPE_IDS) {
      const def = EVENT_TABLE[typeId]
      if (def.goodsRule.kind === 'fixedGoods') {
        for (const goodId of def.goodsRule.goodIds) {
          expect(REAL_GOOD_IDS.has(goodId)).toBe(true)
        }
      }
    }
  })

  it('2026-08: Electronics/Rare-Metals event types are active (no longer inert) now that both goods + Kessler Mines ship', () => {
    expect(EVENT_TABLE.techBreakthrough.inertInV1).toBe(false)
    expect(EVENT_TABLE.techBreakthrough.goodsRule).toEqual({ kind: 'fixedGoods', goodIds: ['electronics'] })

    expect(EVENT_TABLE.newDepositDiscovered.inertInV1).toBe(false)
    expect(EVENT_TABLE.newDepositDiscovered.goodsRule).toEqual({ kind: 'fixedGoods', goodIds: ['rare-metals'] })
  })

  it('T068: flags aviationSafetyIncident as inert too (a non-price event modeled with an empty goods list, same inertNoV1Good shape as the Electronics/Rare-Metals rows)', () => {
    expect(EVENT_TABLE.aviationSafetyIncident.inertInV1).toBe(true)
    expect(EVENT_TABLE.aviationSafetyIncident.goodsRule).toEqual({ kind: 'inertNoV1Good' })
  })

  it('does not flag any other event type as inert (warehouseFire included — it is excluded from scheduling entirely, not "inert")', () => {
    const INERT_TYPE_IDS = new Set<EventTypeId>(['aviationSafetyIncident'])
    for (const typeId of ALL_EVENT_TYPE_IDS) {
      if (INERT_TYPE_IDS.has(typeId)) continue
      expect(EVENT_TABLE[typeId].inertInV1).toBe(false)
    }
  })

  it('T068: warehouseFire (T050) is a dedicated-daily-roll event excluded from PRICE_EVENT_TYPE_IDS, with an empty/neutral price entry', () => {
    expect(EVENT_TABLE.warehouseFire.goodsRule).toEqual({ kind: 'none' })
    expect(EVENT_TABLE.warehouseFire.scopeRule).toEqual({ kind: 'oneCity' })
    expect(EVENT_TABLE.warehouseFire.inertInV1).toBe(false)
    expect(PRICE_EVENT_TYPE_IDS).not.toContain('warehouseFire')
  })

  it('T068: aviationSafetyIncident (T065) IS eligible for normal scheduling (unlike warehouseFire), with a 5-10 day grounding duration and global scope', () => {
    expect(PRICE_EVENT_TYPE_IDS).toContain('aviationSafetyIncident')
    expect(EVENT_TABLE.aviationSafetyIncident.scopeRule).toEqual({ kind: 'fixedGlobal' })
    expect(EVENT_TABLE.aviationSafetyIncident.durationDays).toEqual({ min: 5, max: 10 })
  })

  it('T068: PRICE_EVENT_TYPE_IDS is exactly ALL_EVENT_TYPE_IDS minus warehouseFire (12 entries)', () => {
    expect(PRICE_EVENT_TYPE_IDS).toHaveLength(12)
    expect(new Set(PRICE_EVENT_TYPE_IDS)).toEqual(new Set(ALL_EVENT_TYPE_IDS.filter((id) => id !== 'warehouseFire')))
  })

  it('bumper harvest affects exactly Grain and Cotton', () => {
    expect(EVENT_TABLE.bumperHarvest.goodsRule).toEqual({
      kind: 'fixedGoods',
      goodIds: ['grain', 'cotton'],
    })
  })

  it('mine collapse affects Iron and Rare Metals', () => {
    expect(EVENT_TABLE.mineCollapse.goodsRule).toEqual({ kind: 'fixedGoods', goodIds: ['iron', 'rare-metals'] })
  })

  it('festival season affects Silk and Spices', () => {
    expect(EVENT_TABLE.festivalSeason.goodsRule).toEqual({
      kind: 'fixedGoods',
      goodIds: ['silk', 'spices'],
    })
  })

  it('epidemic affects all goods', () => {
    expect(EVENT_TABLE.epidemic.goodsRule).toEqual({ kind: 'allGoods' })
  })

  it('government tariff is a dual-direction ±20-40% spec over one random good', () => {
    expect(EVENT_TABLE.governmentTariff.goodsRule).toEqual({ kind: 'oneRandomGood' })
    const multiplier = EVENT_TABLE.governmentTariff.multiplier
    expect(multiplier.kind).toBe('dual')
    if (multiplier.kind === 'dual') {
      expect(multiplier.increase).toEqual({ min: 1.2, max: 1.4 })
      expect(multiplier.decrease).toEqual({ min: 0.6, max: 0.8 })
    }
  })
})
