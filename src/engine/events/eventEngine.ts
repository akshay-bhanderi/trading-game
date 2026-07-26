/**
 * Event scheduling engine — Trade Winds of Selvara.
 *
 * Design doc reference: §7 pipeline steps 1-2 —
 *   1. "Engine schedules an event 2-4 days in the future."
 *   2. "Each morning's paper carries 2-4 items: scheduled-event rumors,
 *      filler news, and deliberate false rumors."
 * This file implements step 1 only (scheduling). Step 2 (assembling a daily
 * paper from scheduled events + filler + false rumors) is T018's job
 * (newspaper.ts) — not built here. Fire/fizzle resolution (§7 step 4) is
 * T017's job (resolution.ts) — also not built here; this file only decides
 * and stores the HIDDEN truth flag at scheduling time, per the task brief.
 *
 * Pure TypeScript, zero React imports (see /src/engine/README.md).
 *
 * NEVER uses `Math.random` — every draw comes from the `Rng` passed in
 * (see rng.ts's project-wide rule).
 *
 * ---------------------------------------------------------------------------
 * DESIGN — event-type selection: uniform at random
 * ---------------------------------------------------------------------------
 * `scheduleEvent` picks which event type to schedule via
 * `rng.pick(PRICE_EVENT_TYPE_IDS)` — a uniform draw over the 11 base §7
 * types. §7 doesn't call for weighting any event type over another, so
 * uniform is the simplest choice that satisfies the task brief ("simplest is
 * uniform unless the doc implies otherwise"). A future balance pass (T029)
 * could introduce weights (e.g. to make rarer/more dramatic events less
 * frequent) without changing this function's shape — only the selection line
 * would need to change.
 *
 * T050 note: `PRICE_EVENT_TYPE_IDS` (not `EVENT_TYPE_IDS`) is used
 * deliberately — it EXCLUDES `warehouseFire` (§14's 12th event type, added by
 * eventTable.ts), which never moves a price and is fired via its own
 * dedicated daily roll in `/src/engine/warehouse.ts` instead of this
 * schedule/resolve pipeline. See eventTable.ts's file header ("T050
 * ADDITION") for the full rationale.
 *
 * ---------------------------------------------------------------------------
 * DESIGN — hidden-truth probability
 * ---------------------------------------------------------------------------
 * `hiddenTruth = rng.next() < CONFIG.events.eventFireProbability` (0.6,
 * documented in config.ts) — see that constant's own doc comment for the
 * full rationale (distinct from wire/gossip SOURCE-STYLE accuracy, which is
 * a separate T018 concern).
 *
 * ---------------------------------------------------------------------------
 * DESIGN — purity and id uniqueness (no module-level mutable counter)
 * ---------------------------------------------------------------------------
 * Every other action in this codebase (cargo.ts, actions/stay.ts,
 * actions/travel.ts, turnLoop.ts) is a pure function: no shared mutable
 * module state, deterministic purely from its arguments. `scheduleEvent`
 * follows the same convention — rather than a module-level incrementing
 * counter (which would make repeated calls depend on how many times this
 * module has EVER been called across a whole process, including other
 * tests/other runs sharing the same JS module instance — not reproducible
 * from a seed alone), the event's `id` is derived entirely from the
 * function's own inputs: `state.day`, the chosen `typeId`,
 * `state.activeEvents.length` (grows monotonically as events accumulate,
 * so two events scheduled the same day never collide), and one extra RNG
 * draw folded in for good measure. Same seed + same state -> same id, every
 * time; no hidden global counter to reset between tests.
 *
 * ---------------------------------------------------------------------------
 * DESIGN — return shape
 * ---------------------------------------------------------------------------
 * `scheduleEvent` returns `{ event, updatedState }` rather than just the new
 * state, so callers (e.g. a future daily-tick hook, or this file's own
 * tests) can inspect the freshly created `Event` directly without having to
 * diff `updatedState.activeEvents` against the state they passed in. Follows
 * the same "return everything the caller might reasonably need" spirit as
 * T008's `computePrice` returning `{ nextState, price }`.
 */

