/**
 * News-follower bot strategy — Trade Winds of Selvara.
 *
 * TASK.md T027 / design doc references:
 *   §11 — "news-follower using rumors + loans", one of the three scripted
 *   bots the §11 balance harness (T028) runs against the day-10/30/90
 *   targets.
 *   §7  — Newspaper & Rumor Engine: source styling ("wire" ~80% accurate,
 *   "gossip" ~50%), the scheduled-event rumor pipeline this bot reacts to.
 *   §9  — Banking: loans/repayment, used opportunistically to fund larger
 *   positions when a high-confidence rumor is active.
 *
 * Pure TypeScript, zero React imports (see /src/engine/README.md).
 * NEVER uses `Math.random` — every draw comes from the `Rng` passed in.
 *
 * ---------------------------------------------------------------------------
 * `newsBotStep` calls `generateDailyPaper` itself
 * ---------------------------------------------------------------------------
 * TASK.md says the bot "reads the current day's newspaper (T018) to bias
 * buy/sell/travel decisions". Nothing in the engine currently calls
 * `generateDailyPaper` automatically as part of `advanceDay`/the turn loop —
 * it is a screen-driven (T039) or bot-driven concern. So `newsBotStep` calls
 * `generateDailyPaper(state, rng)` itself, early in its step (after running
 * the unlock checks, before any trade decisions), and uses the RETURNED
 * `state`/`stories` for the rest of its logic. This is also what guarantees
 * `state.currentNewspaper` is populated after every `newsBotStep` call — see
 * the acceptance test in newsBot.test.ts.
 *
 * ---------------------------------------------------------------------------
 * Reading "high-confidence wire rumor"
 * ---------------------------------------------------------------------------
 * The bot cannot see `Event.hiddenTruth` (that stays hidden per §7) or the
 * true wire/gossip accuracy numbers (that's meta-game config, §7's own ⚙).
 * What it CAN observe, directly off each day's `NewspaperStory[]`, is which
 * stories are tagged `sourceStyle: 'wire'` vs `'gossip'` — the bot treats
 * `'wire'` as high-confidence and `'gossip'` as low-confidence, exactly
 * mirroring how a human player would read the paper (§7: "wire is right
 * ~80%... this teaches the player to read sources").
 *
 * Only genuine scheduled-event rumors are actionable signals: stories with
 * `isResolution: false`, `isFalseRumor: false`, and `relatedEventId !== null`
 * (T018's "bucket 2"). Resolution stories are old news (already happened,
 * nothing to act on) and false rumors have no backing `Event` at all
 * (`relatedEventId: null`), so neither can be turned into a directional
 * signal.
 *
 * For each actionable rumor story, the linked `Event` (looked up in
 * `state.activeEvents` by `relatedEventId`) supplies:
 *   - direction: `(multiplierMin + multiplierMax) / 2 >= 1` -> price rise
 *     expected, else a fall (matches §7's event table: a "Bumper harvest"
 *     event has a multiplier < 1, a "Drought" event has one > 1).
 *   - which goods: `event.affectedGoodIds`, filtered down to goods the bot
 *     can actually trade right now (unlocked + license paid, or free).
 *   - whether it applies to the bot's CURRENT city: `scope.kind === 'global'`
 *     always applies; `'city'` only if it matches `state.currentCity`;
 *     `'tier'` only if the current city's tier matches.
 *
 * ---------------------------------------------------------------------------
 * Position sizing and loans
 * ---------------------------------------------------------------------------
 * A high-confidence (wire) UP signal targets spending
 * `HIGH_CONFIDENCE_TARGET_SPEND_FRACTION` (1.3x) of current cash on the
 * rumored good — deliberately MORE than the bot currently has, so that when
 * cash alone can't cover the target position, `buyIntoRumor` opportunistically
 * calls `takeLoan(state, state.currentCity, shortfall)` to close the gap
 * before buying. `takeLoan` is itself already a no-op (returns the identical
 * state) if the current city's bank has an active loan, the cap is exceeded,
 * or the 3-concurrent-banks limit is hit — so this is always safe to attempt;
 * on rejection the bot simply falls back to buying what cash alone affords.
 * A low-confidence (gossip) UP signal targets a smaller 0.35x-of-cash
 * position and never attempts a loan. A quiet news day (no actionable UP
 * signal at all) falls back to an opportunistic "cheapest relative to base
 * price" buy sized by `baselineSpendFraction(state.day)` — see that
 * function's own T029 doc comment for why the fraction is higher in an early
 * warm-up window and lower thereafter, so the bot isn't fully idle between
 * rumors at ANY point in a run.
 *
 * A DOWN signal for a good the bot currently holds triggers an immediate
 * local sell IF the current price still covers the holding's average buy
 * cost (no fire-sale losses); otherwise the position is held, and the
 * end-of-day travel decision (see below) may route toward a city with a
 * better remembered price instead.
 *
 * ---------------------------------------------------------------------------
 * Loan repayment heuristic
 * ---------------------------------------------------------------------------
 * `maybeRepayLoan`: if the current city's bank has an active loan AND
 * `state.cash` exceeds a small reserve (`SPARE_CASH_RESERVE`, $2,000), the
 * bot repays `REPAYMENT_FRACTION` (50%) of the spare cash above that reserve
 * toward the loan (capped at the outstanding debt so it never overpays).
 * Deliberately simple, as the task brief allows ("simple heuristic... doesn't
 * need to be sophisticated") — this runs once per step, before any of the
 * day's buying, so a big cash pile from a prior rumor win gets partially
 * de-risked before being redeployed into a new position.
 *
 * ---------------------------------------------------------------------------
 * End-of-day travel/stay decision
 * ---------------------------------------------------------------------------
 * `findBestRememberedSellDestination` scans every good the bot currently
 * holds and every OTHER unlocked city's remembered `lastSeenPrice` for that
 * good (§6 information model — never a live remote price, only what was
 * already observed). If some other city's remembered price beats the
 * current city's live price by more than `TRAVEL_MARGIN_THRESHOLD` (10%),
 * the bot travels there. This is a small, independently-implemented version
 * of the same "best remembered sell price" idea T026's greedy bot uses —
 * `greedyBot.ts` is never imported here (no cross-bot dependency), per the
 * task brief's "your call, keep it simple" allowance. If no better
 * destination stands out, the bot ends the day with `stay()` (falling back
 * to a direct `advanceDay` if even the hotel bill can't be afforded, so the
 * day always advances exactly once — matching the precedent in
 * turnLoop.test.ts's headless simulations and the other bots' smoke tests).
 *
 * ---------------------------------------------------------------------------
 * T067 ADDITION — opportunistic Phase 2 investment (§14-§16)
 * ---------------------------------------------------------------------------
 * Doc references: §11 (this task's own file-path hints name newsBot as "the
 * most sophisticated bot", the recommended candidate for exercising §14-§16
 * so the harness can measure their effect on net worth growth), §14
 * (Warehouse), §15 (Hotel), §16 (Aviation).
 *
 * `maybeInvestInPhase2Assets` (below) runs once per non-travel step, after
 * the day's rumor-driven trading (`applySignalTrades`) and before the
 * end-of-day travel decision — i.e. it only ever spends cash the day's
 * PRIMARY trading strategy already decided not to use, never cash a live
 * rumor position needs. It considers exactly three candidate actions in the
 * bot's CURRENT city: build/upgrade a warehouse floor, build/upgrade a hotel,
 * or (only at a Medium+ bank city, per `isPlanePurchaseAvailable`) buy the
 * cheapest plane class and immediately lease it out monthly. Of whichever
 * candidates are affordable (cash >= cost * `PHASE2_AFFORDABILITY_MULTIPLE`,
 * a materially larger cushion than `LICENSE_AFFORDABILITY_MULTIPLE` above
 * since these are large, only-50%-liquid capital commitments, not a small
 * recurring trading unlock), it takes the CHEAPEST one and stops — never
 * more than one Phase 2 purchase per day, mirroring `maybeBuyLicense`'s
 * "at most one per day" reasoning: affording several individually against
 * the SAME pre-purchase cash figure doesn't mean affording them all
 * together, and stacking large outlays same-day would defeat the whole
 * point of the affordability cushion.
 *
 * Random/greedy bots (`randomBot.ts`/`greedyBot.ts`) are deliberately left
 * UNCHANGED — the task brief recommends news-follower specifically (already
 * the "smartest" of the three, and the one this file's own §11 balance
 * history shows compounds fastest), and extending all three at once would
 * make it impossible for the harness/T068 balance pass to isolate Phase 2's
 * effect from the extension itself.
 *
 * Deliberately NOT implemented here: actually routing cargo through a built
 * warehouse (`storeGoods`/`withdrawGoods`) once one exists, or ever choosing
 * `'leasedAnnual'`/`'personal'` plane status. The acceptance bar this task
 * sets is "opportunistically build warehouses, buy hotels, and buy/lease
 * planes" — building ownership, not operating every downstream mechanic each
 * system offers. A warehouse the bot never stores anything in is a pure
 * capital sink (spend cash, get only the 50% sell-back option back) rather
 * than a net-worth booster, which is itself useful, honest information for
 * the T068 balance pass to see in the harness's new Phase 2 asset stat
 * (`netWorth.ts`'s `calcPhase2AssetValue`) — a documented scope boundary, not
 * an oversight.
 *
 * ---------------------------------------------------------------------------
 * Never throws
 * ---------------------------------------------------------------------------
 * Every engine function this file calls (`buy`/`sell`/`travel`/`stay`/
 * `takeLoan`/`repayLoan`/`checkCityUnlocks`/`checkGoodUnlocks`/
 * `generateDailyPaper`) already follows the codebase-wide "reject by
 * returning the identical state, never throw" convention. The only
 * theoretically risky call is `Rng.pick` on an empty array (which DOES
 * throw) — every `pick` call site here is guarded so its input is always
 * non-empty first. As a final defensive net (and to satisfy the "never
 * throws" acceptance bar unconditionally, not just "as far as I can tell"),
 * the whole step is wrapped in a try/catch that falls back to a safe
 * single-day advance (travel-continuation, Stay, or a direct `advanceDay`)
 * on any unexpected error.
 */

