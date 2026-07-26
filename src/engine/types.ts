/**
 * Core engine types — Trade Winds of Selvara.
 *
 * Pure TypeScript, zero React imports (see /src/engine/README.md).
 * Source of truth: trade-winds-design-doc.md §4 (cities), §5 (goods), §6
 * (price engine), §7 (events/newspaper), §8 (rank), §9 (banking), §10 (tax/CA).
 *
 * Phase 2 note: Warehouse (§14), Hotel (§15) and Aviation (§16) fields are
 * intentionally NOT included here yet. They land in Phase 10-12 (T046-T066)
 * once the v1 core loop ships and clears the §11 bot-harness baseline (T045).
 * `GameState` is expected to be extended incrementally by those later tasks.
 */

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

/** Opaque id types — kept as plain strings so they serialize trivially to
 * localStorage (§17) and to JSON snapshot files (§11 bot harness). */
export type CityId = string
export type GoodId = string

/** §3 difficulty modes. */
export type Difficulty = 'Noob' | 'Pro' | 'Expert'

/** §4 city unlock tiers. Tier 3/4 are defined for config completeness but are
 * OUT of v1 scope per §13 — see /src/engine/data/cities.ts (T005). */
export type CityTier = 1 | 2 | 3 | 4

/** §4/§9 bank size classes, used to look up loan/deposit rates in config. */
export type BankSize = 'Small' | 'Medium' | 'Large' | 'Huge'

/** §5 commodity volatility classes, used to look up daily-noise ranges. */
export type VolatilityClass = 'Stable' | 'Low' | 'Medium' | 'High' | 'Extreme'

// ---------------------------------------------------------------------------
// City (§4)
// ---------------------------------------------------------------------------

export interface City {
  id: CityId
  name: string
  tier: CityTier
  /** Short flavor/character text, e.g. "Farming town", "Mining town". */
  character: string
  bankSize: BankSize
  /** §4 "Hotel/night" column — the non-owner guest rate charged by Stay
   * (§2). Distinct from the Phase 2 hotel-ownership revenue model (§15). */
  hotelPerNight: number
  /** Good ids this city produces cheaply (feeds §6's producer cityModifier). */
  produces: GoodId[]
  /** Good ids this city wants/is dear for (feeds §6's consumer cityModifier). */
  wants: GoodId[]
}

// ---------------------------------------------------------------------------
// Good (§5)
// ---------------------------------------------------------------------------

/** How a commodity becomes unlocked, per §5's "Unlock" column. */
export type GoodUnlockCondition =
  | { kind: 'start' }
  /** Unlocked once cities of `tier` are reachable, optionally also gated by
   * a minimum day (e.g. Salt/Textiles: "Tier 1, day 5+"). */
  | { kind: 'tier'; tier: CityTier; minDay?: number }
  /** Unlocked only via a specific city's unlock, e.g. Rare Metals <- Kessler
   * Mines (§5: "Tier 3 (Kessler)"), rather than the whole tier generally. */
  | { kind: 'city'; cityId: CityId }

export interface Good {
  id: GoodId
  name: string
  unlockCondition: GoodUnlockCondition
  /** One-time fee paid at any bank to make the good tradeable; null for
   * goods available from game start (§5's "—" license entries). */
  licenseFee: number | null
  basePrice: number
  volatilityClass: VolatilityClass
  /** Daily drift as a fraction, e.g. 0.04 for the table's "±4%". */
  dailyDriftPct: number
}

// ---------------------------------------------------------------------------
// CityGoodModifier (§6 cityModifier term)
// ---------------------------------------------------------------------------

/** A city's economic relationship to a good: producer (cheap), neutral, or
 * consumer (dear) — §6: "producer 0.65-0.8, neutral 0.9-1.1, consumer 1.2-1.6". */
export type CityGoodRole = 'producer' | 'neutral' | 'consumer'

export interface CityGoodModifier {
  cityId: CityId
  goodId: GoodId
  role: CityGoodRole
  /** The concrete multiplier for this pair, drawn from the role's range
   * (see §6) at data-definition time. */
  modifier: number
}

