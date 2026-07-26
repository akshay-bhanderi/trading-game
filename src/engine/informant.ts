/**
 * Insider information / Informant system — Trade Winds of Selvara.
 *
 * Design doc reference: §7 "Insider information" —
 *   "Available in Medium+ bank cities via an Informant contact; best
 *   (cheapest per accuracy) in Novara Heights."
 *   "A tip = exact city, good, direction, and day. 70% accurate (75% in
 *   Novara)."
 *   "Price scales with net worth: max($500, 1% of net worth) per tip."
 *   "Resolution stories also cover insider tips ('your informant's
 *   warehouse-fire tip proved false — the fire was staged')."
 * Also §9 (bank size tiers — Medium+ gating reuses the same `BankSize`
 * ordering `takeLoan`/CA-hiring/aviation-purchase gating will each need).
 *
 * Pure TypeScript, zero React imports (see /src/engine/README.md).
 * NEVER uses `Math.random` — every draw comes from the `Rng` passed in.
 *
 * ---------------------------------------------------------------------------
 * File-collision-avoidance note (do NOT edit newspaper.ts from this file)
 * ---------------------------------------------------------------------------
 * T019 (fog of wealth) is concurrently making a small additive edit to
 * newspaper.ts's `buildRumorStory`/`buildFalseRumorStory`. To avoid stepping
 * on that in-flight change, this module does NOT touch newspaper.ts and does
 * NOT invent a parallel tip-tracking/resolution system. Instead,
 * `buyInformantTip` below reuses T016's `scheduleEvent` (events/eventEngine.ts)
 * to create a genuine `Event`, exactly as if the newspaper's own rumor
 * pipeline had scheduled it. That real `Event` is stored in `state.activeEvents`
 * like any other, so T017's `resolveDueEvents` will resolve it fire-vs-fizzle
 * on its own `scheduledFireDay` and T018's `generateDailyPaper` will produce
 * its resolution story the following morning through the EXISTING machinery
 * — no code path here needs to know how a resolution story gets built. This
 * is precisely what TASK.md's T020 entry means by "purchased tips resolve
 * through the same resolution-story mechanism as regular rumors (reuses
 * T017/T018)": the tip's underlying truth is carried entirely by the
 * `Event` object, not by anything private to this file.
 *
 * ---------------------------------------------------------------------------
 * DESIGN — Medium+ bank gating via an ordered `BANK_SIZE_RANK`, not a
 * hardcoded city-id list
 * ---------------------------------------------------------------------------
 * `isInformantAvailable` compares `BANK_SIZE_RANK[city.bankSize] >=
 * BANK_SIZE_RANK.Medium` rather than checking `state.currentCity` against a
 * literal `['port-vela', 'ironvale', 'silkden']` list. In v1's 8 cities that
 * happens to be exactly those three (all `bankSize: 'Medium'` — verified by
 * reading /src/engine/data/cities.ts: Farrow/Saltmere/Copperfell/Millbrook/
 * Greyharbor are all `'Small'`; Port Vela/Ironvale/Silkden are the only
 * `'Medium'` cities; no `'Large'`/`'Huge'` city exists in v1 at all), but the
 * ordered-rank approach means a future Tier 3/4 city with `bankSize: 'Large'`
 * or `'Huge'` (Auren City, Voltspire, The Freeport, Novara Heights — all
 * defined in the design doc, all out of v1 scope per §13) becomes
 * Informant-eligible automatically, with zero code change here.
 *
 * ---------------------------------------------------------------------------
 * DESIGN — Novara Heights' bonus accuracy: generic city-id check, not
 * special-cased elsewhere
 * ---------------------------------------------------------------------------
 * §7 says Novara Heights' tip accuracy is 75% instead of the generic 70%.
 * Novara Heights does not exist in v1's `CITIES` (Tier 4, out of scope per
 * §13), so this branch is UNREACHABLE in v1 and only the generic 70% base
 * ever applies in practice. The lookup is still written generically — a
 * plain `city?.id === NOVARA_HEIGHTS_CITY_ID` check against whatever city the
 * player is currently in — rather than threading a "isNovara" flag through
 * any other file, precisely per the task brief's instruction: a future Tier 4
 * addition just needs a `City` record with that id in `data/cities.ts`; nothing
 * in this file changes, and nothing throws or misbehaves in the meantime
 * because `Array.find` simply returns `undefined` for an id that isn't in v1's
 * data and the `?.` guards it safely.
 *
 * ---------------------------------------------------------------------------
 * DESIGN — return shape: `{ state, tip } | null`, deviating from the
 * established "identical-state-reference" rejection convention
 * ---------------------------------------------------------------------------
 * Every other action in this codebase (cargo.ts's `buyCargoUpgrade`,
 * actions/stay.ts's `stay`, etc.) signals rejection by returning the exact
 * same `state` object reference it was given, and success by returning a new
 * one — callers detect rejection via `result === state`. That convention
 * works because those functions only ever need to return a `GameState`.
 * `buyInformantTip` is different: on SUCCESS it must also hand back the
 * purchased `InformantTip` data (the hinted good/city/direction, whether the
 * hint is trustworthy, and the underlying `Event`) so the UI (T039's
 * Informant modal) can display it immediately — there is no state field where
 * "the tip the player just bought" naturally lives, since the whole point is
 * that its truth is only revealed later via the newspaper's resolution story.
 * A bare `GameState` return has nowhere to carry that. So this function
 * returns `{ state: GameState; tip: InformantTip } | null`: `null` on
 * rejection (gating fails or insufficient cash), the wrapped pair on success.
 * `null` is a clearer rejection signal here than "same reference" would be —
 * there's no previous "tip result" to compare against on a first call, so
 * reference-equality has nothing to be equal to. Every other engine
 * "purchase-and-return-data" style function in this codebase (e.g. T008's
 * `computePrice` returning `{ nextState, price }`) already returns a fresh
 * object on success; this just adds the standard TS `| null` idiom for the
 * failure case on top of that existing pattern.
 *
 * ---------------------------------------------------------------------------
 * DESIGN — the accuracy roll governs the TIP'S CONTENT, not the event's
 * fire/fizzle outcome
 * ---------------------------------------------------------------------------
 * These are two independent random draws over two different questions:
 *   1. `event.hiddenTruth` (drawn inside `scheduleEvent`, §7 step 3) decides
 *      whether the underlying event will actually FIRE or FIZZLE on its
 *      `scheduledFireDay` — exactly the same mechanism a free newspaper rumor
 *      already goes through (T016/T017). Buying a tip does not change this
 *      roll or make the event more likely to fire; the world doesn't care
 *      that the player paid for a preview of it.
 *   2. `accurateHint` (drawn here, via `rng.next() < calcTipAccuracy(state)`)
 *      decides whether the DISPLAYED hint — the exact good/city/direction the
 *      Informant tells the player right now — actually describes that same
 *      underlying event correctly, or is a deliberately WRONG decoy (a
 *      different, plausible good/city, and the opposite direction). This is
 *      the "70% accurate" number from §7, and it is what the doc's own
 *      example is about: "your informant's warehouse-fire tip proved false —
 *      the fire was staged" describes a tip whose CONTENT was accurate (it
 *      correctly named the real scheduled event) but whose underlying event
 *      then fizzled — i.e. `accurateHint === true` while `event.hiddenTruth
 *      === false`. The two rolls are orthogonal on purpose: a trustworthy tip
 *      can point at an event that fizzles anyway (the informant told the
 *      truth about what was PLANNED, not a guarantee it happens), and an
 *      untrustworthy tip can happen to still point near an event that fires
 *      for unrelated reasons. Nothing in this file ever lets one roll leak
 *      into the other.
 */

