/**
 * Turn loop / day-advance engine — Trade Winds of Selvara.
 *
 * Design doc reference:
 *   §2  — core loop: each day the player may trade/bank, then ends the day
 *         with either Travel or Stay.
 *   §17 — build step 3: "Turn loop: travel/stay/trade actions, headless."
 *         This is the "headless in Node" checkpoint the whole project's
 *         architecture depends on (§17: "The engine must run headless in
 *         Node for the §11 bot harness") — see turnLoop.test.ts's 100-day
 *         run for the acceptance test.
 *
 * Pure TypeScript, zero React imports (see /src/engine/README.md).
 *
 * ---------------------------------------------------------------------------
 * `advanceDay` — the single function every day-advancing action funnels
 * through
 * ---------------------------------------------------------------------------
 * `advanceDay(state: GameState): GameState` does exactly three things, IN
 * THIS ORDER:
 *   1. Increments `state.day` to `newDay = state.day + 1`.
 *   2. Recomputes every city x good price FOR `newDay` (via T008's
 *      `computePrice`) and stores each pair's `nextState` back into
 *      `priceStates[city.id][good.id]`.
 *   3. Updates net worth / peak net worth (via T009's `updatePeakNetWorth`),
 *      so cargo valuation reflects the NEW day's prices, not the old ones.
 *
 * ---------------------------------------------------------------------------
 * ARCHITECTURAL DECISION — day-increment-then-recompute sequencing
 * ---------------------------------------------------------------------------
 * The day is incremented FIRST, then prices are computed for that
 * already-incremented `newDay` value. Prices are indexed by day (T008's
 * `computePrice(city, good, day, ...)` takes the day whose price is being
 * asked for), so "day N's price" and "the day counter reads N" should always
 * agree — computing for `state.day` (the OLD day) and only incrementing
 * afterward would leave `state.priceStates` one day stale relative to
 * `state.day` for exactly one step every call, which is a subtle, easy-to-
 * misuse footgun for anything reading both fields together (e.g. the
 * Newspaper/Travel screens' staleness-age display, `currentDay - lastSeenDay`,
 * later tasks). Doing day-increment first avoids that class of off-by-one
 * bug entirely, at the cost of nothing (this function owns both steps, so
 * there is no way to observe the intermediate state from outside).
 *
 * ---------------------------------------------------------------------------
 * ARCHITECTURAL DECISION — RNG threading: option (b), self-contained,
 * per-day derived sub-seed (no live `Rng` object threaded through callers)
 * ---------------------------------------------------------------------------
 * `GameState` only stores a `seed: number` (RNG instances aren't
 * serializable, so they can't live in `GameState` itself — see priceEngine.ts's
 * own architecture note for why `computePrice` splits "seed" from "rng" the
 * way it does). `advanceDay` needs *some* `Rng` instance to hand to
 * `computePrice` for each city/good's daily noise draw. Two options existed:
 *   (a) thread a live `Rng` as a second parameter, owned/persisted by the
 *       caller across every `advanceDay` call in a run, or
 *   (b) derive a FRESH `Rng` internally, once per call, seeded by hashing
 *       `(state.seed, newDay)` together — fully self-contained, no external
 *       object to keep alive or thread through.
 *
 * Option (b) is used here. Rationale:
 *   - `advanceDay`'s signature stays exactly `(state) => state` — the single
 *     cleanest shape for the turn-loop's callers (stay.ts, travel.ts, the
 *     bot harness T028, and this task's own 100-day headless test) to use.
 *     None of them need to create, own, or thread an `Rng` object through
 *     dozens of call sites.
 *   - It is still fully deterministic and reproducible (required by §6):
 *     the SAME `(state.seed, newDay)` pair always hashes to the SAME
 *     sub-seed, which always produces the SAME sequence of `.next()` draws
 *     when consumed in the SAME order. Since a single day's price recompute
 *     always iterates `CITIES` x `GOODS` in the same fixed array order
 *     (see below), replaying a run from its saved seed reproduces byte-
 *     identical prices every time, independent of anything that happened on
 *     OTHER days (each day's noise draws are sourced from a seed hash that
 *     depends only on that day's own number, not on how many draws prior
 *     days happened to consume).
 *   - This is the same "hash `(seed, ...identifying parts)` into a local
 *     sub-seed" technique `priceEngine.ts` already uses internally for its
 *     own structurally-stable picks (cityModifier, trend period/phase) — see
 *     `hashStringToUint32`/`deriveSubSeed` there. That function isn't
 *     exported (it's file-private plumbing), so a small equivalent is
 *     duplicated here rather than reaching into priceEngine's internals;
 *     the duplication is intentionally tiny (a dozen lines) and follows the
 *     exact same well-known FNV-1a algorithm, so there's no risk of the two
 *     copies drifting apart in a way that matters.
 *
 * If a future task needs cross-day RNG continuity for something OTHER than
 * price noise (events scheduling, bot decisions, etc. — T016+), those are
 * expected to own and thread their own `Rng` instances the way `computePrice`
 * already documents; this file's per-day derivation is scoped ONLY to the
 * daily price-noise draw.
 *
 * ---------------------------------------------------------------------------
 * ARCHITECTURAL DECISION — the §6 "never leak live remote prices" invariant
 * ---------------------------------------------------------------------------
 * `computePrice` (T008) does NOT itself refresh `lastSeenPrice`/`lastSeenDay`
 * to the newly computed price/day on every call — by its own design, it only
 * carries `previousState.lastSeenPrice`/`lastSeenDay` FORWARD unchanged
 * (falling back to the fresh price/day only when there is no previous state
 * at all, i.e. the very first computation ever done for that city+good
 * pair). Refreshing "the city the player is actually standing in right now"
 * to a live price is therefore explicitly THIS file's job, not T008's — see
 * `computePrice`'s own doc comment: "`nextState` ... Persist this and pass it
 * back in ... trend continuity + mean-reversion memory" — it says nothing
 * about staleness refresh, because that's a day-tick / turn-loop concern.
 *
 * The rule this file enforces:
 *   - `state.currentCity`'s `PriceState` entries have `lastSeenPrice`/
 *     `lastSeenDay` OVERWRITTEN to the fresh `price`/`newDay` every day —
 *     but ONLY when the player is actually PRESENT there, i.e.
 *     `state.travelInProgress === null` at the moment `advanceDay` runs
 *     (see the next paragraph for why this extra condition matters).
 *   - Every OTHER city's `PriceState` entries keep whatever `lastSeenPrice`/
 *     `lastSeenDay` they already had — `computePrice`'s own carry-forward
 *     behavior already guarantees this by default, so this file simply does
 *     NOT override it for non-current cities. Their `currentPrice` field
 *     still advances internally every day (continuing the trend/mean-
 *     reversion walk under the hood) — but that's a hidden internal detail
 *     the player never sees; nothing in this file (or in any UI code, once
 *     built) may read a non-current city's `currentPrice`. Only
 *     `lastSeenPrice`/`lastSeenDay` are ever safe to surface for a city the
 *     player isn't standing in.
 *
 * KNOWN EDGE CASE — the very first-ever computation for a city+good pair:
 * `computePrice` (T008) itself falls back to `lastSeenPrice: price` /
 * `lastSeenDay: day` whenever `previousState` is `undefined` (i.e. the very
 * first time that exact city+good pair is ever computed — see T008's own
 * `nextState` construction) — this fallback applies REGARDLESS of whether
 * that city happens to be `state.currentCity`. Under this file's "compute
 * every city x every good, every day, from day 1" approach (see below), that
 * means on the FIRST-ever `advanceDay` call of a run, every city's every
 * good gets an initial `lastSeenPrice`/`lastSeenDay` seeded to that first
 * day's freshly-generated value, even for cities the player has never set
 * foot in. This is a harmless, documented quirk rather than a live-remote-
 * price leak in the sense §6 cares about: it's a one-time "the world's
 * price texture starts existing on day 1" seed, not the player watching a
 * price tick in real time while standing somewhere else. The invariant that
 * actually matters — that a non-current city's `lastSeenPrice`/`lastSeenDay`
 * never CHANGES again once that initial value is seeded, i.e. it stays
 * frozen at whatever it was on day 1 until the player actually visits — is
 * fully enforced from day 2 onward by the logic below, and is what
 * turnLoop.test.ts verifies directly.
 *
 * WHY the extra `travelInProgress === null` condition, beyond just
 * "`city.id === state.currentCity`": while a multi-day trip is under way,
 * `state.currentCity` is deliberately left pointing at the ORIGIN city for
 * the entire duration of the trip (T013's `travel`/`advanceTravelDay` design
 * — `currentCity` only flips to the destination on the arrival day). If this
 * file refreshed "whatever city `currentCity` currently says" unconditionally,
 * the ORIGIN city's prices would keep refreshing to live values on every
 * transit day even though the player has physically left and can no longer
 * observe them — directly violating §6 and contradicting T013's own test
 * ("traveling 2 days leaves the origin city's prices frozen at last-seen
 * values"). Gating the refresh on `travelInProgress === null` means: no
 * refresh happens on ANY transit day (correctly freezing the origin for the
 * whole trip), and the destination's refresh naturally kicks in on the
 * arrival day, because `advanceTravelDay` (see actions/travel.ts) updates
 * `currentCity` to the destination AND clears `travelInProgress` back to
 * `null` BEFORE calling into this file's logic for that day.
 *
 * ---------------------------------------------------------------------------
 * ARCHITECTURAL DECISION — recompute ALL cities x ALL goods, every day,
 * regardless of unlock status
 * ---------------------------------------------------------------------------
 * The task brief explicitly allows either "every city/every unlocked good"
 * or "just all of them, simpler". This file computes prices for every
 * `CITIES` x every `GOODS` pair unconditionally, every day. Rationale:
 *   - It's simpler: no dependency on T010's unlock-checking logic, and no
 *     risk of a locked-then-later-unlocked good having a weird "day 1 of its
 *     own price history starts on whatever day it unlocked" discontinuity —
 *     every good's price has been walking its trend/mean-reversion since day
 *     1, exactly like every good the player could see from the start.
 *   - It's cheap: 8 cities x 9 goods = 72 `computePrice` calls per day, and
 *     the price engine's structurally-stable picks (cityModifier, trend
 *     period/phase) are already memoized internally (see priceEngine.ts).
 *   - It matches "just compute everything, gating what the UI/other systems
 *     are ALLOWED to read" — the same philosophy already used for the
 *     staleness invariant above (a locked good's price state existing
 *     internally is harmless as long as nothing surfaces it before it's
 *     unlocked; that gating is T010/UI's job, not this file's).
 *
 * ---------------------------------------------------------------------------
 * `activeEvents` — wired in T017
 * ---------------------------------------------------------------------------
 * Two things happen here now, both from `events/resolution.ts` (T017):
 *   1. Before computing ANY prices for `newDay`, `resolveDueEvents` is
 *      called against a state whose `day` is already `newDay` — this
 *      resolves (fire-vs-fizzle, per §7 step 4) every event whose
 *      `scheduledFireDay === newDay` and isn't already resolved. Doing this
 *      FIRST means an event due today already has its `fired`/
 *      `resolvedMultiplier`/`activeUntilDay` fields populated in time for
 *      THIS SAME day's price computation below — not one day late.
 *   2. For each city/good pair, `getActiveEventEffectsFor(city, good,
 *      newDay, activeEvents)` looks up every currently-fired event whose
 *      active window covers `newDay` and whose `scope`/`affectedGoodIds`
 *      match that pair, turning them into the `PriceEventEffect[]` passed as
 *      `computePrice`'s 7th argument (previously always left unset/neutral).
 *
 * A separate, independently-derived RNG stream (`createEventResolutionRng`,
 * same `(seed, day)`-hash technique as `createDayRng` below but with its own
 * purpose tag) is used for event resolution's duration/multiplier draws,
 * rather than reusing the same `rng` instance that feeds the per-city/good
 * price-noise loop. This keeps the two concerns decoupled: the number of
 * RNG draws event resolution happens to consume on a given day (0, 1, or
 * several, depending how many events are due) never shifts which noise
 * values any city/good pair's `computePrice` call draws that day, and vice
 * versa — each stream is deterministic purely from `(seed, day)`,
 * independent of the other.
 *
 * `resolveDueEvents`'s second return value (`resolutions:
 * EventResolution[]`) is intentionally NOT threaded any further by this
 * file — `GameState` has no field yet to hold "pending resolution stories"
 * (that lands with T018's newspaper engine, which is expected to either
 * call `resolveDueEvents` itself or have `advanceDay` extended to surface
 * it once a home for it exists on `GameState`). Discarding it here is safe:
 * the only durable, game-state-visible effect of a resolution — the
 * resolved `Event` (with `resolved`/`fired`/`resolvedDurationDays`/
 * `activeUntilDay`/`resolvedMultiplier` set) — is already persisted via
 * `state.activeEvents`, which IS threaded through.
 *
 * ---------------------------------------------------------------------------
 * Integration with Stay/Travel (T013/T014) — option (a): funnel through
 * `advanceDay`
 * ---------------------------------------------------------------------------
 * `stay()` (actions/stay.ts) and `advanceTravelDay()` (actions/travel.ts)
 * used to increment `state.day` inline themselves (T013/T014's original,
 * pre-turn-loop implementation, written before this file existed). Both are
 * now modified to call `advanceDay` instead of bumping `day` directly, so
 * ALL day-advancement funnels through this one function — otherwise price
 * recompute and net-worth tracking would simply never happen on a day the
 * player chose to Stay or Travel, which would be a glaring hole (most days
 * in a real run end with exactly one of those two actions). Concretely:
 *   - `stay()` still validates cash and deducts the nightly rate itself
 *     (unchanged), then returns `advanceDay(stateAfterPayment)` instead of
 *     `{ ...state, day: state.day + 1 }`.
 *   - `advanceTravelDay()` still owns the travel-specific state transition
 *     (decrementing `daysRemaining`, and on arrival flipping `currentCity` +
 *     clearing `travelInProgress`), then returns `advanceDay(...)` on that
 *     already-transitioned state instead of bumping `day` itself.
 * See each file's own updated doc comments for the full detail.
 */