// ---------------------------------------------------------------------------
// PriceState (§6 — per city+good daily price state, incl. information model)
// ---------------------------------------------------------------------------

export interface PriceState {
  cityId: CityId
  goodId: GoodId
  /** Live computed price. Only ever shown to the UI for the player's
   * CURRENT city — §6: "never leak live remote prices to the UI". */
  currentPrice: number
  /** The price last observed by the player while physically present here. */
  lastSeenPrice: number
  /** Day `lastSeenPrice` was observed — used to render staleness/age. */
  lastSeenDay: number
  /** Position within the good's slow global sine/random-walk trend cycle
   * (§6: period 20-40 days, amplitude ±15%), persisted so the trend
   * continues smoothly from one day to the next rather than resetting. */
  trendPosition: number
}

// ---------------------------------------------------------------------------
// Event (§7 — newspaper/rumor pipeline)
// ---------------------------------------------------------------------------

/** The 11 base event types from §7's table. Phase 2 (§14/§16) adds
 * "Warehouse fire" and "Aviation safety incident" later — not here. */
export type EventTypeId =
  | 'bumperHarvest'
  | 'droughtCropFailure'
  | 'mineCollapse'
  | 'workersStrike'
  | 'warScare'
  | 'techBreakthrough'
  | 'newDepositDiscovered'
  | 'shipSinkingRouteClosed'
  | 'festivalSeason'
  | 'governmentTariff'
  | 'epidemic'

export type EventScope =
  | { kind: 'global' }
  | { kind: 'city'; cityId: CityId }
  /** "One tier of cities" (e.g. Government tariff) or a multi-city regional
   * effect (e.g. War scare). */
  | { kind: 'tier'; tier: CityTier }

export interface Event {
  id: string
  typeId: EventTypeId
  affectedGoodIds: GoodId[]
  scope: EventScope
  multiplierMin: number
  multiplierMax: number
  durationDaysMin: number
  durationDaysMax: number
  /** §7 step 3: hidden from the player. true = the event will actually fire
   * on `scheduledFireDay`; false = it is a deliberate false rumor that will
   * fizzle. Newspaper source styling (wire/gossip) hints at this without
   * revealing it outright. */
  hiddenTruth: boolean
  /** Day this event is scheduled to fire — always 2-4 days after the day
   * it was scheduled (§7 step 1). */
  scheduledFireDay: number
  /** Day `scheduleEvent` created this record (needed to validate the 2-4
   * day scheduling window). */
  createdOnDay: number
  /** Whether §7 step 4 (fire-vs-fizzle) has already been decided. */
  resolved: boolean
  /** null until resolved; true = fired (prices moved), false = fizzled. */
  fired: boolean | null

  // -------------------------------------------------------------------------
  // T017 additions (all optional — backward compatible with T016, which
  // never sets any of these three at schedule time; only
  // events/resolution.ts's `resolveEvent` sets them, and only when the event
  // fires). See events/resolution.ts's file header for the full rationale.
  // -------------------------------------------------------------------------

  /** Concrete duration in days, drawn from `[durationDaysMin,
   * durationDaysMax]` at RESOLUTION time (not schedule time) via the RNG.
   * Only set when `fired === true`. */
  resolvedDurationDays?: number
  /** Day after which this event's price effect no longer applies —
   * `scheduledFireDay + resolvedDurationDays`. The effect is active over the
   * half-open interval `[scheduledFireDay, activeUntilDay)`. Only set when
   * `fired === true`. */
  activeUntilDay?: number
  /** Concrete price multiplier, drawn from `[multiplierMin, multiplierMax]`
   * at RESOLUTION time via the RNG, held fixed for the whole active window.
   * This is the exact number that feeds `computePrice`'s
   * `PriceEventEffect.multiplier` (§6's `eventMultiplier` term). Only set
   * when `fired === true`. */
  resolvedMultiplier?: number

  // -------------------------------------------------------------------------
  // T018 addition (optional — backward compatible with T016/T017, neither of
  // which ever sets this; only newspaper.ts sets it). See newspaper.ts's file
  // header for the full rationale.
  // -------------------------------------------------------------------------

