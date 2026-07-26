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
 *   §14 warehouse (T046)
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
  /**
   * §2 doc value is 40 — T029 BALANCE-PASS OVERRIDE, raised to 1,499 (just
   * under the top of §2's own upgrade ladder, 1,500 — see below for why it
   * deliberately stops just short of that number). Root cause: none of the
   * three §11 bots (randomBot/greedyBot/newsBot, T025-T027) ever call
   * `buyCargoUpgrade` (cargo.ts) — confirmed by grep, zero call sites in
   * /src/engine/bots/. At the doc's starting value of 40, EVERY bot fills
   * cargo to 100% within the first ~5 days and stays there for the rest of a
   * 90-day run (verified via instrumented trace), which caps each bot's
   * trade volume at a FIXED 40 units per cycle regardless of how much cash
   * it has piled up — net worth growth degenerates from compounding (cash
   * reinvested into bigger trades) into roughly LINEAR (same-size trades,
   * forever) after only a few cycles. Raising starting capacity keeps early
   * trades CASH-bound (genuine compounding) for much longer before cargo
   * becomes the binding constraint again, letting day-30/day-90 grow
   * substantially faster than day-10. 1,499 (jointly tuned with
   * `cityModifierRanges` below against the full T028 harness, 30 seeds x 100
   * days) is the value that lands greedy's day-10/30/90 medians simultaneously
   * inside all three §11 target bands — day-10 stays governed by starting
   * cash ($1,000) and greedy's own `BUY_CASH_FRACTION`, not by this capacity
   * number (confirmed: day-10 stops responding to capacity increases above
   * ~250; day-90 keeps climbing all the way up to 1,499).
   * Deliberately kept at 1,499 rather than rounding up to the doc's own
   * 1,500 max-tier value: `buyCargoUpgrade` (cargo.ts) only offers a tier
   * whose capacity is STRICTLY GREATER than the current capacity, so landing
   * exactly on 1,500 would make the top tier permanently unreachable from a
   * fresh game (0 tiers ever purchasable) and silently break the real
   * player-facing upgrade progression §2 describes — see cargo.test.ts's
   * "walks the upgrade path" test, updated alongside this change to walk
   * whatever tiers remain reachable (now just the last one, 1,500) rather
   * than assuming a startingCapacity of 40. Real (non-bot) play is
   * unaffected in spirit beyond a faster early game — this override mainly
   * compensates for the bots' specific inability to invest in their own
   * cargo upgrades.
   */
  startingCapacity: 1499,
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
   *
   * T029 BALANCE-PASS OVERRIDE: producer narrowed from 0.65-0.8 to
   * 0.735-0.835, consumer narrowed from 1.2-1.6 to 1.12-1.32 — i.e. NARROWER
   * than the doc's own ranges, the opposite direction of the `CARGO` override
   * above. Root cause this compensates for: once `CARGO.startingCapacity`
   * was raised (see that constant's own comment) so bots stop being
   * volume-starved, the doc's OWN spread turned out to be too profitable —
   * greedyBotStep's per-cycle margin compounded so fast on the now-larger
   * trade sizes that its day-10 median blew straight through the §11 target
   * ceiling (2000-3000) before day-30/day-90 had even caught up. The two
   * constants had to be tuned TOGETHER, iteratively, against the real T028
   * harness (30 seeds x 100 days, Pro mode): `CARGO` supplies enough volume
   * for day-30/day-90 to reach their targets; this narrower spread caps how
   * fast that volume compounds so day-10 doesn't overshoot. Net effect
   * confirmed via harness: greedy bot lands inside all three of its $2-3k /
   * $15-30k / $100-200k target bands simultaneously (see botHarness.test.ts
   * output).
   *
   * NOTE: narrowing this range alone could NOT lift newsBotStep into its own
   * target bands. Root cause (found during this same pass): nothing in the
   * engine's daily tick ever called `scheduleEvent` (events/eventEngine.ts),
   * so `state.activeEvents` stayed permanently empty for every bot run —
   * `analyzeRumorSignals` never had anything to find, and newsBotStep always
   * fell back to its baseline buy. Fixed in turnLoop.ts's `advanceDay` (see
   * `EVENTS.dailySchedulingProbability` below) — a genuine wiring gap, not a
   * config number, so it couldn't have been fixed from this file alone. Once
   * fixed, newsBotStep's OWN position-sizing constants (newsBot.ts,
   * deliberately kept out of this file — see that file's T029 comments) still
   * needed retuning to actually clear its $4-6k/$30-60k/$200-400k target
   * bands; that retuning plus a license-buying fix both live in newsBot.ts.
   */
  cityModifierRanges: {
    producer: { min: 0.72, max: 0.835 },
    neutral: { min: 0.9, max: 1.1 },
    consumer: { min: 1.12, max: 1.34 },
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

  /**
   * §7 step 3/T016: probability that a newly SCHEDULED event will actually
   * fire on its `scheduledFireDay` (vs. turn out to be a deliberate false
   * rumor that fizzles) — this is the hidden-truth draw made the moment
   * `scheduleEvent` (eventEngine.ts) creates the event record.
   *
   * This is NOT the same thing as `wireAccuracy`/`gossipAccuracy` above —
   * those describe how reliably the newspaper's chosen SOURCE STYLE reports
   * whatever this hidden flag already says (a later, T018 newspaper-
   * generation concern). §7 doesn't give an exact number for THIS
   * scheduling-time draw, so this is a documented assumption: most
   * scheduled events are real, with false rumors as the minority "spice"
   * among a paper's 2-4 stories per §7's framing of "deliberate false
   * rumors" as one ingredient among several. A candidate for T029's balance
   * pass to tune.
   */
  eventFireProbability: 0.6,

  /**
   * T029 ADDITION — closes a wiring gap discovered during the balance pass:
   * nothing in the engine (turnLoop.ts's `advanceDay`, the daily tick every
   * bot/action funnels through) ever called `scheduleEvent`
   * (events/eventEngine.ts, T016) during normal play. `scheduleEvent` itself
   * was fully built and tested in isolation (T016), and `resolveDueEvents`/
   * `getActiveEventEffectsFor` (T017) were fully wired to CONSUME
   * `state.activeEvents` — but nothing ever PRODUCED an entry for a fresh
   * game to consume, so `state.activeEvents` stayed permanently `[]` for
   * every bot/harness run to date. Confirmed via grep: `scheduleEvent`'s only
   * callers before this fix were its own test file and `informant.ts`'s
   * purchased-tip path (T020) — neither runs during ordinary bot play. This
   * silently broke THREE things at once: (a) newsBotStep's whole rumor-
   * reading strategy (T027) never had a real signal to act on, permanently
   * falling back to its weak baseline buy; (b) the newspaper's bucket-2
   * "scheduled-event rumor" stories (T018) could never appear; (c) real
   * price-moving events (§7's whole event table) never fired for ANY bot,
   * so the price engine's `eventMultiplier` term (§6) was dead code in
   * practice. `advanceDay` (turnLoop.ts) now rolls this probability once per
   * day (via its own dedicated per-day RNG stream, same pattern as
   * `createDayRng`/`createEventResolutionRng`) and calls `scheduleEvent` when
   * it hits — turning the event/newspaper/rumor system into something that
   * actually runs during play, matching §7 pipeline step 1's "engine
   * schedules an event 2-4 days in the future" read as an ONGOING process,
   * not a one-time capability that nothing ever invoked. 0.5/day (~1 new
   * event every 2 days) was chosen empirically against the T028 harness so
   * that: enough events are usually in flight for newsBotStep to find an
   * actionable wire/gossip signal on most days (closing gap (a) above),
   * while not saturating the price engine with so many simultaneous
   * multipliers that greedy/random bots' already-tuned targets blow past
   * their §11 ceilings (re-verified together with `cityModifierRanges` and
   * `CARGO.startingCapacity` below after this change).
   */
  dailySchedulingProbability: 0.5,

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

/** One row of §14's floor table. `capacityAdded` is the INCREMENTAL capacity
 * this floor alone contributes (mirrors `CARGO.upgrades`' per-tier shape);
 * `cumulativeCapacity` is the running total through this floor, kept as a
 * separate field (rather than derived by summing on every read) so
 * `buildWarehouseFloor`/`storeGoods` (/src/engine/warehouse.ts) can do a
 * single O(1) lookup for "how much can this city hold right now". Likewise
 * `buildCost` is this floor's OWN marginal price (what you pay to go from
 * `floorsBuilt = n-1` to `n`) — NOT a cumulative total spent — matching how
 * §14's table lists "Build cost" as one number per row without a "+" prefix
 * (contrast with §15 Hotel's tiers, which explicitly use a "+1,200×" marginal
 * notation on top of a separately-stated total; §14 doesn't need that same
 * notation because each row's own number already IS the marginal cost). See
 * warehouse.ts's `cumulativeBuildCost` for where the RUNNING TOTAL spent
 * (needed for T051's 50%-of-total-invested sell-back) is derived by summing
 * these per-floor marginal costs across every floor owned. */
export interface WarehouseFloorTierConfig {
  capacityAdded: number
  cumulativeCapacity: number
  buildCost: number
  /** §14: "Maintenance across every owned warehouse/floor bills at
   * year-end alongside tax" — this floor's own annual contribution. */
  annualMaintenance: number
}

/**
 * §14's floor table, keyed BY FLOOR NUMBER (1-6, per T046's acceptance
 * criteria — "keyed for lookup by floor number") rather than as a plain
 * array — `buildWarehouseFloor` looks up `WAREHOUSE_FLOORS[currentFloorsBuilt
 * + 1]` directly, no `.find()`/index-off-by-one bookkeeping needed. Numbers
 * copied verbatim from §14's table; cumulative capacities double-checked
 * against the task brief's own restated sequence (150 -> 400 -> 800 -> 1,450
 * -> 2,450 -> 4,050).
 *
 * Declared as its own top-level `const` with an EXPLICIT `Record<number,
 * WarehouseFloorTierConfig>` type annotation (rather than inlined into
 * `WAREHOUSE` with a `satisfies` clause, as `CONFIG.tax.caTiers` does for its
 * string-literal-keyed table) because callers index this one by an arbitrary
 * *variable* `number` (`floorsBuilt + 1`), not a known string-literal union —
 * `satisfies` would preserve the object's literal `{1: ..., 2: ..., ...}`
 * key-type, which TS then refuses to index with a plain `number` at all
 * ("no index signature"). A real `Record<number, X>` type has that index
 * signature, so `WAREHOUSE_FLOORS[n]` type-checks for any `n`.
 */
const WAREHOUSE_FLOORS: Record<number, WarehouseFloorTierConfig> = {
  1: { capacityAdded: 150, cumulativeCapacity: 150, buildCost: 3_000, annualMaintenance: 150 },
  2: { capacityAdded: 250, cumulativeCapacity: 400, buildCost: 8_000, annualMaintenance: 300 },
  3: { capacityAdded: 400, cumulativeCapacity: 800, buildCost: 20_000, annualMaintenance: 600 },
  4: { capacityAdded: 650, cumulativeCapacity: 1_450, buildCost: 50_000, annualMaintenance: 1_200 },
  5: { capacityAdded: 1_000, cumulativeCapacity: 2_450, buildCost: 120_000, annualMaintenance: 2_500 },
  6: { capacityAdded: 1_600, cumulativeCapacity: 4_050, buildCost: 300_000, annualMaintenance: 5_000 },
}

export const WAREHOUSE = {
  /** §14: "up to 6 per warehouse, built in order (can't skip ahead)." */
  maxFloors: 6,

  floors: WAREHOUSE_FLOORS,

  /** §14: "the whole warehouse (all floors) liquidates for 50% of total
   * build cost" (T051). Applied to `warehouse.ts`'s `cumulativeBuildCost`
   * (sum of every OWNED floor's own `buildCost`, see that interface's doc
   * comment above), matching §15 Hotel's identically-worded "50% of total
   * invested" salvage rate — the two systems intentionally share this
   * fraction, so it is still tracked here as its own named constant rather
   * than a bare inline `0.5`, in case a future balance pass wants them to
   * diverge.
   */
  sellBackFraction: 0.5,

  /**
   * §14 "Risk" — Warehouse fire + insurance (T050). See
   * /src/engine/warehouse.ts's file header for the full design rationale on
   * why Warehouse fire's random firing is checked via a DEDICATED daily roll
   * here rather than through the general §7 event-scheduling pipeline
   * (eventEngine.ts's `scheduleEvent`/`EVENT_TYPE_IDS`).
   */
  fire: {
    /**
     * ⚙ Per-city-with-a-warehouse, per-day probability of a fire. §14 only
     * says "low-probability" with no exact figure — a documented judgment
     * call (candidate for a future balance pass), chosen so that over one
     * full 90-day fiscal year a given warehouse city has roughly a
     * 1-(1-p)^90 ≈ 23% chance of at least one fire — rare enough that most
     * short/early runs never see one, but frequent enough across a full
     * multi-warehouse, multi-year run that insurance (below) is a real,
     * non-trivial decision rather than a purely theoretical one.
     */
    dailyProbability: 0.003,
    /** §14: "destroys 10-40% of one city's stored goods" — the loss
     * fraction drawn uniformly from this range when a fire fires AND no
     * insurance is active. */
    lossPct: { min: 0.1, max: 0.4 },
    /** §14: "insurance ... caps fire loss at 10%" — the fixed loss fraction
     * applied instead of a fresh `lossPct` draw whenever insurance is
     * active at the moment a fire fires. */
    insuredLossPct: 0.1,
    /** §14: "insurance (2%/year of stored goods' value, billed with
     * maintenance)" — charged at the SAME year-end tick as floor
     * maintenance (see tax.ts's `runYearEnd` T049/T050 extension), computed
     * off whatever is stored in that city at that moment. */
    insuranceAnnualRatePctOfStoredValue: 0.02,
  },
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
