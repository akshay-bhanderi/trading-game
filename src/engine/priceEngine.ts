/**
 * Price engine — Trade Winds of Selvara.
 *
 * Pure TypeScript, zero React imports (see /src/engine/README.md).
 * Source of truth: trade-winds-design-doc.md §6 (Price Engine), with §5
 * (goods/volatility classes) and §7 (events — not built yet, just a hook)
 * as supporting context.
 *
 * Pipeline (§6), applied in order:
 *   price(city, good, day) =
 *       basePrice(good)
 *     x cityModifier(city, good)        // producer 0.65-0.8, neutral 0.9-1.1, consumer 1.2-1.6
 *     x trend(good, day)                // slow global sine wave, period 20-40 days, amplitude +-15%
 *     x dailyNoise                      // uniform within the good's volatility class
 *     x eventMultiplier(city, good, day) // from active events (T016/T017 hook, neutral default 1)
 *     x meanReversion                   // if price > 2.2x or < 0.45x base*cityMod, pull 10%/day back
 *   Then: hard floor 0.3x / ceiling 4x of (base*cityModifier), enforced LAST.
 *
 * ---------------------------------------------------------------------------
 * ARCHITECTURAL CHOICE — state-threading (PriceState-based, per T008's brief)
 * ---------------------------------------------------------------------------
 * `computePrice` is a function of (city, good, day, seed, rng, previousState,
 * activeEvents). Two different kinds of "randomness" are deliberately kept
 * separate:
 *
 * 1. `seed` (a plain number, e.g. `GameState.seed`) drives two properties
 *    that must stay STABLE for a given (seed, city, good) across every day
 *    of a run, and must NOT depend on call order or how many other
 *    city/good pairs were computed first:
 *      - `cityModifier` — a city's economic relationship to a good (§6:
 *        producer/neutral/consumer) is a fixed structural fact, not
 *        something that should re-roll every day. It is derived from a
 *        LOCAL RNG seeded by hashing `seed` together with the city/good
 *        ids (see `deriveSubSeed`/`resolveCityModifier`) — completely
 *        independent of the `rng` stream below, so it never shifts if the
 *        caller computes prices for goods/cities in a different order.
 *      - the trend's period (20-40 days) and phase offset — likewise a
 *        fixed-per-good structural fact (§6: trend is a function of
 *        (good, day) only, not city), derived the same hashed way.
 *
 * 2. `rng: Rng` is the run's live, continuously-advancing RNG stream,
 *    threaded in by the caller (created via `createRng(seed)` once per run
 *    and passed to every `computePrice` call in sequence). It supplies only
 *    the day's fresh `dailyNoise` draw — the one piece of this formula that
 *    SHOULD consume a new random value every single call.
 *
 * `previousState` (a `PriceState`, reused as-is from types.ts — see its
 * `trendPosition` field) is what makes the day-to-day walk continuous:
 *   - `trendPosition` carries the sine wave's phase from one day to the
 *     next (advanced by 1 per call), so the trend doesn't reset.
 *   - `currentPrice` (yesterday's settled, post-floor/ceiling price) is the
 *     one thing mean reversion needs "memory" of: an event-driven spike can
 *     leave the price far from base for many days after the event ends,
 *     and only a reference to the actual previous price lets mean reversion
 *     decay that back down by ~10%/day rather than recomputing a fresh
 *     (and, absent another event, near-base) price every day with no memory
 *     of the spike at all.
 *
 * The caller is expected to persist the returned `nextState` and pass it
 * back in as `previousState` on the following day's call for that exact
 * city+good pair (`undefined` only on the very first computation ever done
 * for that pair). This satisfies the "either PriceState-threaded or a pure
 * function of day" requirement via the recommended PriceState-threaded
 * route, while still being fully deterministic and reproducible: replaying
 * the same seed with the same sequence of (day, rng-draw) calls always
 * reproduces an identical sequence of prices (required test (d)).
 *
 * No `Math.random` is used anywhere in this file — see rng.ts's project-wide
 * rule.
 */

import { CONFIG } from './config'
import { createRng, type Rng } from './rng'
import type { City, CityGoodRole, Good, PriceState } from './types'