import { CITIES } from './data/cities'
import { GOODS } from './data/goods'
import { CONFIG } from './config'
import { calcNetWorth } from './netWorth'
import { scheduleEvent } from './events/eventEngine'
import type { Rng } from './rng'
import type { BankSize, CityId, Event, EventScope, GameState, GoodId } from './types'

// ---------------------------------------------------------------------------
// Ordered bank-size rank — generalizes "Medium+" to Large/Huge automatically.
// ---------------------------------------------------------------------------

const BANK_SIZE_RANK: Record<BankSize, number> = {
  Small: 0,
  Medium: 1,
  Large: 2,
  Huge: 3,
}

/** Novara Heights' city id, per §4's Tier 4 table — does not exist in v1's
 * `CITIES` (§13). Named here (not inlined as a magic string) so its one use
 * site below is self-documenting. */
const NOVARA_HEIGHTS_CITY_ID: CityId = 'novara-heights'

// ---------------------------------------------------------------------------
// isInformantAvailable
// ---------------------------------------------------------------------------

/**
 * True only when the player's current city has a Medium-or-larger bank
 * (`'Medium' | 'Large' | 'Huge'`), per §7 ("Available in Medium+ bank
 * cities"). Compares `BANK_SIZE_RANK` ordinals rather than a hardcoded city
 * id list — see file header. Returns `false` (never throws) if
 * `state.currentCity` isn't found in `CITIES` at all.
 */