import { advanceTravelDay, travel } from '../actions/travel'
import { stay } from '../actions/stay'
import { buy, sell } from '../actions/trade'
import { isPlanePurchaseAvailable, buyPlane, setPlaneStatus } from '../aviation'
import { repayLoan, takeLoan } from '../bank/loans'
import { cargoUsed } from '../cargo'
import { CONFIG } from '../config'
import { CITIES } from '../data/cities'
import { GOODS } from '../data/goods'
import { buildOrUpgradeHotel, getNextUpgradeCost } from '../hotel'
import { generateDailyPaper } from '../newspaper'
import type { Rng } from '../rng'
import { advanceDay } from '../turnLoop'
import type { CityId, Event, GameState, GoodId, NewspaperStory, PlaneClass } from '../types'
import { buyLicense, checkCityUnlocks, checkGoodUnlocks } from '../unlocks'
import { buildWarehouseFloor } from '../warehouse'

// ---------------------------------------------------------------------------
// Bot-local strategy tuning knobs (deliberately NOT in /src/engine/config.ts
// — these shape this one bot's decision-making, not engine game-balance
// constants shared across systems; see cargo.ts/trade.ts's own precedent of
// keeping caller-local heuristics out of CONFIG).
// ---------------------------------------------------------------------------

/** High-confidence (wire) rumor: target spending MORE than current cash on
 * the rumored good (2x), intentionally requiring a loan for the excess. */
