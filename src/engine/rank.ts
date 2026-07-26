/**
 * Hidden trader rank engine — Trade Winds of Selvara.
 *
 * Design doc reference: §8 ("Hidden Trader Rank (never shown to player)").
 *
 * Pure TypeScript, zero React imports (see /src/engine/README.md).
 *
 * ---------------------------------------------------------------------------
 * Formula (matches §8 exactly)
 * ---------------------------------------------------------------------------
 *   score = weights.netWorthLog10      * log10(netWorth + 1)
 *         + weights.tradeVolumeLog10   * log10(cumulativeTradeVolume + 1)
 *         + weights.repaymentRecord    * clamp(repaymentRecord, repaymentRecordClamp)
 *         + weights.daysSurvivedLog10  * log10(daysSurvived + 1)
 *   rank  = clamp(floor(score), rankClamp.min, rankClamp.max)
 *
 * Every weight and clamp is read from `CONFIG.rank` (config.ts, §8's "⚙
 * weights in config") — no magic numbers duplicated here.
 *
 * ---------------------------------------------------------------------------
 * `daysSurvived` interpretation — documented design decision
 * ---------------------------------------------------------------------------
 * `GameState` has no separate "elapsed time" or "days survived" field —
 * `state.day` (the day counter, starting at 1 on a fresh run per turnLoop.ts)
 * already tracks exactly that: the number of the current day is, by
 * construction, the number of days the run has survived so far. Reusing
 * `state.day` directly as the formula's `daysSurvived` input is therefore a
 * reasonable, exact reading of §8's intent, not an approximation — there is
 * no other candidate field this could mean.
 *
 * ---------------------------------------------------------------------------
 * Negative-input guard — documented design decision
 * ---------------------------------------------------------------------------
 * `calcNetWorth` (netWorth.ts) explicitly documents that net worth "may be
 * negative" (outstanding debt can exceed assets). `log10` of a non-positive
 * number is undefined (`NaN` for negative inputs, `-Infinity` for zero), and
 * §8's formula text doesn't address this case. Rather than let a single bad
 * day of debt poison the whole score with `NaN`, the log argument for both
 * `netWorth` and `cumulativeTradeVolume` is floored at 0 before adding 1
 * (`Math.max(0, x) + 1`), so the log term never drops below 0 regardless of
 * how negative the underlying value is. `daysSurvived` is never negative in
 * practice (`state.day` only ever increases), but the same guard is applied
 * defensively for symmetry and cheap safety.
 *
 * ---------------------------------------------------------------------------
 * CRITICAL DESIGN CONSTRAINT — no display/formatting helper in this file
 * ---------------------------------------------------------------------------
 * §8: "Never render a rank number." This file exposes the raw numeric rank
 * (1-10) because later gameplay hooks need the NUMBER internally (loan caps
 * in T023 via `rankFactor(rank)`, banker dialogue tone per §8's own text) —
 * that is fine and expected. What this file deliberately does NOT contain,
 * and must never grow, is any function that formats/stringifies/labels rank
 * for direct UI display (e.g. no `formatRankForUI(rank): string`, no
 * `rankTitle(rank)`, nothing of the sort). This is a permanent design
 * constraint per §8, not a missing feature or a TODO — the player must never
 * see this number rendered anywhere, in any form.
 *
 * ---------------------------------------------------------------------------
 * Seeding a fresh game's `rankCache` — NOT this task's job
 * ---------------------------------------------------------------------------
 * `maybeRecomputeRank` only compares `state.day - state.rankCache.computedOnDay`
 * against the recompute cadence — it has no opinion on what a brand-new game's
 * initial `rankCache` should be. Whatever code creates a new `GameState` (no
 * such "new game" constructor exists yet in this codebase as of T021) is
 * responsible for seeding `rankCache` sensibly, e.g. `{ value: 1,
 * computedOnDay: startingDay }` (matches the existing test-fixture convention
 * across the codebase, deferring the first real recompute to
 * `startingDay + recomputeCadenceDays`) or `{ value: 1, computedOnDay:
 * startingDay - recomputeCadenceDays }` (forces an immediate first
 * recompute on the very next `advanceDay` call). Either is valid; this file
 * only implements the cadence check, not the initial seed.
 */

import { calcNetWorth } from './netWorth'
import { CONFIG } from './config'
import type { GameState, RankInputs } from './types'

/** Clamps `value` into `[min, max]`. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** `log10(max(0, x) + 1)` — see the file header's "negative-input guard". */
function safeLog10(x: number): number {
  return Math.log10(Math.max(0, x) + 1)
}

/**
 * Pure formula core: computes the 1-10 hidden rank from already-extracted
 * `RankInputs`, per §8's exact formula. Weights/clamps come from
 * `CONFIG.rank` (config.ts) — no magic numbers.
 *
 * Split out from `computeRank` so the formula itself can be unit tested
 * independently of how its inputs are derived from a `GameState`.
 */
export function computeRankFromInputs(inputs: RankInputs): number {
  const { weights, repaymentRecordClamp, rankClamp } = CONFIG.rank

  const clampedRepaymentRecord = clamp(inputs.repaymentRecord, repaymentRecordClamp.min, repaymentRecordClamp.max)

  const score =
    weights.netWorthLog10 * safeLog10(inputs.netWorth) +
    weights.tradeVolumeLog10 * safeLog10(inputs.cumulativeTradeVolume) +
    weights.repaymentRecord * clampedRepaymentRecord +
    weights.daysSurvivedLog10 * safeLog10(inputs.daysSurvived)

  return clamp(Math.floor(score), rankClamp.min, rankClamp.max)
}

/**
 * Computes the player's current hidden trader rank (1-10) directly from a
 * `GameState`, per §8. Builds a `RankInputs` from the state (net worth via
 * `calcNetWorth`, T009; `cumulativeTradeVolume`/`repaymentRecord`/`day` read
 * straight off `state`) and delegates to `computeRankFromInputs`.
 *
 * Returns the raw numeric rank — see the file header's "CRITICAL DESIGN
 * CONSTRAINT" section for why no display/formatting wrapper exists here.
 */
export function computeRank(state: GameState): number {
  const inputs: RankInputs = {
    netWorth: calcNetWorth(state),
    cumulativeTradeVolume: state.cumulativeTradeVolume,
    repaymentRecord: state.repaymentRecord,
    daysSurvived: state.day,
  }
  return computeRankFromInputs(inputs)
}

/**
 * Recomputes and caches the hidden rank if at least
 * `CONFIG.rank.recomputeCadenceDays` (7) days have elapsed since the last
 * computation; otherwise a no-op.
 *
 * Pure function, following the established convention (cargo.ts/stay.ts/
 * netWorth.ts's `updatePeakNetWorth`): on recompute, returns a NEW
 * `GameState` with `rankCache: { value: computeRank(state), computedOnDay:
 * state.day }`; otherwise returns the identical `state` reference,
 * unchanged, so callers can detect the no-op cheaply via `result === state`.
 */
export function maybeRecomputeRank(state: GameState): GameState {
  const daysSinceLastComputed = state.day - state.rankCache.computedOnDay

  if (daysSinceLastComputed < CONFIG.rank.recomputeCadenceDays) {
    return state
  }

  return {
    ...state,
    rankCache: {
      value: computeRank(state),
      computedOnDay: state.day,
    },
  }
}
