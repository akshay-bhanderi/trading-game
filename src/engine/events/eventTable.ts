/**
 * Base event table — Trade Winds of Selvara.
 *
 * Design doc reference: §7's event-types table (the 11 rows) and pipeline
 * step 1 ("Engine schedules an event 2-4 days in the future"). This file is
 * DATA ONLY — it defines the 11 base event types' rules; the actual random
 * scheduling/resolution-to-concrete-values happens in ./eventEngine.ts (T016)
 * and later ./resolution.ts (T017).
 *
 * Pure TypeScript, zero React imports (see /src/engine/README.md).
 *
 * ---------------------------------------------------------------------------
 * DESIGN DECISION — how "producer cities of X" / "source city" / "affected
 * port" scopes are encoded: TABLE defines the RULE, SCHEDULING resolves the
 * concrete city
 * ---------------------------------------------------------------------------
 * `EventScope` (types.ts) only supports a FIXED city id (`{kind:'city',
 * cityId}`), never "whichever city produces X". Hardcoding a specific city
 * per event type (e.g. always Copperfell for Mine collapse) would be simpler
 * but wrong the moment city data changes, and wastes the RNG's ability to
 * vary WHICH producer city gets hit run to run.
 *
 * So this table never names a concrete city. Instead each `EventTypeDef`
 * carries a `scopeRule` (and, where relevant, a `goodsRule`) describing HOW
 * to pick the concrete scope/goods — e.g. "pick one city that produces one
 * of the affected goods" — and `eventEngine.ts`'s `scheduleEvent` resolves
 * that rule against the real `CITIES`/`GOODS` data plus the RNG at the
 * moment an occurrence is scheduled. This is the "(a)" option the task
 * brief recommends: more general, and correct even as city/good data
 * evolves.
 *
 * ---------------------------------------------------------------------------
 * SCOPE FENCE — Electronics / Rare Metals (§13)
 * ---------------------------------------------------------------------------
 * Tech breakthrough (Electronics) and New deposit discovered (Rare Metals)
 * reference commodities that are OUT of v1 scope (§13) — neither good exists
 * in /src/engine/data/goods.ts, and Rare Metals' only source city (Kessler
 * Mines) doesn't exist in /src/engine/data/cities.ts either. Per the task
 * brief's guidance ("leaning toward including it with a comment is probably
 * safer against the acceptance bar" — TASK.md's T016 acceptance criteria
 * says "All 11 base event types... are data-defined"), BOTH are still
 * included here as full `EventTypeDef` records, each flagged `inertInV1:
 * true` and given `goodsRule: { kind: 'inertNoV1Good' }`, which always
 * resolves to an EMPTY `affectedGoodIds` array — so if one is ever randomly
 * scheduled in v1, it fires/fizzles as a genuine no-op against real prices
 * (no good is ever affected). This keeps the table's "11 base event types"
 * count honest without inventing a fake v1 good to stand in for them.
 *
 * ---------------------------------------------------------------------------
 * OTHER DOCUMENTED SIMPLIFICATIONS (read before extending this table)
 * ---------------------------------------------------------------------------
 * - Durations not given by §7: rows 2 (Drought), 3 (Mine collapse), 4
 *   (Workers' strike), 5 (War scare), 8 (Ship sinking), 11 (Epidemic) have no
 *   explicit duration in §7's table. Each uses a documented default range
 *   (5-8 days) picked to sit comfortably inside the other rows' explicit
 *   values (3, 4-6, 8, 10 days) — flagged individually below as a candidate
 *   for T029's balance pass.
 * - War scare's secondary clause ("Silk/luxury -20%"): the `Event` shape
 *   (types.ts) has exactly ONE `multiplierMin`/`multiplierMax` range applied
 *   to ALL of `affectedGoodIds` for a single occurrence — it cannot express
 *   "Steel/Fuel up AND Silk down" as one record. This table models only the
 *   dominant clause (Steel/Fuel +40-80%) and drops Silk from
 *   `affectedGoodIds` for this event type, documented here as a known
 *   simplification. A future "compound event" shape (multiple
 *   good-group/multiplier pairs per occurrence) could restore full fidelity;
 *   out of scope for T016.
 * - Workers' strike's "everywhere else" clause: the doc's flavor text implies
 *   the picked producer city itself is EXEMPT from the price bump (its own
 *   local output halted, but the +30% is what OTHER cities pay). `EventScope`
 *   has no "global except city X" variant, so this table models the effect
 *   as `scope: { kind: 'global' }` (the closest fit), accepting that the
 *   source city is technically included too. Documented simplification,
 *   deferred to T017 if finer exclusion is ever wanted.
 * - New deposit discovered's scope: §7 implies a source-city concept
 *   (mirroring Mine collapse), but Rare Metals' only source city (Kessler
 *   Mines) is out of v1 scope. Modeled as `scope: { kind: 'global' }` as an
 *   inert placeholder — moot anyway since `affectedGoodIds` always resolves
 *   empty per the scope-fence note above.
 *
 * ---------------------------------------------------------------------------
 * T050 ADDITION — "Warehouse fire" (§14), the 12th event type, and why it's
 * excluded from `PRICE_EVENT_TYPE_IDS`
 * ---------------------------------------------------------------------------
 * §14 extends "§7's event table" with Warehouse fire: "low-probability,
 * destroys 10-40% of one city's stored goods". Structurally this does NOT
 * fit the rest of this table at all — every other row's effect is "multiply
 * some good's PRICE by some factor for some duration" (`Event.multiplierMin/
 * Max`, consumed by `events/resolution.ts`'s `getActiveEventEffectsFor` into
 * `computePrice`'s `eventMultiplier` term). Warehouse fire's effect is
 * "destroy a fraction of a QUANTITY already sitting in a warehouse" — there
 * is no price anywhere in that sentence, and the `Event` type has no
 * "destroy N% of X" field to express it with.
 *
 * Two options existed: (a) extend `Event`/`computePrice`'s pipeline with a
 * new non-price effect kind just for this one row, or (b) keep Warehouse
 * fire's actual random-firing + destructive effect COMPLETELY OUT of the
 * scheduleEvent/resolveDueEvents/getActiveEventEffectsFor pipeline, firing it
 * instead via its own small, dedicated, config-driven daily roll living in
 * `/src/engine/warehouse.ts` (own RNG substream, same per-day-hash pattern
 * `turnLoop.ts` already uses for its other daily rolls), and reserve this
 * table entry PURELY for data-completeness / a stable `EventTypeId` +
 * `label` that `newspaper.ts`'s generic `EVENT_TABLE[event.typeId]` lookup
 * can still resolve if one is ever surfaced in newspaper text.
 *
 * (b) is what this file does. `warehouseFire`'s `goodsRule` is `{ kind:
 * 'none' }` (see that new `EventGoodsRule` variant below) — it ALWAYS
 * resolves to an empty `affectedGoodIds`, so even if a `warehouseFire`
 * `Event` record were ever created and pushed through the normal
 * scheduleEvent/resolveDueEvents machinery by mistake, it would be a
 * complete no-op against prices (never matches any good). More importantly,
 * `warehouseFire` is EXCLUDED from `PRICE_EVENT_TYPE_IDS` (the array
 * `eventEngine.ts`'s `scheduleEvent` actually draws from — see that
 * constant's own doc comment below), so in normal play it is never scheduled
 * through that pipeline at all; its real firing is entirely owned by
 * `warehouse.ts`'s own daily check against `CONFIG.warehouse.fire.dailyProbability`.
 * This also naturally makes it "low-probability" in the sense §14 asks for,
 * without needing to invent a per-type weighting scheme for the other 11
 * uniformly-drawn event types just to accommodate one outlier.
 *
 * `multiplier`/`durationDays` are still populated (neutral `1x`/1 day) purely
 * so this row satisfies `EventTypeDef`'s required shape — neither field is
 * ever actually read for this type, since `resolveScopeAndGoods`'s
 * `goodsRule: 'none'` guarantees no price effect can ever result.
 *
 * ---------------------------------------------------------------------------
 * PHASE 2 ADDITION (T065) — "Aviation safety incident" (§16): a non-price
 * event type, represented as an intentionally INERT price-multiplier entry
 * ---------------------------------------------------------------------------
 * §16 adds one new event to this table: "Aviation safety incident — one
 * random leased plane grounded 5-10 days, income paused, maintenance still
 * owed". Unlike every other row in this table, its real effect (grounding a
 * specific `Plane`) has NOTHING to do with commodity prices — the `Event`
 * shape this whole file is built around (`affectedGoodIds`,
 * `multiplierMin/Max`, `scope` matched against `City`) has no way to name
 * "which plane" at all, and was never meant to.
 *
 * Rather than bolting plane-specific fields onto the shared `Event`
 * interface (types.ts) or `EventTypeDef` here — which would leak an
 * aviation-only concept into a type every OTHER event type also uses, and
 * would need eventEngine.ts/resolution.ts (both otherwise plane-agnostic) to
 * import from aviation.ts — this event type is modeled as a deliberately
 * INERT entry, exactly like Tech breakthrough/New deposit discovered above
 * (`goodsRule: { kind: 'inertNoV1Good' }`, empty `affectedGoodIds`, so
 * `getActiveEventEffectsFor` never contributes a price effect for it
 * regardless of `multiplier`). What this table's ordinary scheduling/
 * resolution machinery IS reused for, unchanged: the RANDOM 5-10 day
 * duration draw. `durationDays: { min: 5, max: 10 }` here means
 * `resolveEvent` (events/resolution.ts, T017) already computes exactly the
 * concrete `resolvedDurationDays`/`activeUntilDay` this event needs to
 * describe its grounding window — no new resolution concept required.
 *
 * The actual grounding — picking a random currently-leased, not-already-
 * grounded `Plane` and setting its `groundedUntilDay` — happens in
 * aviation.ts's `applyAviationSafetyIncidents`, called from turnLoop.ts's
 * `advanceDay` immediately after `resolveDueEvents` produces this call's
 * `EventResolution[]` (i.e. the exact moment `fired` becomes `true` for a
 * same-day-due event — see events/resolution.ts's file header for where
 * that happens). That function reads the resolved event's own
 * `activeUntilDay` (already computed by the ordinary machinery above) as the
 * grounded plane's `groundedUntilDay` — the SAME number, reused directly,
 * rather than re-deriving a second "how long" concept. See aviation.ts's
 * file header for the full design writeup.
 */