const HIGH_CONFIDENCE_TARGET_SPEND_FRACTION = 1.3
/** Low-confidence (gossip) rumor: a smaller, cash-only position. */
const LOW_CONFIDENCE_TARGET_SPEND_FRACTION = 0.35
/**
 * T029 REVISION: no rumor signal at all today: an opportunistic buy. Root
 * cause this fixes: actionable rumor signals are rare in practice (most
 * scheduled events are scoped to a city/tier the bot isn't currently in, or
 * to a good it hasn't licensed — see `maybeBuyLicense` below for the other
 * half of this fix), so this baseline path governs the vast majority of this
 * bot's trading days, especially early on before enough events have
 * accumulated for a same-city match to be likely. The OLD flat 0.15 fraction
 * capped this bot's compounding WELL below even greedy's blind spread-
 * chasing (§11 expects the opposite ordering: news bot ~= the full target,
 * greedy ~= half of it) — a smarter bot sitting on a weaker baseline than the
 * dumb bot it's supposed to beat was the actual balance bug.
 *
 * A single flat fraction can't simultaneously satisfy day-10 ($4-6k, needs
 * aggressive early compounding from a $1,000 start) and day-90 ($200-400k,
 * would wildly overshoot if that SAME aggressive fraction kept compounding
 * for 90 days rather than 10 — confirmed empirically against the T028
 * harness: any flat fraction high enough to clear day-10's floor pushed
 * day-90 past its $400k ceiling by 25-70%). Splitting into an EARLY
 * (`BASELINE_SPEND_FRACTION_EARLY`, first `BASELINE_WARMUP_DAYS`) and LATE
 * (`BASELINE_SPEND_FRACTION_LATE`, thereafter) fraction — mirroring the same
 * "decelerate growth after an early phase" shape `CONFIG.cargo.
 * startingCapacity` already uses for greedy/random (see config.ts's own
 * T029 comment) — lets day-10 compound fast while day-90 spends its (much
 * more numerous) later cycles at a calmer, non-explosive rate.
 */
const BASELINE_SPEND_FRACTION_EARLY = 0.55
const BASELINE_SPEND_FRACTION_LATE = 0.28
const BASELINE_WARMUP_DAYS = 12

