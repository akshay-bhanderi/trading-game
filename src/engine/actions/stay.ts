/**
 * Stay action — Trade Winds of Selvara.
 *
 * Design doc reference: §2 core loop — "Stay the night — hotel cost charged
 * per city tier (§4)." and §4's per-city "Hotel/night" column (`City.hotelPerNight`,
 * see /src/engine/types.ts and /src/engine/data/cities.ts).
 *
 * Pure TypeScript, zero React imports (see /src/engine/README.md).
 *
 * Convention: follows the same pure-function precedent already established
 * by T011's `buyCargoUpgrade` (/src/engine/cargo.ts) — on success this
 * returns a NEW `GameState`; on rejection (insufficient cash) it returns the
 * identical `state` reference, unchanged, with no throw and no mutation, so
 * callers can detect rejection cheaply via `result === state`.
 */

import { CITIES } from '../data/cities'
import type { GameState } from '../types'

/**
 * Stays the night in the player's current city (`state.currentCity`).
 *
 * Looks up the current city's nightly rate (`City.hotelPerNight` from
 * `CITIES`, §4), deducts it from `state.cash`, and advances `state.day` by 1.
 *
 * On success: returns a NEW `GameState` with `cash` reduced by exactly the
 * current city's `hotelPerNight` and `day` incremented by 1.
 *
 * Rejected (returns the identical `state` reference, unchanged) when:
 *   - the current city cannot be found in `CITIES` (defensive — should not
 *     happen in a well-formed game state), or
 *   - `state.cash` is less than the current city's `hotelPerNight`.
 */
export function stay(state: GameState): GameState {
  const city = CITIES.find((c) => c.id === state.currentCity)

  if (!city) {
    // Unknown city — reject with no mutation rather than throw.
    return state
  }

  if (state.cash < city.hotelPerNight) {
    // Insufficient cash — reject with no mutation.
    return state
  }

  return {
    ...state,
    cash: state.cash - city.hotelPerNight,
    day: state.day + 1,
  }
}
