/**
 * Greedy spread-chaser bot strategy — Trade Winds of Selvara.
 *
 * Design doc reference: §11 — "(b) greedy spread-chaser ignoring news" — one
 * of the three scripted bots the §11 balance-test harness (T028) runs 1,000
 * seeded games against. Its whole point is to be a "dumb but sound" trading
 * heuristic — buy whatever's unusually cheap right now, carry it toward the
 * best place you remember it selling for, cash in, repeat — with ZERO
 * awareness of rumors/newspaper/rank/loans. It exists to give the harness a
 * mid-tier reference point between the random bot (near-broke) and the
 * news-follower bot (hits the §11 targets): §11 says "Greedy bot ≈ 0.5×
 * targets."
 *
 * TASK.md T026 reference (doc references: §11 only — this task predates any
 * task-specific doc section, §11 is it).
 *
 * ---------------------------------------------------------------------------
 * DELIBERATE CONSTRAINT: must NOT import newspaper.ts
 * ---------------------------------------------------------------------------
 * Per TASK.md T026: "ignoring newspaper/rumor state entirely (must not
 * import newspaper.ts — enforce via code review/comment)". There is no
 * runtime way to unit-test an absent import, so this comment IS the
 * enforcement mechanism the task asks for: this file contains, and must
 * continue to contain, NO import of '../newspaper' (or anything that
 * re-exports newspaper state) anywhere. Grep-friendly marker: NO-NEWSPAPER-IMPORT.
 *
 * ---------------------------------------------------------------------------
 * Pattern: mirrors T025's randomBot.ts (same file family, same day-loop
 * shape) and reuses the same already-built primitives (T011-T015):
 *   - `advanceTravelDay` (actions/travel.ts) — mid-trip, no action possible.
 *   - `checkCityUnlocks`/`checkGoodUnlocks` (unlocks.ts, T010) — run first
 *     every non-travel day so the bot can keep progressing into Tier 2 and
 *     higher-tier goods over a long run, exactly like TASK.md's brief asks.
 *   - `buy`/`sell` (actions/trade.ts, T012), `travel`/`advanceTravelDay`
 *     (actions/travel.ts, T013), `stay` (actions/stay.ts, T014) — all
 *     pure, reject-by-returning-same-reference functions; this bot never
 *     throws because none of its dependencies do, and it never assumes a
 *     dependency call succeeded (always checks `result !== state` before
 *     treating an action as having happened).
 *
 * ---------------------------------------------------------------------------
 * Design: "cheapest relative to base" (the BUY decision)
 * ---------------------------------------------------------------------------
 * Per TASK.md T026 and §6's price formula, `currentPrice` already bakes in
 * cityModifier/trend/noise/events/mean-reversion — dividing it by the good's
 * `basePrice` gives a single unitless ratio: how cheap this good is RIGHT
 * NOW in THIS city relative to its own normal price, independent of how
 * expensive different goods are from each other in absolute terms (Silk at
 * base $300 vs Grain at base $10 are not directly comparable in raw price,
 * but a 0.5x-of-base Silk and a 0.5x-of-base Grain are equally "unusually
 * cheap"). The bot only ever reads `state.priceStates[state.currentCity]?.
 * [goodId]?.currentPrice` — never any other city's `currentPrice` — per §6's
 * information model ("the player sees live prices only in the current
 * city"); a good with no `PriceState` entry yet for this city is treated as
 * unavailable to buy this turn (no fabricated price), matching the task
 * brief exactly. Only goods that are both unlocked (`unlockedGoodIds`) AND
 * either free (`licenseFee === null`) or already licensed
 * (`purchasedLicenseGoodIds`) are considered tradeable candidates. Ties on
 * the minimum ratio (rare, but possible with identical prices) are broken
 * via the seeded `rng` rather than always favoring array order.
 *
 * ---------------------------------------------------------------------------
 * Design: buy sizing rule (interpretation call — the doc/task does not
 * specify an exact greedy sizing formula)
 * ---------------------------------------------------------------------------
 * `BUY_CASH_FRACTION = 0.5`: the bot spends up to 50% of its CURRENT cash on
 * the chosen good, further capped by remaining cargo space
 * (`cargoCapacity - cargoUsed(state)`). Rationale: a pure "spend everything"
 * bot would leave itself unable to ever afford fares/hotel nights/licenses,
 * starving its own ability to travel toward the sell price it's chasing;
 * capping at half keeps a cash cushion for the OTHER actions a day still
 * requires (travel fare, stay cost) while still being meaningfully
 * "greedy" (a real spread-chaser wouldn't leave 95% of its capital idle).
 * `qty = floor(min(cash * BUY_CASH_FRACTION, cash) / price)`, then clamped to
 * remaining cargo space; if that comes out to 0 (too poor or too full), no
 * buy happens this turn — that's fine, the day still ends normally via the
 * travel/stay step below.
 *
 * ---------------------------------------------------------------------------
 * Design: "travels toward the best known remembered sell price"
 * ---------------------------------------------------------------------------
 * `state.priceStates[cityId]?.[goodId]?.lastSeenPrice` is the ONLY signal
 * used for non-current cities (never `currentPrice` for anywhere but
 * `state.currentCity` — see §6). For EACH good currently held in cargo, this
 * file finds that good's single best-remembered-price city among UNLOCKED
 * cities only (`state.unlockedCityIds` — a bot, like a player, cannot travel
 * anywhere it hasn't unlocked; `travel()` itself does not enforce this
 * engine-side, so this file enforces it at the decision layer). Across every
 * held good's own best city, the (good, city) pair with the single HIGHEST
 * remembered price overall is chosen as the day's travel target — the
 * "simplest defensible approach" the task brief explicitly suggests. This
 * naturally also covers "sell here" opportunistically: since the CURRENT
 * city's own `lastSeenPrice` is kept fresh every day the bot is physically
 * present (turnLoop.ts's `advanceDay`), if the current city IS the best
 * remembered price for a held good, that comparison already reflects it —
 * see the SELL step below, which cashes in exactly that case before any
 * travel decision is made.
 *
 * SELL step (added beyond the task's literal "buy + travel" wording, to
 * close the loop into an actual spread-chase rather than a pure
 * accumulator): before buying anything, for each good currently held, if
 * THIS city is that good's own best-remembered-price city (by the same
 * `lastSeenPrice` comparison described above) and a live current-city price
 * is available, the bot sells its entire holding of that good here. This is
 * what makes the strategy a genuine "buy low here, carry it to where I
 * remember it selling high, cash in there" loop across multiple days/trips,
 * rather than a bot that only ever accumulates cargo until full.
 *
 * ---------------------------------------------------------------------------
 * Design: empty-cargo / no-remembered-price fallback
 * ---------------------------------------------------------------------------
 * If the bot holds nothing (empty cargo) after the buy step, or holds
 * something but no OTHER unlocked city has any remembered price for any
 * held good yet (very early game, before the bot has ever left its start
 * city), there is nothing meaningful to travel toward. The documented
 * fallback is simply to Stay — deterministic and safe, and it still costs
 * the city's nightly rate (keeping cash pressure realistic) without wasting
 * a travel fare on a directionless trip. If `stay()` itself is rejected
 * (cash can't cover the nightly rate), the day is still forced forward via
 * `advanceDay` directly (same safety-valve pattern already used by
 * turnLoop.test.ts's own headless simulation and expected of T025's
 * randomBot), so the bot NEVER throws and NEVER stalls a run.
 */