function baselineSpendFraction(day: number): number {
  return day <= BASELINE_WARMUP_DAYS ? BASELINE_SPEND_FRACTION_EARLY : BASELINE_SPEND_FRACTION_LATE
}

/** Cash reserve kept untouched by `maybeRepayLoan` — below this, no repayment
 * is attempted even if a loan is active. */
const SPARE_CASH_RESERVE = 2_000
/** Fraction of spare cash (above the reserve) put toward loan repayment. */
const REPAYMENT_FRACTION = 0.5

/** A remembered price elsewhere must beat the current city's live price by
 * more than this multiple before the bot bothers traveling for it. */
const TRAVEL_MARGIN_THRESHOLD = 1.1

/**
 * T029 ADDITION — see `maybeBuyLicense` below. A license is only purchased
 * once cash is at least this multiple of the fee, so buying one never eats
 * into the cash the bot needs for its next trade.
 */
const LICENSE_AFFORDABILITY_MULTIPLE = 4

/**
 * T067 ADDITION — see file header's "opportunistic Phase 2 investment"
 * section. Set well above `LICENSE_AFFORDABILITY_MULTIPLE` (4) because a
 * license is a small, cheap, permanent trading unlock, while a warehouse
 * floor/hotel tier/plane is a large capital outlay only 50% recoverable
 * (sell-back fraction, §14/§15) or subject to a liquidation fee + ongoing
 * depreciation (§16) — a bigger cash cushion ensures buying one never leaves
 * the bot unable to fund its next high-confidence rumor position.
 */
const PHASE2_AFFORDABILITY_MULTIPLE = 8

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Advances the bot by one day.
 *
 * If a multi-day trip is in progress, simply advances it (matches T025/T026's
 * pattern — no market/newspaper decisions can happen mid-travel). Otherwise:
 * runs the unlock checks, generates today's newspaper (populating
 * `state.currentNewspaper`), derives actionable rumor signals from it,
 * opportunistically repays any active loan, trades on the signals (buying
 * into high-confidence UP rumors — funded partly by a loan if cash alone
 * isn't enough — selling profitable holdings on DOWN rumors, or making a
 * modest baseline buy on a quiet news day), and ends the day with either a
 * Travel-start (toward a remembered better sell price) or a Stay.
 *
 * Never throws — see the file header's "Never throws" section.
 */
export function newsBotStep(state: GameState, rng: Rng): GameState {
  try {
    return newsBotStepInner(state, rng)
  } catch {
    return safeFallback(state)
  }
}

function newsBotStepInner(state: GameState, rng: Rng): GameState {
  if (state.travelInProgress !== null) {
    return advanceTravelDay(state)
  }

  let working = checkGoodUnlocks(checkCityUnlocks(state))
  working = maybeBuyLicense(working)

  const { state: afterPaper, stories } = generateDailyPaper(working, rng)
  working = afterPaper

  const signals = analyzeRumorSignals(working, stories)

  working = maybeRepayLoan(working)
  working = applySignalTrades(working, rng, signals)
  working = maybeInvestInPhase2Assets(working)
  working = decideEndOfDay(working)

  return working
}

function safeFallback(state: GameState): GameState {
  if (state.travelInProgress !== null) return advanceTravelDay(state)
  const stayed = stay(state)
  return stayed !== state ? stayed : advanceDay(state)
}

// ---------------------------------------------------------------------------
// Rumor signal extraction
// ---------------------------------------------------------------------------

export interface RumorSignal {
  goodId: GoodId
  direction: 'up' | 'down'
  confidence: 'high' | 'low'
}

/**
 * Scans today's `stories` for genuine scheduled-event rumors (T018 bucket 2:
 * `isResolution: false`, `isFalseRumor: false`, `relatedEventId !== null`)
 * whose linked `Event` applies to the bot's current city, turning each into
 * zero or more `RumorSignal`s (one per affected, currently-tradeable good).
 * See the file header for the direction/confidence derivation rules.
 */
export function analyzeRumorSignals(state: GameState, stories: NewspaperStory[]): RumorSignal[] {
  const signals: RumorSignal[] = []

  for (const story of stories) {
    if (story.isResolution || story.isFalseRumor || story.relatedEventId === null) continue

    const event = state.activeEvents.find((e) => e.id === story.relatedEventId)
    if (!event) continue
    if (!eventAppliesToCity(event, state.currentCity)) continue

    const avgMultiplier = (event.multiplierMin + event.multiplierMax) / 2
    const direction: 'up' | 'down' = avgMultiplier >= 1 ? 'up' : 'down'
    const confidence: 'high' | 'low' = story.sourceStyle === 'wire' ? 'high' : 'low'

    for (const goodId of event.affectedGoodIds) {
      if (!isGoodTradeable(state, goodId)) continue
      signals.push({ goodId, direction, confidence })
    }
  }

  return signals
}

