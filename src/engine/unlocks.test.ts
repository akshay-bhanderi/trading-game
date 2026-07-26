import { describe, expect, it } from 'vitest'
import { CONFIG } from './config'
import { CITIES } from './data/cities'
import { GOODS } from './data/goods'
import { buyLicense, checkCityUnlocks, checkGoodUnlocks } from './unlocks'
import type { GameState } from './types'

/**
 * Builds a minimal-but-valid `GameState` for unlock tests, following the same
 * pattern as /src/engine/netWorth.test.ts. Only `data/cities.ts` and
 * `data/goods.ts` are imported (both already landed, T005/T006) — deliberately
 * does NOT depend on the concurrently-edited `turnLoop.ts`.
 */
function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    day: 1,
    currentCity: 'farrow',
    cash: 0,
    cargo: {},
    cargoCapacity: CONFIG.cargo.startingCapacity,
    bankAccounts: {},
    priceStates: {},
    unlockedCityIds: [],
    unlockedGoodIds: [],
    purchasedLicenseGoodIds: [],
    activeEvents: [],
    currentNewspaper: [],
    taxHistory: [],
    travelInProgress: null,
    peakNetWorth: 0,
    seed: 1,
    difficulty: 'Pro',
    repaymentRecord: 0,
    cumulativeTradeVolume: 0,
    rankCache: { value: 1, computedOnDay: 0 },
    ...overrides,
  }
}

/** Tier 1 city ids per §4 — what a fresh-game seeding step is expected to
 * have already placed in `unlockedCityIds` before this engine's functions
 * ever run. */
const TIER1_CITY_IDS = CITIES.filter((c) => c.tier === 1).map((c) => c.id)
const TIER2_CITY_IDS = CITIES.filter((c) => c.tier === 2).map((c) => c.id)

/** A fresh-game state: only Tier 1 cities unlocked, only start-condition
 * goods (Grain/Cotton/Iron) unlocked, day 1. */
function makeFreshGameState(overrides: Partial<GameState> = {}): GameState {
  return makeState({
    unlockedCityIds: [...TIER1_CITY_IDS],
    unlockedGoodIds: GOODS.filter((g) => g.unlockCondition.kind === 'start').map((g) => g.id),
    ...overrides,
  })
}

describe('checkCityUnlocks', () => {
  it('a fresh-game state has no Tier 2 cities unlocked and nothing new unlocks below the threshold', () => {
    const state = makeFreshGameState({ cash: 0 })
    expect(TIER2_CITY_IDS.length).toBeGreaterThan(0)
    for (const id of TIER2_CITY_IDS) {
      expect(state.unlockedCityIds).not.toContain(id)
    }

    const result = checkCityUnlocks(state)
    expect(result).toBe(state) // identical reference — no-op
    for (const id of TIER2_CITY_IDS) {
      expect(result.unlockedCityIds).not.toContain(id)
    }
  })

  it('unlocks ALL Tier 2 cities once net worth crosses $25,000', () => {
    const state = makeFreshGameState({ cash: CONFIG.cityUnlocks.tier2NetWorth })
    const result = checkCityUnlocks(state)

    expect(result).not.toBe(state)
    for (const id of TIER2_CITY_IDS) {
      expect(result.unlockedCityIds).toContain(id)
    }
    // Tier 1 cities remain unlocked too — nothing is removed.
    for (const id of TIER1_CITY_IDS) {
      expect(result.unlockedCityIds).toContain(id)
    }
  })

  it('does not unlock Tier 2 cities when net worth is just below the threshold', () => {
    const state = makeFreshGameState({ cash: CONFIG.cityUnlocks.tier2NetWorth - 1 })
    const result = checkCityUnlocks(state)

    expect(result).toBe(state)
    for (const id of TIER2_CITY_IDS) {
      expect(result.unlockedCityIds).not.toContain(id)
    }
  })

  it('is idempotent — running it again after cities are already unlocked changes nothing further', () => {
    const state = makeFreshGameState({ cash: CONFIG.cityUnlocks.tier2NetWorth })
    const firstResult = checkCityUnlocks(state)
    const secondResult = checkCityUnlocks(firstResult)

    expect(secondResult).toBe(firstResult)
  })
})

