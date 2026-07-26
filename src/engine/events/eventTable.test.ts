import { describe, expect, it } from 'vitest'
import { GOODS } from '../data/goods'
import { EVENT_TABLE, EVENT_TYPE_IDS } from './eventTable'
import type { EventTypeId } from '../types'

const ALL_EVENT_TYPE_IDS: EventTypeId[] = [
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

const REAL_GOOD_IDS = new Set(GOODS.map((g) => g.id))

describe('EVENT_TABLE', () => {
  it('data-defines all 11 base event types from §7', () => {
    expect(EVENT_TYPE_IDS).toHaveLength(11)
    expect(Object.keys(EVENT_TABLE)).toHaveLength(11)
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

  it('flags Electronics/Rare-Metals-only event types as inert in v1 with no resolvable goods', () => {
    expect(EVENT_TABLE.techBreakthrough.inertInV1).toBe(true)
    expect(EVENT_TABLE.techBreakthrough.goodsRule).toEqual({ kind: 'inertNoV1Good' })

    expect(EVENT_TABLE.newDepositDiscovered.inertInV1).toBe(true)
    expect(EVENT_TABLE.newDepositDiscovered.goodsRule).toEqual({ kind: 'inertNoV1Good' })
  })

  it('does not flag any other event type as inert', () => {
    for (const typeId of ALL_EVENT_TYPE_IDS) {
      if (typeId === 'techBreakthrough' || typeId === 'newDepositDiscovered') continue
      expect(EVENT_TABLE[typeId].inertInV1).toBe(false)
    }
  })

  it('bumper harvest affects exactly Grain and Cotton', () => {
    expect(EVENT_TABLE.bumperHarvest.goodsRule).toEqual({
      kind: 'fixedGoods',
      goodIds: ['grain', 'cotton'],
    })
  })

  it('mine collapse affects only Iron (Rare Metals excluded per v1 scope)', () => {
    expect(EVENT_TABLE.mineCollapse.goodsRule).toEqual({ kind: 'fixedGoods', goodIds: ['iron'] })
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
