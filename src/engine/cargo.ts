/**
 * Cargo capacity + upgrade purchase — Trade Winds of Selvara.
 *
 * Design doc reference: §2 — "Cargo capacity: starts at 40 units. Upgradable:
 * 100 units ($2,500), 250 ($12,000), 600 ($60,000), 1,500 ($300,000)." and
 * the cargo unit model: "1 cargo slot = 1 unit of ANY commodity, regardless
 * of type. No weight/bulk mechanic."
 *
 * Pure TypeScript, zero React imports (see /src/engine/README.md).
 *
 * `GameState.cargoCapacity` is assumed to already be initialized to
 * `CONFIG.cargo.newGameStartingCapacity` (40) by whatever code seeds a fresh
 * game (out of scope for this task, T011 — this file only consumes
 * `state.cargoCapacity` as-is and steps it forward through the upgrade
 * tiers). `CONFIG.cargo.startingCapacity` (1,499) is a DIFFERENT, bot-
 * harness/test-only value — see that field's own comment (config.ts) for why
 * the two must never be conflated again.
 *
 * Design decisions (documented per the task brief):
 *
 * 1. Immutability: `buyCargoUpgrade` is a pure function that returns a
 *    (possibly new) `GameState` rather than mutating its argument in place.
 *    The rest of the engine has no Redux/Zustand-style mutation convention
 *    yet (T034 wires a store later), so pure "returns a new state" is the
 *    safer default — it composes cleanly with whatever the store ends up
 *    doing (React state, Zustand's `set`, etc. all work fine with a pure
 *    reducer-shaped function; the reverse is not true).
 *
 * 2. Rejection signaling: on rejection (insufficient cash, or already at the
 *    top tier with nothing left to buy) the function returns the exact same
 *    `state` reference it was given (no shallow copy, no mutation) — never
 *    throws. Callers can therefore detect rejection cheaply with
 *    `result === state`, and a rejected call is guaranteed to have changed
 *    nothing (cash/cargoCapacity/anything else all untouched), which is
 *    exactly what the task's "no state mutation" requirement asks for.
 *
 * 3. Skip-ahead is structurally impossible, by design: `buyCargoUpgrade`
 *    takes no target-tier parameter. It always advances to the single next
 *    tier after the current `cargoCapacity`, looked up from
 *    `CONFIG.cargo.upgrades` (an ordered array). There is no code path that
 *    could ever request tier 3 while sitting at tier 1 — the "reject
 *    skip-ahead" requirement is satisfied by the API shape itself rather
 *    than by a runtime check on an explicit target. This is simpler and
 *    less error-prone than accepting a `targetCapacity` param and validating
 *    it, and it matches how the doc phrases the upgrade path as a fixed,
 *    ordered ladder with no "buy tier N directly" concept anywhere else in
 *    the design.
 */

import { CONFIG } from './config'
import type { GameState } from './types'

/**
 * Attempts to buy the next cargo-capacity upgrade tier after the player's
 * current `state.cargoCapacity`, per `CONFIG.cargo.upgrades` (§2).
 *
 * On success: returns a NEW `GameState` with `cash` reduced by the tier's
 * cost and `cargoCapacity` set to the tier's capacity.
 *
 * Rejected (returns the identical `state` reference, unchanged) when:
 *   - there is no next tier (player already owns the top tier, 1,500), or
 *   - `state.cash` is less than the next tier's cost.
 */
export function buyCargoUpgrade(state: GameState): GameState {
  const nextTier = CONFIG.cargo.upgrades.find((tier) => tier.capacity > state.cargoCapacity)

  if (!nextTier) {
    // Already at (or somehow above) the top tier — nothing left to buy.
    return state
  }

  if (state.cash < nextTier.cost) {
    // Insufficient cash — reject with no mutation.
    return state
  }

  return {
    ...state,
    cash: state.cash - nextTier.cost,
    cargoCapacity: nextTier.capacity,
  }
}

/**
 * Sums units currently carried across ALL owned goods, regardless of good
 * type — §2's cargo unit model: "1 cargo slot = 1 unit of ANY commodity".
 * No weight/bulk mechanic, so this is a flat sum of each holding's `qty`.
 */
export function cargoUsed(state: GameState): number {
  let total = 0
  for (const goodId in state.cargo) {
    const holding = state.cargo[goodId]
    if (holding) total += holding.qty
  }
  return total
}