import { CITIES } from './data/cities'
import { GOODS } from './data/goods'
import { computePrice } from './priceEngine'
import { createRng } from './rng'
import { updatePeakNetWorth } from './netWorth'
import { getActiveEventEffectsFor, resolveDueEvents } from './events/resolution'
import type { GameState, GoodId, PriceState } from './types'

// ---------------------------------------------------------------------------
// Per-day RNG derivation (see the architectural-decision comment above).
// Same tiny FNV-1a technique priceEngine.ts uses internally for its own
// stable-pick sub-seeds; duplicated here since that helper isn't exported.
// ---------------------------------------------------------------------------

function hashStringToUint32(str: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** Fresh `Rng`, deterministic per `(seed, day)` — see file header. */
function createDayRng(seed: number, day: number) {
  return createRng(hashStringToUint32(`${seed}:turnLoopDay:${day}`))
}

/** Fresh `Rng` for T017's event-resolution draws (duration/multiplier),
 * deterministic per `(seed, day)` but on a stream independent of
 * `createDayRng`'s price-noise stream — see file header. */
function createEventResolutionRng(seed: number, day: number) {
  return createRng(hashStringToUint32(`${seed}:turnLoopEventResolution:${day}`))
}

/**
 * Advances the game by exactly one day:
 *   1. Increments `state.day`.
 *   2. Recomputes every city x good price for the new day (T008), refreshing
 *      `lastSeenPrice`/`lastSeenDay` ONLY for `state.currentCity`'s entries,
 *      and ONLY when the player is actually present there (not mid-travel) —
 *      see the file header's "never leak live remote prices" section.
 *   3. Updates net worth / peak net worth (T009), using the just-refreshed
 *      prices.
 *
 * Pure function: returns a NEW `GameState`; never mutates its argument.
 * Never throws (there is no "rejection" case for advancing a day — this is
 * not a player-initiated action with validation, unlike buy/sell/travel/stay).
 */
export function advanceDay(state: GameState): GameState {
  const newDay = state.day + 1
  const rng = createDayRng(state.seed, newDay)

  // T017: resolve any event due TODAY (newDay) before computing prices, so
  // its fired-vs-fizzled outcome (and, if fired, its concrete
  // duration/multiplier) is available for THIS SAME day's price computation
  // below — see file header. `resolveDueEvents` checks `scheduledFireDay ===
  // state.day`, so the state passed in must already carry `day: newDay`.
  const eventResolutionRng = createEventResolutionRng(state.seed, newDay)
  const { state: stateAfterEvents } = resolveDueEvents({ ...state, day: newDay }, eventResolutionRng)

  // Only refresh the "physically present" city's staleness fields when the
  // player isn't mid-travel — see file header for why this extra condition
  // (beyond just "is this the current city") is required.
  const isPresent = stateAfterEvents.travelInProgress === null

  const newPriceStates: Record<string, Record<GoodId, PriceState>> = {}

  for (const city of CITIES) {
    const cityPriceStates: Record<GoodId, PriceState> = {}
    const previousCityStates = state.priceStates[city.id]

    for (const good of GOODS) {
      const previousState = previousCityStates?.[good.id]
      const eventEffects = getActiveEventEffectsFor(city, good, newDay, stateAfterEvents.activeEvents)
      const { nextState, price } = computePrice(
        city,
        good,
        newDay,
        state.seed,
        rng,
        previousState,
        eventEffects,
      )

      const isPresentHere = isPresent && city.id === stateAfterEvents.currentCity
      cityPriceStates[good.id] = isPresentHere
        ? { ...nextState, lastSeenPrice: price, lastSeenDay: newDay }
        : nextState
    }

    newPriceStates[city.id] = cityPriceStates
  }

  const advanced: GameState = {
    ...stateAfterEvents,
    day: newDay,
    priceStates: newPriceStates,
  }

  return updatePeakNetWorth(advanced)
}
