/**
 * Global tunable-constant registry — Trade Winds of Selvara.
 *
 * Every number marked ⚙ in trade-winds-design-doc.md (§3-§10, plus the
 * placeholder Phase 2 sections §14-§16) lives here and ONLY here. Balancing
 * the game means editing this file (§17: "Config rule: every ⚙ number lives
 * in /src/engine/config.ts. Balancing = editing one file."). No other file
 * in this codebase should hardcode any of these numbers — import them from
 * `CONFIG` (or the standalone `YEAR_LENGTH_DAYS` export) instead.
 *
 * Pure TypeScript, zero React imports (see /src/engine/README.md).
 *
 * Doc section map:
 *   §3  difficulty
 *   §4  cityUnlocks, travel, cargo
 *   §5  (see comment above `goods` section — per-good data lives in T006)
 *   §6  priceEngine
 *   §7  events
 *   §8  rank
 *   §9  banking
 *   §10 tax
 *   §14 warehouse (placeholder — filled in by T046)
 *   §15 hotel (placeholder — filled in by T053)
 *   §16 aviation (placeholder — filled in by T059)
 */

import type { BankSize, CATier, Difficulty, VolatilityClass } from './types'

// ---------------------------------------------------------------------------
// Cross-cutting constant reused by every yearly/annual system (§10, §14-§16)
// ---------------------------------------------------------------------------

/**
 * §10: "1 game year = 90 days" — the tax year-end cadence. §16's footnote
 * clarifies that every "annual"/"yearly" figure in the whole game (CA tiers,
 * warehouse maintenance, hotel license fees, aviation "annual" lease rate
 * and year-over-year depreciation) rides this SAME 90-day clock, not a real
 * calendar year. Import this one constant everywhere a "year" is needed —
 * do not redefine 90 anywhere else (T059/T061/T064 reuse this directly).
 */
export const YEAR_LENGTH_DAYS = 90

// ---------------------------------------------------------------------------
// §3 — Difficulty modes
// ---------------------------------------------------------------------------

export interface DifficultyConfig {
  startingCash: number
  /** City id the run begins in (matches an id defined in data/cities.ts). */
  startingCityId: string
  /** Additive bonus/penalty applied to rumor/insider-tip accuracy, e.g. 0.15
   * for Noob's "+15%", -0.10 for Expert's "-10%". */
  rumorAccuracyBonus: number
  /** §3: "First tax year — waived" for Noob only. */
  firstTaxYearWaived: boolean
  /** Multiplies the price engine's dailyNoise/trend swings (§6). */
  priceVolatilityMultiplier: number
  /** Multiplies bank loan daily interest rates (§9). */
  loanInterestMultiplier: number
  /** Applied to leaderboard/high-score reporting only — never affects
   * in-run mechanics (§3: "score multiplier applies to leaderboard score
   * only"). */
  scoreMultiplier: number
}

export const DIFFICULTY: Record<Difficulty, DifficultyConfig> = {
  Noob: {
    startingCash: 2000,
    startingCityId: 'farrow',
    rumorAccuracyBonus: 0.15,
    firstTaxYearWaived: true,
    priceVolatilityMultiplier: 0.8,
    loanInterestMultiplier: 0.8,
    scoreMultiplier: 0.75,
  },
  Pro: {
    startingCash: 1000,
    startingCityId: 'farrow',
    rumorAccuracyBonus: 0,
    firstTaxYearWaived: false,
    priceVolatilityMultiplier: 1.0,
    loanInterestMultiplier: 1.0,
    scoreMultiplier: 1.0,
  },
  Expert: {
    startingCash: 500,
    startingCityId: 'copperfell',
    rumorAccuracyBonus: -0.1,
    firstTaxYearWaived: false,
    priceVolatilityMultiplier: 1.3,
    loanInterestMultiplier: 1.25,
    scoreMultiplier: 1.5,
  },
}

// ---------------------------------------------------------------------------
// §4 — World: city unlock thresholds, travel/fare formula, cargo capacity
// ---------------------------------------------------------------------------

export const CITY_UNLOCKS = {
  /** Tier 1 is unlocked from game start — no threshold. */
  tier2NetWorth: 25_000,
  tier3NetWorth: 250_000,
  tier4NetWorth: 2_000_000,
}