import type { CityId, EventScope, EventTypeId, GoodId } from '../types'

// ---------------------------------------------------------------------------
// Rule vocabularies — HOW eventEngine.ts should resolve a concrete
// occurrence's affected goods / scope from this table's rule, not the
// concrete values themselves.
// ---------------------------------------------------------------------------

export type EventGoodsRule =
  /** Always these exact goods (e.g. Bumper harvest -> Grain, Cotton). */
  | { kind: 'fixedGoods'; goodIds: GoodId[] }
  /** Pick one good at random from all of `GOODS` (Government tariff). */
  | { kind: 'oneRandomGood' }
  /** Every good in `GOODS` is affected (Epidemic: "all goods -15% there"). */
  | { kind: 'allGoods' }
  /** Resolved TOGETHER with `scopeRule` in eventEngine.ts because the good(s)
   * depend on which city gets picked (Workers' strike: the picked producer
   * city's own good; Ship sinking: the picked port's imported/"wants"
   * goods). Never resolved in isolation — see eventEngine.ts. */
  | { kind: 'derivedFromScope' }
  /** No real v1 good is reachable for this event type (Electronics/Rare
   * Metals, §13) — always resolves to an empty `affectedGoodIds` array. */
  | { kind: 'inertNoV1Good' }
  /** This event type's effect is NOT a price multiplier at all (currently
   * only Warehouse fire, §14/T050 — see file header's "T050 ADDITION"
   * section) — always resolves to an empty `affectedGoodIds` array, same
   * empty-array RESULT as `inertNoV1Good` but a DIFFERENT reason: this isn't
   * about a good being out of v1 scope, it's that the event's real effect
   * (destroying stored warehouse goods) is consumed entirely outside this
   * table's price-multiplier pipeline, by `warehouse.ts`'s own dedicated
   * daily check. */
  | { kind: 'none' }