export function isInformantAvailable(state: GameState): boolean {
  const city = CITIES.find((c) => c.id === state.currentCity)
  if (!city) return false
  return BANK_SIZE_RANK[city.bankSize] >= BANK_SIZE_RANK.Medium
}

// ---------------------------------------------------------------------------
// calcTipPrice
// ---------------------------------------------------------------------------

/**
 * §7: "Price scales with net worth: max($500, 1% of net worth) per tip."
 * Reuses T009's `calcNetWorth` and T003's config constants — neither the
 * $500 floor nor the 1% rate is redefined here.
 */
export function calcTipPrice(state: GameState): number {
  return Math.max(
    CONFIG.events.insider.tipPriceFloor,
    CONFIG.events.insider.tipPricePctOfNetWorth * calcNetWorth(state),
  )
}

// ---------------------------------------------------------------------------
// calcTipAccuracy
// ---------------------------------------------------------------------------

/**
 * §7: base tip accuracy is 70% (75% in Novara Heights — unreachable in v1,
 * see file header), plus §3's difficulty `rumorAccuracyBonus` (+0.15 Noob,
 * 0 Pro, -0.10 Expert) added on top.
 *
 * Clamp: the raw sum is clamped to `[0, 1]` since it's used directly as a
 * probability in `buyInformantTip`'s `rng.next() < accuracy` roll — an
 * unclamped value could theoretically exceed 1 (always accurate, fine on its
 * own but not a valid probability to reason about) or, with a hypothetical
 * future difficulty/city combination, dip below 0 (never accurate) or even
 * negative (which `rng.next() < accuracy` would silently treat as "always
 * false" anyway, but clamping makes that intent explicit rather than
 * incidental). With v1's actual numbers (0.7 or 0.75 base, ±0.15/0/-0.10
 * difficulty bonus) the result always naturally falls within `[0.6, 0.9]`,
 * so the clamp never actually engages today — it exists purely as a
 * documented safety bound for future tuning (T029's balance pass).
 */
export function calcTipAccuracy(state: GameState): number {
  const city = CITIES.find((c) => c.id === state.currentCity)
  const isNovara = city?.id === NOVARA_HEIGHTS_CITY_ID
  const baseAccuracy = isNovara
    ? CONFIG.events.insider.novaraBonusAccuracy
    : CONFIG.events.insider.baseAccuracy

  const difficultyBonus = CONFIG.difficulty[state.difficulty].rumorAccuracyBonus

  const raw = baseAccuracy + difficultyBonus
  return Math.min(1, Math.max(0, raw))
}

// ---------------------------------------------------------------------------
// buyInformantTip
// ---------------------------------------------------------------------------

export interface InformantTip {
  /** The genuine scheduled `Event` this tip is about — reuses T016's
   * `scheduleEvent` so it resolves fire-vs-fizzle and gets a resolution
   * story through the SAME machinery a free newspaper rumor uses (T017/T018).
   * See file header. */
  event: Event
  /** Whether the hinted fields below (`hintedGoodId`/`hintedCityId`/
   * `hintedDirection`) truthfully describe `event`, drawn via
   * `rng.next() < calcTipAccuracy(state)`. Independent of `event.hiddenTruth`
   * — see file header's "accuracy roll vs fire/fizzle" section. */
  accurateHint: boolean
  hintedGoodId: GoodId
  hintedCityId: CityId
  hintedDirection: 'up' | 'down'
}

export interface BuyInformantTipResult {
  state: GameState
  tip: InformantTip
}

/** Picks one good from `GOODS` that is NOT `excludeGoodId` (used to build a
 * plausible-but-wrong decoy hint). Falls back to `excludeGoodId` itself only
 * in the degenerate case where `GOODS` has a single entry (never true in v1's
 * 9-good data, but kept defensive). */
function pickDifferentGood(excludeGoodId: GoodId, rng: Rng): GoodId {
  const candidates = GOODS.filter((g) => g.id !== excludeGoodId)
  const pool = candidates.length > 0 ? candidates : GOODS
  return rng.pick(pool).id
}

/** Picks one city from `CITIES` that is NOT `excludeCityId` (decoy hint). */
function pickDifferentCity(excludeCityId: CityId, rng: Rng): CityId {
  const candidates = CITIES.filter((c) => c.id !== excludeCityId)
  const pool = candidates.length > 0 ? candidates : CITIES
  return rng.pick(pool).id
}

