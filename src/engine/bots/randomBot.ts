/**
 * Random bot strategy — Trade Winds of Selvara.
 *
 * Design doc reference: §11 — "three scripted bots — (a) random trader, (b)
 * greedy spread-chaser ignoring news, (c) news-follower using rumors +
 * loans. Run 1,000 seeded games each, 360 days." and its health check:
 * "Random bot should hover near broke (median < $10k at day 90)." This file
 * implements bot (a) only — it is deliberately the DUMBEST of the three:
 * every decision (whether to trade, which good, buy-vs-sell, how much, and
 * whether to end the day with Travel or Stay) is drawn straight from the
 * seeded RNG with no market awareness, no memory of past prices, and no use
 * of the newspaper/rumor/rank/loan systems whatsoever. It exists as the
 * balance harness's (T028, later) worst-case baseline: if the random bot
 * ever does WELL, something in the price/event model is too forgiving.
 *
 * TASK.md T025 acceptance criteria (verbatim): "A pure function
 * `randomBotStep(state, rng)` picks a random valid action each day (random
 * buy/sell qty within limits, random travel-or-stay) using only the seeded
 * RNG — no use of newspaper/rank/loans. Runs 90 simulated days without
 * throwing in a smoke test."
 *
 * Pure TypeScript, zero React imports (see /src/engine/README.md).
 *
 * ---------------------------------------------------------------------------
 * DESIGN: explicit non-import constraint (newspaper/rank/loans)
 * ---------------------------------------------------------------------------
 * This file does NOT import from `../newspaper`, `../rank`, or
 * `../bank/loans` — not even for their types. The import list below is the
 * easiest possible proof of that: every import is either a shared primitive
 * type (`GameState`, `Rng`) or one of the already-built action/data modules
 * this bot is explicitly allowed to drive (`cargo.ts`, `actions/trade.ts`,
 * `actions/travel.ts`, `actions/stay.ts`, `turnLoop.ts`, `unlocks.ts`,
 * `data/goods.ts`). Note `turnLoop.ts`/`actions/travel.ts`/`actions/stay.ts`
 * themselves internally use `rank.ts`/`bank/loans.ts` (T021/T023 wired those
 * into `advanceDay`) — that is unavoidable and fine: the constraint here is
 * about what THIS bot's own decision-making reads/reasons about, not about
 * severing `advanceDay`'s existing, required day-tick side effects.
 *
 * ---------------------------------------------------------------------------
 * DESIGN: one `randomBotStep` call = up to one day of decisions
 * ---------------------------------------------------------------------------
 * Mirrors §2's core loop: every day, the player may trade freely, then MUST
 * end the day with either Travel or Stay. Concretely:
 *
 *   1. Mid-trip (`state.travelInProgress !== null`): trading/starting a new
 *      trip is impossible per T013's own rules (see actions/travel.ts's file
 *      header). The only legal thing to do is let the trip continue, so this
 *      function just calls `advanceTravelDay(state)` and returns immediately
 *      — no RNG draws happen at all on a transit day.
 *
 *   2. Not traveling: first refreshes `unlockedCityIds`/`unlockedGoodIds` via
 *      `checkCityUnlocks`/`checkGoodUnlocks` (T010) — cheap, always safe,
 *      no-ops when nothing newly qualifies — so a long-running bot actually
 *      reaches Tier 2 content once its net worth crosses the threshold,
 *      rather than being permanently stuck trading only the 3 starter goods.
 *      Then draws a random NUMBER of trade-ish attempts (0-3, via `rng.int`)
 *      and, for each one, either buys a license for a newly-unlocked good
 *      (small probability, only when one exists) or attempts a random
 *      buy-or-sell of a random tradeable good in a random quantity capped by
 *      cash/cargo/ownership (see `attemptRandomAction` below). Finally MUST
 *      end the day: draws once more to pick Travel (50%) or Stay (50%) — see
 *      the weighting note below — falling back to Stay (and, if even Stay is
 *      rejected for lack of cash, straight to `advanceDay`) whenever the
 *      preferred choice is rejected, so the day always actually advances.
 *
 * ---------------------------------------------------------------------------
 * DESIGN: day-ending weighting — 50/50 Travel vs. Stay
 * ---------------------------------------------------------------------------
 * The task brief explicitly leaves this to the implementer ("pick between
 * these two via the RNG (e.g. 50/50, or weighted, your call, document it)").
 * A flat 50/50 coin flip is used here (`rng.next() < 0.5`) — deliberately the
 * simplest possible choice, matching the "random bot should be the dumbest
 * baseline" framing from the module header above. No bias toward either
 * action, and no attempt to reason about whether traveling is currently a
 * good idea (that reasoning is exactly what distinguishes the greedy/news
 * bots, T026/T027, from this one).
 *
 * ---------------------------------------------------------------------------
 * DESIGN: never throws, tolerates any sub-action rejection
 * ---------------------------------------------------------------------------
 * `buy`/`sell`/`travel`/`stay`/`buyLicense` all follow the codebase-wide
 * "reject by returning the identical `state` reference, never throw"
 * convention (see each file's own header). This function leans on that
 * directly: every attempted sub-action's result is checked against the state
 * it was called with (`result !== working`) only where the control flow
 * needs to know whether it succeeded (the day-ending choice's fallback);
 * everywhere else a rejected attempt is simply a no-op absorbed into
 * `working` unchanged, and the loop moves on. There is no path in this file
 * that can throw an exception under any `GameState`/`Rng` input.
 *
 * ---------------------------------------------------------------------------
 * DESIGN: quantity/affordability caps
 * ---------------------------------------------------------------------------
 * A buy attempt's quantity is capped by THREE independent limits, taking the
 * smallest: remaining cargo room (`cargoCapacity - cargoUsed`), what cash can
 * actually afford at the good's current price, and a flat sanity ceiling
 * (`MAX_TRADE_QTY`, 50 units) so a single random buy can never dump the bot's
 * entire cash pile into one good even when it could technically afford a lot
 * of a cheap good like Grain. A sell attempt's quantity is capped by however
 * many units of that good the bot currently owns. If any of these caps come
 * out to 0 or below (no cargo room, can't afford even 1 unit, owns none of
 * the good), the attempt is simply skipped — no call to `buy`/`sell` is made
 * at all, rather than calling it with an invalid quantity (both reject qty
 * <= 0 anyway, so this is a belt-and-suspenders early-out, not a
 * correctness requirement).
 */

