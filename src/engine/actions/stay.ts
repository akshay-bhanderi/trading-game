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
 *
 * ---------------------------------------------------------------------------
 * UPDATED BY T015: day-advancement now funnels through `advanceDay`
 * ---------------------------------------------------------------------------
 * Originally (T014) this function incremented `state.day` inline itself.
 * T015 (/src/engine/turnLoop.ts) introduced `advanceDay(state)` as the single
 * function responsible for ALL day-advancement side effects — recomputing
 * every city+good price for the new day and updating net worth/peak net
 * worth, in addition to incrementing `day`. `stay()` now deducts the hotel
 * cost itself (unchanged validation/logic) and then delegates the actual
 * day-advance to `advanceDay`, rather than duplicating a bare `day + 1` that
 * would silently skip price recompute and net-worth tracking on every night
 * the player chooses to Stay (see turnLoop.ts's file header for the full
 * rationale — this is option (a) from T015's brief: funnel through
 * `advanceDay` rather than build a parallel orchestration layer).
 *
 * ---------------------------------------------------------------------------
 * UPDATED BY T055 (§15 Hotel Ownership): free stays for the hotel's owner
 * ---------------------------------------------------------------------------
 * §15: "while you own a city's hotel, the Stay action there costs you $0."
 * `stay()` now checks `isHotelOwnedByPlayer` (/src/engine/hotel.ts) against
 * `state.currentCity` BEFORE charging anything — owning the current city's
 * hotel makes the nightly charge exactly `0` instead of `city.hotelPerNight`,
 * with everything else (day-advance, price recompute, net worth) unchanged.
 * This deliberately does NOT change the function's rejection shape: it still
 * only rejects for an unknown city or insufficient cash for whatever the
 * ACTUAL charge is (which is trivially satisfied once that charge is `0`).
 */

import { CITIES } from '../data/cities'
import { isHotelOwnedByPlayer } from '../hotel'
import { advanceDay } from '../turnLoop'
import type { GameState } from '../types'

/**
 * Stays the night in the player's current city (`state.currentCity`).
 *
 * Looks up the current city's nightly rate (`City.hotelPerNight` from
 * `CITIES`, §4) — or `$0` if the player owns that city's hotel (§15, T055's
 * free-stays rule) — deducts it from `state.cash`, then delegates the
 * day-advance itself to `advanceDay` (T015) — which increments `state.day`,
 * recomputes all city+good prices for the new day, and updates net worth/
 * peak net worth.
 *
 * On success: returns a NEW `GameState` with `cash` reduced by exactly the
 * current city's `hotelPerNight` (or `0` for the hotel's owner), `day`
 * incremented by 1, prices recomputed for the new day, and net worth/peak
 * net worth refreshed.
 *
 * Rejected (returns the identical `state` reference, unchanged) when:
 *   - the current city cannot be found in `CITIES` (defensive — should not
 *     happen in a well-formed game state), or
 *   - `state.cash` is less than the actual nightly charge (never triggers
 *     for the hotel's owner, since their charge is always `$0`).
 */
export function stay(state: GameState): GameState {
  const city = CITIES.find((c) => c.id === state.currentCity)

  if (!city) {
    // Unknown city — reject with no mutation rather than throw.
    return state
  }

  const nightlyCharge = isHotelOwnedByPlayer(state, city.id) ? 0 : city.hotelPerNight

  if (state.cash < nightlyCharge) {
    // Insufficient cash — reject with no mutation.
    return state
  }

  const afterPayment: GameState = {
    ...state,
    cash: state.cash - nightlyCharge,
  }

  return advanceDay(afterPayment)
}