function eventAppliesToCity(event: Event, cityId: CityId): boolean {
  switch (event.scope.kind) {
    case 'global':
      return true
    case 'city':
      return event.scope.cityId === cityId
    case 'tier': {
      const city = CITIES.find((c) => c.id === cityId)
      return city !== undefined && city.tier === event.scope.tier
    }
  }
}

function isGoodTradeable(state: GameState, goodId: GoodId): boolean {
  if (!state.unlockedGoodIds.includes(goodId)) return false
  const good = GOODS.find((g) => g.id === goodId)
  if (!good) return false
  if (good.licenseFee === null) return true
  return state.purchasedLicenseGoodIds.includes(goodId)
}

function currentPrice(state: GameState, goodId: GoodId): number | null {
  const price = state.priceStates[state.currentCity]?.[goodId]?.currentPrice
  return price === undefined ? null : price
}

// ---------------------------------------------------------------------------
// Trading on signals
// ---------------------------------------------------------------------------

function applySignalTrades(state: GameState, rng: Rng, signals: RumorSignal[]): GameState {
  let working = state

  const upSignals = signals.filter((s) => s.direction === 'up')
  const downSignals = signals.filter((s) => s.direction === 'down')
  const downGoodIds = new Set(downSignals.map((s) => s.goodId))

  // Sell holdings the bot expects to fall, but only while still profitable
  // (or breakeven) at today's local price — see file header.
  for (const signal of downSignals) {
    const holding = working.cargo[signal.goodId]
    if (!holding || holding.qty <= 0) continue
    const price = currentPrice(working, signal.goodId)
    if (price === null) continue
    if (price >= holding.avgBuyCost) {
      working = sell(working, signal.goodId, holding.qty, price)
    }
  }

  // General profit-taking sell — see `sellProfitableHoldings`'s own doc
  // comment for why this exists: without it, ANY position bought on an UP
  // rumor or the baseline fallback (i.e. every position NOT later covered by
  // a DOWN signal on the exact same good) was never sold for the rest of the
  // run, permanently locking up cash and cargo space.
  working = sellProfitableHoldings(working)

  const bestUp = pickBestUpSignal(rng, upSignals)

  if (bestUp) {
    working = buyIntoRumor(working, bestUp)
  } else {
    working = buyCheapestAvailable(working, downGoodIds)
  }

  return working
}

/**
 * ROOT-CAUSE FIX (bot-harness regression, T028): before this function
 * existed, the ONLY sell path in this file was the DOWN-signal branch above
 * — a good was sold when a rumor said its price would FALL. But the bot's
 * whole buying strategy (`buyIntoRumor`, `buyCheapestAvailable`) is about
 * betting a price will RISE (UP rumor) or is cheap right now, i.e. exactly
 * the goods that were NEVER covered by a DOWN signal on that same good. In
 * practice this meant almost every position the bot ever opened was bought
 * and then held forever: `state.cargo` filled up with day-2/3 purchases that
 * sat completely untouched for the rest of a 90-day run, cash got drained to
 * near-zero by the travel fares `decideEndOfDay` kept paying to chase
 * "better remembered prices" it then never actually cashed in at, and net
 * worth was left to drift passively with whatever the frozen cargo's market
 * price happened to do — flat/declining instead of compounding. Confirmed
 * via day-by-day trace (seeds 0 and 2, `makeFreshGameState`): cash pinned at
 * $10-16 by ~day 20-23, identical cargo held bought-and-never-sold through
 * day 90, net worth just oscillating with price noise on that frozen cargo.
 *
 * This closes the loop the file header already describes ("carry it to a
 * city with a better remembered price") with the cash-in step that was
 * missing: sell a currently-held good HERE, today, whenever (a) the local
 * price is at/above its cost basis (no fire-sale losses, same rule the
 * DOWN-signal sell already uses) AND (b) no other unlocked city's
 * remembered price beats it by more than `TRAVEL_MARGIN_THRESHOLD` — i.e.
 * exactly the cities `decideEndOfDay`'s travel decision would NOT bother
 * relocating for. If a better city genuinely is remembered, the position is
 * deliberately left alone here so the travel step below can carry it there
 * instead; once it arrives (or if it never finds anywhere better), this same
 * check on a later day sells it for real. Exported for direct unit testing.
 */
