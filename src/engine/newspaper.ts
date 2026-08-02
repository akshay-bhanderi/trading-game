/**
 * Newspaper generation pipeline — Trade Winds of Selvara.
 *
 * Design doc reference:
 *   §7 — the full pipeline: "Each morning's paper carries 2-4 items:
 *   scheduled-event rumors, filler news, and deliberate false rumors"
 *   (step 2), source styling wire~80%/gossip~50% (step 3), and — the
 *   "Non-negotiable feature" — "the next day's paper always runs a
 *   resolution story explaining WHY" an event fired or fizzled (step 5).
 *   §4 — "A newspaper headline announces each unlock" (e.g. "Trade routes to
 *   Port Vela now open to licensed merchants!").
 *
 * Pure TypeScript, zero React imports (see /src/engine/README.md).
 * NEVER uses `Math.random` — every draw comes from the `Rng` passed in.
 *
 * ---------------------------------------------------------------------------
 * DESIGN — surfacing "yesterday's resolutions": GameState.pendingResolutions
 * ---------------------------------------------------------------------------
 * T017's `resolveDueEvents` (events/resolution.ts) already produces an
 * `EventResolution[]` every time an event becomes due, but T015's
 * `turnLoop.ts` used to discard that return value entirely (see its own,
 * now-updated, doc comment). This file needs to know, on any given day,
 * exactly which events resolved on some PRIOR day so it can print EXACTLY
 * one resolution story per resolved event, the day AFTER it resolved (never
 * the same day — §7 step 5 says "the NEXT day's paper").
 *
 * Chosen approach — option (b) from the task brief: `GameState` gains a new
 * optional field, `pendingResolutions` (see types.ts's own doc comment on
 * that field for the full rationale), which `turnLoop.ts`'s `advanceDay` now
 * APPENDS every day's freshly resolved events onto (never removes from —
 * draining is this file's job). `generateDailyPaper` is the sole consumer:
 * on every call it partitions `state.pendingResolutions` into
 *   - "ready" entries (`event.scheduledFireDay < state.day`, i.e. resolved
 *     on some day strictly BEFORE today) — each becomes exactly one
 *     resolution `NewspaperStory` today, and is then removed from the queue
 *     (never generates a second story on a later call), and
 *   - "still pending" entries (`event.scheduledFireDay >= state.day`, i.e.
 *     resolved TODAY) — held back untouched for tomorrow's call.
 * This is what produces the required one-day lag using nothing but a plain
 * state field read directly, with no separate "yesterday" snapshot needed:
 * an event resolved during the transition INTO day D sits in the queue,
 * unreported, through day D's own `generateDailyPaper` call (D < D is
 * false), and is finally reported the first time `generateDailyPaper` runs
 * for any day > D. This also makes the pipeline robust to
 * `generateDailyPaper` occasionally not being called on some day (e.g. a
 * skipped test tick) — entries just accumulate harmlessly and are still
 * each reported exactly once, whenever the next call happens to land on a
 * day after they resolved. This is the guarantee the T018 acceptance test
 * requires: exact 1:1 correspondence, no event ever missed, no event ever
 * double-reported.
 *
 * ---------------------------------------------------------------------------
 * DESIGN — tracking which scheduled events have already had a rumor printed
 * ---------------------------------------------------------------------------
 * Bucket 2 (scheduled-event rumors) must not re-announce the same
 * not-yet-due event in every single day's paper. `Event` gains an optional
 * `rumorAnnounced?: boolean` flag (types.ts) — set to `true` on the returned
 * state's copy of any event chosen for a rumor story this call. Candidates
 * for bucket 2 are exactly the events in `state.activeEvents` that are
 * `!resolved && scheduledFireDay > state.day && !rumorAnnounced`.
 *
 * ---------------------------------------------------------------------------
 * DESIGN — total story count: resolution stories + unlock headlines are
 * ALWAYS included, ADDITIONAL to a random 2-4 discretionary items
 * ---------------------------------------------------------------------------
 * §7 step 2's "2-4 items" most naturally describes the discretionary mix of
 * rumors/filler/false-rumors — the pipeline's actual guesswork content.
 * Resolution stories (§7 step 5: "non-negotiable... ALWAYS runs") and
 * unlock headlines (§4: "a newspaper headline announces EACH unlock" — not
 * "if there's room") are both things that GENUINELY HAPPENED and must never
 * be dropped to make room for the discretionary count, nor counted against
 * it. So: `stories.length === resolutionStories.length + unlockStories.length
 * + discretionaryCount`, where `discretionaryCount` alone is drawn from
 * `[CONFIG.events.storiesPerDayMin, storiesPerDayMax]` (2-4). A quiet day
 * with nothing resolved/unlocked still reads as a normal 2-4-story paper;
 * a busy day with 2 resolutions and 1 unlock reads as a bigger, 2+1+[2-4]
 * story paper — which doesn't contradict §7's "carries 2-4 items" phrasing
 * once that phrasing is understood to describe the discretionary portion.
 *
 * ---------------------------------------------------------------------------
 * DESIGN — sourceStyle assignment (wire ~80% / gossip ~50% accurate)
 * ---------------------------------------------------------------------------
 * Every story gets a `sourceStyle` so the UI (T039) can render wire vs.
 * gossip distinctly. For rumor/filler/false-rumor stories, the style itself
 * is picked 50/50 via the RNG — `CONFIG.events.wireAccuracy` /
 * `gossipAccuracy` are NOT consumed by any logic in this file; they remain
 * pure config for whichever accuracy-modeling task actually governs
 * fog-of-wealth / insider-info accuracy (T019/T020). This file only ever
 * RECORDS a style label, never uses it to bias what text is printed or
 * whether a rumor turns out true. Resolution stories are always tagged
 * `'wire'` — they report a plain, now-settled fact ("it fired" / "it
 * fizzled"), which doesn't fit the "unverified tip" framing sourceStyle
 * exists to convey in the first place.
 *
 * ---------------------------------------------------------------------------
 * DESIGN — filler content is a placeholder, richer content is future polish
 * ---------------------------------------------------------------------------
 * `FILLER_STORIES` below is a small, hand-written pool of generic flavor
 * text with no mechanical connection to any event/city/good. This satisfies
 * T018's acceptance bar (filler stories exist, are picked via RNG, have a
 * valid shape) but is explicitly NOT meant to be the final content — a
 * later polish pass can expand/vary this pool freely without touching this
 * file's pipeline logic at all.
 *
 * ---------------------------------------------------------------------------
 * DESIGN — false rumors (bucket 4) vs. scheduled-event rumors (bucket 2)
 * ---------------------------------------------------------------------------
 * Bucket 2 rumors are always tied to a REAL, already-scheduled `Event`
 * (`relatedEventId` set, `isFalseRumor` mirrors that event's `hiddenTruth
 * === false` per `NewspaperStory`'s own doc comment) — the event might still
 * fizzle, but it genuinely exists in `state.activeEvents`. Bucket 4 stories
 * are pure fiction dressed as a rumor: a randomly picked good+city+direction
 * combo with NO backing `Event` at all (`relatedEventId: null`,
 * `isFalseRumor: true` unconditionally). Both read the same to the player
 * (a rumor with a source style) — only this file's internal bookkeeping
 * distinguishes "will actually resolve later" from "was never going
 * anywhere."
 */