describe('checkGoodUnlocks', () => {
  it('a fresh-game state has only Grain/Cotton/Iron unlocked, and Salt/Textiles/Spices/Fuel/Steel/Silk are NOT unlocked', () => {
    const state = makeFreshGameState()
    expect(state.unlockedGoodIds.sort()).toEqual(['cotton', 'grain', 'iron'].sort())

    const result = checkGoodUnlocks(state)
    expect(result).toBe(state) // identical reference — no-op

    for (const goodId of ['salt', 'textiles', 'spices', 'fuel', 'steel', 'silk']) {
      expect(result.unlockedGoodIds).not.toContain(goodId)
    }
  })

  it('does NOT unlock Salt/Textiles on day 1 even though Tier 1 is reached from game start', () => {
    const state = makeFreshGameState({ day: 1 })
    const result = checkGoodUnlocks(state)

    expect(result.unlockedGoodIds).not.toContain('salt')
    expect(result.unlockedGoodIds).not.toContain('textiles')
  })

  it('unlocks Salt/Textiles once day >= 5 (Tier 1 already reached from day 1)', () => {
    const state = makeFreshGameState({ day: 5 })
    const result = checkGoodUnlocks(state)

    expect(result).not.toBe(state)
    expect(result.unlockedGoodIds).toContain('salt')
    expect(result.unlockedGoodIds).toContain('textiles')
    // Tier 2-gated goods still absent — Tier 2 not reached yet.
    expect(result.unlockedGoodIds).not.toContain('spices')
  })

  it('does not unlock Salt/Textiles on day 4 (one day before the gate)', () => {
    const state = makeFreshGameState({ day: 4 })
    const result = checkGoodUnlocks(state)

    expect(result.unlockedGoodIds).not.toContain('salt')
    expect(result.unlockedGoodIds).not.toContain('textiles')
  })

  it('unlocks Spices/Fuel/Steel/Silk once a Tier 2 city is unlocked, regardless of day', () => {
    const state = makeFreshGameState({
      day: 1,
      unlockedCityIds: [...TIER1_CITY_IDS, 'port-vela'],
    })
    const result = checkGoodUnlocks(state)

    expect(result).not.toBe(state)
    for (const goodId of ['spices', 'fuel', 'steel', 'silk']) {
      expect(result.unlockedGoodIds).toContain(goodId)
    }
  })

  it('is idempotent — running it again after goods are already unlocked changes nothing further', () => {
    const state = makeFreshGameState({ day: 5 })
    const firstResult = checkGoodUnlocks(state)
    const secondResult = checkGoodUnlocks(firstResult)

    expect(secondResult).toBe(firstResult)
  })
})

describe('buyLicense', () => {
  it('rejects buying a license before its prerequisite unlock condition is met (Spices before Tier 2 reached)', () => {
    const state = makeFreshGameState({ cash: 1_000_000 }) // plenty of cash
    expect(state.unlockedGoodIds).not.toContain('spices')

    const result = buyLicense(state, 'spices')

    expect(result).toBe(state) // identical reference — no mutation
    expect(result.cash).toBe(1_000_000)
    expect(result.purchasedLicenseGoodIds).not.toContain('spices')
  })

  it('succeeds once the prerequisite is met and cash covers the fee', () => {
    const spices = GOODS.find((g) => g.id === 'spices')
    if (!spices || spices.licenseFee === null) throw new Error('expected spices with a license fee')

    const state = makeFreshGameState({
      cash: spices.licenseFee + 100,
      unlockedGoodIds: ['grain', 'cotton', 'iron', 'spices'],
    })

    const result = buyLicense(state, 'spices')

    expect(result).not.toBe(state)
    expect(result.cash).toBe(100)
    expect(result.purchasedLicenseGoodIds).toContain('spices')
  })

  it('rejects when cash is insufficient to cover the license fee', () => {
    const spices = GOODS.find((g) => g.id === 'spices')
    if (!spices || spices.licenseFee === null) throw new Error('expected spices with a license fee')

    const state = makeFreshGameState({
      cash: spices.licenseFee - 1,
      unlockedGoodIds: ['grain', 'cotton', 'iron', 'spices'],
    })

    const result = buyLicense(state, 'spices')

    expect(result).toBe(state)
    expect(result.purchasedLicenseGoodIds).not.toContain('spices')
  })

  it('rejects buying the same license twice', () => {
    const spices = GOODS.find((g) => g.id === 'spices')
    if (!spices || spices.licenseFee === null) throw new Error('expected spices with a license fee')

    const state = makeFreshGameState({
      cash: spices.licenseFee * 2,
      unlockedGoodIds: ['grain', 'cotton', 'iron', 'spices'],
      purchasedLicenseGoodIds: ['spices'],
    })

    const result = buyLicense(state, 'spices')

    expect(result).toBe(state)
    expect(result.cash).toBe(spices.licenseFee * 2)
  })

  it('rejects calling buyLicense for a free good (licenseFee null) — Grain needs no license', () => {
    const grain = GOODS.find((g) => g.id === 'grain')
    if (!grain) throw new Error('expected grain in GOODS')
    expect(grain.licenseFee).toBeNull()

    const state = makeFreshGameState({ cash: 100 })
    const result = buyLicense(state, 'grain')

    expect(result).toBe(state)
    expect(result.purchasedLicenseGoodIds).not.toContain('grain')
  })

  it('rejects an unknown good id', () => {
    const state = makeFreshGameState({ cash: 1_000_000 })
    const result = buyLicense(state, 'not-a-real-good')

    expect(result).toBe(state)
  })
})
