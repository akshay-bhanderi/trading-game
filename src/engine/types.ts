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
   * forced Huge-bank-rate loan (§10). */
  forcedLoanTriggered: boolean
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
}
