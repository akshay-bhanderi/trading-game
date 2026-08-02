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
 * DESIGN: day advancement — UPDATED BY T015, now funnels through `advanceDay`
 * ---------------------------------------------------------------------------
 * Originally (T013) `advanceTravelDay()` incremented `state.day` by 1
 * itself, matching the precedent `stay()` (T014) also used at the time.
 * T015 (/src/engine/turnLoop.ts) introduced `advanceDay(state)` as the single
 * function responsible for ALL day-advancement side effects (day increment +
 * price recompute + net-worth tracking). `advanceTravelDay()` now performs
 * its own travel-specific state transition FIRST (decrementing
 * `daysRemaining`, and on arrival flipping `currentCity` to the destination +
 * clearing `travelInProgress` back to `null`), and then delegates the actual
 * day-advance to `advanceDay` on that already-transitioned state, instead of
 * bumping `day` a second/separate time itself. This guarantees a multi-day
 * trip's price recompute/net-worth tracking actually happens on every
 * transit day, not just on arrival (previously, before T015 existed, nothing
 * else was wired up to do this).
 *
 * Ordering matters here: because `currentCity`/`travelInProgress` are
 * updated BEFORE `advanceDay` runs, `advanceDay`'s "refresh the present
 * city's lastSeenPrice" logic sees the POST-transition values — i.e. on a
 * transit day it still sees `travelInProgress !== null` (no refresh anywhere,
 * origin correctly stays frozen), and on the arrival day it sees
 * `travelInProgress === null` and `currentCity` already equal to the
 * destination (so the destination's prices freshen immediately on arrival).
 * See turnLoop.ts's file header for the full rationale on why the refresh is
 * gated on `travelInProgress === null` rather than just "is this
 * `currentCity`".
 *
 * ---------------------------------------------------------------------------
 * DESIGN: price staleness (§6)
 * ---------------------------------------------------------------------------
 * Neither `travel()` nor `advanceTravelDay()` reads or writes
 * `state.priceStates` directly themselves — that remains `advanceDay`'s
 * (T015's) job, driven by T008's `computePrice`. `advanceDay` only ever
 * REFRESHES `lastSeenPrice`/`lastSeenDay` for the city the player is
 * PRESENTLY standing in (`currentCity`, and only when not mid-travel) when
 * it's called — cities left behind simply stop receiving that refresh.
 * Staleness is therefore guaranteed by the surrounding system; this file's
 * own job is narrower: perform the correct `currentCity`/`travelInProgress`
 * transition, in the correct order, before handing off to `advanceDay`.
 *
 * ---------------------------------------------------------------------------
 * NOTE FOR OTHER CODE: trading-while-traveling
 * ---------------------------------------------------------------------------
 * `state.travelInProgress !== null` is the signal that trading (buy/sell,
 * trade.ts) and any other city-bound actions should refuse to run — per §2,
 * "cannot trade" while multi-day travel is in progress. That check belongs
 * to `trade.ts`/the turn loop, not to this file; it is documented here so
 * the intent is discoverable from either side.
 *
 * ---------------------------------------------------------------------------
 * T063 addition (§16 Aviation — Personal-use travel bonus, single-use)
 * ---------------------------------------------------------------------------
 * §16: a plane in `'personal'` status "applies that plane's fare/day/cargo
 * bonus to your next Travel action instead [of lease income]." `travel()`
 * reads `state.armedPersonalUsePlaneId` (set by aviation.ts's
 * `setPlaneStatus`, T063) and, if it resolves to a real plane still in
 * `'personal'` status, applies its `CONFIG.aviation.classes[class].personalUse`
 * bonus to THIS ONE trip:
 *   - `travelDaysReduction` is subtracted from the base `getTravelDays`
 *     result, floored at 1 day (§16: "travel days -1 (min 1)") — a trip can
 *     never become instantaneous.
 *   - `cargoCapacityBonusPct` inflates the EFFECTIVE cargo capacity used only
 *     for `calcFare`'s cargo-doubling-threshold check (travel.ts) — e.g.
 *     Freighter's "+50% effective cargo capacity while flying" makes the
 *     >60%-of-capacity fare-doubling trigger less likely to fire on this
 *     trip. It does NOT touch `state.cargoCapacity` itself (the bonus is
 *     explicitly scoped to "while flying" this one trip, not a permanent
 *     capacity upgrade).
 *   - `fareReductionPct` is applied as a straight multiplier reduction to
 *     the resulting fare, AFTER the doubling check above (so a Freighter's
 *     cargo bonus can first avoid the doubling, and its fare-reduction bonus
 *     then further cuts whatever fare results).
 *
 * Whether or not a valid bonus was actually found and applied, ANY
 * successful (non-rejected) call to `travel()` unconditionally clears
 * `state.armedPersonalUsePlaneId` back to `null` — see aviation.ts's file
 * header for why the bonus is single-use-per-CALL rather than tied to the
 * plane's status persisting as `'personal'`, and why a stale/invalid pointer
 * (e.g. the armed plane was sold or reassigned before this trip) is a
 * silent, harmless no-op rather than an error.
 */

import { CITIES } from '../data/cities'
import { CONFIG } from '../config'
import type { GameState } from '../types'
import { calcFare, getTravelDays } from '../travel'
import { cargoUsed } from '../cargo'
import { advanceDay } from '../turnLoop'
import { createCityNightRng, nightProbabilityForTravelDays, rollIsNight } from '../cityBackground'

/**
 * Starts a trip from `state.currentCity` to `destinationCityId`.
 *
 * Computes `days = getTravelDays(state.currentCity, destinationCityId)` and
 * `cargoUsedPct = cargoUsed(state) / state.cargoCapacity`, then
 * `fare = calcFare(days, destinationCity.tier, cargoUsedPct)` (both reused
 * from T007/T011 — not reimplemented here). T063: if an Aviation
 * Personal-use plane is currently armed (`state.armedPersonalUsePlaneId`),
 * that plane's class bonus adjusts `days`/`cargoUsedPct`/the final fare
 * before any of the above — see file header's "T063 addition" section for
 * the exact formula and ordering.
 *
 * On success: returns a NEW `GameState` with `cash` reduced by exactly
 * `fare` and `state.travelInProgress` set to
 * `{ destinationCityId, daysRemaining: days, totalDays: days }`.
 * `state.currentCity` is left untouched — arrival happens via
 * `advanceTravelDay`, once `daysRemaining` reaches 0 (see file header).
 * `state.armedPersonalUsePlaneId` is unconditionally cleared to `null`
 * (T063 — the bonus, if any, is single-use).
 *
 * By design, travel is allowed even if `fare` exceeds `state.cash` — cash
 * is deducted unconditionally and may go negative. This is a deliberate
 * departure from `buy()`/`stay()`'s "reject on insufficient cash" rule,
 * per an explicit user request; it does not gate on `state.cash` at all.
 *
 * Rejected (returns the identical `state` reference, unchanged) when:
 *   - `destinationCityId` is not a known city in `CITIES`, or
 *   - a trip is already in progress (`state.travelInProgress !== null`).
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

  // T063: resolve the armed Personal-use plane's bonus, if any is currently
  // armed AND still valid (the plane exists and is still in 'personal'
  // status — a stale pointer, e.g. the plane was sold/reassigned since being
  // armed, is treated as "no bonus" rather than an error).
  const armedPlaneId = state.armedPersonalUsePlaneId ?? null
  const armedPlane = armedPlaneId
    ? (state.planes ?? []).find((p) => p.id === armedPlaneId && p.status === 'personal')
    : undefined
  const personalUseBonus = armedPlane ? CONFIG.aviation.classes[armedPlane.class].personalUse : null

  const baseDays = getTravelDays(state.currentCity, destinationCityId)
  const days = personalUseBonus ? Math.max(1, baseDays - personalUseBonus.travelDaysReduction) : baseDays

  // T063: Freighter/Widebody's cargo-capacity bonus only affects THIS
  // fare-doubling-threshold check (a bigger effective denominator makes the
  // >60%-used trigger less likely) — it never touches state.cargoCapacity
  // itself. `effectiveCargoCapacity` falls back to the real capacity (bonus
  // 0) for every other class/no-bonus case.
  const effectiveCargoCapacity = personalUseBonus
    ? state.cargoCapacity * (1 + personalUseBonus.cargoCapacityBonusPct)
    : state.cargoCapacity
  const cargoUsedPct = effectiveCargoCapacity > 0 ? cargoUsed(state) / effectiveCargoCapacity : 0

  const baseFare = calcFare(days, destinationCity.tier, cargoUsedPct)
  const fare = personalUseBonus ? baseFare * (1 - personalUseBonus.fareReductionPct) : baseFare

  // By design (user request): traveling is allowed even if the fare drives
  // cash negative — unlike buy()/stay(), which still reject on insufficient
  // cash. Cash is deducted unconditionally below.
  return {
    ...state,
    cash: state.cash - fare,
    travelInProgress: {
      destinationCityId,
      daysRemaining: days,
      totalDays: days,
    },
    // T063: single-use — cleared on every successful trip, whether or not a
    // valid bonus was actually found above (see file header).
    armedPersonalUsePlaneId: null,
  }
}

/**
 * Advances an in-progress trip (`state.travelInProgress`) by exactly one
 * day. Called once per day-tick while a trip is underway — see the
 * file-header design note for why this is a separate function from
 * `travel()`.
 *
 * Decrements `daysRemaining` by 1. When `daysRemaining` reaches 0, also sets
 * `state.currentCity` to the destination and clears `state.travelInProgress`
 * back to `null` — this is the moment of arrival. Either way, the resulting
 * state is then passed to `advanceDay` (T015), which owns the actual
 * day-increment, the day's full city+good price recompute, and net-worth
 * tracking — see the "UPDATED BY T015" file-header section above for why
 * this file no longer bumps `day`/touches `priceStates` inline itself.
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
    // Arrival — transition currentCity/travelInProgress FIRST, then hand off
    // to advanceDay (T015) so its "present city" price refresh sees the
    // destination as already arrived-at (see file header ordering note).
    //
    // T070: also roll this arrival's day/night background (cosmetic only —
    // see cityBackground.ts's file header), weighted by the trip's total
    // length. Rolled from `state.day` (the day BEFORE advanceDay bumps it)
    // as the RNG key, matching turnLoop.ts's own per-day-RNG convention —
    // every arrival lands on a distinct, reproducible draw.
    const arrived: GameState = {
      ...state,
      currentCity: trip.destinationCityId,
      travelInProgress: null,
      currentCityIsNight: rollIsNight(
        createCityNightRng(state.seed, `day:${state.day}`),
        nightProbabilityForTravelDays(trip.totalDays),
      ),
    }
    const afterDay = advanceDay(arrived)
    // User-requested (2026-08): stamp this arrival for the Travel screen's
    // "Last visited N days ago" summary, using the POST-advanceDay day so it
    // reads as "0 days ago" immediately on arrival (see types.ts's
    // `lastVisitedDayByCity` doc comment for why this can't be stamped
    // before advanceDay's day-increment).
    return {
      ...afterDay,
      lastVisitedDayByCity: {
        ...(afterDay.lastVisitedDayByCity ?? {}),
        [trip.destinationCityId]: afterDay.day,
      },
    }
  }

  const stillTraveling: GameState = {
    ...state,
    travelInProgress: {
      ...trip,
      daysRemaining,
    },
  }
  return advanceDay(stillTraveling)
}
