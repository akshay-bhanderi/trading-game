/**
 * City and commodity unlock logic (incl. license purchase) — Trade Winds of
 * Selvara.
 *
 * Design doc reference:
 *   §4 — "Cities unlock by net worth (cash + deposits + goods at last-known
 *   prices - debt)." Tier 1 is available from game start; Tier 2 unlocks at
 *   net worth $25,000 (CONFIG.cityUnlocks.tier2NetWorth); Tier 3/4 thresholds
 *   exist in config for completeness but have no reachable Tier 3/4 `City`
 *   records in v1 (§13), so they never trigger — the lookup below is generic
 *   by tier, not hardcoded to "Tier 2 only".
 *   §5 — "Unlocks are tied to city unlocks... plus a license fee paid once at
 *   any bank." Salt/Textiles: "Tier 1, day 5+". Spices/Fuel/Steel/Silk:
 *   "Tier 2" (no minDay).
 *
 * Pure TypeScript, zero React imports (see /src/engine/README.md).
 *
 * Design decisions (documented per the task brief):
 *
 * 1. Immutability: both `checkCityUnlocks` and `checkGoodUnlocks` are pure
 *    functions that return a (possibly new) `GameState` rather than mutating
 *    their argument, matching the established convention in
 *    cargo.ts/stay.ts/trade.ts/travel.ts/netWorth.ts. When nothing newly
 *    qualifies, the identical `state` reference is returned (no shallow
 *    copy) so callers can cheaply detect "no-op" with `result === state`.
 *
 * 2. Tier->threshold lookup is generic: `checkCityUnlocks` groups `CITIES` by
 *    `tier` and compares each tier's net worth threshold (all pulled from
 *    `CONFIG.cityUnlocks`, keyed by tier number) against `calcNetWorth(state)`.
 *    Tier 1 is never re-added here (it's the seeding step's job per the task
 *    brief) and has no threshold entry — this function only ever ADDS newly-
 *    qualifying cities, never removes/reverts already-unlocked ones even if
 *    net worth were to later drop below a threshold (matches §4: unlocks are
 *    one-way, "a newspaper headline announces each unlock").
 *
 * 3. `checkGoodUnlocks`'s `{kind:'tier', tier, minDay}` condition unlocks once
 *    ANY city of that tier is present in `state.unlockedCityIds` (i.e. "that
 *    tier has been reached") AND, if `minDay` is set, `state.day >= minDay`.
 *    Since Tier 1 cities are unlocked from game start, a `{tier: 1, minDay: 5}`
 *    condition (Salt/Textiles) reduces in practice to a pure day-5 gate, as
 *    the task brief calls out explicitly.
 *
 * 4. `buyLicense` for a good whose `licenseFee` is `null` (free goods: Grain/
 *    Cotton/Iron — §5's "—" license entries) is REJECTED, not treated as an
 *    implicit success. Free goods don't need a license at all — they become
 *    tradeable purely via `unlockedGoodIds` (§5: "start" condition) with no
 *    purchase step ever required, so calling `buyLicense` for one is a
 *    caller error with nothing meaningful to charge or record; rejecting
 *    (identical state back, no mutation) is safer than silently "succeeding"
 *    into a `purchasedLicenseGoodIds` entry that the rest of the engine has
 *    no reason to ever check for a free good.
 */

import { CONFIG } from './config'
import { CITIES } from './data/cities'
import { GOODS } from './data/goods'
import { calcNetWorth } from './netWorth'
import type { CityTier, GameState, GoodId } from './types'

/** Tier -> net-worth-threshold lookup, generic over any `CityTier` value
 * present in `CONFIG.cityUnlocks` (Tier 1 has no threshold — it's unlocked
 * from game start by the new-game seeding step, not by this function). */
const TIER_NET_WORTH_THRESHOLD: Partial<Record<CityTier, number>> = {
  2: CONFIG.cityUnlocks.tier2NetWorth,
  3: CONFIG.cityUnlocks.tier3NetWorth,
  4: CONFIG.cityUnlocks.tier4NetWorth,
}

/**
 * Adds any newly-qualifying cities to `state.unlockedCityIds`, per §4: a
 * city of tier T unlocks once `calcNetWorth(state) >= threshold(T)`. Tier 1
 * cities are assumed already present in `unlockedCityIds` by whatever seeds
 * a fresh game — this function's job is only to ADD newly-qualifying
 * higher-tier cities, never to seed Tier 1.
 *
 * Returns a NEW `GameState` with an updated `unlockedCityIds` array when at
 * least one city newly qualifies; returns the identical `state` reference
 * (no mutation, no copy) when nothing new unlocks.
 */
