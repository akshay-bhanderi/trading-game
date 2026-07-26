/**
 * Travel action — Trade Winds of Selvara.
 *
 * Design doc reference:
 *   §2 — "Travel to another city (costs money + 1-3 days, §4)... While
 *         traveling multiple days, the player still receives newspapers
 *         each morning but cannot trade."
 *   §4 — fare formula and distance matrix (implemented by T007's
 *        `getTravelDays`/`calcFare` in /src/engine/travel.ts — reused here,
 *        not reimplemented).
 *   §6 — information model: "the player sees live prices only in the
 *        current city. Other cities show last-seen price + how many days
 *        old... never leak live remote prices to the UI."
 *
 * Pure TypeScript, zero React imports (see /src/engine/README.md).
 *
 * ---------------------------------------------------------------------------
 * DESIGN: two-function split (start vs. advance)
 * ---------------------------------------------------------------------------
 * The acceptance criteria for this task describe `travel()` as setting
 * `state.currentCity` only "after the correct number of days elapse" for
 * multi-day trips. Looping multiple days inside a single `travel()` call
 * would require this file to own day-advancement (price recompute, event
 * ticking, etc.) — that is explicitly the Turn Loop's job (T015, not yet
 * built). So the behavior is split into two small, composable functions:
 *
 *   - `travel(state, destinationCityId)` — STARTS a trip. Validates fare
 *     and "not already traveling", deducts the fare, and records
 *     `state.travelInProgress = { destinationCityId, daysRemaining, totalDays }`.
 *     It does NOT touch `state.currentCity` and does NOT loop — even for a
 *     1-day trip, arrival is a separate step (see below).
 *
 *   - `advanceTravelDay(state)` — ADVANCES an in-progress trip by exactly
 *     one day. Decrements `daysRemaining`; when it hits 0, sets
 *     `state.currentCity = destinationCityId` and clears
 *     `state.travelInProgress` back to `null`. This is the function the
 *     turn loop (T015) is expected to call once per day while a trip is
 *     underway, the same number of times as `totalDays`.
 *
 * This means a 1-day trip still needs one `travel()` call followed by one
 * `advanceTravelDay()` call to actually arrive — `travel()` alone only ever
 * starts the journey and charges the fare, regardless of trip length. This
 * keeps the split uniform (no special-cased "same call" 1-day path) and
 * keeps `travel.ts` itself free of any day-tick/price-recompute logic.
 *
 * ---------------------------------------------------------------------------
 * DESIGN: rejection mechanism
 * ---------------------------------------------------------------------------
 * Following the established convention from cargo.ts/stay.ts (T011/T014):
 * rejection returns the IDENTICAL `state` reference, unchanged — never
 * throws. Callers detect rejection cheaply via `result === state`, and a
 * rejected call is guaranteed to have mutated nothing. `travel()` rejects
 * (no mutation) when:
 *   - `state.travelInProgress !== null` (a trip is already underway — this
 *     task does not implement the full turn loop, so `travel()` itself is
 *     the enforcement point for "can't start a new trip mid-trip"), or
 *   - `state.cash < fare`, or
 *   - `destinationCityId` isn't a known city in `CITIES` (defensive).
 * `advanceTravelDay()` rejects the same way when `state.travelInProgress`
 * is already `null` (nothing to advance).
 *
 * ---------------------------------------------------------------------------
 * DESIGN: day advancement
 * ---------------------------------------------------------------------------
 * `advanceTravelDay()` increments `state.day` by 1 itself, matching the
 * precedent set by `stay()` (T014), which also advances `day` on its own.
 * This keeps `travel`'s per-day cadence consistent with `stay`'s: both
 * "spend a day" functions own their own day-increment rather than leaving
 * it to a not-yet-built turn loop. (T015, when built, is expected to call
 * `advanceTravelDay` — which already bumps `day` — rather than bumping `day`
 * a second time itself.)
 *
 * ---------------------------------------------------------------------------
 * DESIGN: price staleness (§6)
 * ---------------------------------------------------------------------------
 * Neither `travel()` nor `advanceTravelDay()` reads or writes
 * `state.priceStates` at all. Price recomputation (which is what would make
 * the destination's price "fresh" on arrival) is the Turn Loop's job (T015),
 * driven by T008's `computePrice`. Per T008's own design, `computePrice`
 * only ever REFRESHES `lastSeenPrice`/`lastSeenDay` for the city the player
 * is physically standing in when it's called — cities left behind simply
 * stop receiving that refresh. Staleness is therefore already structurally
 * guaranteed by the surrounding system; this file's job is narrower and
 * verified by its own tests: prove that `travel`/`advanceTravelDay`
 * themselves never mutate any `priceStates` entry, directly or indirectly.
 *
 * ---------------------------------------------------------------------------
 * NOTE FOR OTHER CODE: trading-while-traveling
 * ---------------------------------------------------------------------------
 * `state.travelInProgress !== null` is the signal that trading (buy/sell,
 * trade.ts) and any other city-bound actions should refuse to run — per §2,
 * "cannot trade" while multi-day travel is in progress. That check belongs
 * to `trade.ts`/the turn loop, not to this file; it is documented here so
 * the intent is discoverable from either side.
 */

