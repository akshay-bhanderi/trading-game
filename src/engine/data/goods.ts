/**
 * Commodity/goods data — Trade Winds of Selvara, v1 scope.
 *
 * Pure TypeScript, zero React imports (see /src/engine/README.md).
 * Source of truth: trade-winds-design-doc.md §5 (Commodities table) and
 * §13 (v1 scope fence). Reuses the `Good`/`GoodId`/`GoodUnlockCondition`/
 * `VolatilityClass` types already defined in /src/engine/types.ts — no
 * redefinition here.
 *
 * Scope note (T006): §5's table lists 11 rows (9 v1 goods + Electronics +
 * Rare Metals), but §5's own prose is internally ambiguous about Rare
 * Metals — one sentence right after the table reads "Rare Metals is one
 * commodity in v1 scope for later (Tier 3)", which read in isolation could
 * be misread as "Rare Metals ships in v1". §13 (the v1 scope fence) is the
 * authoritative section whenever the doc disagrees with itself, and §13
 * settles this explicitly:
 *   - §13's OUT list names "Electronics and Rare Metals commodities"
 *     together, with no carve-out for Rare Metals.
 *   - §13 also states v1 ships "9 commodities (§5, all but Electronics)" —
 *     9 total, which only balances if Rare Metals is ALSO excluded (9 v1
 *     goods + Electronics + Rare Metals = 11 total rows in §5's table).
 *   - Mechanically, Rare Metals' only unlock path is `{ kind: 'city',
 *     cityId: 'kessler-mines' }` (§5: "Tier 3 (Kessler)") — Kessler Mines
 *     is a Tier 3 city, and §13 puts every Tier 3/4 city OUT of v1. With
 *     its sole source city absent, Rare Metals has no reachable unlock
 *     condition in v1 regardless.
 * All three signals agree, so Rare Metals (alongside Electronics) is
 * excluded from this file. Both remain fully defined in the design doc for
 * v2 and are trivial to add back later — see §5's table for their eventual
 * data (Electronics: Tier 3, $25,000 license, base $800, High, ±22%;
 * Rare Metals: Tier 3/Kessler, $60,000 license, base $2,500, Extreme, ±30%).
 *
 * v1 ships exactly 9 goods, matching §5's table rows 1-9.
 */

import type { Good } from '../types'

export const GOODS: Good[] = [
  {
    id: 'grain',
    name: 'Grain',
    unlockCondition: { kind: 'start' },
    licenseFee: null,
    basePrice: 10,
    volatilityClass: 'Stable',
    dailyDriftPct: 0.04,
  },
  {
    id: 'cotton',
    name: 'Cotton',
    unlockCondition: { kind: 'start' },
    licenseFee: null,
    basePrice: 16,
    volatilityClass: 'Stable',
    dailyDriftPct: 0.05,
  },
  {
    id: 'iron',
    name: 'Iron',
    unlockCondition: { kind: 'start' },
    licenseFee: null,
    basePrice: 25,
    volatilityClass: 'Low',
    dailyDriftPct: 0.07,
  },
  {
    id: 'salt',
    name: 'Salt',
    // §5: "Tier 1, day 5+".
    unlockCondition: { kind: 'tier', tier: 1, minDay: 5 },
    licenseFee: 200,
    basePrice: 14,
    volatilityClass: 'Stable',
    dailyDriftPct: 0.04,
  },
  {
    id: 'textiles',
    name: 'Textiles',
    // §5: "Tier 1, day 5+".
    unlockCondition: { kind: 'tier', tier: 1, minDay: 5 },
    licenseFee: 400,
    basePrice: 40,
    volatilityClass: 'Low',
    dailyDriftPct: 0.08,
  },
  {
    id: 'spices',
    name: 'Spices',
    unlockCondition: { kind: 'tier', tier: 2 },
    licenseFee: 1_500,
    basePrice: 90,
    volatilityClass: 'Medium',
    dailyDriftPct: 0.12,
  },
  {
    id: 'fuel',
    name: 'Fuel',
    unlockCondition: { kind: 'tier', tier: 2 },
    licenseFee: 2_500,
    basePrice: 60,
    volatilityClass: 'Medium',
    dailyDriftPct: 0.14,
  },
  {
    id: 'steel',
    name: 'Steel',
    unlockCondition: { kind: 'tier', tier: 2 },
    licenseFee: 4_000,
    basePrice: 120,
    volatilityClass: 'Medium',
    dailyDriftPct: 0.12,
  },
  {
    id: 'silk',
    name: 'Silk',
    // §5 note: "Silk's unlock tier was moved from Tier 3 to Tier 2 to match
    // Port Vela and Silkden, both Tier 2 cities that produce/want it".
    unlockCondition: { kind: 'tier', tier: 2 },
    licenseFee: 10_000,
    basePrice: 300,
    volatilityClass: 'High',
    dailyDriftPct: 0.18,
  },
]
