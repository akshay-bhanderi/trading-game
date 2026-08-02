/**
 * Commodity/goods data — Trade Winds of Selvara.
 *
 * Pure TypeScript, zero React imports (see /src/engine/README.md).
 * Source of truth: trade-winds-design-doc.md §5 (Commodities table).
 * Reuses the `Good`/`GoodId`/`GoodUnlockCondition`/`VolatilityClass` types
 * already defined in /src/engine/types.ts — no redefinition here.
 *
 * TIER 3/4 EXPANSION (2026-08, user-requested): Electronics and Rare Metals
 * — previously excluded per the original §13 v1 scope fence (kept out
 * alongside Tier 3/4 cities, since Rare Metals' only unlock path,
 * `{kind:'city', cityId:'kessler-mines'}`, had no reachable source city) —
 * are now added below, now that Kessler Mines (and the rest of Tier 3/4,
 * see /src/engine/data/cities.ts) exist. §5's table numbers, reproduced
 * exactly.
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
  // ---------------------------------------------------------------------
  // Tier 3/4 expansion (2026-08) — see file header.
  // ---------------------------------------------------------------------
  {
    id: 'electronics',
    name: 'Electronics',
    unlockCondition: { kind: 'tier', tier: 3 },
    licenseFee: 25_000,
    basePrice: 800,
    volatilityClass: 'High',
    dailyDriftPct: 0.22,
  },
  {
    id: 'rare-metals',
    name: 'Rare Metals',
    // §5: "Tier 3 (Kessler)" — unlocked specifically by Kessler Mines, not
    // just any Tier 3 city.
    unlockCondition: { kind: 'city', cityId: 'kessler-mines' },
    licenseFee: 60_000,
    basePrice: 2_500,
    volatilityClass: 'Extreme',
    dailyDriftPct: 0.3,
  },
]