import { CITIES } from '../data/cities'
import { GOODS } from '../data/goods'
import { CONFIG } from '../config'
import type { Rng } from '../rng'
import type { City, Event, EventScope, GameState, GoodId } from '../types'
import { EVENT_TABLE, PRICE_EVENT_TYPE_IDS } from './eventTable'
import type { EventGoodsRule, EventMultiplierSpec, EventScopeRule, EventTypeDef, MultiplierRange } from './eventTable'

export interface ScheduleEventResult {
  event: Event
  updatedState: GameState
}

/** Resolves an `EventGoodsRule` that does NOT depend on a picked city
 * (fixedGoods/oneRandomGood/allGoods/inertNoV1Good). Never called with
 * `derivedFromScope` — those are resolved inline inside
 * `resolveScopeAndGoods` where the picked city is available. */
function resolveIndependentGoods(rule: EventGoodsRule, rng: Rng): GoodId[] {
  switch (rule.kind) {
    case 'fixedGoods':
      return [...rule.goodIds]
    case 'oneRandomGood':
      return [rng.pick(GOODS).id]
    case 'allGoods':
      return GOODS.map((g) => g.id)
    case 'inertNoV1Good':
      return []
    case 'none':
      // T050: Warehouse fire's non-price effect — see eventTable.ts's file
      // header "T050 ADDITION" section. Never actually reached in practice
      // since `warehouseFire` is excluded from `PRICE_EVENT_TYPE_IDS` (this
      // function's caller only ever picks from that narrower pool), but
      // handled here for exhaustiveness/defensiveness.
      return []
    case 'derivedFromScope':
      // Defensive: should never be reached — callers route this case through
      // resolveScopeAndGoods's per-scope-rule branches instead.
      throw new Error('resolveIndependentGoods: derivedFromScope must be resolved alongside scope')
  }
}

/** All distinct tiers actually present in `CITIES` (v1: [1, 2]). Computed
 * fresh each call rather than hardcoded, so it stays correct if Tier 3/4
 * cities are ever added back per §13's "config-driven, easy to re-add"
 * note. */
function distinctTiers(): City['tier'][] {
  return Array.from(new Set(CITIES.map((c) => c.tier)))
}

/** Resolves BOTH the affected goods and the concrete `EventScope` for one
 * event type definition, per its `scopeRule` (and, where correlated, its
 * `goodsRule`). See eventTable.ts's file header for the full design
 * rationale on why scope/goods resolution happens here (at schedule time)
 * rather than being hardcoded in the table. */
function resolveScopeAndGoods(
  def: EventTypeDef,
  rng: Rng,
): { affectedGoodIds: GoodId[]; scope: EventScope } {
  const scopeRule: EventScopeRule = def.scopeRule

  switch (scopeRule.kind) {
    case 'fixedGlobal': {
      const affectedGoodIds = resolveIndependentGoods(def.goodsRule, rng)
      return { affectedGoodIds, scope: { kind: 'global' } }
    }

    case 'producerCityOfAffectedGoods': {
      const affectedGoodIds = resolveIndependentGoods(def.goodsRule, rng)
      const candidates = CITIES.filter((c) => c.produces.some((g) => affectedGoodIds.includes(g)))
      const pool = candidates.length > 0 ? candidates : CITIES
      const city = rng.pick(pool)
      return { affectedGoodIds, scope: { kind: 'city', cityId: city.id } }
    }

    case 'producerCityOwnGood': {
      // Workers' strike: pick a producer city, then ONE of its own produced
      // goods is the affected good ("its good", singular, per §7).
      const producers = CITIES.filter((c) => c.produces.length > 0)
      const pool = producers.length > 0 ? producers : CITIES
      const city: City = rng.pick(pool)
      const goodId = city.produces.length > 0 ? rng.pick(city.produces) : rng.pick(GOODS).id
      return { affectedGoodIds: [goodId], scope: { kind: 'global' } }
    }

    case 'importingCity': {
      // Ship sinking: pick a city that imports/wants at least one good; its
      // `wants` list becomes the affected ("import") goods at that port.
      const importers = CITIES.filter((c) => c.wants.length > 0)
      const pool = importers.length > 0 ? importers : CITIES
      const city = rng.pick(pool)
      return { affectedGoodIds: [...city.wants], scope: { kind: 'city', cityId: city.id } }
    }

    case 'oneCity': {
      const city = rng.pick(CITIES)
      const affectedGoodIds = resolveIndependentGoods(def.goodsRule, rng)
      return { affectedGoodIds, scope: { kind: 'city', cityId: city.id } }
    }

    case 'oneTier': {
      const tier = rng.pick(distinctTiers())
      const affectedGoodIds = resolveIndependentGoods(def.goodsRule, rng)
      return { affectedGoodIds, scope: { kind: 'tier', tier } }
    }
  }
}