export const TRAVEL = {
  /** §4: `Fare = $10 × days × (1 + destination tier × 0.5)`. */
  fareBaseRatePerDay: 10,
  fareTierMultiplier: 0.5,
  /** Fare doubles when carrying more than this fraction of cargo capacity. */
  cargoDoublingThresholdPct: 0.6,
  cargoDoublingFactor: 2,
}

export const CARGO = {
  startingCapacity: 40,
  /** §2: fixed, ordered upgrade path — must be purchased in order (T011). */
  upgrades: [
    { capacity: 100, cost: 2_500 },
    { capacity: 250, cost: 12_000 },
    { capacity: 600, cost: 60_000 },
    { capacity: 1_500, cost: 300_000 },
  ],
}

// ---------------------------------------------------------------------------
// §5 — Commodities
// ---------------------------------------------------------------------------
// §5's numbers (unlock condition, license fee, base price, volatility class,
// per-good daily drift %) are PER-GOOD data, not global tunables — they live
// as individual `Good` records in /src/engine/data/goods.ts (T006), one
// object per commodity, matching §5's table exactly. Nothing to put here
// beyond the class-level fallback noise ranges captured under `priceEngine`
// below (used by the price engine as a documented reference; each good's
// own `dailyDriftPct` field in data/goods.ts remains the authoritative
// per-good value).

// ---------------------------------------------------------------------------
// §6 — Price engine
// ---------------------------------------------------------------------------

export const PRICE_ENGINE = {
  /** §6: "slow global sine/random-walk, period 20-40 days". */
  trendPeriodMinDays: 20,
  trendPeriodMaxDays: 40,
  /** §6: trend amplitude ±15%. */
  trendAmplitudePct: 0.15,

  /**
   * §6: "dailyNoise ... uniform within the good's volatility class".
   * Reference ranges derived from §5's per-good daily-drift column, grouped
   * by volatility class (min/max actually used by v1's goods in that
   * class). Each good's own exact value lives in data/goods.ts (T006);
   * this table is a documented fallback/default, not an override.
   */
  volatilityClassDailyNoisePct: {
    // Grain ±4%, Cotton ±5%, Salt ±4% (§5)
    Stable: { min: 0.04, max: 0.05 },
    // Iron ±7%, Textiles ±8% (§5)
    Low: { min: 0.07, max: 0.08 },
    // Spices ±12%, Fuel ±14%, Steel ±12% (§5)
    Medium: { min: 0.12, max: 0.14 },
    // Silk ±18% (v1); Electronics ±22% is OUT of v1 scope (§13) but kept
    // for config completeness since Electronics is a defined §5 good.
    High: { min: 0.18, max: 0.22 },
    // Rare Metals ±30% — OUT of v1 scope (§13), kept for completeness.
    Extreme: { min: 0.3, max: 0.3 },
  } satisfies Record<VolatilityClass, { min: number; max: number }>,

  /**
   * §6: "producer 0.65-0.8, neutral 0.9-1.1, consumer 1.2-1.6" — the ranges
   * used when deriving each city+good's concrete `CityGoodModifier.modifier`
   * (T005 data generation), keyed by `CityGoodRole`.
   */
  cityModifierRanges: {
    producer: { min: 0.65, max: 0.8 },
    neutral: { min: 0.9, max: 1.1 },
    consumer: { min: 1.2, max: 1.6 },
  },

  /** §6: mean reversion — "if price > 2.2x or < 0.45x base×cityMod, pull
   * 10%/day back". */
  meanReversion: {
    upperTriggerMultiplier: 2.2,
    lowerTriggerMultiplier: 0.45,
    pullRatePerDay: 0.1,
  },

  /** §6: "Hard floor 0.3x and ceiling 4x of (base × cityModifier)". */
  hardFloorMultiplier: 0.3,
  hardCeilingMultiplier: 4,
}

// ---------------------------------------------------------------------------
// §7 — Newspaper & rumor engine
// ---------------------------------------------------------------------------