export function sellProfitableHoldings(state: GameState): GameState {
  let working = state

  for (const goodId in working.cargo) {
    const holding = working.cargo[goodId]
    if (!holding || holding.qty <= 0) continue

    const price = currentPrice(working, goodId)
    if (price === null) continue
    if (price < holding.avgBuyCost) continue // no fire-sale losses

    if (hasBetterRememberedDestination(working, goodId, price)) continue // hold — travel step will carry it there

    working = sell(working, goodId, holding.qty, price)
  }

  return working
}

/**
 * True if some OTHER unlocked city's remembered (`lastSeenPrice`) price for
 * `goodId` beats `localPrice` by more than `TRAVEL_MARGIN_THRESHOLD` — the
 * same comparison `findBestRememberedSellDestination` uses to decide whether
 * to travel, kept in sync deliberately so `sellProfitableHoldings` never
 * sells out from under a position `decideEndOfDay` is about to travel for.
 */
function hasBetterRememberedDestination(state: GameState, goodId: GoodId, localPrice: number): boolean {
  for (const cityId of state.unlockedCityIds) {
    if (cityId === state.currentCity) continue
    const remembered = state.priceStates[cityId]?.[goodId]?.lastSeenPrice
    if (remembered === undefined || remembered <= 0) continue
    if (remembered / localPrice > TRAVEL_MARGIN_THRESHOLD) return true
  }
  return false
}

/** Prefers a high-confidence (wire) signal over a low-confidence (gossip)
 * one when both are available; picks randomly (via `rng`) among ties. */
function pickBestUpSignal(rng: Rng, upSignals: RumorSignal[]): RumorSignal | null {
  if (upSignals.length === 0) return null
  const highConfidence = upSignals.filter((s) => s.confidence === 'high')
  const pool = highConfidence.length > 0 ? highConfidence : upSignals
  return rng.pick(pool)
}

/**
 * Buys into an UP rumor signal. Targets a position sized off
 * `HIGH_CONFIDENCE_TARGET_SPEND_FRACTION`/`LOW_CONFIDENCE_TARGET_SPEND_FRACTION`
 * of current cash (the high-confidence target deliberately exceeds current
 * cash, see file header); if the target costs more than the bot currently
 * has, opportunistically attempts a loan at the current city's bank to cover
 * the shortfall (`takeLoan` is a safe no-op if rejected for any reason).
 * Exported for direct unit testing of the loan-taking path — see
 * newsBot.test.ts.
 */
export function buyIntoRumor(state: GameState, signal: RumorSignal): GameState {
  const price = currentPrice(state, signal.goodId)
  if (price === null || price <= 0) return state

  const freeCapacity = state.cargoCapacity - cargoUsed(state)
  if (freeCapacity <= 0) return state

  const targetSpendFraction =
    signal.confidence === 'high' ? HIGH_CONFIDENCE_TARGET_SPEND_FRACTION : LOW_CONFIDENCE_TARGET_SPEND_FRACTION
  const targetSpend = state.cash * targetSpendFraction
  const targetQty = Math.min(freeCapacity, Math.floor(targetSpend / price))
  if (targetQty <= 0) return state

  const targetCost = targetQty * price
  let working = state

  if (signal.confidence === 'high' && targetCost > working.cash) {
    const shortfall = targetCost - working.cash
    working = takeLoan(working, working.currentCity, Math.ceil(shortfall))
    // No-op (identical state back) if the loan is rejected — safe either way.
  }

  const affordableQty = Math.min(targetQty, Math.floor(working.cash / price))
  if (affordableQty <= 0) return working

  return buy(working, signal.goodId, affordableQty, price)
}

/**
 * No-rumor-signal fallback: buys a modest position (0.15x cash) in whichever
 * currently-tradeable, non-down-signaled good is cheapest relative to its own
 * base price in the current city — a small, independent version of the same
 * "spread chasing" idea T026's greedy bot uses (not imported from there).
 */
function buyCheapestAvailable(state: GameState, excludeGoodIds: Set<GoodId>): GameState {
  let best: { goodId: GoodId; ratio: number; price: number } | null = null

  for (const good of GOODS) {
    if (excludeGoodIds.has(good.id)) continue
    if (!isGoodTradeable(state, good.id)) continue

    const price = currentPrice(state, good.id)
    if (price === null || price <= 0) continue

    const ratio = price / good.basePrice
    if (!best || ratio < best.ratio) {
      best = { goodId: good.id, ratio, price }
    }
  }

  if (!best) return state

  const freeCapacity = state.cargoCapacity - cargoUsed(state)
  if (freeCapacity <= 0) return state

  const desiredSpend = state.cash * baselineSpendFraction(state.day)
  const qty = Math.min(freeCapacity, Math.floor(desiredSpend / best.price))
  if (qty <= 0) return state

  return buy(state, best.goodId, qty, best.price)
}