import { CITIES } from '../data/cities'
import { GOODS } from '../data/goods'
import { cargoUsed } from '../cargo'
import { buy, sell } from '../actions/trade'
import { advanceTravelDay, travel } from '../actions/travel'
import { stay } from '../actions/stay'
import { advanceDay } from '../turnLoop'
import { checkCityUnlocks, checkGoodUnlocks } from '../unlocks'
import type { Rng } from '../rng'
import type { CityId, GameState, GoodId } from '../types'

/** See file header — spends up to this fraction of CURRENT cash on the
 * day's chosen buy, further capped by remaining cargo space. Documented
 * interpretation call; the doc/task does not specify an exact number. */
const BUY_CASH_FRACTION = 0.5

/** True when `goodId` is currently tradeable by the bot: unlocked, AND
 * either free (no license required) or already licensed. Mirrors the same
 * gating `buyLicense`/the Market screen (T038, future) would apply. */
function isTradeable(state: GameState, goodId: GoodId): boolean {
  if (!state.unlockedGoodIds.includes(goodId)) return false
  const good = GOODS.find((g) => g.id === goodId)
  if (!good) return false
  return good.licenseFee === null || state.purchasedLicenseGoodIds.includes(goodId)
}

/**
 * Finds the single best-known-price UNLOCKED city for `goodId`, using ONLY
 * `lastSeenPrice` (§6 — never a non-current city's live `currentPrice`).
 * Ties keep the first city encountered in `CITIES` order (deterministic).
 * Returns `null` if no unlocked city has ever recorded a price for this good.
 */
function bestRememberedCityFor(
  state: GameState,
  goodId: GoodId,
): { cityId: CityId; price: number } | null {
  let best: { cityId: CityId; price: number } | null = null

  for (const city of CITIES) {
    if (!state.unlockedCityIds.includes(city.id)) continue
    const remembered = state.priceStates[city.id]?.[goodId]?.lastSeenPrice
    if (remembered === undefined) continue
    if (best === null || remembered > best.price) {
      best = { cityId: city.id, price: remembered }
    }
  }

  return best
}