/**
 * Derives the single "exact city" a truthful tip would name for `scope`.
 * `Event.scope` isn't always a single city (`'global'`/`'tier'` are valid
 * scopes for several base event types, per eventTable.ts), but §7 says a tip
 * always names one exact city — so when the underlying event's real scope is
 * broader than one city, one concrete city consistent with that scope is
 * picked via the RNG (any city of the matching tier, or any city at all for
 * a global event). Documented design decision: this is necessary because
 * `EventScope` doesn't collapse to a single city on its own; the Informant is
 * simply reporting "the city where you'd feel this first," a reasonable
 * flavor reading of a global/regional event.
 */
function resolveHintCityId(scope: EventScope, rng: Rng): CityId {
  switch (scope.kind) {
    case 'city':
      return scope.cityId
    case 'tier': {
      const citiesInTier = CITIES.filter((c) => c.tier === scope.tier)
      const pool = citiesInTier.length > 0 ? citiesInTier : CITIES
      return rng.pick(pool).id
    }
    case 'global':
      return rng.pick(CITIES).id
  }
}

/** Derives the "true" direction implied by an event's (already-concrete,
 * single-direction — see eventEngine.ts's `resolveMultiplierRange`, which
 * picks increase-vs-decrease at schedule time for dual-direction types like
 * Government tariff) `multiplierMin`/`multiplierMax` range: >= 1 reads as
 * 'up' (a price increase), < 1 reads as 'down'. Uses the range's midpoint so
 * it's well-defined even for a (hypothetical) range spanning both sides. */
function resolveTrueDirection(event: Event): 'up' | 'down' {
  const mid = (event.multiplierMin + event.multiplierMax) / 2
  return mid >= 1 ? 'up' : 'down'
}

/**
 * Purchases one Informant tip in the player's current city.
 *
 * Validates, in order:
 *   1. `isInformantAvailable(state)` — Medium+ bank city required.
 *   2. `state.cash >= calcTipPrice(state)` — sufficient cash.
 * Returns `null` (no mutation) if either check fails — see file header for
 * why `null` is used here instead of the identical-state-reference
 * convention used by simpler actions elsewhere in this codebase.
 *
 * On success:
 *   - deducts `calcTipPrice(state)` from cash,
 *   - schedules a genuine new `Event` via T016's `scheduleEvent` (this IS the
 *     tip's subject — it will resolve fire-vs-fizzle and get a resolution
 *     story through the existing T017/T018 machinery on its own
 *     `scheduledFireDay`, completely unmodified by anything in this file),
 *   - derives that event's "true" good/city/direction,
 *   - rolls `accurateHint` via `calcTipAccuracy(state)`,
 *   - if accurate: the returned hint fields equal the true values,
 *   - if inaccurate: the returned hint fields are a plausible-but-wrong
 *     decoy — a different good, a different city, and the opposite
 *     direction (see file header's "accuracy roll vs fire/fizzle" section).
 *
 * Returns `{ state, tip }` where `state` already reflects both the cash
 * deduction and the newly scheduled event (i.e. it's the same `updatedState`
 * `scheduleEvent` produced, layered on top of the post-payment state).
 */
export function buyInformantTip(state: GameState, rng: Rng): BuyInformantTipResult | null {
  if (!isInformantAvailable(state)) {
    return null
  }

  const price = calcTipPrice(state)
  if (state.cash < price) {
    return null
  }

  const afterPayment: GameState = {
    ...state,
    cash: state.cash - price,
  }

  const { event, updatedState } = scheduleEvent(afterPayment, rng)

  const trueGoodId =
    event.affectedGoodIds.length > 0 ? rng.pick(event.affectedGoodIds) : rng.pick(GOODS).id
  const trueCityId = resolveHintCityId(event.scope, rng)
  const trueDirection = resolveTrueDirection(event)

  const accuracy = calcTipAccuracy(state)
  const accurateHint = rng.next() < accuracy

  const hintedGoodId = accurateHint ? trueGoodId : pickDifferentGood(trueGoodId, rng)
  const hintedCityId = accurateHint ? trueCityId : pickDifferentCity(trueCityId, rng)
  const hintedDirection = accurateHint ? trueDirection : trueDirection === 'up' ? 'down' : 'up'

  const tip: InformantTip = {
    event,
    accurateHint,
    hintedGoodId,
    hintedCityId,
    hintedDirection,
  }

  return { state: updatedState, tip }
}