export type EventScopeRule =
  /** No city/tier concept — applies everywhere (Tech breakthrough; also
   * Workers' strike and New deposit discovered, see file header). */
  | { kind: 'fixedGlobal' }
  /** Pick one city that PRODUCES at least one of the (already-resolved)
   * affected goods (Bumper harvest, Mine collapse). */
  | { kind: 'producerCityOfAffectedGoods' }
  /** Pick one producer city (any city with a non-empty `produces`); that
   * city's own produced good becomes the affected good (Workers' strike). */
  | { kind: 'producerCityOwnGood' }
  /** Pick one city that WANTS/imports at least one good (non-empty `wants`,
   * i.e. an import-dependent "port"); its `wants` list becomes the affected
   * goods (Ship sinking / route closed). */
  | { kind: 'importingCity' }
  /** Pick any one city at random, independent of produce/want data
   * (Festival season, Epidemic). */
  | { kind: 'oneCity' }
  /** Pick one tier at random among tiers actually present in `CITIES`
   * (Drought "regional", War scare "regional", Government tariff "one tier
   * of cities"). */
  | { kind: 'oneTier' }

/** A single min/max multiplier range, applied directly as the price
 * engine's `eventMultiplier` term (§6) — e.g. 0.6 for "-40%", 1.6 for
 * "+60%". Not a percentage delta. */