/**
 * SELL step — see file header. For every good currently held, sells the
 * entire holding here if `state.currentCity` is that good's own
 * best-remembered-price city and a live price is available here.
 */
function sellAtRememberedBestCity(state: GameState): GameState {
  let working = state

  for (const goodId in working.cargo) {
    const holding = working.cargo[goodId]
    if (!holding || holding.qty <= 0) continue

    const best = bestRememberedCityFor(working, goodId)
    if (!best || best.cityId !== working.currentCity) continue

    const livePrice = working.priceStates[working.currentCity]?.[goodId]?.currentPrice
    if (livePrice === undefined) continue

    working = sell(working, goodId, holding.qty, livePrice)
  }

  return working
}

/**
 * BUY step — see file header. Picks the tradeable good in the current city
 * with the lowest `currentPrice / basePrice` ratio (goods with no observed
 * price this city are skipped, never fabricated) and buys as much as
 * `BUY_CASH_FRACTION` of cash / remaining cargo space allows.
 */
function buyCheapestRelativeToBase(state: GameState, rng: Rng): GameState {
  const candidates: Array<{ goodId: GoodId; price: number; ratio: number }> = []

  for (const good of GOODS) {
    if (!isTradeable(state, good.id)) continue
    const price = state.priceStates[state.currentCity]?.[good.id]?.currentPrice
    if (price === undefined) continue // no observed price here yet — skip, don't fabricate
    candidates.push({ goodId: good.id, price, ratio: price / good.basePrice })
  }

  if (candidates.length === 0) return state

  const minRatio = Math.min(...candidates.map((c) => c.ratio))
  const tied = candidates.filter((c) => c.ratio === minRatio)
  const chosen = tied.length === 1 ? (tied[0] as (typeof tied)[number]) : rng.pick(tied)

  const cargoRemaining = state.cargoCapacity - cargoUsed(state)
  if (cargoRemaining <= 0) return state

  const affordableQty = Math.floor((state.cash * BUY_CASH_FRACTION) / chosen.price)
  const qty = Math.min(affordableQty, cargoRemaining)

  if (qty < 1) return state

  return buy(state, chosen.goodId, qty, chosen.price)
}

/**
 * End-of-day step — see file header. Travels toward the single best
 * remembered (good, city) pair among everything currently held; falls back
 * to Stay when nothing is held or no remembered price exists elsewhere.
 * Always advances exactly one day, one way or another, and never throws.
 */
function endDayTowardBestRememberedPrice(state: GameState): GameState {
  let bestOverall: { cityId: CityId; price: number } | null = null

  for (const goodId in state.cargo) {
    const holding = state.cargo[goodId]
    if (!holding || holding.qty <= 0) continue

    const best = bestRememberedCityFor(state, goodId)
    if (!best) continue
    if (bestOverall === null || best.price > bestOverall.price) {
      bestOverall = best
    }
  }

  if (bestOverall !== null && bestOverall.cityId !== state.currentCity) {
    const started = travel(state, bestOverall.cityId)
    if (started !== state) {
      // Trip accepted — consume its first day this same call, matching the
      // convention already established by turnLoop.test.ts's headless
      // simulation and randomBot's day-loop shape.
      return advanceTravelDay(started)
    }
    // Travel rejected (e.g. insufficient cash for the fare) — fall through
    // to the Stay fallback below.
  }

  // Fallback: nothing held, nothing remembered elsewhere, target is the
  // current city already, or travel was rejected — see file header.
  const stayed = stay(state)
  return stayed !== state ? stayed : advanceDay(state)
}

/**
 * `greedyBotStep(state, rng)` — advances the game by exactly one day using
 * the greedy spread-chaser strategy (§11). Never throws; always returns a
 * NEW `GameState` with `day` advanced by exactly 1 (either via a Stay, or
 * via the first leg of a newly-started or already-in-progress Travel).
 *
 * NO-NEWSPAPER-IMPORT: this function and this file deliberately never read
 * `state.currentNewspaper`/`state.activeEvents`' rumor fields or import
 * anything from `../newspaper` — see file header.
 */
export function greedyBotStep(state: GameState, rng: Rng): GameState {
  if (state.travelInProgress !== null) {
    // Mid-trip — cannot act, per §2 ("cannot trade" while traveling) and the
    // same convention travel.ts documents for every action file.
    return advanceTravelDay(state)
  }

  let working = checkCityUnlocks(state)
  working = checkGoodUnlocks(working)

  working = sellAtRememberedBestCity(working)
  working = buyCheapestRelativeToBase(working, rng)

  return endDayTowardBestRememberedPrice(working)
}