  /** True once a scheduled-event rumor story (§7 pipeline step 2) has been
   * printed for this event in some past day's paper. Prevents
   * `generateDailyPaper` from re-announcing the same not-yet-due event every
   * single day — each event gets at most one rumor story before it either
   * fires or fizzles. Never set for resolution stories (those are tracked
   * separately via `GameState.pendingResolutions`, not this flag). */
  rumorAnnounced?: boolean
}

// ---------------------------------------------------------------------------
// NewspaperStory (§7 — daily paper contents)
// ---------------------------------------------------------------------------

/** §7 step 3: visible source style — wire is right ~80%, gossip ~50%. */
export type NewsSourceStyle = 'wire' | 'gossip'

export interface NewspaperStory {
  id: string
  day: number
  headline: string
  body: string
  sourceStyle: NewsSourceStyle
  /** Links this story back to the Event it rumors or resolves; null for
   * pure filler stories and city-unlock headlines (§4). */
  relatedEventId: string | null
  /** True for the "why it fired/fizzled" story required the morning after
   * an event's due date (§7 step 5 — non-negotiable). */
  isResolution: boolean
  /** True if this story is a deliberate false rumor (mirrors the linked
   * Event's `hiddenTruth === false`, kept here too for convenience). */
  isFalseRumor: boolean
}

// ---------------------------------------------------------------------------
// Cargo (§2 unit model, §10 FIFO cost basis)
// ---------------------------------------------------------------------------

/** One FIFO buy lot: a quantity bought together at a single unit cost.
 * Consumed oldest-first on sell so realized profit can be computed exactly
 * as "sell proceeds - matched buy costs, FIFO" (§10). */
export interface CargoLot {
  qty: number
  unitCost: number
}

export interface CargoHolding {
  goodId: GoodId
  /** Total units currently owned/carried (sum of all lots' qty). */
  qty: number
  /** Running average buy cost per unit, for UI display (§12 Market screen). */
  avgBuyCost: number
  /** FIFO ledger, oldest lot first. */
  lots: CargoLot[]
}

/** All goods currently carried, keyed by good id. 1 cargo slot = 1 unit of
 * any good (§2 — no weight/bulk mechanic). */
export type Cargo = Record<GoodId, CargoHolding>

// ---------------------------------------------------------------------------
// BankAccount (§9 — deposit + loan, one bank per city)
// ---------------------------------------------------------------------------

export interface Loan {
  principal: number
  /** Simple daily interest accrued so far, added to the outstanding balance. */
  accruedInterest: number
  startDay: number
  /** Loan term in days — 60 per §9. */
  termDays: number
  /**
   * T024 (§9 Default, Restructure branch) — true once this loan has been
   * refinanced via `resolveDefault(state, 'restructure')`
   * (/src/engine/bank/default.ts). MINIMUM VIABLE v1 scope: this flag alone
   * is set at restructure time; it does NOT yet cause `accrueLoanInterest`
   * (T023, /src/engine/bank/loans.ts) to actually apply the doubled
   * interest rate + daily collector fee described in §9 — that ongoing-
   * accrual behavior is a documented FOLLOW-UP for a future extension of
   * `accrueLoanInterest` to branch on this flag. See default.ts's file
   * header for the full scope rationale. `undefined` is equivalent to
   * `false` (never restructured) — every loan created before T024 has no
   * opinion on this field.
   */
  restructured?: boolean
}

export interface BankAccount {
  cityId: CityId
  /** §9: "deposits/loans live at the specific city's bank" — no cross-city
   * routing in v1. */
  depositBalance: number
  /** null = no active loan at this bank. The shape itself enforces §9's
   * "one active loan per bank" constraint — a bank account can hold at
   * most one Loan, never a list of them. */
  loan: Loan | null
}

// ---------------------------------------------------------------------------
// TaxRecord (§10 — per fiscal year, 1 year = 90 days)
// ---------------------------------------------------------------------------

export type CATier = 'none' | 'junior' | 'senior' | 'elite'

