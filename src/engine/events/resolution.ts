/**
 * Event resolution engine — Trade Winds of Selvara.
 *
 * Design doc reference: §7 pipeline steps 3-5 —
 *   3. "Every rumor has a hidden truth flag..."
 *   4. "When the event date arrives, the event either fires (prices move per
 *      table) or fizzles."
 *   5. "The next day's paper always runs a resolution story explaining WHY"
 *      (T018's job, not built here — this file only produces the structured
 *      `EventResolution` records T018 will consume).
 *
 * Pure TypeScript, zero React imports (see /src/engine/README.md).
 * NEVER uses `Math.random` — every draw comes from the `Rng` passed in.
 *
 * ---------------------------------------------------------------------------
 * DESIGN — fire-vs-fizzle: reusing `hiddenTruth`, NOT a new independent roll
 * ---------------------------------------------------------------------------
 * §7 step 3 says the hidden truth flag is decided WHEN THE RUMOR IS CREATED
 * ("every rumor has a hidden truth flag"), and step 4 says resolution is
 * simply the moment that pre-decided truth becomes visible ("the event
 * either fires... or fizzles" — phrased as a reveal, not a fresh coin flip).
 * T016's `scheduleEvent` already draws `hiddenTruth` via
 * `CONFIG.events.eventFireProbability` at schedule time and stores it on the
 * `Event`. Rolling a SECOND independent random outcome at resolution time
 * would contradict the doc's own framing (a rumor could then be "hidden-true"
 * yet still fizzle for an unrelated second reason, which §7 never describes)
 * and would make `hiddenTruth` a partially-meaningless field. The
 * straightforward reading — and the one this file implements — is:
 *
 *     fired = event.hiddenTruth
 *
 * No new RNG draw is used for the fire/fizzle decision itself. `resolveEvent`
 * still accepts an `Rng` because, once an event is confirmed to FIRE, two
 * things that were deliberately left as ranges at schedule time (T016) need
 * a concrete value NOW: the actual duration (`durationDaysMin..Max`) and the
 * actual price multiplier (`multiplierMin..Max`). Both are resolved here, at
 * the moment the event actually fires, rather than at schedule time — this
 * matches the task brief's guidance that "resolving a concrete duration now,
 * when the event actually fires, is reasonable and keeps the 'how long does
 * an active effect last' decision close to when it's actually needed," and
 * extends the same reasoning to the multiplier (§6's `eventMultiplier` term
 * needs one concrete number, not a range, to multiply into a price). Both
 * values are drawn ONCE at resolution and then held fixed for the entire
 * active window — re-rolling either on every subsequent day would make an
 * event's effect wobble day-to-day in a way §7 never describes, and would
 * make the "measurably different from a control run" acceptance test flaky.
 *
 * ---------------------------------------------------------------------------
 * `Event` type additions (see ../types.ts) — all optional, backward
 * compatible with T016
 * ---------------------------------------------------------------------------
 * Three new OPTIONAL fields were added to the `Event` interface, all `?`
 * so T016's existing scheduling code (which never sets them) still compiles
 * and behaves identically:
 *   - `resolvedDurationDays?: number` — concrete duration drawn from
 *     `[durationDaysMin, durationDaysMax]` at resolution time. Only set when
 *     `fired === true`.
 *   - `activeUntilDay?: number` — `scheduledFireDay + resolvedDurationDays`;
 *     the event's price effect applies over the HALF-OPEN interval
 *     `[scheduledFireDay, activeUntilDay)`. Only set when `fired === true`.
 *   - `resolvedMultiplier?: number` — concrete multiplier drawn from
 *     `[multiplierMin, multiplierMax]` at resolution time; this is the exact
 *     number that feeds `computePrice`'s `PriceEventEffect.multiplier` (§6's
 *     `eventMultiplier` term). Only set when `fired === true`.
 * A fizzled event (`fired === false`) gets none of these three fields set —
 * there is no duration/multiplier to resolve for an event that never
 * happened, and `getActiveEventEffectsFor` below relies on their absence
 * (or on `fired !== true`) to correctly contribute NO price effect.
 *
 * ---------------------------------------------------------------------------
 * Two entry points
 * ---------------------------------------------------------------------------
 * - `resolveEvent(event, rng)` — resolves ONE event (assumes the caller
 *   already confirmed it's due). Pure, returns a new `Event`.
 * - `resolveDueEvents(state, rng)` — the day-tick-level entry point. Scans
 *   `state.activeEvents` for everything due `=== state.day` and not yet
 *   resolved, resolves each via `resolveEvent`, and returns both the updated
 *   `GameState` and an `EventResolution[]` (§7 step 5's raw material for
 *   T018's newspaper). Never touches already-resolved events, never touches
 *   events whose `scheduledFireDay` isn't exactly `state.day` (not-yet-due
 *   events are left completely alone, including a stray future event whose
 *   day simply hasn't arrived).
 *
 * ---------------------------------------------------------------------------
 * `getActiveEventEffectsFor` — the turnLoop.ts wiring helper
 * ---------------------------------------------------------------------------
 * Turns `state.activeEvents` into the `PriceEventEffect[]` shape
 * `computePrice` (T008) expects for one specific (city, good, day). An event
 * contributes an effect only when ALL of:
 *   - `fired === true` (fizzled or not-yet-resolved events never contribute),
 *   - `day` falls within `[scheduledFireDay, activeUntilDay)`,
 *   - `good.id` is in `affectedGoodIds`,
 *   - `scope` matches `city` — `global` matches every city, `city` matches
 *     only the named city id, `tier` matches every city of that tier.
 * Multiple simultaneously-active matching events all contribute (their
 * multipliers combine via `computePrice`'s own `resolveEventMultiplier`,
 * which multiplies every effect together — see priceEngine.ts).
 */

