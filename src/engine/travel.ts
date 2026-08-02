/**
 * Travel distance matrix and fare calculation — Trade Winds of Selvara.
 *
 * Source of truth: trade-winds-design-doc.md §4 ("Travel" subsection).
 *
 * §4 full distance rule: "Distance matrix (days): within same tier cluster
 * = 1 day; adjacent tier = 2 days; Tier 1 <-> Tier 3/4 = 3 days. Frosthelm
 * always 3 days from anywhere except Kessler Mines (2)."
 *
 * TIER 3/4 EXPANSION (2026-08, user-requested): the original v1 scope fence
 * only implemented the first two clauses (same-tier / adjacent-tier), since
 * Tier 3/4 cities (including Frosthelm and Kessler Mines) didn't exist yet.
 * Both remaining clauses are implemented below now that they do:
 *   - "adjacent tier" is generalized to |tierA - tierB| === 1 (was
 *     previously "not the same tier" = 2 days flat, since Tier 1/2 were the
 *     only two tiers that ever existed — now that Tier 3/4 exist, a
 *     same-tier check alone would wrongly give Tier 1<->Tier 4 the same 2
 *     days as Tier 1<->Tier 2).
 *   - any tier gap of 2 or more (Tier 1<->Tier 3, Tier 1<->Tier 4, and by
 *     the same generalization Tier 2<->Tier 4, which §4's prose doesn't
 *     explicitly call out but which the "Tier 1<->Tier 3/4 = 3 days" clause
 *     implies as the natural extension — there is no "4 days" tier
 *     anywhere in the doc) = 3 days.
 *   - Frosthelm's special case OVERRIDES the tier-based calculation
 *     entirely (checked first, not merged into it) — always 3 days from
 *     anywhere except Kessler Mines (2), even though Frosthelm (Tier 4) to
 *     Auren City/Voltspire/Duskfield/Kessler Mines (Tier 3, adjacent tier)
 *     would otherwise compute to 2 days under the generic rule.
 *
 * Pure TypeScript, zero React imports (see /src/engine/README.md).
 */

import { CITIES } from './data/cities'
import type { City, CityId, CityTier } from './types'
import { TRAVEL } from './config'

const FROSTHELM_CITY_ID: CityId = 'frosthelm'
const KESSLER_MINES_CITY_ID: CityId = 'kessler-mines'

/**
 * Distance in days between two DIFFERENT cities, per §4's full rule — see
 * file header. Frosthelm's special case is checked first since it overrides
 * the generic tier-distance calculation entirely.
 */
function cityDistanceDays(from: City, to: City): number {
  if (from.id === FROSTHELM_CITY_ID || to.id === FROSTHELM_CITY_ID) {
    const other = from.id === FROSTHELM_CITY_ID ? to.id : from.id
    return other === KESSLER_MINES_CITY_ID ? 2 : 3
  }
  return tierDistanceDays(from.tier, to.tier)
}

/** Distance in days between two city TIERS, per §4's generic (non-Frosthelm)
 * rule — see file header for the |tierA-tierB| generalization. */
function tierDistanceDays(tierA: CityTier, tierB: CityTier): number {
  if (tierA === tierB) return 1
  return Math.abs(tierA - tierB) === 1 ? 2 : 3
}

/**
 * Full 15x15 distance-in-days lookup, keyed by [fromCityId][toCityId].
 * Derived programmatically from each city's `tier`/`id` in `CITIES` — not
 * hand-written as individual entries. A same-city entry is 0 days; this
 * is expected and never actually traveled (the Travel action, T013, won't
 * offer a city as its own destination).
 */
function buildDistanceMatrix(): Record<CityId, Record<CityId, number>> {
  const matrix: Record<CityId, Record<CityId, number>> = {}
  for (const from of CITIES) {
    const row: Record<CityId, number> = {}
    for (const to of CITIES) {
      row[to.id] = from.id === to.id ? 0 : cityDistanceDays(from, to)
    }
    matrix[from.id] = row
  }
  return matrix
}

/** Programmatically-derived distance-in-days matrix for all v1 city pairs. */
export const DISTANCE_DAYS: Record<CityId, Record<CityId, number>> = buildDistanceMatrix()

/**
 * Looks up travel days between two city ids using the precomputed
 * `DISTANCE_DAYS` matrix.
 */
export function getTravelDays(fromCityId: CityId, toCityId: CityId): number {
  const row = DISTANCE_DAYS[fromCityId]
  if (!row || row[toCityId] === undefined) {
    throw new Error(`getTravelDays: unknown city id(s) "${fromCityId}" -> "${toCityId}"`)
  }
  return row[toCityId]
}

/**
 * §4 fare formula: `fare = fareBaseRatePerDay x days x (1 + destinationTier x
 * fareTierMultiplier)`, doubled by `cargoDoublingFactor` when `cargoUsedPct`
 * exceeds `cargoDoublingThresholdPct` (i.e. carrying more than 60% of cargo
 * capacity). All tunable numbers are read from `TRAVEL` in ./config —
 * nothing is hardcoded here.
 */
export function calcFare(days: number, destinationTier: CityTier, cargoUsedPct: number): number {
  const baseFare =
    TRAVEL.fareBaseRatePerDay * days * (1 + destinationTier * TRAVEL.fareTierMultiplier)
  return cargoUsedPct > TRAVEL.cargoDoublingThresholdPct
    ? baseFare * TRAVEL.cargoDoublingFactor
    : baseFare
}