import { CONFIG } from './config'
import { CITIES } from './data/cities'
import { GOODS } from './data/goods'
import { EVENT_TABLE } from './events/eventTable'
import { describeRumorSubject } from './fogOfWealth'
import { calcNetWorth } from './netWorth'
import type { Rng } from './rng'
import type { CityId, Event, EventScope, GameState, GoodId, NewsSourceStyle, NewspaperStory } from './types'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface GenerateDailyPaperOptions {
  /**
   * City ids that newly unlocked TODAY (`state.day`), per §4. Simplest
   * option per the task brief: the caller runs T010's `checkCityUnlocks`
   * itself, diffs `unlockedCityIds` before/after (or otherwise knows which
   * ids are new), and passes the new ones in here. This file never calls
   * `checkCityUnlocks` itself — it has no opinion on unlock timing, only on
   * how to announce an unlock it's told already happened.
   */
  newlyUnlockedCityIds?: CityId[]
}

export interface GenerateDailyPaperResult {
  /**
   * A NEW `GameState` with:
   *   - `currentNewspaper` set to `stories` (same array as the sibling
   *     `stories` field below — returned on `state` too so callers that only
   *     destructure `state` still get the paper).
   *   - `pendingResolutions` drained of every resolution reported today,
   *     retaining anything resolved TODAY (held for tomorrow's call).
   *   - `activeEvents` updated so every event chosen for a bucket-2 rumor
   *     story this call now carries `rumorAnnounced: true`.
   * Never mutates the input `state` (pure function, matching every other
   * action in this codebase).
   */
  state: GameState
  /** Convenience alias for `state.currentNewspaper` — the exact same array. */
  stories: NewspaperStory[]
}