/** Resolves an `EventMultiplierSpec` into a single concrete `MultiplierRange`
 * for this occurrence — for `dual` specs (Government tariff's "±20-40%"),
 * picks increase-vs-decrease 50/50 via the RNG. */
function resolveMultiplierRange(spec: EventMultiplierSpec, rng: Rng): MultiplierRange {
  if (spec.kind === 'single') return spec.range
  return rng.next() < 0.5 ? spec.decrease : spec.increase
}

/**
 * Schedules one new event occurrence:
 *   1. Picks an event type uniformly at random from `PRICE_EVENT_TYPE_IDS`
 *      (every `EVENT_TABLE` entry except `warehouseFire` — see file header's
 *      T050 note).
 *   2. Resolves its concrete affected good(s) and scope (city/tier/global)
 *      per that type's rules, using `CITIES`/`GOODS` data and the RNG for
 *      any remaining randomness (e.g. which producer city, which tier).
 *   3. Resolves a concrete multiplier range (picking a direction first for
 *      dual-direction types like Government tariff).
 *   4. Draws the hidden truth flag (`CONFIG.events.eventFireProbability`).
 *   5. Sets `scheduledFireDay = state.day + rng.int(scheduleWindowMinDays,
 *      scheduleWindowMaxDays)` (2-4 days out) and `createdOnDay = state.day`.
 *   6. Appends the new `Event` to `state.activeEvents` in a NEW `GameState`
 *      (pure function — never mutates `state` or its `activeEvents` array).
 *
 * Does NOT decide fire-vs-fizzle (§7 step 4, T017's job) and does NOT touch
 * prices — this function only schedules. Never throws; always produces a
 * valid `Event` (there is no "rejection" case, unlike buy/sell/travel/stay).
 */
export function scheduleEvent(state: GameState, rng: Rng): ScheduleEventResult {
  const typeId = rng.pick(PRICE_EVENT_TYPE_IDS)
  const def = EVENT_TABLE[typeId]

  const { affectedGoodIds, scope } = resolveScopeAndGoods(def, rng)
  const { min: multiplierMin, max: multiplierMax } = resolveMultiplierRange(def.multiplier, rng)

  const hiddenTruth = rng.next() < CONFIG.events.eventFireProbability

  const scheduledFireDay =
    state.day + rng.int(CONFIG.events.scheduleWindowMinDays, CONFIG.events.scheduleWindowMaxDays)

  // Uniqueness derived from inputs only (see file header) — no module-level
  // mutable counter, keeping this function pure/reproducible from its seed.
  const uniqueSuffix = Math.floor(rng.next() * 1_000_000_000)
  const id = `evt-d${state.day}-${typeId}-${state.activeEvents.length}-${uniqueSuffix}`

  const event: Event = {
    id,
    typeId,
    affectedGoodIds,
    scope,
    multiplierMin,
    multiplierMax,
    durationDaysMin: def.durationDays.min,
    durationDaysMax: def.durationDays.max,
    hiddenTruth,
    scheduledFireDay,
    createdOnDay: state.day,
    resolved: false,
    fired: null,
  }

  const updatedState: GameState = {
    ...state,
    activeEvents: [...state.activeEvents, event],
  }

  return { event, updatedState }
}