export interface MultiplierRange {
  min: number
  max: number
}

export type EventMultiplierSpec =
  /** One direction, one range (most event types). */
  | { kind: 'single'; range: MultiplierRange }
  /** Two possible directions (Government tariff: "±20-40%") — eventEngine.ts
   * picks ONE direction per scheduled occurrence via the RNG; the table
   * itself just records both possibilities. */
  | { kind: 'dual'; increase: MultiplierRange; decrease: MultiplierRange }

export interface EventTypeDef {
  typeId: EventTypeId
  /** Human-readable label, matching §7's table row name — for future
   * newspaper text generation (T018), not used by T016 itself. */
  label: string
  goodsRule: EventGoodsRule
  scopeRule: EventScopeRule
  multiplier: EventMultiplierSpec
  durationDays: MultiplierRange
  /** True for event types whose only real-world good/city is out of v1
   * scope (§13) — see file header's "SCOPE FENCE" note. Always paired with
   * `goodsRule: { kind: 'inertNoV1Good' }`. */
  inertInV1: boolean
  /** Free-text note on any documented assumption/simplification for this
   * specific row (missing duration, dropped secondary clause, etc.) — see
   * file header for the full rationale behind each. */
  docNote: string
}

// ---------------------------------------------------------------------------
// The 11 base event types (§7's table), keyed by `EventTypeId` — the
// `Record<EventTypeId, ...>` shape itself guarantees (at the TypeScript
// level) that all 11 literals are present, since TS rejects a missing key.
// ---------------------------------------------------------------------------