export function checkCityUnlocks(state: GameState): GameState {
  const netWorth = calcNetWorth(state)
  const alreadyUnlocked = new Set(state.unlockedCityIds)
  const newlyUnlocked: string[] = []

  for (const city of CITIES) {
    if (alreadyUnlocked.has(city.id)) continue
    const threshold = TIER_NET_WORTH_THRESHOLD[city.tier]
    if (threshold === undefined) continue
    if (netWorth >= threshold) {
      newlyUnlocked.push(city.id)
    }
  }

  if (newlyUnlocked.length === 0) {
    return state
  }

  return {
    ...state,
    unlockedCityIds: [...state.unlockedCityIds, ...newlyUnlocked],
  }
}

/**
 * Adds any newly-qualifying goods to `state.unlockedGoodIds`, per §5's
 * per-good `unlockCondition`:
 *   - `{kind:'start'}` -> always unlocked (defensive — should already be true
 *     for a fresh game's seeded `unlockedGoodIds`).
 *   - `{kind:'tier', tier, minDay}` -> unlocked once at least one city of
 *     `tier` is in `state.unlockedCityIds`, AND (if `minDay` set)
 *     `state.day >= minDay`.
 *   - `{kind:'city', cityId}` -> unlocked once that specific city id is in
 *     `state.unlockedCityIds`.
 *
 * Returns a NEW `GameState` with an updated `unlockedGoodIds` array when at
 * least one good newly qualifies; returns the identical `state` reference
 * (no mutation, no copy) when nothing new unlocks.
 */
export function checkGoodUnlocks(state: GameState): GameState {
  const unlockedCitySet = new Set(state.unlockedCityIds)
  const alreadyUnlocked = new Set(state.unlockedGoodIds)
  const newlyUnlocked: string[] = []

  const tierHasUnlockedCity = (tier: CityTier): boolean =>
    CITIES.some((city) => city.tier === tier && unlockedCitySet.has(city.id))

  for (const good of GOODS) {
    if (alreadyUnlocked.has(good.id)) continue

    const condition = good.unlockCondition
    let qualifies = false

    switch (condition.kind) {
      case 'start':
        qualifies = true
        break
      case 'tier':
        qualifies =
          tierHasUnlockedCity(condition.tier) &&
          (condition.minDay === undefined || state.day >= condition.minDay)
        break
      case 'city':
        qualifies = unlockedCitySet.has(condition.cityId)
        break
    }

    if (qualifies) {
      newlyUnlocked.push(good.id)
    }
  }

  if (newlyUnlocked.length === 0) {
    return state
  }

  return {
    ...state,
    unlockedGoodIds: [...state.unlockedGoodIds, ...newlyUnlocked],
  }
}

/**
 * Attempts to purchase the one-time license fee for `goodId`, making it
 * tradeable (§5). On success, deducts `licenseFee` from `state.cash` once
 * and adds `goodId` to `state.purchasedLicenseGoodIds`.
 *
 * Rejected (returns the identical `state` reference, no mutation) when:
 *   - `goodId` does not match any `Good` in `GOODS`;
 *   - the good's unlock condition has not yet been met, i.e. it is not (yet)
 *     present in `state.unlockedGoodIds` (prerequisite not met);
 *   - the good is already in `state.purchasedLicenseGoodIds` (already
 *     purchased — no double charging);
 *   - the good's `licenseFee` is `null` (free goods — Grain/Cotton/Iron —
 *     don't need a license at all; see module doc decision #4 above); or
 *   - `state.cash < licenseFee`.
 */
export function buyLicense(state: GameState, goodId: GoodId): GameState {
  const good = GOODS.find((g) => g.id === goodId)
  if (!good) return state

  if (!state.unlockedGoodIds.includes(goodId)) return state
  if (state.purchasedLicenseGoodIds.includes(goodId)) return state
  if (good.licenseFee === null) return state
  if (state.cash < good.licenseFee) return state

  return {
    ...state,
    cash: state.cash - good.licenseFee,
    purchasedLicenseGoodIds: [...state.purchasedLicenseGoodIds, goodId],
  }
}