// ---------------------------------------------------------------------------
// Opportunistic license purchase
// ---------------------------------------------------------------------------

/**
 * T029 ADDITION — root-cause fix for a second balance bug found alongside
 * the baseline-spend-fraction one above. Before this existed, `newsBotStep`
 * never called `buyLicense` (unlocks.ts) at all, so it could only ever trade
 * the 3 free starter goods (Grain/Cotton/Iron) for an entire 90-day run —
 * confirmed via trace: 6 of the 9 v1 goods (and therefore most of the §7
 * event table's affected-goods, e.g. Silk/Spices/Steel/Fuel-scoped events)
 * could NEVER produce an actionable `RumorSignal` no matter how good the news
 * was, since `isGoodTradeable` (this file) rejects any good without a
 * purchased license. A "news-follower" bot that structurally can't act on
 * most of the news it reads isn't using its information edge at all.
 *
 * Buys the CHEAPEST licensable good (by fee) that is (a) already unlocked
 * (`state.unlockedGoodIds`, via T010's `checkGoodUnlocks`), (b) not yet
 * purchased, and (c) affordable with room to spare
 * (`cash >= fee * LICENSE_AFFORDABILITY_MULTIPLE`) — at most ONE license per
 * day, so a newly-affordable license never eats the cash the same day's
 * trading needs. Cheapest-first means Salt/Textiles unlock early (day 5+,
 * per §5), well before the pricier Spices/Fuel/Steel/Silk licenses become
 * affordable, mirroring how a real player would naturally expand their
 * tradeable-goods list as their bankroll grows. Exported for direct unit
 * testing.
 */
export function maybeBuyLicense(state: GameState): GameState {
  const candidates = GOODS.filter(
    (good) =>
      good.licenseFee !== null &&
      state.unlockedGoodIds.includes(good.id) &&
      !state.purchasedLicenseGoodIds.includes(good.id) &&
      state.cash >= good.licenseFee * LICENSE_AFFORDABILITY_MULTIPLE,
  ).sort((a, b) => (a.licenseFee as number) - (b.licenseFee as number))

  const cheapest = candidates[0]
  if (!cheapest) return state

  return buyLicense(state, cheapest.id)
}

// ---------------------------------------------------------------------------
// Opportunistic loan repayment
// ---------------------------------------------------------------------------

/**
 * If the current city's bank carries an active loan and cash comfortably
 * exceeds `SPARE_CASH_RESERVE`, repays `REPAYMENT_FRACTION` of the spare
 * cash toward it (capped at the outstanding debt by `repayLoan` itself).
 * Exported for direct unit testing.
 */
export function maybeRepayLoan(state: GameState): GameState {
  const account = state.bankAccounts[state.currentCity]
  if (!account?.loan) return state

  const spare = state.cash - SPARE_CASH_RESERVE
  if (spare <= 0) return state

  const outstanding = account.loan.principal + account.loan.accruedInterest
  const amount = Math.min(spare * REPAYMENT_FRACTION, outstanding)
  if (amount <= 0) return state

  return repayLoan(state, state.currentCity, amount)
}

// ---------------------------------------------------------------------------
// End-of-day travel/stay decision
// ---------------------------------------------------------------------------

function decideEndOfDay(state: GameState): GameState {
  const destination = findBestRememberedSellDestination(state)

  if (destination) {
    const started = travel(state, destination)
    if (started !== state) {
      return advanceTravelDay(started)
    }
  }

  const stayed = stay(state)
  return stayed !== state ? stayed : advanceDay(state)
}

/**
 * For every good the bot currently holds, compares the current city's live
 * price against every OTHER unlocked city's remembered (`lastSeenPrice`)
 * price for that good — never a live remote price, per §6. Returns the
 * single best-margin destination if it beats the current price by more than
 * `TRAVEL_MARGIN_THRESHOLD`, else `null` (stay put).
 */
function findBestRememberedSellDestination(state: GameState): CityId | null {
  let bestCity: CityId | null = null
  let bestMargin = TRAVEL_MARGIN_THRESHOLD

  for (const goodId in state.cargo) {
    const holding = state.cargo[goodId]
    if (!holding || holding.qty <= 0) continue

    const localPrice = currentPrice(state, goodId)

    for (const cityId of state.unlockedCityIds) {
      if (cityId === state.currentCity) continue

      const remembered = state.priceStates[cityId]?.[goodId]?.lastSeenPrice
      if (remembered === undefined || remembered <= 0) continue

      const baseline = localPrice !== null && localPrice > 0 ? localPrice : remembered
      const margin = remembered / baseline

      if (margin > bestMargin) {
        bestMargin = margin
        bestCity = cityId
      }
    }
  }

  return bestCity
}

