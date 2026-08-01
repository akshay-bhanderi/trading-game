/**
 * Day/night roll for HubScene's per-city background art (Phase 14, T070).
 * Purely cosmetic — zero effect on economy/balance — but lives in
 * `/src/engine` rather than `/src/ui` because it hooks into two engine-owned
 * state transitions (new-game creation, travel arrival) and must draw from
 * the run's seeded RNG (§6) to stay reproducible like every other random
 * draw the seed already governs. See tasks/phase-14-city-background-scenes.md
 * for the full design rationale.
 *
 * Pure TypeScript, zero React imports (see /src/engine/README.md).
 */

import { createRng, type Rng } from './rng'

// Same tiny FNV-1a technique turnLoop.ts/priceEngine.ts use internally for
// their own stable per-day/per-call sub-seeds; duplicated here since that
// helper isn't exported (established convention — see turnLoop.ts's own
// "duplicated here since that helper isn't exported" comment).
function hashStringToUint32(str: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** Fresh `Rng` for a single day/night roll, deterministic per `(seed, key)`
 * on its own stream independent of every other engine RNG use. `key` should
 * be unique per roll (e.g. the arrival day, or `'start'` for the very first
 * city) so repeated rolls across a run don't all land on the same draw. */
export function createCityNightRng(seed: number, key: string): Rng {
  return createRng(hashStringToUint32(`${seed}:cityBackgroundNight:${key}`))
}

/** Night probability for a completed trip of `travelDays` days (§4's 1-3 day
 * trips) — longer journeys read as more likely to arrive after dark: 1 day
 * ≈ 25%, 2 days ≈ 50%, 3 days ≈ 75%. Clamped for any value outside 1-3
 * (defensive — e.g. a future longer Tier 3/4 trip) rather than throwing. */
export function nightProbabilityForTravelDays(travelDays: number): number {
  const clamped = Math.min(3, Math.max(1, travelDays))
  return 0.25 * clamped
}

/** Rolls day (`false`) / night (`true`) at the given probability. */
export function rollIsNight(rng: Rng, nightProbability: number): boolean {
  return rng.next() < nightProbability
}
