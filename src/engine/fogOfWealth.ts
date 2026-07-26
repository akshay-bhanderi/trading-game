/**
 * Fog of wealth — rumor specificity scaling by net worth. Trade Winds of
 * Selvara.
 *
 * Design doc reference:
 *   §7 "Fog of wealth": "As net worth grows, public papers get vaguer:
 *   - < $50k: rumors name the exact city and good.
 *   - $50k-500k: rumors name the good but only the region ('northern mining
 *     towns').
 *   - > $500k: rumors are directional only ('industrial metals face
 *     turbulence')."
 *
 * Pure TypeScript, zero React imports (see /src/engine/README.md).
 * NEVER uses `Math.random` — the only randomness this file can produce (the
 * band-3 direction word) is drawn from an optional caller-supplied `Rng`.
 *
 * ---------------------------------------------------------------------------
 * DESIGN — thresholds and exact boundary behavior
 * ---------------------------------------------------------------------------
 * Reuses `CONFIG.events.fogOfWealth` (already defined by an earlier task).
 * The doc writes the three bands as "< $50k", "$50k-500k", and "> $500k" —
 * read literally, $50k itself belongs to band 2 (not band 1, since band 1 is
 * strictly "<"), and $500k itself belongs to band 2 (not band 3, since band
 * 3 is strictly ">"). So the exact comparisons used below are:
 *   netWorth <  exactDetailBelowNetWorth (50_000)                    -> band 1 (exact city + good)
 *   exactDetailBelowNetWorth <= netWorth <= regionOnlyBelowNetWorth  -> band 2 (good + region)
 *   netWorth >  regionOnlyBelowNetWorth (500_000)                    -> band 3 (directional only)
 * See the boundary-value unit tests in fogOfWealth.test.ts for explicit
 * coverage of both threshold values ($50,000 and $500,000 exactly).
 *
 * ---------------------------------------------------------------------------
 * DESIGN — "region" phrases (band 2)
 * ---------------------------------------------------------------------------
 * `City` (types.ts) has no explicit `region` field, and the doc's own
 * example ("northern mining towns") implies some geographic/thematic flavor
 * text exists per city. Rather than build a full region-mapping system, this
 * file authors a small, hardcoded per-city "region phrase" lookup table
 * (`REGION_PHRASE_BY_CITY_ID` below), analogous to how `newspaper.ts`'s
 * `FILLER_STORIES` pool is a small hand-authored flavor-text pool with no
 * deeper mechanical backing. Each phrase is loosely derived from that city's
 * `character` field (data/cities.ts) plus an invented compass direction for
 * flavor — there is no canonical in-game map/compass, so the directions are
 * simply authored once here and are not used anywhere else. A city id with
 * no entry (future cities, or no `cityId` provided at all) falls back to
 * `DEFAULT_REGION_PHRASE`.
 *
 * ---------------------------------------------------------------------------
 * DESIGN — "sector" labels (band 3)
 * ---------------------------------------------------------------------------
 * `Good` (types.ts) has no "sector" field either. This file hardcodes a
 * small good-id -> sector-label map (`SECTOR_BY_GOOD_ID` below), grouping
 * the 9 v1 goods (data/goods.ts) into 5 flavor sectors:
 *   - grain, cotton              -> "agricultural goods"
 *   - iron, steel                -> "industrial metals"
 *   - salt, spices, silk         -> "luxury goods"
 *   - fuel                       -> "energy markets"
 *   - textiles                   -> "manufactured goods"
 * When multiple `goodIds` are passed and span more than one sector, every
 * distinct sector touched is listed, joined with "and" (still no individual
 * good named). An unknown good id falls back to `DEFAULT_SECTOR_LABEL`.
 *
 * ---------------------------------------------------------------------------
 * DESIGN — band-3 direction word
 * ---------------------------------------------------------------------------
 * The doc's band-3 example ("industrial metals face turbulence") pairs the
 * sector label with a short direction verb phrase. A small fixed pool of
 * neutral direction phrases (`DIRECTION_PHRASES`) is defined below. When the
 * caller supplies an `rng` (newspaper.ts always has one in scope at its call
 * site and passes it through for variety), one is picked via `rng.pick`; when
 * omitted (e.g. simple unit tests calling this function directly), the first
 * entry is used deterministically so the function stays pure and
 * side-effect-free without forcing every caller to thread an `Rng` through.
 * This function itself never calls `Math.random`.
 */

import { CONFIG } from './config'
import { CITIES } from './data/cities'
import { GOODS } from './data/goods'
import type { Rng } from './rng'
import type { CityId, GoodId } from './types'

// ---------------------------------------------------------------------------
// Flavor lookup tables (see header for derivation notes)
// ---------------------------------------------------------------------------

/** Band-2 "region" flavor phrase per city id — see header DESIGN note. */
const REGION_PHRASE_BY_CITY_ID: Record<string, string> = {
  farrow: 'the inland farming country',
  saltmere: 'the coastal salt ports',
  copperfell: 'the northern mining towns',
  millbrook: 'the riverside mill towns',
  'port-vela': 'the eastern trading ports',
  ironvale: 'the southern steel country',
  silkden: 'the inland bazaar towns',
  greyharbor: 'the western harbor towns',
}