export interface TaxRecord {
  /** 1-based fiscal year number (year 1 = days 1-90, year 2 = days 91-180…). */
  fiscalYear: number
  /** Day this year-end statement was produced (90, 180, 270…). */
  yearEndDay: number
  /** FIFO-realized trading profit for the year (§10 taxable-base component). */
  realizedProfit: number
  /** Deposit interest earned during the year (also taxable per §10). */
  depositInterestEarned: number
  taxPaid: number
  caTierActive: CATier
  /** True if the tax bill exceeded cash+deposits and was covered by a
   * forced Huge-bank-rate loan (§10). T053 widens this to ALSO cover a
   * hotel-license-fee shortfall (see `hotelLicenseFeesPaid` below and
   * tax.ts's `runYearEnd` for the full rationale) — `true` if EITHER the
   * tax bill or the hotel license fee bill (or both) needed the forced
   * loan. */
  forcedLoanTriggered: boolean

  /**
   * T053 addition (§15 Hotel Ownership) — total hotel annual license fees
   * actually PAID this year-end (i.e. after any shortfall that rolled into
   * `taxDebt` is subtracted out), summed across every city in
   * `GameState.hotels`. `0` when the player owns no hotels. Deliberately a
   * SEPARATE field from `taxPaid` (rather than folding hotel fees into that
   * number) even though both amounts are deducted through the same cash ->
   * deposits -> forced-loan cascade in `runYearEnd` — keeping them apart
   * lets the Year-End statement (T042/YearEndScreen) show the trading tax
   * and the hotel-portfolio license bill as two distinct, honestly-labeled
   * line items rather than one opaque combined number. Optional (not every
   * pre-T053 `TaxRecord` in an existing save file will have it) — treated
   * as `0`/not-applicable wherever read.
   */
  hotelLicenseFeesPaid?: number
}

// ---------------------------------------------------------------------------
// Hidden trader rank (§8) — inputs + cache, never a display value
// ---------------------------------------------------------------------------

/** Inputs to the hidden rank formula (§8). Rank itself is a derived number
 * 1-10 computed FROM these — this type only captures the inputs. There is
 * deliberately no "display rank" helper anywhere in the engine (§8: never
 * shown to the player). */
export interface RankInputs {
  netWorth: number
  cumulativeTradeVolume: number
  /** Clamped to [-2, +2]: +0.1 per loan repaid on time, -0.5 per default. */
  repaymentRecord: number
  daysSurvived: number
}

/** Recomputed weekly (every 7 days, §8) — cache holds only the last
 * computed value and the day it was computed, never a UI-facing format. */
export interface RankCache {
  value: number
  computedOnDay: number
}

// ---------------------------------------------------------------------------
// Travel-in-progress (§2/§4 — multi-day travel, no trading while en route)
// ---------------------------------------------------------------------------

export interface TravelInProgress {
  destinationCityId: CityId
  daysRemaining: number
  totalDays: number
}

// ---------------------------------------------------------------------------
// GameState — the top-level engine state
// ---------------------------------------------------------------------------

export interface GameState {
  day: number
  currentCity: CityId
  cash: number

  /** Goods currently carried, with avg cost + FIFO lots per good. This IS
   * the "owned goods with cost basis" — Cargo already tracks avgBuyCost and
   * the FIFO ledger, so there is no separate/duplicate field for it. */
  cargo: Cargo
  /** Current max cargo units (§2: starts 40, upgradable). */
  cargoCapacity: number

  /** One bank account (deposit + at most one loan) per city that has a
   * bank, keyed by city id (§9). */
  bankAccounts: Record<CityId, BankAccount>

  /** Live/last-seen price state per city, per good (§6 information model). */
  priceStates: Record<CityId, Record<GoodId, PriceState>>

  /** City ids unlocked so far (Tier 1 unlocked from game start, §4). */
  unlockedCityIds: CityId[]
  /** Good ids whose unlock condition has been met (§5) — tradeable only
   * once its license fee is also paid, see `purchasedLicenseGoodIds`. */
  unlockedGoodIds: GoodId[]
  /** Good ids whose one-time license fee (§5) has been paid. */
  purchasedLicenseGoodIds: GoodId[]

