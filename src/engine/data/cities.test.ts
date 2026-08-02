import { describe, expect, it } from 'vitest'
import { CITIES } from './cities'
import type { City } from '../types'

function requireCity(id: string): City {
  const city = CITIES.find((c) => c.id === id)
  if (!city) throw new Error(`test setup error: expected city id "${id}" to exist`)
  return city
}

describe('CITIES data (T005 — §4, full 15-city world since the 2026-08 Tier 3/4 expansion)', () => {
  it('contains exactly 15 city records', () => {
    expect(CITIES).toHaveLength(15)
  })

  it('every city has a unique id', () => {
    const ids = CITIES.map((city) => city.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })

  it('includes exactly the 15 expected cities', () => {
    const ids = CITIES.map((city) => city.id).sort()
    expect(ids).toEqual(
      [
        'farrow',
        'saltmere',
        'copperfell',
        'millbrook',
        'port-vela',
        'ironvale',
        'silkden',
        'greyharbor',
        'auren-city',
        'voltspire',
        'duskfield',
        'kessler-mines',
        'novara-heights',
        'frosthelm',
        'the-freeport',
      ].sort(),
    )
  })

  it('has exactly 4 Tier 1, 4 Tier 2, 4 Tier 3, and 3 Tier 4 cities', () => {
    const tier1 = CITIES.filter((city) => city.tier === 1)
    const tier2 = CITIES.filter((city) => city.tier === 2)
    const tier3 = CITIES.filter((city) => city.tier === 3)
    const tier4 = CITIES.filter((city) => city.tier === 4)
    expect(tier1).toHaveLength(4)
    expect(tier2).toHaveLength(4)
    expect(tier3).toHaveLength(4)
    expect(tier4).toHaveLength(3)
  })

  it('every city has non-empty name/character and a positive hotelPerNight', () => {
    for (const city of CITIES) {
      expect(city.name.length).toBeGreaterThan(0)
      expect(city.character.length).toBeGreaterThan(0)
      expect(city.hotelPerNight).toBeGreaterThan(0)
    }
  })

  it('matches §4 hotel/night values exactly', () => {
    expect(requireCity('farrow').hotelPerNight).toBe(15)
    expect(requireCity('saltmere').hotelPerNight).toBe(20)
    expect(requireCity('copperfell').hotelPerNight).toBe(18)
    expect(requireCity('millbrook').hotelPerNight).toBe(22)
    expect(requireCity('port-vela').hotelPerNight).toBe(45)
    expect(requireCity('ironvale').hotelPerNight).toBe(40)
    expect(requireCity('silkden').hotelPerNight).toBe(60)
    expect(requireCity('greyharbor').hotelPerNight).toBe(30)
    expect(requireCity('auren-city').hotelPerNight).toBe(120)
    expect(requireCity('voltspire').hotelPerNight).toBe(90)
    expect(requireCity('duskfield').hotelPerNight).toBe(50)
    expect(requireCity('kessler-mines').hotelPerNight).toBe(70)
    expect(requireCity('novara-heights').hotelPerNight).toBe(200)
    expect(requireCity('frosthelm').hotelPerNight).toBe(150)
    expect(requireCity('the-freeport').hotelPerNight).toBe(180)
  })

  it('matches §4 bank sizes exactly', () => {
    expect(requireCity('farrow').bankSize).toBe('Small')
    expect(requireCity('saltmere').bankSize).toBe('Small')
    expect(requireCity('copperfell').bankSize).toBe('Small')
    expect(requireCity('millbrook').bankSize).toBe('Small')
    expect(requireCity('port-vela').bankSize).toBe('Medium')
    expect(requireCity('ironvale').bankSize).toBe('Medium')
    expect(requireCity('silkden').bankSize).toBe('Medium')
    expect(requireCity('greyharbor').bankSize).toBe('Small')
    expect(requireCity('auren-city').bankSize).toBe('Huge')
    expect(requireCity('voltspire').bankSize).toBe('Large')
    expect(requireCity('duskfield').bankSize).toBe('Medium')
    expect(requireCity('kessler-mines').bankSize).toBe('Small')
    expect(requireCity('novara-heights').bankSize).toBe('Huge')
    expect(requireCity('frosthelm').bankSize).toBe('Small')
    expect(requireCity('the-freeport').bankSize).toBe('Large')
  })

  it('Silkden has no producer goods (§4: "—")', () => {
    const silkden = CITIES.find((city) => city.id === 'silkden')
    expect(silkden?.produces).toEqual([])
  })

  it('The Freeport offers no loans (§4 Tier 4 Special); every other city defaults to loans offered', () => {
    expect(requireCity('the-freeport').loansOffered).toBe(false)
    const others = CITIES.filter((c) => c.id !== 'the-freeport')
    for (const city of others) {
      expect(city.loansOffered).not.toBe(false)
    }
  })

  it('Kessler Mines and Frosthelm both produce Rare Metals (§4 Kessler table row + Frosthelm\'s "extreme discount" Special)', () => {
    const producers = CITIES.filter((c) => c.produces.includes('rare-metals')).map((c) => c.id)
    expect(new Set(producers)).toEqual(new Set(['kessler-mines', 'frosthelm']))
  })
})