import { cargoUsed } from '../cargo'
import { GOODS } from '../data/goods'
import { buy, sell } from '../actions/trade'
import { travel, advanceTravelDay } from '../actions/travel'
import { stay } from '../actions/stay'
import { advanceDay } from '../turnLoop'
import { buyLicense, checkCityUnlocks, checkGoodUnlocks } from '../unlocks'
import type { Rng } from '../rng'
import type { GameState } from '../types'

/** Flat sanity ceiling on a single random buy's quantity — see file header. */
const MAX_TRADE_QTY = 50

/** How many trade-ish attempts (buy/sell/license) to draw per non-travel
 * day, inclusive upper bound — see file header ("0-3 attempts"). */
const MAX_ACTIONS_PER_DAY = 3

/** Probability of using a given trade-ish attempt on buying a license for a
 * newly-unlocked-but-not-yet-licensed good, rather than a buy/sell — kept
 * low since most attempts should be ordinary trading. */
const LICENSE_ATTEMPT_PROBABILITY = 0.2

/** Probability the day-ending choice is Travel rather than Stay — see file
 * header's "50/50" design note. */
const TRAVEL_VS_STAY_PROBABILITY = 0.5

/**
 * One random buy/sell/license attempt against `state`, using `rng`. Returns
 * a NEW `GameState` on success, or the identical `state` reference if the
 * attempt was skipped (no eligible good/qty) or rejected by the underlying
 * action. Never throws.
 */