import { CITIES } from '../data/cities'
import type { GameState } from '../types'
import { calcFare, getTravelDays } from '../travel'
import { cargoUsed } from '../cargo'

/**
 * Starts a trip from `state.currentCity` to `destinationCityId`.
 *
 * Computes `days = getTravelDays(state.currentCity, destinationCityId)` and
 * `cargoUsedPct = cargoUsed(state) / state.cargoCapacity`, then
 * `fare = calcFare(days, destinationCity.tier, cargoUsedPct)` (both reused
 * from T007/T011 — not reimplemented here).
 *
 * On success: returns a NEW `GameState` with `cash` reduced by exactly
 * `fare` and `state.travelInProgress` set to
 * `{ destinationCityId, daysRemaining: days, totalDays: days }`.
 * `state.currentCity` is left untouched — arrival happens via
 * `advanceTravelDay`, once `daysRemaining` reaches 0 (see file header).
 *
 * Rejected (returns the identical `state` reference, unchanged) when:
 *   - `destinationCityId` is not a known city in `CITIES`, or
 *   - a trip is already in progress (`state.travelInProgress !== null`), or
 *   - `state.cash < fare`.
 */
export function travel(state: GameState, destinationCityId: string): GameState {
  const destinationCity = CITIES.find((c) => c.id === destinationCityId)
  if (!destinationCity) {
    // Unknown destination — reject with no mutation rather than throw.
    return state
  }

  if (state.travelInProgress !== null) {
    // A trip is already underway — refuse to start a second one.
    return state
  }

  const days = getTravelDays(state.currentCity, destinationCityId)
  const cargoUsedPct = cargoUsed(state) / state.cargoCapacity
  const fare = calcFare(days, destinationCity.tier, cargoUsedPct)

  if (state.cash < fare) {
    // Insufficient cash — reject with no mutation.
    return state
  }

  return {
    ...state,
    cash: state.cash - fare,
    travelInProgress: {
      destinationCityId,
      daysRemaining: days,
      totalDays: days,
    },
  }
}

/**
 * Advances an in-progress trip (`state.travelInProgress`) by exactly one
 * day. Intended to be called once per day-tick by the turn loop (T015)
 * while a trip is underway — see the file-header design note for why this
 * is a separate function from `travel()`.
 *
 * Decrements `daysRemaining` by 1 and increments `state.day` by 1 (matching
 * `stay()`'s precedent of owning its own day-advancement). When
 * `daysRemaining` reaches 0, also sets `state.currentCity` to the
 * destination and clears `state.travelInProgress` back to `null` — this is
 * the moment of arrival.
 *
 * Never touches `state.priceStates` — see the file-header design note on
 * price staleness (§6); that is the turn loop's job, driven by T008.
 *
 * Rejected (returns the identical `state` reference, unchanged) when there
 * is no trip in progress (`state.travelInProgress === null`).
 */
export function advanceTravelDay(state: GameState): GameState {
  const trip = state.travelInProgress
  if (!trip) {
    // Nothing to advance — reject with no mutation.
    return state
  }

  const daysRemaining = trip.daysRemaining - 1

  if (daysRemaining <= 0) {
    // Arrival.
    return {
      ...state,
      day: state.day + 1,
      currentCity: trip.destinationCityId,
      travelInProgress: null,
    }
  }

  return {
    ...state,
    day: state.day + 1,
    travelInProgress: {
      ...trip,
      daysRemaining,
    },
  }
}