/**
 * Generates today's newspaper (`state.day`) from:
 *   1. Resolution stories — one per entry in `state.pendingResolutions`
 *      whose event resolved on a PRIOR day (§7 step 5, non-negotiable,
 *      always included, pinned FIRST in `stories` so a later UI task (T039)
 *      can trivially pin them at the top).
 *   2. A city-unlock headline for each id in `options.newlyUnlockedCityIds`
 *      (§4, always included when relevant).
 *   3. A random `CONFIG.events.storiesPerDayMin`-`storiesPerDayMax` (2-4)
 *      count of DISCRETIONARY items, each independently rolled as one of:
 *      a scheduled-event rumor (bucket 2, only if an unannounced future
 *      event exists), a deliberate false rumor (bucket 4), or filler
 *      (bucket 3).
 *
 * See this file's header for the full design rationale behind each choice.
 * Never throws; always produces a valid result (there is no "rejection"
 * case, matching `scheduleEvent`/`resolveDueEvents`'s precedent).
 */
export function generateDailyPaper(
  state: GameState,
  rng: Rng,
  options: GenerateDailyPaperOptions = {},
): GenerateDailyPaperResult {
  // --- Bucket 1: resolution stories (non-negotiable, always included) -----
  // USER-REQUESTED (2026-08): two additional filters beyond the original
  // "resolved on a prior day" gate —
  //   1. Staleness: anything resolved more than `resolutionStalenessMaxDays`
  //      days ago is dropped silently rather than shown, so a multi-day
  //      Travel trip doesn't dump a backlog of old "news" all at once.
  //   2. Relevance: an event touching only goods/cities the player hasn't
  //      unlocked yet is dropped silently too — no point reporting on Steel
  //      prices before the player can even trade Steel.
  // Either way, the entry is still removed from the queue (never revisited).
  const pending = state.pendingResolutions ?? []
  const due = pending.filter((r) => r.event.scheduledFireDay < state.day)
  const stillPendingResolutions = pending.filter((r) => r.event.scheduledFireDay >= state.day)

  const readyResolutions = due.filter(
    (r) =>
      state.day - r.event.scheduledFireDay <= CONFIG.events.resolutionStalenessMaxDays &&
      isEventRelevant(r.event, state),
  )

  const resolutionStories = readyResolutions.map((r, i) => buildResolutionStory(r, state, i))

  // --- Bucket 5: city-unlock headlines (always included when relevant) ----
  const newlyUnlockedCityIds = options.newlyUnlockedCityIds ?? []
  const unlockStories = newlyUnlockedCityIds.map((cityId) => buildUnlockStory(cityId, state))

  // --- Buckets 2/3/4: discretionary mix, 0-2 items (see EVENTS.storiesPerDayMin/Max) ---
  const rumorCandidates = state.activeEvents.filter(
    (e) => !e.resolved && e.scheduledFireDay > state.day && !e.rumorAnnounced && isEventRelevant(e, state),
  )

  const discretionaryCount = rng.int(CONFIG.events.storiesPerDayMin, CONFIG.events.storiesPerDayMax)

  const discretionaryStories: NewspaperStory[] = []
  const announcedEventIds = new Set<string>()
  let candidatePool = [...rumorCandidates]

  for (let i = 0; i < discretionaryCount; i++) {
    const roll = rng.next()

    if (roll < 0.4 && candidatePool.length > 0) {
      // Bucket 2: scheduled-event rumor.
      const idx = rng.int(0, candidatePool.length - 1)
      const event = candidatePool[idx] as Event
      candidatePool = candidatePool.filter((_, j) => j !== idx)
      announcedEventIds.add(event.id)
      discretionaryStories.push(buildRumorStory(event, rng, state, i))
    } else if (roll < 0.7) {
      // Bucket 4: deliberate false rumor (pure fiction, no backing event).
      discretionaryStories.push(buildFalseRumorStory(rng, state, i))
    } else {
      // Bucket 3: filler.
      discretionaryStories.push(buildFillerStory(rng, state, i))
    }
  }

  // Resolution stories PINNED first, then unlock headlines, then the
  // discretionary mix — see this file's header for why resolutions sort
  // first (T039 pinning requirement).
  const stories: NewspaperStory[] = [...resolutionStories, ...unlockStories, ...discretionaryStories]

  const updatedActiveEvents =
    announcedEventIds.size === 0
      ? state.activeEvents
      : state.activeEvents.map((e) => (announcedEventIds.has(e.id) ? { ...e, rumorAnnounced: true } : e))

  const updatedState: GameState = {
    ...state,
    currentNewspaper: stories,
    pendingResolutions: stillPendingResolutions,
    activeEvents: updatedActiveEvents,
  }

  return { state: updatedState, stories }
}

