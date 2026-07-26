/**
 * Travel distance matrix and fare calculation — Trade Winds of Selvara.
 *
 * Source of truth: trade-winds-design-doc.md §4 ("Travel" subsection), §13
 * (v1 scope fence).
 *
 * §4 full distance rule: "Distance matrix (days): within same tier cluster
 * = 1 day; adjacent tier = 2 days; Tier 1 <-> Tier 3/4 = 3 days. Frosthelm
 * always 3 days from anywhere except Kessler Mines (2)."
 *
 * §13 SCOPE FENCE: v1 only has Tier 1 and Tier 2 cities (8 total — see
 * ./data/cities.ts, T005). Tier 3/4 cities (including Frosthelm and Kessler
 * Mines specifically) do not exist in this codebase. Consequently only the
 * first two clauses of §4's rule are reachable in v1:
 *   - two cities in the SAME tier            -> 1 day
 *   - one Tier 1 city <-> one Tier 2 city     -> 2 days (adjacent tier)
 * The "Tier 1 <-> Tier 3/4 = 3 days" clause and the Frosthelm/Kessler
 * special-casing are N/A for v1 and are deliberately NOT implemented here —
 * no dead branches for unreachable tiers are included. If Tier 3/4 cities
 * are added in a future v2 pass (per §13), `tierDistanceDays` below is the
 * only place that needs extending to add those clauses.
 *
 * Pure TypeScript, zero React imports (see /src/engine/README.md).
 */

import { CITIES } from './data/cities'
import type { CityId, CityTier } from './types'
import { TRAVEL } from './config'

/**
 * Distance in days between two city tiers, per §4 (v1-reachable subset
 * only — see the scope-fence comment above).
 */
function tierDistanceDays(tierA: CityTier, tierB: CityTier): number {
  return tierA === tierB ? 1 : 2
}

/**
 * Full 8x8 (v1 scope) distance-in-days lookup, keyed by [fromCityId][toCityId].
 * Derived programmatically from each city's `tier` in `CITIES` — not
 * hand-written as 64 individual entries. A same-city entry is 0 days; this
 * is expected and never actually traveled (the Travel action, T013, won't
 * offer a city as its own destination).
 */
function buildDistanceMatrix(): Record<CityId, Record<CityId, number>> {
  const matrix: Record<CityId, Record<CityId, number>> = {}
  for (const from of CITIES) {
    const row: Record<CityId, number> = {}
    for (const to of CITIES) {
      row[to.id] = from.id === to.id ? 0 : tierDistanceDays(from.tier, to.tier)
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
