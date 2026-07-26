/**
 * CA (Certified Accountant) hiring system — Trade Winds of Selvara.
 *
 * Design doc reference: §10 CA tiers table — "hire for the year, fee due on
 * hiring, effective that fiscal year... Hiring available at Medium+ bank
 * cities." Four tiers (none/Junior/Senior/Elite), each with its own annual
 * fee, tax rate, profit cap, and above-cap rate (`CONFIG.tax.caTiers`, T003).
 *
 * Pure TypeScript, zero React imports (see /src/engine/README.md).
 *
 * ---------------------------------------------------------------------------
 * DESIGN — Medium+ bank gating: same ordered-rank pattern as informant.ts
 * ---------------------------------------------------------------------------
 * `isCAHiringAvailable` reuses the exact `BANK_SIZE_RANK` comparison
 * `informant.ts`'s `isInformantAvailable` already established for its own
 * "Medium+ bank city" gate (§7's Informant, T020) — a small, self-contained
 * duplicate rather than a shared import, so this file has no dependency on
 * informant.ts (a different subsystem) for a two-line comparison. Comparing
 * ordinal rank rather than a hardcoded city-id list means a future Tier 3/4
 * city with a `Large`/`Huge` bank (out of v1 scope, §13) needs no
 * special-casing here either.
 *
 * ---------------------------------------------------------------------------
 * DESIGN — `hireCA` is a one-year contract, not a standing subscription
 * ---------------------------------------------------------------------------
 * §10's own phrasing — "hire for the year, fee due on hiring, effective THAT
 * fiscal year" — means paying the annual fee buys exactly one year of
 * service; `runYearEnd` (tax.ts, T030/T031) resets
 * `state.hiredCATierThisFiscalYear` back to `'none'` once it has used it to
 * compute that year's tax, so a player who wants a CA again next year must
 * call `hireCA` (and pay again) before the NEXT year-end. This file only
 * writes that field; tax.ts owns reading it and resetting it — see that
 * file's own T031 updates.
 *
 * ---------------------------------------------------------------------------
 * DESIGN — re-hiring/upgrading mid-year is allowed, not specially rejected
 * ---------------------------------------------------------------------------
 * Nothing in §10 says hiring a second time (the same tier, or a different
 * one) within the same fiscal year is disallowed — `hireCA` always charges
 * the tier's full annual fee and overwrites
 * `hiredCATierThisFiscalYear` with whatever tier was just requested. This
 * means a player COULD wastefully hire Junior then Elite the same year
 * (paying both fees, only the Elite rate ends up applying) — a real but
 * minor inefficiency the task brief doesn't ask this file to guard against,
 * left as the player's own choice.
 */

import { CONFIG } from './config'
import { CITIES } from './data/cities'
import type { BankSize, CATier, GameState } from './types'

// ---------------------------------------------------------------------------
// Medium+ bank gating (see file header)
// ---------------------------------------------------------------------------

const BANK_SIZE_RANK: Record<BankSize, number> = {
  Small: 0,
  Medium: 1,
  Large: 2,
  Huge: 3,
}

/**
 * True only when the player's current city has a Medium-or-larger bank
 * (§10: "Hiring available at Medium+ bank cities"). Returns `false` (never
 * throws) if `state.currentCity` isn't found in `CITIES` at all.
 */
export function isCAHiringAvailable(state: GameState): boolean {
  const city = CITIES.find((c) => c.id === state.currentCity)
  if (!city) return false
  return BANK_SIZE_RANK[city.bankSize] >= BANK_SIZE_RANK.Medium
}

// ---------------------------------------------------------------------------
// hireCA
// ---------------------------------------------------------------------------

/**
 * Hires a CA at `tier` ('junior' | 'senior' | 'elite' — hiring `'none'`
 * makes no sense, there is nothing to purchase, so it's excluded from the
 * parameter type entirely rather than accepted-and-rejected at runtime) for
 * the CURRENT fiscal year.
 *
 * Validates:
 *   - `isCAHiringAvailable(state)` — must be standing in a Medium+ bank city
 *   - `state.cash >= CONFIG.tax.caTiers[tier].annualFee`
 *
 * On success: deducts the tier's annual fee from `state.cash` and sets
 * `state.hiredCATierThisFiscalYear = tier` (see file header for why this is
 * scoped to the current year only). Rejected (returns the identical `state`
 * reference, unchanged) when either validation fails.
 */
export function hireCA(state: GameState, tier: Exclude<CATier, 'none'>): GameState {
  if (!isCAHiringAvailable(state)) return state

  const fee = CONFIG.tax.caTiers[tier].annualFee
  if (state.cash < fee) return state

  return {
    ...state,
    cash: state.cash - fee,
    hiredCATierThisFiscalYear: tier,
  }
}