export const EVENTS = {
  /** §7 step 1: "schedules an event 2-4 days in the future". */
  scheduleWindowMinDays: 2,
  scheduleWindowMaxDays: 4,
  /** §7 step 2: "each morning's paper carries 2-4 items". */
  storiesPerDayMin: 2,
  storiesPerDayMax: 4,

  /** §7 step 3: visible source-style accuracy — "wire is right ~80%,
   * gossip ~50%". */
  wireAccuracy: 0.8,
  gossipAccuracy: 0.5,

  /** §7 "Fog of wealth" net-worth breakpoints controlling rumor specificity:
   * below the low breakpoint = exact city+good; between = good+region only;
   * above the high breakpoint = directional only. */
  fogOfWealth: {
    exactDetailBelowNetWorth: 50_000,
    regionOnlyBelowNetWorth: 500_000,
  },

  /** §7 "Insider information" — Informant tips. */
  insider: {
    /** Base tip accuracy (adjusted further by difficulty's
     * `rumorAccuracyBonus`, §3). */
    baseAccuracy: 0.7,
    /** Novara Heights' bonus accuracy — unreachable in v1 (Tier 4, §13) but
     * kept so a future Tier 4 addition needs no special-casing. */
    novaraBonusAccuracy: 0.75,
    /** Tip price = `max(tipPriceFloor, tipPricePctOfNetWorth * netWorth)`. */
    tipPriceFloor: 500,
    tipPricePctOfNetWorth: 0.01,
  },
}

// ---------------------------------------------------------------------------
// §8 — Hidden trader rank
// ---------------------------------------------------------------------------

export const RANK = {
  /** §8 formula weights:
   * `score = 0.5*log10(netWorth+1) + 0.3*log10(tradeVolume+1)
   *        + 1.5*repaymentRecord + 0.2*log10(daysSurvived+1)`. */
  weights: {
    netWorthLog10: 0.5,
    tradeVolumeLog10: 0.3,
    repaymentRecord: 1.5,
    daysSurvivedLog10: 0.2,
  },
  /** §8: repaymentRecord clamp [-2, +2]. */
  repaymentRecordClamp: { min: -2, max: 2 },
  /** §8: `rank = clamp(floor(score), 1, 10)`. */
  rankClamp: { min: 1, max: 10 },
  /** §8: "recomputed weekly (every 7 days)". */
  recomputeCadenceDays: 7,
}

// ---------------------------------------------------------------------------
// §9 — Banking (loans, deposits, default)
// ---------------------------------------------------------------------------

export const BANKING = {
  /** §9: `Max principal = baseCap(bankSize) × rankFactor(rank)`. */
  loanBaseCaps: {
    Small: 1_000,
    Medium: 10_000,
    Large: 50_000,
    Huge: 250_000,
  } satisfies Record<BankSize, number>,

  /** §9: "rankFactor: rank 1 = 1x, each rank ×1.8 (rank 10 ≈ 198x)" —
   * i.e. `rankFactor(rank) = rankFactorBase ^ (rank - 1)`. */
  rankFactorBase: 1.8,

  /** §9: daily simple loan interest by bank size, BEFORE the difficulty
   * `loanInterestMultiplier` (§3) is applied. */
  loanInterestDailyRates: {
    Small: 0.009,
    Medium: 0.007,
    Large: 0.0055,
    Huge: 0.004,
  } satisfies Record<BankSize, number>,

  /** §9: "Interest: ... Simple daily interest added to balance." Loan term
   * length, used by the default-trigger check below. */
  loanTermDays: 60,

  /** §9: deposit daily compounding interest by bank size. */
  depositInterestDailyRates: {
    Small: 0.001,
    Medium: 0.0014,
    Large: 0.0018,
    Huge: 0.0025,
  } satisfies Record<BankSize, number>,

  /** §9: "One active loan per bank; up to 3 banks concurrently." */
  maxConcurrentBankLoans: 3,

  default: {
    /** §9 trigger (a): a loan is this many days past its `loanTermDays`
     * term. */
    overdueGraceDays: 15,
    /** §9 trigger (b): total debt exceeds this multiple of net worth... */
    debtToNetWorthRatioTrigger: 2,
    /** ...for this many consecutive days. */
    debtToNetWorthTriggerDays: 7,

    /** §9 branch 1 — Surrender assets. */
    surrender: {
      /** Bank seizes deposits + cargo at this fraction of value. */
      seizureValueFraction: 0.7,
      repaymentRecordPenalty: -0.5,
    },

    /** §9 branch 2 — Restructure (debt pressure). */
    restructure: {
      /** Debt refinanced at this multiple of the normal interest rate. */
      interestMultiplier: 2,
      /** Collector fee, per day, as a fraction of debt. */
      collectorFeeDailyRatePctOfDebt: 0.005,
      repaymentRecordPenalty: -0.3,
      /** Forced game-over if debt is still > `debtToNetWorthRatioTrigger`
       * times net worth after this many more days. */
      recheckAfterDays: 15,
    },

    // §9 branch 3 — Bankruptcy: no numeric constants; run ends immediately,
    // final score = peakNetWorth (§1).
  },
}