// ---------------------------------------------------------------------------
// Story builders
// ---------------------------------------------------------------------------

/** Deterministic-enough unique id suffix, matching the small-suffix
 * convention already used by `eventEngine.ts`'s `scheduleEvent` (an extra
 * RNG draw folded into the id) — avoids any module-level mutable counter. */
function uniqueSuffix(rng: Rng): string {
  return Math.floor(rng.next() * 1_000_000_000).toString()
}

function goodNames(ids: readonly GoodId[]): string {
  if (ids.length === 0) return ''
  return ids.map((id) => GOODS.find((g) => g.id === id)?.name ?? id).join('/')
}

function cityName(cityId: CityId): string {
  return CITIES.find((c) => c.id === cityId)?.name ?? cityId
}

/**
 * USER-REQUESTED (2026-08): true if `event` is worth reporting on given what
 * the player has unlocked so far — at least one of its affected goods must
 * be unlocked (an event with no affected goods, e.g. an Epidemic, is always
 * relevant), AND its scope must touch an unlocked city ('global' always
 * qualifies; 'city'/'tier' scope needs at least one unlocked city in that
 * scope). Applied to both resolution stories and rumor candidates so locked
 * commodities/cities (e.g. Steel before its license, Tier 2 cities before
 * unlock) never surface in the newspaper.
 */
function isEventRelevant(event: Event, state: GameState): boolean {
  const goodsOk =
    event.affectedGoodIds.length === 0 || event.affectedGoodIds.some((id) => state.unlockedGoodIds.includes(id))
  if (!goodsOk) return false

  switch (event.scope.kind) {
    case 'global':
      return true
    case 'city':
      return state.unlockedCityIds.includes(event.scope.cityId)
    case 'tier': {
      const tier = event.scope.tier
      return CITIES.some((c) => c.tier === tier && state.unlockedCityIds.includes(c.id))
    }
  }
}

/** Human-readable description of an event's scope, or `''` for global
 * (nothing worth naming). Deliberately vague for `tier` (never lists which
 * cities) — fog-of-wealth-style vagueness proper is T019's job; this is
 * just a reasonable default phrasing. */
function describeScope(scope: EventScope): string {
  switch (scope.kind) {
    case 'global':
      return ''
    case 'city':
      return cityName(scope.cityId)
    case 'tier':
      return `the Tier ${scope.tier} cities`
  }
}

/** One resolution story per `EventResolution`-shaped entry (see
 * `GameState.pendingResolutions`'s doc comment for why this is a structural
 * duplicate of `events/resolution.ts`'s `EventResolution`, not an import).
 * Clearly differentiates fired vs. fizzled outcomes and references the
 * event type's `label` (T016's `EVENT_TABLE`), per the task's explicit
 * wording bar — flavorful is nice, but "clearly differentiate" is the actual
 * requirement. */