function attemptRandomAction(state: GameState, rng: Rng): GameState {
  const licensable = GOODS.filter(
    (good) =>
      state.unlockedGoodIds.includes(good.id) &&
      good.licenseFee !== null &&
      !state.purchasedLicenseGoodIds.includes(good.id),
  )

  // Occasionally spend an attempt buying a license instead of trading, so a
  // long-running bot can eventually trade goods beyond the 3 free starters
  // (Grain/Cotton/Iron) once it reaches the relevant tier/day gate.
  if (licensable.length > 0 && rng.next() < LICENSE_ATTEMPT_PROBABILITY) {
    const good = rng.pick(licensable)
    return buyLicense(state, good.id)
  }

  const tradeable = GOODS.filter(
    (good) =>
      state.unlockedGoodIds.includes(good.id) &&
      (good.licenseFee === null || state.purchasedLicenseGoodIds.includes(good.id)),
  )
  if (tradeable.length === 0) return state

  const good = rng.pick(tradeable)
  const unitPrice = state.priceStates[state.currentCity]?.[good.id]?.currentPrice ?? good.basePrice

  const wantsToBuy = rng.next() < 0.5

  if (wantsToBuy) {
    if (unitPrice <= 0) return state
    const cargoRoom = state.cargoCapacity - cargoUsed(state)
    const affordableQty = Math.floor(state.cash / unitPrice)
    const maxQty = Math.min(cargoRoom, affordableQty, MAX_TRADE_QTY)
    if (maxQty <= 0) return state
    const qty = rng.int(1, maxQty)
    return buy(state, good.id, qty, unitPrice)
  }

  const owned = state.cargo[good.id]?.qty ?? 0
  if (owned <= 0) return state
  const qty = rng.int(1, owned)
  return sell(state, good.id, qty, unitPrice)
}

/**
 * Picks and executes ONE random valid action for "today", ending with
 * either a Travel-start, a Travel-continuation, or a Stay — see file header
 * for the full day-shape rationale. Pure function: never mutates `state`,
 * never throws, always returns a valid `GameState`.
 *
 * - Mid-trip (`state.travelInProgress !== null`): delegates straight to
 *   `advanceTravelDay(state)` and returns that result — no other randomness
 *   this "day" (matches T013's "can't trade or start a new trip while
 *   traveling" rule).
 * - Otherwise: refreshes city/good unlocks (T010), makes 0-3 random
 *   buy/sell/license attempts, then ends the day via a 50/50 Travel-or-Stay
 *   coin flip (falling back to Stay, and finally to a bare `advanceDay`, if
 *   the preferred choice is rejected) so the day always actually advances.
 */
export function randomBotStep(state: GameState, rng: Rng): GameState {
  if (state.travelInProgress !== null) {
    // Mid-trip: nothing else is legal today — just let the trip continue.
    return advanceTravelDay(state)
  }

  let working = checkGoodUnlocks(checkCityUnlocks(state))

  const numAttempts = rng.int(0, MAX_ACTIONS_PER_DAY)
  for (let i = 0; i < numAttempts; i++) {
    working = attemptRandomAction(working, rng)
  }

  const wantsToTravel = rng.next() < TRAVEL_VS_STAY_PROBABILITY
  if (wantsToTravel) {
    const destinations = working.unlockedCityIds.filter((id) => id !== working.currentCity)
    if (destinations.length > 0) {
      const destination = rng.pick(destinations)
      const traveled = travel(working, destination)
      if (traveled !== working) {
        // Trip accepted — consume its first day this same call, so a single
        // `randomBotStep` call always advances the day exactly once (even
        // for the very first leg of a multi-day trip).
        return advanceTravelDay(traveled)
      }
      // Travel rejected (e.g. insufficient cash for the fare) — fall through
      // to the Stay fallback below.
    }
  }

  const stayed = stay(working)
  if (stayed !== working) return stayed

  // Last-resort fallback: Stay was itself rejected (cash can't cover the
  // nightly rate). Advance the day directly so the bot always makes forward
  // progress rather than ever leaving a day un-advanced.
  return advanceDay(working)
}