// ---------------------------------------------------------------------------
// Opportunistic Phase 2 investment (T067) — see file header for the full
// design rationale (why one-per-day, why cheapest-first, why the higher
// affordability multiple, why store/withdraw and leasedAnnual/personal are
// out of scope).
// ---------------------------------------------------------------------------

/** The marginal cost (dollars) of the NEXT warehouse floor in `cityId`, or
 * `null` if the player already owns the max (`CONFIG.warehouse.maxFloors`)
 * floors there. Mirrors `hotel.ts`'s own `getNextUpgradeCost` shape, kept
 * local since warehouse.ts doesn't export an equivalent helper (its own
 * `buildWarehouseFloor` computes this internally but doesn't surface it). */
function nextWarehouseFloorCost(state: GameState, cityId: CityId): number | null {
  const currentFloors = state.warehouses?.[cityId]?.floorsBuilt ?? 0
  if (currentFloors >= CONFIG.warehouse.maxFloors) return null
  return CONFIG.warehouse.floors[currentFloors + 1]?.buildCost ?? null
}

/** The cheapest plane class currently configured, by `purchasePrice` — read
 * generically off `CONFIG.aviation.classes` (rather than hardcoding
 * `'propFeeder'`) so a future balance pass reordering/repricing the class
 * table never silently strands this bot buying the wrong (pricier) class. */
function cheapestPlaneClass(): { planeClass: PlaneClass; cost: number } {
  let best: { planeClass: PlaneClass; cost: number } | null = null
  for (const planeClass of Object.keys(CONFIG.aviation.classes) as PlaneClass[]) {
    const cost = CONFIG.aviation.classes[planeClass].purchasePrice
    if (!best || cost < best.cost) best = { planeClass, cost }
  }
  return best as { planeClass: PlaneClass; cost: number } // classes is always non-empty
}

/** Buys `planeClass` in `cityId`, then immediately leases it out monthly —
 * the only status this bot ever chooses (see file header: Leased Monthly is
 * cancellable any time with 3 days' notice, unlike Leased Annual's firm
 * 90-day lock-in, and needs no travel-timing logic unlike Personal use). */
function buyAndLeaseMonthly(state: GameState, cityId: CityId, planeClass: PlaneClass): GameState {
  const afterBuy = buyPlane(state, cityId, planeClass)
  if (afterBuy === state) return state

  const planes = afterBuy.planes ?? []
  const newPlane = planes[planes.length - 1] // buyPlane always appends
  if (!newPlane) return afterBuy

  return setPlaneStatus(afterBuy, newPlane.id, 'leasedMonthly')
}

/**
 * Opportunistically spends SPARE cash (whatever the day's rumor-driven
 * trading already decided not to use) on the cheapest of three candidate
 * Phase 2 purchases in the bot's current city — see file header for the full
 * "why one-per-day, cheapest-first, higher affordability bar" rationale.
 * Exported for direct unit testing (deferred to T068 per this codebase's
 * documented testing policy for Phase 2 — see phase-13-final-balance-pass.md).
 */
export function maybeInvestInPhase2Assets(state: GameState): GameState {
  const cityId = state.currentCity
  const city = CITIES.find((c) => c.id === cityId)
  if (!city) return state

  const candidates: Array<{ cost: number; apply: (s: GameState) => GameState }> = []

  const warehouseCost = nextWarehouseFloorCost(state, cityId)
  if (warehouseCost !== null) {
    candidates.push({ cost: warehouseCost, apply: (s) => buildWarehouseFloor(s, cityId) })
  }

  const hotelCost = getNextUpgradeCost(state, city)
  if (hotelCost !== null) {
    candidates.push({ cost: hotelCost, apply: (s) => buildOrUpgradeHotel(s, cityId) })
  }

  if (isPlanePurchaseAvailable(state)) {
    const { planeClass, cost } = cheapestPlaneClass()
    candidates.push({ cost, apply: (s) => buyAndLeaseMonthly(s, cityId, planeClass) })
  }

  const affordable = candidates.filter((c) => state.cash >= c.cost * PHASE2_AFFORDABILITY_MULTIPLE)
  if (affordable.length === 0) return state

  affordable.sort((a, b) => a.cost - b.cost)
  const chosen = affordable[0] as { cost: number; apply: (s: GameState) => GameState }
  return chosen.apply(state)
}