function buildResolutionStory(
  resolution: { event: Event; fired: boolean },
  state: GameState,
  index: number,
): NewspaperStory {
  const { event, fired } = resolution
  const def = EVENT_TABLE[event.typeId]
  const goods = goodNames(event.affectedGoodIds)
  const scopeDesc = describeScope(event.scope)
  const whereClause = scopeDesc ? ` in ${scopeDesc}` : ''
  const goodsClause = goods ? ` ${goods}` : ''

  const headline = fired ? `${def.label}: confirmed${whereClause}` : `${def.label} rumor fizzles${whereClause}`

  const body = fired
    ? `Yesterday's rumors proved true — the ${def.label.toLowerCase()} was real.${goodsClause ? ` ${goods} prices moved sharply` : ' Prices moved sharply'}${whereClause}. Traders who acted on the tip are counting their gains.`
    : `Panic proves unfounded — the "${def.label.toLowerCase()}" rumor came to nothing${whereClause}.${goodsClause} prices ease back toward normal.`

  return {
    id: `story-d${state.day}-res-${event.id}-${index}`,
    day: state.day,
    headline,
    body,
    sourceStyle: 'wire',
    relatedEventId: event.id,
    isResolution: true,
    isFalseRumor: false,
  }
}

/** §4: "A newspaper headline announces each unlock" — the doc's own worked
 * example ("Trade routes to Port Vela now open to licensed merchants!") is
 * reproduced verbatim in shape here. */
function buildUnlockStory(cityId: CityId, state: GameState): NewspaperStory {
  const name = cityName(cityId)
  return {
    id: `story-d${state.day}-unlock-${cityId}`,
    day: state.day,
    headline: `Trade routes to ${name} now open to licensed merchants!`,
    body: `The merchants' guild confirms new trade routes have opened to ${name}. Traders with sufficient standing may now travel there freely.`,
    sourceStyle: 'wire',
    relatedEventId: null,
    isResolution: false,
    isFalseRumor: false,
  }
}

/** Bucket 2: a vaguely-worded rumor for a REAL scheduled event, never
 * revealing `hiddenTruth` or any concrete multiplier/duration number —
 * §7: "rumors of trouble in the mining towns" style, not "Iron will spike
 * 73% in 3 days". `isFalseRumor` mirrors the event's own `hiddenTruth ===
 * false` per `NewspaperStory`'s doc comment (the event may yet fizzle; this
 * flag records that possibility as data, it is never printed in the text
 * itself). */
function buildRumorStory(event: Event, rng: Rng, state: GameState, index: number): NewspaperStory {
  const def = EVENT_TABLE[event.typeId]
  const scopeDesc = describeScope(event.scope)
  const sourceStyle: NewsSourceStyle = rng.next() < 0.5 ? 'wire' : 'gossip'
  const sourceLabel = sourceStyle === 'wire' ? 'Wire report' : 'Bazaar gossip'
  const whereClause = scopeDesc ? ` near ${scopeDesc}` : ''

  // T019 (§7 "Fog of wealth"): the body's subject description (which good(s)
  // and how precisely the location is named) fogs as the player's net worth
  // grows — see fogOfWealth.ts for the three-band rule. Deliberately scoped
  // to the BODY only, matching this file's existing `describeScope` doc
  // comment ("fog-of-wealth-style vagueness proper is T019's job; this is
  // just a reasonable default phrasing") — the headline's own `whereClause`
  // is left as-is (unchanged from T018) to keep this an additive, minimal
  // edit rather than a rework of the story's overall shape.
  const subject = describeRumorSubject({
    cityId: event.scope.kind === 'city' ? event.scope.cityId : undefined,
    goodIds: event.affectedGoodIds,
    netWorth: calcNetWorth(state),
    rng,
  })
  const bodySubject = subject.charAt(0).toLowerCase() + subject.slice(1)

  return {
    id: `story-d${state.day}-rumor-${event.id}-${index}`,
    day: state.day,
    headline: `${sourceLabel}: whispers of ${def.label.toLowerCase()}${whereClause}`,
    body: `Word is spreading: ${bodySubject}. Nothing is confirmed yet — canny traders are watching prices closely.`,
    sourceStyle,
    relatedEventId: event.id,
    isResolution: false,
    isFalseRumor: event.hiddenTruth === false,
  }
}

