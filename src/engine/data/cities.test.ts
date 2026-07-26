import { describe, expect, it } from 'vitest'
import { CITIES } from './cities'
import type { City } from '../types'

function requireCity(id: string): City {
  const city = CITIES.find((c) => c.id === id)
  if (!city) throw new Error(`test setup error: expected city id "${id}" to exist`)
  return city
}

describe('CITIES data (T005 — §4/§13)', () => {
  it('contains exactly 8 city records (Tier 1+2 only, per §13 scope fence)', () => {
    expect(CITIES).toHaveLength(8)
  })

  it('every city has a unique id', () => {
    const ids = CITIES.map((city) => city.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })

  it('includes exactly the 8 expected v1 cities', () => {
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
      ].sort(),
    )
  })

  it('excludes all Tier 3/4 cities (§13 v1 scope fence)', () => {
    const outOfScopeNames = [
      'Auren City',
      'Voltspire',
      'Duskfield',
      'Kessler Mines',
      'Novara Heights',
      'Frosthelm',
      'The Freeport',
    ]
    const names = CITIES.map((city) => city.name)
    for (const outOfScopeName of outOfScopeNames) {
      expect(names).not.toContain(outOfScopeName)
    }
  })

  it('has exactly 4 Tier 1 and 4 Tier 2 cities', () => {
    const tier1 = CITIES.filter((city) => city.tier === 1)
    const tier2 = CITIES.filter((city) => city.tier === 2)
    expect(tier1).toHaveLength(4)
    expect(tier2).toHaveLength(4)
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
  })

  it('Silkden has no producer goods (§4: "—")', () => {
    const silkden = CITIES.find((city) => city.id === 'silkden')
    expect(silkden?.produces).toEqual([])
  })
})