  /** All events scheduled/active/resolved this run (§7 pipeline). */
  activeEvents: Event[]
  /** Today's newspaper stories (§7/§12 screen 4). */
  currentNewspaper: NewspaperStory[]

  /**
   * T018 addition — optional, backward compatible with every earlier task's
   * `GameState` fixtures (none of which set it; treated as `[]` wherever
   * read). Holds every resolved event (§7 step 4-5's raw material, in the
   * exact shape T017's `events/resolution.ts` calls `EventResolution` —
   * `{ event: Event; fired: boolean }`, duplicated structurally here rather
   * than imported, to avoid a circular type-only import between this file
   * and `events/resolution.ts`, which itself imports several types FROM
   * `types.ts`) that has not yet produced a resolution-story `NewspaperStory`.
   *
   * `turnLoop.ts`'s `advanceDay` APPENDS every event it resolves each day
   * (via `resolveDueEvents`, T017) onto this array. `newspaper.ts`'s
   * `generateDailyPaper` (T018) is the sole consumer: on each call it removes
   * (and turns into a resolution story) every entry whose
   * `event.scheduledFireDay < state.day` — i.e. resolved on some PRIOR day —
   * while leaving behind anything resolved on `state.day` itself for the
   * NEXT day's paper, per §7 step 5's "the next day's paper always runs a
   * resolution story" (never same-day). This guarantees the required exact
   * 1:1 correspondence between resolved events and resolution stories, with
   * no event ever missed even if `generateDailyPaper` isn't called on every
   * single day (multi-day travel, tests, etc.) — entries simply accumulate
   * until the next call, at which point every one of them is finally ready
   * (`scheduledFireDay < state.day` will be true for all of them by then).
   */
  pendingResolutions?: Array<{ event: Event; fired: boolean }>

  /** One record per completed fiscal year (§10). */
  taxHistory: TaxRecord[]

  /** Non-null while a multi-day Travel action is in progress (§2/§13). */
  travelInProgress: TravelInProgress | null

  /** Highest net worth ever reached this run — the game's score (§1). */
  peakNetWorth: number

  /** Seed for the deterministic RNG (§6), saved with the game for
   * reproducible bug reports. */
  seed: number
  difficulty: Difficulty

  /** Clamped to [-2, +2] — feeds the rank formula (§8) and default flow (§9). */
  repaymentRecord: number
  /** Total trade volume ever transacted this run — feeds the rank formula (§8). */
  cumulativeTradeVolume: number

  /** Last computed hidden rank + the day it was computed (§8). */
  rankCache: RankCache

  // ---------------------------------------------------------------------
  // T024 additions (§9 Default) — all optional, backward compatible with
  // every earlier task's `GameState` fixtures (none of which set any of
  // these; treated as "not tracking / not awaiting / not over" wherever
  // read). See /src/engine/bank/default.ts's file header for the full
  // trigger-detection and resolution rationale.
  // ---------------------------------------------------------------------

  /**
   * Tracks how many consecutive days total debt has exceeded
   * `CONFIG.banking.default.debtToNetWorthRatioTrigger` (2x) times net
   * worth. Semantics: `null`/`undefined` = NOT currently over threshold; a
   * day number = the day it FIRST became over-threshold (the start of the
   * current streak) — reset to `null` the moment debt drops back under the
   * threshold on any later day. Updated once per day-tick by
   * `updateDefaultTracking` (default.ts), wired into `advanceDay`
   * (turnLoop.ts). See default.ts for the exact
   * `state.day - debtOverThresholdSinceDay >= debtToNetWorthTriggerDays`
   * trigger-firing formula that consumes this field.
   */
  debtOverThresholdSinceDay?: number | null