import type { City, Event, EventScope, GameState, Good } from '../types'
import type { PriceEventEffect } from '../priceEngine'
import type { Rng } from '../rng'

// ---------------------------------------------------------------------------
// resolveEvent — resolves ONE due event (fire-vs-fizzle + concrete
// duration/multiplier if fired).
// ---------------------------------------------------------------------------

/**
 * Resolves a single event that is due today. Does NOT check `scheduledFireDay`
 * or `resolved` itself — callers (`resolveDueEvents` below) are responsible
 * for only calling this on events that are actually due and not already
 * resolved. Pure function: returns a new `Event`, never mutates its argument.
 *
 * Fire-vs-fizzle: `fired = event.hiddenTruth` (see file header — no new RNG
 * draw for this decision). If fired, draws a concrete `resolvedDurationDays`
 * (uniform int in `[durationDaysMin, durationDaysMax]`) and
 * `resolvedMultiplier` (uniform float in `[multiplierMin, multiplierMax]`)
 * from the passed-in `rng`, and derives `activeUntilDay`. If fizzled, none
 * of those three fields are set (left `undefined`).
 */
export function resolveEvent(event: Event, rng: Rng): Event {
  const fired = event.hiddenTruth

  if (!fired) {
    return {
      ...event,
      resolved: true,
      fired: false,
    }
  }

  const resolvedDurationDays = rng.int(event.durationDaysMin, event.durationDaysMax)
  const resolvedMultiplier =
    event.multiplierMin + rng.next() * (event.multiplierMax - event.multiplierMin)

  return {
    ...event,
    resolved: true,
    fired: true,
    resolvedDurationDays,
    activeUntilDay: event.scheduledFireDay + resolvedDurationDays,
    resolvedMultiplier,
  }
}

// ---------------------------------------------------------------------------
// EventResolution — the per-resolved-event record T018 (newspaper) will
// later consume to generate "why it fired/fizzled" resolution stories.
// ---------------------------------------------------------------------------

/**
 * One resolved event's outcome, produced by `resolveDueEvents` for every
 * event that became due on the current day. T018 (not built yet) is
 * expected to turn each of these into exactly one resolution-story
 * `NewspaperStory` the FOLLOWING day (§7 step 5 — "non-negotiable").
 *
 * `event` is the event's fully resolved form (already carrying `resolved:
 * true`, `fired`, and — if fired — `resolvedDurationDays`/`activeUntilDay`/
 * `resolvedMultiplier`). `fired` is duplicated at the top level purely for
 * T018's convenience (avoids re-checking `event.fired !== null` — it's
 * always non-null here since this record only exists for events JUST
 * resolved this call).
 */