/** Fallback region phrase for an unknown/missing city id. */
const DEFAULT_REGION_PHRASE = 'the outlying trading towns'

/** Band-3 "sector" flavor label per good id — see header DESIGN note. */
const SECTOR_BY_GOOD_ID: Record<string, string> = {
  grain: 'agricultural goods',
  cotton: 'agricultural goods',
  iron: 'industrial metals',
  steel: 'industrial metals',
  salt: 'luxury goods',
  spices: 'luxury goods',
  silk: 'luxury goods',
  fuel: 'energy markets',
  textiles: 'manufactured goods',
}

/** Fallback sector label for an unknown good id. */
const DEFAULT_SECTOR_LABEL = 'the markets'

/** Small fixed pool of neutral band-3 direction phrases — see header DESIGN
 * note on how (and whether) an `Rng` picks among them. */
const DIRECTION_PHRASES: readonly string[] = [
  'face turbulence',
  'show volatility',
  'are in flux',
  'are stirring',
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function exactGoodNames(goodIds: readonly GoodId[]): string {
  if (goodIds.length === 0) return 'Prices'
  return goodIds.map((id) => GOODS.find((g) => g.id === id)?.name ?? id).join('/')
}

function exactCityName(cityId: CityId): string {
  return CITIES.find((c) => c.id === cityId)?.name ?? cityId
}

function regionPhrase(cityId: CityId | undefined): string {
  if (!cityId) return DEFAULT_REGION_PHRASE
  return REGION_PHRASE_BY_CITY_ID[cityId] ?? DEFAULT_REGION_PHRASE
}

/** Lowercased good name(s) for mid-sentence use in band-1/2 phrasing (e.g.
 * "grain markets", not "Grain markets"). */
function lowerGoodNames(goodIds: readonly GoodId[]): string {
  const names = exactGoodNames(goodIds)
  return names.length > 0 ? names.charAt(0).toLowerCase() + names.slice(1) : names
}

function sectorLabel(goodIds: readonly GoodId[]): string {
  if (goodIds.length === 0) return DEFAULT_SECTOR_LABEL
  const sectors = new Set<string>()
  for (const id of goodIds) {
    sectors.add(SECTOR_BY_GOOD_ID[id] ?? DEFAULT_SECTOR_LABEL)
  }
  return [...sectors].join(' and ')
}

function directionPhrase(rng: Rng | undefined): string {
  if (!rng) return DIRECTION_PHRASES[0] as string
  return rng.pick(DIRECTION_PHRASES)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface DescribeRumorSubjectParams {
  /** The city the rumor concerns, if any (some events are global/tier-scoped
   * and have no single city — see `EventScope` in types.ts). Omitted entirely
   * when there is no specific city to (possibly) reveal. */
  cityId?: CityId
  /** The good(s) affected. May be empty (rare, but handled gracefully). */
  goodIds: readonly GoodId[]
  /** The player's current net worth (`calcNetWorth(state)` from
   * netWorth.ts) — determines which of the three fog-of-wealth bands
   * applies. */
  netWorth: number
  /** Optional RNG for varying the band-3 direction phrase — see header
   * DESIGN note. Never required; omitting it keeps the function fully
   * deterministic. */
  rng?: Rng
}

/**
 * Describes a rumor's subject (affected good(s) + location), with
 * specificity that fogs as `netWorth` grows, per §7 "Fog of wealth":
 *   - netWorth < `CONFIG.events.fogOfWealth.exactDetailBelowNetWorth`
 *     (50k): exact good(s) + exact city, e.g. "Grain prices in Farrow".
 *   - up to and including `regionOnlyBelowNetWorth` (500k): exact good(s) +
 *     a vague region phrase, e.g. "grain markets in the northern
 *     mining towns".
 *   - above `regionOnlyBelowNetWorth`: no good name, no location — just a
 *     vague sector + direction phrase, e.g. "industrial metals face
 *     turbulence".
 * Never mutates anything; pure given its inputs (module-level flavor tables
 * are constant). See file header for the boundary-value reasoning and the
 * region/sector table derivations.
 */
export function describeRumorSubject(params: DescribeRumorSubjectParams): string {
  const { cityId, goodIds, netWorth, rng } = params
  const { exactDetailBelowNetWorth, regionOnlyBelowNetWorth } = CONFIG.events.fogOfWealth

  if (netWorth < exactDetailBelowNetWorth) {
    // Band 1: exact city + exact good.
    const goods = exactGoodNames(goodIds)
    return cityId ? `${goods} prices in ${exactCityName(cityId)}` : `${goods} prices`
  }

  if (netWorth <= regionOnlyBelowNetWorth) {
    // Band 2: exact good, region only (never the literal city name).
    const goods = lowerGoodNames(goodIds)
    return `${goods} markets in ${regionPhrase(cityId)}`
  }

  // Band 3: directional only — no good name, no location.
  return `${sectorLabel(goodIds)} ${directionPhrase(rng)}`
}