  /**
   * Non-null once the bank has confronted the player with a default
   * decision (either §9 trigger condition has fired). `triggeredBy`
   * identifies which condition fired; `cityId` is only present for
   * `'overdueLoan'` (identifies which bank's loan is overdue —
   * `'debtRatio'` is a whole-portfolio condition with no single city to
   * name). Set by `updateDefaultTrigger` (default.ts, wired into
   * `advanceDay`) and NEVER auto-cleared by the underlying condition
   * resolving itself — only `resolveDefault` (the player's actual choice)
   * clears it back to `null`. UI (T040/T043, not built yet) is expected to
   * surface a three-choice prompt whenever this is non-null and call
   * `resolveDefault` with the player's pick.
   */
  awaitingDefaultDecision?: { triggeredBy: 'overdueLoan' | 'debtRatio'; cityId?: CityId } | null

  /**
   * Set by `resolveDefault(state, 'restructure')` to `state.day +
   * CONFIG.banking.default.restructure.recheckAfterDays` (15 days later).
   * `checkRestructureRecheck` (default.ts, wired into `advanceDay`)
   * compares debt-to-net-worth against the trigger again once `state.day
   * >= restructureRecheckDay`, forcing `gameOver: true` if still over
   * threshold, and always clears this field back to `null` once the
   * recheck has run (whichever way it resolves) so it never fires twice.
   * `null`/`undefined` = no restructure recheck pending.
   */
  restructureRecheckDay?: number | null

  /**
   * True once the run has ended, either via the player declaring
   * bankruptcy (`resolveDefault(state, 'bankruptcy')`) or a forced
   * restructure-recheck game-over (`checkRestructureRecheck`). Final score
   * is `state.peakNetWorth` (§1), already tracked continuously by
   * `updatePeakNetWorth` (netWorth.ts, T009) — no separate score field is
   * needed. `undefined`/`false` = run still in progress. UI (T043, not
   * built yet) is expected to show the Game Over screen whenever this
   * becomes true.
   */
  gameOver?: boolean

  /**
   * T043 (UI) addition — true once this run's final score has been recorded
   * to the local high-score table (`recordScore`,
   * /src/engine/persistence/highScore.ts) after `gameOver` became true. This
   * lives on `GameState` itself (persisted via `saveGame`/`loadGame`, T032)
   * rather than as transient UI/component state so the "record exactly
   * once" guarantee survives a page reload: a finished (`gameOver: true`)
   * run is auto-saved same as any other, so if the player reloads and hits
   * "Continue" on a finished run, the store must be able to tell it already
   * recorded this run's score and not double-count it. `undefined`/`false`
   * = not yet recorded (only ever meaningful once `gameOver` is `true`).
   */
  scoreRecorded?: boolean

  // ---------------------------------------------------------------------
  // T030 additions (§10 Tax & CA System) — all optional, backward
  // compatible with every earlier task's `GameState` fixtures (none of
  // which set any of these; treated as "0 accumulated so far" / "no
  // outstanding tax debt" wherever read). See /src/engine/tax.ts's file
  // header for the full accumulation/year-end/forced-loan rationale.
  // ---------------------------------------------------------------------

  /**
   * Running FIFO-realized trading profit accumulated SINCE the last
   * fiscal-year reset (§10: "taxable base = realized profit for the year
   * (sum of sell proceeds - matched buy costs, FIFO)"). Incremented by
   * `sell()` (/src/engine/actions/trade.ts, T012/T030) on every successful
   * sale — `sell()` already has exact access to which FIFO lots were
   * consumed and at what cost, which is the only place this number can be
   * computed correctly (once a lot is consumed, its cost basis is gone
   * from `state.cargo`). Reset to `0` by `runYearEnd` (tax.ts) at the end
   * of every fiscal year, whether or not tax was actually charged that
   * year (e.g. Noob's first-year waiver still resets it). `undefined` is
   * equivalent to `0` (nothing realized yet).
   */
  realizedProfitThisFiscalYear?: number

  /**
   * Running deposit interest credited SINCE the last fiscal-year reset
   * (§10: taxable base also includes "deposit interest earned"). Summed
   * across every account by `accrueDepositInterest`
   * (/src/engine/bank/deposits.ts, T022/T030) each time it runs — that
   * function is the only place total interest credited THIS DAY, across
   * every city, is known before it's folded into each account's compounded
   * `depositBalance`. Reset to `0` by `runYearEnd` (tax.ts) at the end of
   * every fiscal year, same as `realizedProfitThisFiscalYear`. `undefined`
   * is equivalent to `0`.
   */
  depositInterestThisFiscalYear?: number