/** Bucket 4: pure fiction dressed as a rumor — a randomly picked
 * good+city+direction combo with NO backing `Event` at all. USER-REQUESTED
 * (2026-08): picks only from unlocked goods/cities (falling back to the full
 * pool in the defensive edge case where nothing is unlocked yet) so a false
 * rumor never names a good/city the player hasn't reached. */
function buildFalseRumorStory(rng: Rng, state: GameState, index: number): NewspaperStory {
  const unlockedGoods = GOODS.filter((g) => state.unlockedGoodIds.includes(g.id))
  const unlockedCities = CITIES.filter((c) => state.unlockedCityIds.includes(c.id))
  const good = rng.pick(unlockedGoods.length > 0 ? unlockedGoods : GOODS)
  const city = rng.pick(unlockedCities.length > 0 ? unlockedCities : CITIES)
  const direction = rng.next() < 0.5 ? 'set to surge' : 'set to slump'
  const sourceStyle: NewsSourceStyle = rng.next() < 0.5 ? 'wire' : 'gossip'
  const sourceLabel = sourceStyle === 'wire' ? 'Wire report' : 'Bazaar gossip'

  // T019: same body-only fogging as buildRumorStory above — see its comment.
  // Headline keeps naming the exact good+city (unchanged from T018); only
  // the body's subject description is net-worth-gated.
  const subject = describeRumorSubject({
    cityId: city.id,
    goodIds: [good.id],
    netWorth: calcNetWorth(state),
    rng,
  })
  const bodySubject = subject.charAt(0).toLowerCase() + subject.slice(1)

  return {
    id: `story-d${state.day}-falserumor-${index}-${uniqueSuffix(rng)}`,
    day: state.day,
    headline: `${sourceLabel}: ${good.name} in ${city.name} ${direction}`,
    body: `Unconfirmed talk suggests ${bodySubject}. No official word yet.`,
    sourceStyle,
    relatedEventId: null,
    isResolution: false,
    isFalseRumor: true,
  }
}

/**
 * Bucket 3: generic flavor filler, no mechanical tie to any city/good/event.
 * Small placeholder pool — richer content is explicitly future polish, not
 * required by T018 (see file header).
 */
const FILLER_STORIES: ReadonlyArray<{ headline: string; body: string }> = [
  {
    headline: 'Market chatter: traders eye the season ahead',
    body: 'Merchants across Selvara traded steadily today, with no major surprises reported at any port or market square.',
  },
  {
    headline: "Guild notice: warehouse inspections proceed as scheduled",
    body: 'The merchants\' guild reminds traders that routine inspections continue this week. No irregularities have been reported.',
  },
  {
    headline: 'Weather holds fair across the trade routes',
    body: 'Caravans and ships alike report smooth going this week, with clear skies over most of the major routes.',
  },
  {
    headline: 'Local color: festival preparations underway',
    body: 'Townsfolk in several cities are already preparing for the coming season\'s festivities, though nothing official has been announced.',
  },
  {
    headline: "Bankers' notes: steady business at the counting houses",
    body: 'Bank clerks report an ordinary day of deposits and withdrawals, with lending activity holding at its usual pace.',
  },
  {
    headline: 'Dockside gossip: nothing much to report',
    body: 'A quiet day on the waterfront — dockhands say cargo moved on schedule with no notable delays.',
  },
]

function buildFillerStory(rng: Rng, state: GameState, index: number): NewspaperStory {
  const pick = rng.pick(FILLER_STORIES)
  const sourceStyle: NewsSourceStyle = rng.next() < 0.5 ? 'wire' : 'gossip'

  return {
    id: `story-d${state.day}-filler-${index}-${uniqueSuffix(rng)}`,
    day: state.day,
    headline: pick.headline,
    body: pick.body,
    sourceStyle,
    relatedEventId: null,
    isResolution: false,
    isFalseRumor: false,
  }
}
