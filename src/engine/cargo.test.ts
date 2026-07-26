import { describe, expect, it } from 'vitest'
import { CONFIG } from './config'
import { buyCargoUpgrade, cargoUsed } from './cargo'
import type { Cargo, GameState } from './types'

/**
 * Builds a minimal-but-valid `GameState` for cargo tests. Deliberately does
 * NOT import `/src/engine/data/cities.ts` or `/src/engine/data/goods.ts`
 * (owned by concurrent tasks) — cargo/upgrade logic only cares about
 * `cash`, `cargo`, and `cargoCapacity`, so every other field is filled with
 * an innocuous placeholder that satisfies the `GameState` shape.
 */
function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    day: 1,
    currentCity: 'placeholder-city',
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

function makeCargo(holdings: Record<string, number>): Cargo {
  const cargo: Cargo = {}
  for (const [goodId, qty] of Object.entries(holdings)) {
    cargo[goodId] = { goodId, qty, avgBuyCost: 0, lots: [{ qty, unitCost: 0 }] }
  }
  return cargo
}

describe('cargoUsed', () => {
  it('sums units across all owned goods regardless of type', () => {
    const state = makeState({ cargo: makeCargo({ grain: 12, iron: 5, silk: 1 }) })
    expect(cargoUsed(state)).toBe(18)
  })

  it('returns 0 for empty cargo', () => {
    const state = makeState({ cargo: {} })
    expect(cargoUsed(state)).toBe(0)
  })
})

describe('buyCargoUpgrade', () => {
  it('walks the full upgrade path 40 -> 100 -> 250 -> 600 -> 1500, deducting cash exactly per tier', () => {
    // Enough cash to fund the entire ladder: 2,500 + 12,000 + 60,000 + 300,000.
    const totalCost = CONFIG.cargo.upgrades.reduce((sum, t) => sum + t.cost, 0)
    let state = makeState({ cash: totalCost, cargoCapacity: CONFIG.cargo.startingCapacity })

    expect(state.cargoCapacity).toBe(40)

    for (const tier of CONFIG.cargo.upgrades) {
      const cashBefore = state.cash
      const next = buyCargoUpgrade(state)

      // A new state object is returned on success.
      expect(next).not.toBe(state)
      expect(next.cargoCapacity).toBe(tier.capacity)
      expect(next.cash).toBe(cashBefore - tier.cost)

      state = next
    }

    // Full ladder consumed: capacity at max tier, all cash spent.
    expect(state.cargoCapacity).toBe(1_500)
    expect(state.cash).toBe(0)

    // No further tier to buy — next attempt is rejected (identical reference).
    const noMoreTiers = buyCargoUpgrade(state)
    expect(noMoreTiers).toBe(state)
    expect(noMoreTiers.cargoCapacity).toBe(1_500)
  })

  it('rejects an upgrade attempt with insufficient cash, with no state mutation', () => {
    const firstTier = CONFIG.cargo.upgrades[0]
    if (!firstTier) throw new Error('expected at least one cargo upgrade tier in config')

    const state = makeState({
      cash: firstTier.cost - 1, // one dollar short
      cargoCapacity: CONFIG.cargo.startingCapacity,
    })

    const result = buyCargoUpgrade(state)

    // Rejected: identical reference, nothing changed.
    expect(result).toBe(state)
    expect(result.cash).toBe(firstTier.cost - 1)
    expect(result.cargoCapacity).toBe(CONFIG.cargo.startingCapacity)
  })

  it('rejects when cash is far short of even the first tier', () => {
    const state = makeState({ cash: 0, cargoCapacity: CONFIG.cargo.startingCapacity })
    const result = buyCargoUpgrade(state)
    expect(result).toBe(state)
    expect(result.cash).toBe(0)
    expect(result.cargoCapacity).toBe(40)
  })

  it('succeeds exactly at the boundary when cash equals the tier cost', () => {
    const firstTier = CONFIG.cargo.upgrades[0]
    if (!firstTier) throw new Error('expected at least one cargo upgrade tier in config')

    const state = makeState({ cash: firstTier.cost, cargoCapacity: CONFIG.cargo.startingCapacity })
    const result = buyCargoUpgrade(state)

    expect(result).not.toBe(state)
    expect(result.cash).toBe(0)
    expect(result.cargoCapacity).toBe(firstTier.capacity)
  })
})