export const EVENT_TABLE: Record<EventTypeId, EventTypeDef> = {
  bumperHarvest: {
    typeId: 'bumperHarvest',
    label: 'Bumper harvest',
    goodsRule: { kind: 'fixedGoods', goodIds: ['grain', 'cotton'] },
    scopeRule: { kind: 'producerCityOfAffectedGoods' },
    // §7: "-40%" exact, no range given.
    multiplier: { kind: 'single', range: { min: 0.6, max: 0.6 } },
    durationDays: { min: 4, max: 6 },
    inertInV1: false,
    docNote: 'Exact -40% and duration both given directly by §7 — no assumptions needed.',
  },

  droughtCropFailure: {
    typeId: 'droughtCropFailure',
    label: 'Drought / crop failure',
    goodsRule: { kind: 'fixedGoods', goodIds: ['grain'] },
    // §7: "regional" -> modeled as one tier of cities (same interpretation
    // used for War scare below and for Government tariff's explicit "one
    // tier of cities" phrasing).
    scopeRule: { kind: 'oneTier' },
    // §7: "+60-120%" -> multiplier 1.6-2.2.
    multiplier: { kind: 'single', range: { min: 1.6, max: 2.2 } },
    // §7 gives no duration for this row. Documented default (see file
    // header) — candidate for T029 tuning.
    durationDays: { min: 5, max: 8 },
    inertInV1: false,
    docNote:
      '"Regional" modeled as one-tier scope. §7 gives no duration for this row; ' +
      'defaulted to 5-8 days (documented assumption, candidate for T029).',
  },

  mineCollapse: {
    typeId: 'mineCollapse',
    label: 'Mine collapse',
    // §7: "Iron/Rare Metals" — both now reachable (2026-08 Tier 3/4
    // expansion added Rare Metals + Kessler Mines; see data/goods.ts and
    // data/cities.ts).
    goodsRule: { kind: 'fixedGoods', goodIds: ['iron', 'rare-metals'] },
    // §7: "at source city" -> the city that produces the affected good(s).
    scopeRule: { kind: 'producerCityOfAffectedGoods' },
    // §7: "+50-150%" -> multiplier 1.5-2.5.
    multiplier: { kind: 'single', range: { min: 1.5, max: 2.5 } },
    durationDays: { min: 4, max: 7 },
    inertInV1: false,
    docNote:
      '§7 gives no duration for this row; defaulted to 4-7 days (documented assumption). ' +
      'Rare Metals rejoined affectedGoodIds 2026-08 once Kessler Mines (its source city) shipped.',
  },

  workersStrike: {
    typeId: 'workersStrike',
    label: "Workers' strike",
    // Resolved together with scope in eventEngine.ts: pick a producer city,
    // then one of ITS produced goods is the affected good.
    goodsRule: { kind: 'derivedFromScope' },
    // §7: "its good +30% everywhere else" -> modeled as global (closest fit
    // to "everywhere else" — see file header's simplification note about the
    // picked city not being technically exempted).
    scopeRule: { kind: 'producerCityOwnGood' },
    // §7: "+30%" exact.
    multiplier: { kind: 'single', range: { min: 1.3, max: 1.3 } },
    durationDays: { min: 5, max: 8 },
    inertInV1: false,
    docNote:
      'Scope modeled as global (no "global except source city" EventScope variant exists) — ' +
      'see file header. §7 gives no duration for this row; defaulted to 5-8 days.',
  },

  warScare: {
    typeId: 'warScare',
    label: 'War scare (regional)',
    // Silk/luxury -20% clause dropped — see file header's documented
    // simplification (a single Event record cannot express two directions
    // across two good groups at once).
    goodsRule: { kind: 'fixedGoods', goodIds: ['steel', 'fuel'] },
    scopeRule: { kind: 'oneTier' },
    // §7: "+40-80%" -> multiplier 1.4-1.8.
    multiplier: { kind: 'single', range: { min: 1.4, max: 1.8 } },
    durationDays: { min: 5, max: 8 },
    inertInV1: false,
    docNote:
      'Silk/luxury -20% secondary clause dropped (single-multiplier-range Event shape cannot ' +
      'express a compound two-direction effect) — see file header. No duration given by §7; ' +
      'defaulted to 5-8 days.',
  },

  techBreakthrough: {
    typeId: 'techBreakthrough',
    label: 'Tech breakthrough',
    // Electronics shipped 2026-08 (Tier 3/4 expansion) — no longer inert.
    goodsRule: { kind: 'fixedGoods', goodIds: ['electronics'] },
    scopeRule: { kind: 'fixedGlobal' },
    // §7: "-35%" -> multiplier 0.65 exact.
    multiplier: { kind: 'single', range: { min: 0.65, max: 0.65 } },
    // §7: "over 5 days" exact.
    durationDays: { min: 5, max: 5 },
    inertInV1: false,
    docNote:
      'Exact -35% and 5-day duration both given directly by §7 — no assumptions needed. ' +
      'Activated 2026-08 once Electronics shipped (previously inert, out of v1 scope).',
  },

  newDepositDiscovered: {
    typeId: 'newDepositDiscovered',
    label: 'New deposit discovered',
    // Rare Metals shipped 2026-08 (Tier 3/4 expansion) — no longer inert.
    goodsRule: { kind: 'fixedGoods', goodIds: ['rare-metals'] },
    // §7 implies a source-city concept (mirroring Mine collapse) — now that
    // Kessler Mines (Rare Metals' only producer) exists, resolve to
    // whichever city actually produces the affected good, same rule Mine
    // collapse uses.
    scopeRule: { kind: 'producerCityOfAffectedGoods' },
    // §7: "-50%" -> multiplier 0.5 exact.
    multiplier: { kind: 'single', range: { min: 0.5, max: 0.5 } },
    // §7: "for 8 days" exact.
    durationDays: { min: 8, max: 8 },
    inertInV1: false,
    docNote:
      'Exact -50% and 8-day duration both given directly by §7. Activated 2026-08 once Rare ' +
      'Metals + Kessler Mines (its only producer) shipped — scope now resolves to the producer ' +
      "city (mirrors Mine collapse's rule) instead of the old inert global placeholder.",
  },

  shipSinkingRouteClosed: {
    typeId: 'shipSinkingRouteClosed',
    label: 'Ship sinking / route closed',
    // Resolved together with scope: the picked port's `wants` (imported)
    // goods become the affected goods.
    goodsRule: { kind: 'derivedFromScope' },
    scopeRule: { kind: 'importingCity' },
    // §7: "+25-60%" -> multiplier 1.25-1.6.
    multiplier: { kind: 'single', range: { min: 1.25, max: 1.6 } },
    durationDays: { min: 5, max: 8 },
    inertInV1: false,
    docNote:
      '"Import goods at the affected port" modeled as the picked city\'s `wants` list (§4\'s ' +
      'per-city producer/want data doubles as the import-dependency signal). §7 gives no ' +
      'duration for this row; defaulted to 5-8 days.',
  },

  festivalSeason: {
    typeId: 'festivalSeason',
    label: 'Festival season',
    goodsRule: { kind: 'fixedGoods', goodIds: ['silk', 'spices'] },
    scopeRule: { kind: 'oneCity' },
    // §7: "+30%" exact.
    multiplier: { kind: 'single', range: { min: 1.3, max: 1.3 } },
    // §7: "3 days" exact.
    durationDays: { min: 3, max: 3 },
    inertInV1: false,
    docNote: 'Exact +30% and 3-day duration both given directly by §7 — no assumptions needed.',
  },

  governmentTariff: {
    typeId: 'governmentTariff',
    label: 'Government tariff/policy',
    goodsRule: { kind: 'oneRandomGood' },
    // §7: "one tier of cities" exact.
    scopeRule: { kind: 'oneTier' },
    // §7: "±20-40%" -> two directions, eventEngine.ts picks one per
    // occurrence.
    multiplier: {
      kind: 'dual',
      increase: { min: 1.2, max: 1.4 },
      decrease: { min: 0.6, max: 0.8 },
    },
    // §7: "10 days" exact.
    durationDays: { min: 10, max: 10 },
    inertInV1: false,
    docNote:
      '"±20-40%" modeled as a dual-direction spec — eventEngine.ts\'s scheduleEvent picks ' +
      'increase-vs-decrease at random per scheduled occurrence, then records a single concrete ' +
      'range on the resulting Event, exactly like every other event type.',
  },

  epidemic: {
    typeId: 'epidemic',
    label: 'Epidemic',
    goodsRule: { kind: 'allGoods' },
    scopeRule: { kind: 'oneCity' },
    // §7: "-15%" exact.
    multiplier: { kind: 'single', range: { min: 0.85, max: 0.85 } },
    durationDays: { min: 5, max: 8 },
    inertInV1: false,
    docNote:
      'Price-side effect only ("all goods -15% there"). §7 also says "hotel closed" for this ' +
      'event — that interaction is a LATER task\'s job (T056, once Phase 2 hotel ownership ' +
      'exists); this table only defines the price multiplier. §7 gives no duration for this ' +
      'row; defaulted to 5-8 days.',
  },

  warehouseFire: {
    typeId: 'warehouseFire',
    label: 'Warehouse fire',
    // Always resolves empty — this event type never moves a price. See file
    // header's "T050 ADDITION" section for the full rationale.
    goodsRule: { kind: 'none' },
    // Retained purely for `EventTypeDef` shape completeness (never actually
    // consumed — `warehouse.ts` owns this event's real scope/firing/effect
    // via its own dedicated per-city daily roll, not `resolveScopeAndGoods`).
    scopeRule: { kind: 'oneCity' },
    // Neutral 1x — never applied to any price (empty affectedGoodIds above
    // guarantees `getActiveEventEffectsFor` can never match this event to
    // any good even if it somehow entered the normal pipeline).
    multiplier: { kind: 'single', range: { min: 1, max: 1 } },
    durationDays: { min: 1, max: 1 },
    inertInV1: false,
    docNote:
      "§14's Warehouse fire: destroys 10-40% of one city's stored warehouse goods (10% if " +
      'insured), NOT a price effect. Deliberately EXCLUDED from `PRICE_EVENT_TYPE_IDS` (the ' +
      "array eventEngine.ts's scheduleEvent actually draws from) — its real random firing is a " +
      'dedicated daily check in warehouse.ts against CONFIG.warehouse.fire.dailyProbability, ' +
      "independent of this table's scheduleEvent/resolveDueEvents pipeline. This entry exists " +
      "purely for EventTypeId/label completeness (e.g. newspaper.ts's generic " +
      'EVENT_TABLE[event.typeId] lookup) — see file header for the full rationale.',
  },

  aviationSafetyIncident: {
    typeId: 'aviationSafetyIncident',
    label: 'Aviation safety incident',
    // No commodity is affected — see file header's "PHASE 2 ADDITION" note.
    goodsRule: { kind: 'inertNoV1Good' },
    scopeRule: { kind: 'fixedGlobal' },
    // Neutral multiplier (never actually applied to any price, since
    // affectedGoodIds always resolves empty) — kept at 1.0 purely so this
    // record has a well-formed, harmless value in every field.
    multiplier: { kind: 'single', range: { min: 1, max: 1 } },
    // §16: "grounded 5-10 days" — this IS the real, consumed duration
    // range: `resolveEvent`'s ordinary duration draw becomes the grounded
    // plane's active window (see aviation.ts's `applyAviationSafetyIncidents`).
    durationDays: { min: 5, max: 10 },
    inertInV1: true,
    docNote:
      'Non-price event (§16 Aviation) — grounds one random leased plane instead of moving any ' +
      'commodity price. Modeled as an inert price entry (empty affectedGoodIds, neutral ' +
      'multiplier) that reuses only the ordinary schedule/resolve machinery\'s duration draw; ' +
      'the actual grounding effect is consumed directly by aviation.ts, not by this table or by ' +
      'getActiveEventEffectsFor. See file header for the full rationale.',
  },
}