// ---------------------------------------------------------------------------
// §10 — Tax & CA system
// ---------------------------------------------------------------------------

export interface CATierConfig {
  annualFee: number
  /** Tax rate applied to taxable profit up to `profitCap` (null = no cap,
   * i.e. the "none" tier, which has no cap concept since it's flat). */
  taxRate: number
  /** Profit cap at `taxRate`; profit above this is taxed at
   * `aboveCapTaxRate` instead. `null` for the no-CA tier (flat rate, no
   * cap distinction). */
  profitCap: number | null
  aboveCapTaxRate: number
}

export const TAX = {
  /** §10: "1 game year = 90 days". Re-exported here for convenience;
   * identical to the top-level `YEAR_LENGTH_DAYS`. */
  yearLengthDays: YEAR_LENGTH_DAYS,

  /** §10: "No CA: 30% of taxable profit." */
  noCaRate: 0.3,

  /** §10 CA tiers table. */
  caTiers: {
    none: { annualFee: 0, taxRate: 0.3, profitCap: null, aboveCapTaxRate: 0.3 },
    junior: { annualFee: 25_000, taxRate: 0.2, profitCap: 1_000_000, aboveCapTaxRate: 0.3 },
    senior: { annualFee: 100_000, taxRate: 0.12, profitCap: 5_000_000, aboveCapTaxRate: 0.3 },
    elite: { annualFee: 500_000, taxRate: 0.08, profitCap: 25_000_000, aboveCapTaxRate: 0.3 },
  } satisfies Record<CATier, CATierConfig>,

  /** §10: if cash+deposits can't cover the tax bill, the shortfall becomes
   * a forced loan at this daily rate (described in the doc as "Huge-bank
   * loan at penalty rate 1.2%/day" — a distinct, higher penalty rate, not
   * simply `BANKING.loanInterestDailyRates.Huge`). */
  forcedLoanPenaltyDailyRate: 0.012,
}

// ---------------------------------------------------------------------------
// §14 — Warehouse Storage (Phase 2 / Phase 10, T046)
// ---------------------------------------------------------------------------
// Placeholder only — do NOT fill in yet. T046 will populate floor
// capacities/costs/maintenance here (and in /src/engine/data/warehouse.ts),
// plus the warehouse-fire loss range and insurance rate (T050).
export const WAREHOUSE = {
  // Filled in by T046
}

// ---------------------------------------------------------------------------
// §15 — Hotel Ownership (Phase 2 / Phase 11, T053)
// ---------------------------------------------------------------------------
// Placeholder only — do NOT fill in yet. T053 will populate the 4 tiers'
// build/upgrade, passive-revenue, and annual-license multipliers here (all
// expressed × each city's nightly rate, per §15).
export const HOTEL = {
  // Filled in by T053
}

// ---------------------------------------------------------------------------
// §16 — Aviation: Plane Ownership & Leasing (Phase 2 / Phase 12, T059)
// ---------------------------------------------------------------------------
// Placeholder only — do NOT fill in yet. T059 will populate the 4 plane
// classes' purchase price / lease rates / travel bonuses here, plus
// maintenance rate, depreciation rate/floor, and liquidation fee
// (T059/T064).
export const AVIATION = {
  // Filled in by T059
}

// ---------------------------------------------------------------------------
// Barrel export — single entry point for all config, per §17's
// "balancing = editing one file" rule.
// ---------------------------------------------------------------------------

export const CONFIG = {
  difficulty: DIFFICULTY,
  cityUnlocks: CITY_UNLOCKS,
  travel: TRAVEL,
  cargo: CARGO,
  priceEngine: PRICE_ENGINE,
  events: EVENTS,
  rank: RANK,
  banking: BANKING,
  tax: TAX,
  warehouse: WAREHOUSE,
  hotel: HOTEL,
  aviation: AVIATION,
}