// ---------------------------------------------------------------------------
// Deterministic hashing — turns (seed, ...stableParts) into a sub-seed for a
// LOCAL rng, used only for the structurally-stable picks (cityModifier,
// trend period/phase) described above. Never used for the daily noise draw.
// ---------------------------------------------------------------------------

/** FNV-1a, a small well-known non-cryptographic string hash. Deterministic
 * across platforms/runs (only relies on 32-bit unsigned integer arithmetic
 * via `Math.imul`, no reliance on iteration order of anything unordered). */
function hashStringToUint32(str: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** Derives a stable sub-seed from the run's `seed` plus any number of
 * identifying parts (e.g. city id, good id, a purpose tag) — same inputs
 * always produce the same sub-seed, different inputs practically never
 * collide in a way that matters for this game. */
function deriveSubSeed(seed: number, ...parts: string[]): number {
  return hashStringToUint32(`${seed}:${parts.join(':')}`)
}

// ---------------------------------------------------------------------------
// cityModifier (§6): role derivation + concrete multiplier resolution
// ---------------------------------------------------------------------------

/**
 * Derives whether `city` is a producer, consumer, or neutral party for
 * `good`, straight from the existing `City.produces`/`City.wants` arrays
 * (§4 data) — `CityGoodModifier` records don't exist as a data file yet, so
 * this is the documented stand-in per T008's brief. Producer takes
 * precedence over consumer in the (currently unused-by-data) case a good
 * appears in both arrays for the same city.
 */
export function deriveCityGoodRole(city: City, good: Good): CityGoodRole {
  if (city.produces.includes(good.id)) return 'producer'
  if (city.wants.includes(good.id)) return 'consumer'
  return 'neutral'
}

export interface ResolvedCityModifier {
  role: CityGoodRole
  /** Concrete multiplier drawn from the role's configured range (§6),
   * stable for a given (seed, city, good) — see the architecture note
   * above for why this does NOT come from the shared daily `rng` stream. */
  modifier: number
}

/** Resolves the concrete, stable cityModifier for a (city, good) pair under
 * a given run `seed`. Deterministic and independent of call order. */
export function resolveCityModifier(seed: number, city: City, good: Good): ResolvedCityModifier {
  const role = deriveCityGoodRole(city, good)
  const range = CONFIG.priceEngine.cityModifierRanges[role]
  const localRng = createRng(deriveSubSeed(seed, 'cityModifier', city.id, good.id))
  const modifier = range.min + localRng.next() * (range.max - range.min)
  return { role, modifier }
}

// ---------------------------------------------------------------------------
// trend (§6): slow global sine wave, period 20-40 days, amplitude +-15%
// ---------------------------------------------------------------------------

/** Resolves the good's trend period (20-40 days, §6), stable per (seed, good). */
function resolveTrendPeriodDays(seed: number, good: Good): number {
  const localRng = createRng(deriveSubSeed(seed, 'trendPeriod', good.id))
  return localRng.int(CONFIG.priceEngine.trendPeriodMinDays, CONFIG.priceEngine.trendPeriodMaxDays)
}

/** Resolves the good's starting phase offset so different seeds don't all
 * start every good's trend at the same point in its cycle, stable per
 * (seed, good). Range is generous relative to the max period so the offset
 * can land anywhere in a cycle regardless of which period got picked. */
function resolveTrendPhaseOffset(seed: number, good: Good): number {
  const localRng = createRng(deriveSubSeed(seed, 'trendPhase', good.id))
  return localRng.int(0, CONFIG.priceEngine.trendPeriodMaxDays - 1)
}

/** Pure trend-multiplier formula: 1 +- amplitude, sinusoidal over `period`
 * days. Exported so the mean-reversion pull can be exercised/tested in
 * isolation without needing to fabricate a full trend cycle. */
export function computeTrendMultiplier(
  trendPosition: number,
  periodDays: number,
  amplitudePct: number,
): number {
  return 1 + amplitudePct * Math.sin((2 * Math.PI * trendPosition) / periodDays)
}

// ---------------------------------------------------------------------------
// dailyNoise (§6): uniform within the good's volatility class
// ---------------------------------------------------------------------------

/** The good's own `dailyDriftPct` (§5) is the authoritative per-good noise
 * amplitude. `CONFIG.priceEngine.volatilityClassDailyNoisePct` is used here
 * as a defensive class-range clamp (per its own doc comment: "a documented
 * fallback/default, not an override") so a future data-entry typo in
 * goods.ts can never silently blow past its declared volatility class. */
function resolveDailyNoiseAmplitude(good: Good): number {
  const classRange = CONFIG.priceEngine.volatilityClassDailyNoisePct[good.volatilityClass]
  return Math.min(classRange.max, Math.max(classRange.min, good.dailyDriftPct))
}

// ---------------------------------------------------------------------------
// eventMultiplier (§7 hook — not built yet, T016/T017 will supply real ones)
// ---------------------------------------------------------------------------

/** Minimal shape the (not-yet-built) event system needs to plug into the
 * price pipeline: just a multiplier. T016/T017 will be responsible for
 * turning `state.activeEvents` (the full `Event` type in types.ts) into a
 * list of these for the affected city/good/day before calling
 * `computePrice`. Omitted or empty = neutral (no active events, multiplier
 * of 1), which is always a safe default today. */
export interface PriceEventEffect {
  multiplier: number
}

function resolveEventMultiplier(activeEvents?: readonly PriceEventEffect[]): number {
  if (!activeEvents || activeEvents.length === 0) return 1
  return activeEvents.reduce((acc, e) => acc * e.multiplier, 1)
}

// ---------------------------------------------------------------------------
// meanReversion (§6): if price > 2.2x or < 0.45x base*cityMod, pull 10%/day
// back toward it.
// ---------------------------------------------------------------------------

export interface MeanReversionConfig {
  upperTriggerMultiplier: number
  lowerTriggerMultiplier: number
  pullRatePerDay: number
}

/**
 * Pure mean-reversion step, deliberately factored out and exported so it can
 * be unit-tested in complete isolation from the rest of the pipeline (no
 * City/Good/Rng fixtures needed) — this is the "test harness that isolates
 * the mean-reversion step" T008's acceptance criteria calls for.
 *
 * `previousPrice` is yesterday's SETTLED price (post floor/ceiling) for this
 * exact city+good pair — the "memory" of how far a past event-driven spike
 * may have pushed things. `rawPrice` is what today's price would be with NO
 * memory at all (base x cityModifier x trend x noise x event) — since
 * trend/noise/event are all bounded, `rawPrice` sits close to
 * `basePriceWithCityModifier` on any day without an extreme active event.
 *
 * When `previousPrice` is beyond the configured trigger bounds, the result
 * moves `pullRatePerDay` (10%) of the way from `previousPrice` toward
 * `rawPrice` — i.e. roughly a 10%/day decay back toward the "home" level,
 * while still letting today's own trend/noise/event terms have their normal
 * (small, near-base) influence. Otherwise `rawPrice` passes through
 * unchanged — mean reversion is a correction, not a permanent force.
 */
export function applyMeanReversion(
  previousPrice: number,
  rawPrice: number,
  basePriceWithCityModifier: number,
  meanReversionConfig: MeanReversionConfig = CONFIG.priceEngine.meanReversion,
): number {
  const upperTrigger = basePriceWithCityModifier * meanReversionConfig.upperTriggerMultiplier
  const lowerTrigger = basePriceWithCityModifier * meanReversionConfig.lowerTriggerMultiplier

  if (previousPrice > upperTrigger || previousPrice < lowerTrigger) {
    return previousPrice + meanReversionConfig.pullRatePerDay * (rawPrice - previousPrice)
  }
  return rawPrice
}

// ---------------------------------------------------------------------------
// computePrice — the full §6 pipeline
// ---------------------------------------------------------------------------

export interface ComputedPrice {
  /** Final price for this city/good/day, AFTER the hard floor/ceiling clamp
   * (§6: "enforced LAST"). This is the only value that should ever reach
   * game state or the UI. */
  price: number
  /** Price BEFORE the hard floor/ceiling clamp — exposed for testing and
   * diagnostics only (e.g. verifying mean reversion's pull independent of
   * clamping). Never use this for game state. */
  preClampPrice: number
  /** basePrice(good) x cityModifier(city, good) — the "home" level mean
   * reversion pulls toward, and the base the floor/ceiling multipliers
   * apply to (§6). */
  basePriceWithCityModifier: number
  cityModifierRole: CityGoodRole
  cityModifier: number
  floor: number
  ceiling: number
  /** Persist this and pass it back in as `previousState` for this exact
   * city+good pair on the next call (trend continuity + mean-reversion
   * memory). `undefined` only on the very first call ever made for a pair. */
  nextState: PriceState
}

/**
 * Computes a city+good's price for a given day, per §6's full pipeline.
 *
 * @param city current city (reused `City` type from types.ts)
 * @param good the commodity (reused `Good` type from types.ts)
 * @param day current game day
 * @param seed the run's RNG seed (`GameState.seed`) — drives the STABLE
 *   picks (cityModifier, trend period/phase) via a local hashed RNG,
 *   independent of `rng` below. Same seed + same city/good always resolves
 *   the same cityModifier/trend period, regardless of call order.
 * @param rng the run's live, continuously-advancing `Rng` stream (create
 *   once via `createRng(seed)` and thread the SAME instance through every
 *   `computePrice` call in sequence) — supplies only the day's fresh
 *   dailyNoise draw.
 * @param previousState the `PriceState` returned by the previous call for
 *   this exact city+good pair, or `undefined` for the first-ever call.
 * @param activeEvents optional list of active event price effects for this
 *   city/good/day (§7 hook — T016/T017 not built yet; omit/empty = neutral).
 */
export function computePrice(
  city: City,
  good: Good,
  day: number,
  seed: number,
  rng: Rng,
  previousState?: PriceState,
  activeEvents?: readonly PriceEventEffect[],
): ComputedPrice {
  const { role, modifier: cityModifier } = resolveCityModifier(seed, city, good)
  const basePriceWithCityModifier = good.basePrice * cityModifier

  // --- trend: advance the persisted phase by 1 day, or start at this
  // good's deterministic phase offset on the very first call.
  const periodDays = resolveTrendPeriodDays(seed, good)
  const trendPosition =
    previousState !== undefined ? previousState.trendPosition + 1 : resolveTrendPhaseOffset(seed, good)
  const trendMultiplier = computeTrendMultiplier(
    trendPosition,
    periodDays,
    CONFIG.priceEngine.trendAmplitudePct,
  )

  // --- dailyNoise: fresh draw from the threaded live rng stream.
  const noiseAmplitude = resolveDailyNoiseAmplitude(good)
  const noiseMultiplier = 1 + (rng.next() * 2 - 1) * noiseAmplitude

  // --- eventMultiplier: neutral (1) until T016/T017 supply real events.
  const eventMultiplier = resolveEventMultiplier(activeEvents)

  const rawPrice = basePriceWithCityModifier * trendMultiplier * noiseMultiplier * eventMultiplier

  // --- meanReversion: pull toward `rawPrice` (~home level) if yesterday's
  // settled price was beyond the trigger bounds. No previous state = no
  // memory yet, so reversion cannot trigger on the very first computation.
  const previousPrice = previousState?.currentPrice ?? rawPrice
  const preClampPrice = applyMeanReversion(previousPrice, rawPrice, basePriceWithCityModifier)

  // --- hard floor/ceiling: enforced LAST, per §6.
  const floor = basePriceWithCityModifier * CONFIG.priceEngine.hardFloorMultiplier
  const ceiling = basePriceWithCityModifier * CONFIG.priceEngine.hardCeilingMultiplier
  const price = Math.min(ceiling, Math.max(floor, preClampPrice))

  const nextState: PriceState = {
    cityId: city.id,
    goodId: good.id,
    currentPrice: price,
    lastSeenPrice: previousState?.lastSeenPrice ?? price,
    lastSeenDay: previousState?.lastSeenDay ?? day,
    trendPosition,
  }

  return {
    price,
    preClampPrice,
    basePriceWithCityModifier,
    cityModifierRole: role,
    cityModifier,
    floor,
    ceiling,
    nextState,
  }
}