export interface EventResolution {
  event: Event
  fired: boolean
}

// ---------------------------------------------------------------------------
// resolveDueEvents — the day-tick-level entry point.
// ---------------------------------------------------------------------------

export interface ResolveDueEventsResult {
  /** `state` with `activeEvents` updated to include every due event's
   * resolved form (order preserved; unaffected events are the SAME object
   * references as in the input, since only due-and-unresolved entries are
   * replaced). */
  state: GameState
  /** One record per event resolved THIS call, in `state.activeEvents` order.
   * Empty array if nothing was due today. */
  resolutions: EventResolution[]
}

/**
 * Resolves every event in `state.activeEvents` that is due today and not
 * already resolved:
 *   - due today: `event.scheduledFireDay === state.day`
 *   - not already resolved: `!event.resolved`
 * Events that don't meet BOTH conditions are left completely untouched
 * (same object reference) — this covers both "not yet due" (a future
 * `scheduledFireDay`) and "already resolved" (calling this again on the same
 * day is always safe and a no-op for events it already resolved).
 *
 * Pure function: never mutates `state` or any `Event` in place; returns a
 * new `GameState` only when at least one event was actually resolved (if
 * nothing was due, `state` itself is returned unchanged, avoiding a
 * pointless new-object allocation on every ordinary day).
 */
export function resolveDueEvents(state: GameState, rng: Rng): ResolveDueEventsResult {
  const resolutions: EventResolution[] = []
  let anyResolved = false

  const nextActiveEvents = state.activeEvents.map((event) => {
    if (event.resolved || event.scheduledFireDay !== state.day) {
      return event
    }

    const resolvedEvent = resolveEvent(event, rng)
    resolutions.push({ event: resolvedEvent, fired: resolvedEvent.fired === true })
    anyResolved = true
    return resolvedEvent
  })

  if (!anyResolved) {
    return { state, resolutions }
  }

  return {
    state: { ...state, activeEvents: nextActiveEvents },
    resolutions,
  }
}

// ---------------------------------------------------------------------------
// getActiveEventEffectsFor — turns resolved+fired events into the
// PriceEventEffect[] shape computePrice (T008) expects, for one (city, good,
// day). This is what turnLoop.ts's advanceDay calls per city/good pair.
// ---------------------------------------------------------------------------

/** Whether an event's `scope` applies to `city` — `global` matches every
 * city, `city` matches only the named city id, `tier` matches every city of
 * that tier. */
function scopeMatchesCity(scope: EventScope, city: City): boolean {
  switch (scope.kind) {
    case 'global':
      return true
    case 'city':
      return scope.cityId === city.id
    case 'tier':
      return scope.tier === city.tier
  }
}

/**
 * Returns the list of `PriceEventEffect`s (just `{ multiplier }`) that
 * should apply to `city`+`good` on `day`, derived from `activeEvents`. An
 * event contributes an effect only when it has FIRED (`fired === true`),
 * has a resolved multiplier/active-window (i.e. it went through
 * `resolveEvent` and fired — fizzled or unresolved events never contribute),
 * `day` falls within its half-open active window
 * `[scheduledFireDay, activeUntilDay)`, `good.id` is one of its
 * `affectedGoodIds`, and its `scope` matches `city` (see
 * `scopeMatchesCity`). Multiple matching events all contribute — the caller
 * (`computePrice`) multiplies every effect together.
 *
 * Returns `[]` (neutral, no effect) if nothing matches — safe to pass
 * directly as `computePrice`'s `activeEvents` argument every day, whether or
 * not any event happens to be active.
 */
export function getActiveEventEffectsFor(
  city: City,
  good: Good,
  day: number,
  activeEvents: readonly Event[],
): PriceEventEffect[] {
  const effects: PriceEventEffect[] = []

  for (const event of activeEvents) {
    if (event.fired !== true) continue
    if (event.resolvedMultiplier === undefined || event.activeUntilDay === undefined) continue
    if (day < event.scheduledFireDay || day >= event.activeUntilDay) continue
    if (!event.affectedGoodIds.includes(good.id)) continue
    if (!scopeMatchesCity(event.scope, city)) continue

    effects.push({ multiplier: event.resolvedMultiplier })
  }

  return effects
}
