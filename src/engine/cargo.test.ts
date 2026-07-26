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
  // T029 note: `CONFIG.cargo.startingCapacity` was raised from the doc's
  // original 40 during the T029 balance pass (see config.ts's own doc
  // comment on `CARGO.startingCapacity` for the full rationale). This test
  // no longer assumes a specific starting value or a specific number of
  // reachable tiers — it dynamically walks whatever tiers in
  // `CONFIG.cargo.upgrades` have `capacity > startingCapacity` (there may be
  // anywhere from 0 to all 4, depending on config), so it keeps verifying
  // the SAME behavioral invariant (walks each reachable tier in order,
  // deducting the right cost, ends at the max reachable capacity with the
  // right cash spent, then rejects any further attempt) regardless of what
  // `startingCapacity` happens to be tuned to.
  it('walks every remaining upgrade tier above the starting capacity, in order, deducting cash exactly per tier', () => {
    const reachableTiers = CONFIG.cargo.upgrades.filter((t) => t.capacity > CONFIG.cargo.startingCapacity)
    expect(reachableTiers.length).toBeGreaterThan(0) // sanity: at least one tier must still be buyable

    // Enough cash to fund every reachable tier.
    const totalCost = reachableTiers.reduce((sum, t) => sum + t.cost, 0)
    let state = makeState({ cash: totalCost, cargoCapacity: CONFIG.cargo.startingCapacity })

    expect(state.cargoCapacity).toBe(CONFIG.cargo.startingCapacity)

    for (const tier of reachableTiers) {
      const cashBefore = state.cash
      const next = buyCargoUpgrade(state)

      // A new state object is returned on success.
      expect(next).not.toBe(state)
      expect(next.cargoCapacity).toBe(tier.capacity)
      expect(next.cash).toBe(cashBefore - tier.cost)

      state = next
    }

    // Every reachable tier consumed: capacity at the ladder's max, all cash spent.
    const maxCapacity = Math.max(...CONFIG.cargo.upgrades.map((t) => t.capacity))
    expect(state.cargoCapacity).toBe(maxCapacity)
    expect(state.cash).toBe(0)

    // No further tier to buy — next attempt is rejected (identical reference).
    const noMoreTiers = buyCargoUpgrade(state)
    expect(noMoreTiers).toBe(state)
    expect(noMoreTiers.cargoCapacity).toBe(maxCapacity)
  })

  it('rejects an upgrade attempt with insufficient cash, with no state mutation', () => {
    // T029 note: "the next reachable tier" (the first tier whose capacity
    // exceeds the current `startingCapacity`), not necessarily
    // `upgrades[0]` — see the "walks every remaining upgrade tier" test
    // above for why this is computed dynamically rather than assumed.
    const nextTier = CONFIG.cargo.upgrades.find((t) => t.capacity > CONFIG.cargo.startingCapacity)
    if (!nextTier) throw new Error('expected at least one reachable cargo upgrade tier in config')

    const state = makeState({
      cash: nextTier.cost - 1, // one dollar short
      cargoCapacity: CONFIG.cargo.startingCapacity,
    })

    const result = buyCargoUpgrade(state)

    // Rejected: identical reference, nothing changed.
    expect(result).toBe(state)
    expect(result.cash).toBe(nextTier.cost - 1)
    expect(result.cargoCapacity).toBe(CONFIG.cargo.startingCapacity)
  })

  it('rejects when cash is far short of even the first tier', () => {
    const state = makeState({ cash: 0, cargoCapacity: CONFIG.cargo.startingCapacity })
    const result = buyCargoUpgrade(state)
    expect(result).toBe(state)
    expect(result.cash).toBe(0)
    expect(result.cargoCapacity).toBe(CONFIG.cargo.startingCapacity)
  })

  it('succeeds exactly at the boundary when cash equals the tier cost', () => {
    const nextTier = CONFIG.cargo.upgrades.find((t) => t.capacity > CONFIG.cargo.startingCapacity)
    if (!nextTier) throw new Error('expected at least one reachable cargo upgrade tier in config')

    const state = makeState({ cash: nextTier.cost, cargoCapacity: CONFIG.cargo.startingCapacity })
    const result = buyCargoUpgrade(state)

    expect(result).not.toBe(state)
    expect(result.cash).toBe(0)
    expect(result.cargoCapacity).toBe(nextTier.capacity)
  })
})