  /**
   * Non-null while the player owes an outstanding forced tax-shortfall
   * loan (§10: "if cash + deposits can't cover it, the shortfall becomes a
   * forced Huge-bank loan at penalty rate 1.2%/day"). Deliberately a
   * SEPARATE top-level field rather than a `Loan` living inside
   * `bankAccounts` (§9's `BankAccount`/`Loan` shape) — the tax authority
   * isn't tied to any one city's bank (v1 has no reachable Huge-bank city
   * at all, per §13), so there is no `cityId` this debt could sensibly be
   * keyed under. It still conceptually accrues the same way a `Loan` does
   * (simple daily interest on `principal`, via `accrueTaxDebtInterest`,
   * wired into `advanceDay` alongside the other daily bank accruals) and
   * can be paid down via `repayTaxDebt` (tax.ts) — both mirror
   * `accrueLoanInterest`/`repayLoan` (/src/engine/bank/loans.ts) structure
   * and interest-first repayment order. `null`/`undefined` = no
   * outstanding tax debt.
   */
  taxDebt?: {
    principal: number
    /** Simple daily interest accrued so far, at
     * `CONFIG.tax.forcedLoanPenaltyDailyRate` (1.2%/day) — see
     * `accrueTaxDebtInterest` (tax.ts). */
    accruedInterest: number
    /** Day this debt was first created (or, if the player already had tax
     * debt from a prior shortfall, the ORIGINAL day it was first created —
     * a later top-up from a second shortfall does not reset this). */
    startDay: number
  } | null

  /**
   * T031 addition — the CA tier hired for the CURRENT fiscal year, per §10:
   * "hire for the year, fee due on hiring, effective that fiscal year." Set
   * by `hireCA` (ca.ts); read by `runYearEnd` (tax.ts) to pick that year's
   * tax-rate/profit-cap formula, then reset back to `'none'` by
   * `runYearEnd` once that year's tax is computed — the engagement is a
   * one-year contract, not an auto-renewing subscription, so the player
   * must re-hire (and re-pay the annual fee) every fiscal year they want a
   * CA active. `undefined` is equivalent to `'none'` (no CA hired this
   * year yet).
   */
  hiredCATierThisFiscalYear?: CATier

  // ---------------------------------------------------------------------
  // T053 additions (§15 Hotel Ownership) — optional, backward compatible
  // with every earlier task's `GameState` fixtures (none of which set this;
  // treated as "owns no hotels anywhere" wherever read via `?? {}`). See
  // /src/engine/hotel.ts's file header for the full build/upgrade/revenue/
  // sell-back rationale.
  // ---------------------------------------------------------------------

  /**
   * One hotel holding per owned city, keyed by city id — absence of a key
   * means "does not own that city's hotel" (never an explicit `tier: -1` or
   * similar sentinel). `tier` is a 0-based index into `CONFIG.hotel.tiers`
   * (0 = Inn, 1 = Lodge, 2 = Grand Hotel, 3 = Resort) — the SAME array this
   * whole system prices every cost/revenue/license figure from, so a tier
   * index alone (plus the owning city's static `City.hotelPerNight`, §4)
   * is sufficient to derive EVERY dollar figure the hotel system needs
   * (build cost so far, current daily revenue, current annual license fee)
   * with no redundant stored totals to keep in sync. `hotel.ts` is the sole
   * writer (`buildOrUpgradeHotel` sets/advances a city's entry;
   * `sellHotel` removes it entirely rather than ever setting a "tier 0
   * but not owned" state). `undefined`/missing city key is equivalent to
   * "never owned" — deliberately NOT a `Record<CityId, HotelHolding> = {}`
   * default on every fresh game (see newGame.ts, which — like `taxDebt`/
   * `hiredCATierThisFiscalYear` before it — simply omits this field
   * entirely for a brand-new run rather than seeding an empty object).
   */
  hotels?: Record<CityId, { tier: number }>
}