/** Convenience: every event type id defined in this table (12, including
 * Warehouse fire), in table-declaration order. Not required by any consumer
 * yet, but useful for iterating the FULL table without re-deriving
 * `Object.keys` everywhere (eventTable.test.ts and eventEngine.test.ts both
 * need this at least once). NOTE: this is NOT the array `eventEngine.ts`'s
 * `scheduleEvent` draws its uniform pick from — see `PRICE_EVENT_TYPE_IDS`
 * immediately below for that (deliberately narrower) pool. */
export const EVENT_TYPE_IDS = Object.keys(EVENT_TABLE) as EventTypeId[]

/**
 * The subset of `EVENT_TYPE_IDS` that actually move prices and are eligible
 * for `eventEngine.ts`'s `scheduleEvent` uniform draw — i.e. every event type
 * EXCEPT `warehouseFire` (T050 — see file header's "T050 ADDITION" section
 * for why that one type is excluded). `eventEngine.ts` picks from THIS array,
 * not `EVENT_TYPE_IDS`, so Warehouse fire is never scheduled/resolved through
 * the newspaper/rumor pipeline at all; it fires exclusively via
 * `warehouse.ts`'s own dedicated daily roll.
 */
export const PRICE_EVENT_TYPE_IDS = EVENT_TYPE_IDS.filter((id) => id !== 'warehouseFire')

/** Type-only re-export so callers don't need a second import from
 * ../types just to reference the scope shape while working with this
 * table. */
export type { CityId, EventScope }
