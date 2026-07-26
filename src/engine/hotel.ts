/**
 * Hotel ownership engine — Trade Winds of Selvara.
 *
 * Design doc reference: §15 "Hotel Ownership (city-wise real estate)" —
 *   "Distinct from the flat Stay cost already in §4's 'Hotel/night' column
 *   — that's what a non-owner pays as a guest. Buying a hotel makes you the
 *   owner of that city's lodging business instead. ... Cost and revenue
 *   scale off each city's existing nightly rate (§4) rather than a new
 *   hardcoded per-city table... Free stays... Passive revenue accrues
 *   daily... Epidemic pauses revenue... Sell-back: 50% of total invested."
 *
 * Pure TypeScript, zero React imports (see /src/engine/README.md).
 *
 * ---------------------------------------------------------------------------
 * Ownership representation: `GameState.hotels?: Record<CityId, { tier }>`
 * ---------------------------------------------------------------------------
 * One hotel per city, any number of cities simultaneously (§15: "Own hotels
 * in as many cities as you want — a hospitality portfolio"). `tier` is a
 * 0-based index into `CONFIG.hotel.tiers` (0 = Inn ... 3 = Resort — see
 * config.ts's own doc comment on why the ARRAY INDEX, not a name string, is
 * the tier's true identity). See types.ts's field doc for why no other
 * figure (total invested, current daily revenue, etc.) is stored alongside
 * `tier` — every dollar figure this file needs is cheaply DERIVED from
 * `tier` + the owning city's static `City.hotelPerNight` (§4) on demand,
 * via the helpers below, rather than kept as separate state that could
 * drift out of sync.
 *
 * ---------------------------------------------------------------------------
 * Marginal vs. cumulative cost — why `buildOrUpgradeHotel` only ever charges
 * ONE tier's `buildOrUpgradeCostMultiplier`
 * ---------------------------------------------------------------------------
 * §15's cost column is explicitly MARGINAL ("Lodge's '+1,200x' is paid on
 * top of what Inn already cost"), not cumulative. `buildOrUpgradeHotel`
 * therefore always charges exactly `CONFIG.hotel.tiers[nextTierIndex]
 * .buildOrUpgradeCostMultiplier * city.hotelPerNight` — the ONE marginal
 * step from the current tier (or "unowned") to the next. `cumulativeInvested`
 * below (used only by `sellHotel`'s 50%-of-total-invested payout) is the sum
 * of every tier's marginal cost from tier 0 up to and including the current
 * tier — i.e. exactly what the player has actually paid in, across however
 * many separate `buildOrUpgradeHotel` calls it took to get there.
 *
 * ---------------------------------------------------------------------------
 * JUDGMENT CALL — location gating: `buildOrUpgradeHotel`/`sellHotel` both
 * require `state.currentCity === cityId`
 * ---------------------------------------------------------------------------
 * §15 doesn't explicitly say whether buying/upgrading/selling a hotel
 * requires physically standing in that city. This file follows the
 * strongest existing precedent in the codebase for city-specific
 * transactions: `bank/deposits.ts`'s `deposit`/`withdraw` and `ca.ts`'s
 * `hireCA` both gate on `state.currentCity` (deposits/withdrawals: "you must
 * be in that city to transact with it", §9; CA hiring: available only at
 * the CURRENT city's bank if it's Medium+, §10). Buying real estate is at
 * least as physically-grounded an action as banking, so the same rule is
 * applied here. This does mean the Real Estate screen's (T058) upgrade/sell
 * buttons for a city the player ISN'T currently standing in will be
 * rejected (no-op) if clicked — the UI is expected to disable/gray those
 * out for any city other than `game.currentCity`, mirroring how BankScreen
 * only shows loan/deposit controls for the current city's account.
 * Passive revenue accrual (`accruePassiveHotelRevenue` below) is
 * DELIBERATELY NOT subject to this gate — §15 explicitly requires revenue to
 * keep accruing "whether you're in that city or not" (see that function's
 * own doc comment).
 *
 * ---------------------------------------------------------------------------
 * Free stays (T055) — implemented in actions/stay.ts, not here
 * ---------------------------------------------------------------------------
 * §15: "while you own a city's hotel, the Stay action there costs you $0."
 * `isHotelOwnedByPlayer` below is the single helper both `stay()`
 * (actions/stay.ts) and this file's own revenue/sell-back logic call, so the
 * "do we own this city's hotel" check is defined in exactly one place.
 *
 * ---------------------------------------------------------------------------
 * Epidemic interaction (T056) — reuses the existing event, no new type
 * ---------------------------------------------------------------------------
 * §15: "Epidemic events... pause an owned hotel's revenue for the event's
 * duration in that city — reuses the existing effect, no new event type
 * needed." `isEpidemicActiveInCity` below checks `state.activeEvents` for a
 * FIRED `'epidemic'`-typed event whose scope is `{kind:'city', cityId}`
 * (confirmed via events/eventTable.ts + eventEngine.ts: the epidemic event
 * type's `scopeRule` is `'oneCity'`, which eventEngine.ts's
 * `resolveScopeAndGoods` always resolves to a concrete `{kind:'city',
 * cityId}` scope — never `'global'`/`'tier'` for this event type) and whose
 * active window (`[scheduledFireDay, activeUntilDay)`) covers the day being
 * ticked. This is the EXACT same "is event X active here on day Y" shape
 * `events/resolution.ts`'s `getActiveEventEffectsFor` already uses for price
 * effects — duplicated here as a small, single-purpose predicate (rather
 * than generalizing that function to also match on `typeId`) since it has a
 * different job (a plain boolean gate on REVENUE, not a price multiplier to
 * multiply into `computePrice`) and pulling in `getActiveEventEffectsFor`'s
 * `Good`-shaped signature here would be an awkward fit for a check that has
 * nothing to do with any specific good.
 *
 * ---------------------------------------------------------------------------
 * Daily revenue accrual hook (T055) — wired into turnLoop.ts's `advanceDay`
 * ---------------------------------------------------------------------------
 * `accruePassiveHotelRevenue` follows the exact same additive-step
 * convention as T022's `accrueDepositInterest`/T023's `accrueLoanInterest`/
 * T030's `accrueTaxDebtInterest`: called ONCE PER DAY-TICK, unconditionally,
 * regardless of the player's current location or travel state — §15: "Passive
 * revenue accrues daily, whether you're in that city or not, riding the same
 * daily tick that already delivers newspapers while you travel... no extra
 * turn cost, and it keeps earning while you're on the road." Since
 * `advanceTravelDay` (actions/travel.ts) already calls `advanceDay` once per
 * transit day, hooking in here automatically covers every travel day too —
 * no separate travel-specific wiring needed. Pure function: returns a NEW
 * `GameState` when at least one owned hotel actually earned non-zero revenue
 * today; returns the identical `state` reference, unchanged, when there are
 * no owned hotels OR every owned hotel's city currently has an active
 * epidemic (nothing to add to `cash` either way) — mirroring
 * `accrueDepositInterest`'s "no pointless new-object allocation on an
 * ordinary no-op day" contract.
 *
 * ---------------------------------------------------------------------------
 * Annual license fee (T057) — implemented in tax.ts's `runYearEnd`, not here
 * ---------------------------------------------------------------------------
 * §15: "Annual license fee bills at the same year-end cadence as CA fees and
 * warehouse maintenance." `computeHotelLicenseFeeOwed` below is the pure
 * calculation `runYearEnd` calls; the actual cash/deposit/forced-debt
 * deduction cascade lives in tax.ts (see that file's own updated header for
 * the full rationale on why the shortfall folds into the same `taxDebt`
 * bucket tax already uses).
 *
 * ---------------------------------------------------------------------------
 * Sell-back (T057)
 * ---------------------------------------------------------------------------
 * §15: "Sell-back: 50% of total invested (build + all upgrades), matching
 * the Warehouse salvage rate (§14)." `sellHotel` pays out
 * `cumulativeInvested(city, tier) * CONFIG.hotel.sellBackFraction` and
 * removes the city's entry from `state.hotels` entirely (not a "tier -1"
 * sentinel) — a sold-then-rebought hotel starts back at tier 0 (Inn),
 * exactly like a freshly built one, since nothing about a PAST ownership is
 * retained once sold.
 */

import { CONFIG, type HotelTierConfig } from './config'
import { CITIES } from './data/cities'
import type { City, CityId, Event, GameState } from './types'

// ---------------------------------------------------------------------------
// Small pure helpers — city/tier lookups and derived dollar figures.
// ---------------------------------------------------------------------------

/**
 * Safe indexed lookup into `CONFIG.hotel.tiers` (an ARRAY, so
 * `noUncheckedIndexedAccess` — see tsconfig.app.json — types plain `[i]`
 * access as possibly `undefined`, unlike `Record<SomeUnion, X>` lookups
 * elsewhere in this codebase, e.g. `CONFIG.tax.caTiers[tier]` in tax.ts).
 * Every call site below already guarantees `tierIndex` is in bounds
 * (`0..tiers.length-1`) via `getOwnedTier`/`getNextTierIndex`'s own bounds
 * checks before ever reaching here — this cast is only needed to satisfy
 * the type checker, mirroring the exact `arr[idx] as T` pattern rng.ts's
 * `pick` already uses after its own bounds check.
 */
function tierConfigAt(tierIndex: number): HotelTierConfig {
  return CONFIG.hotel.tiers[tierIndex] as HotelTierConfig
}

/** The tier's display name ('Inn'/'Lodge'/'Grand Hotel'/'Resort') — exported
 * so the Real Estate screen (T058) never needs to index
 * `CONFIG.hotel.tiers` directly itself. */
export function getTierName(tierIndex: number): string {
  return tierConfigAt(tierIndex).name
}

/** The 0-based tier index the player currently owns in `cityId`, or `null`
 * if they don't own that city's hotel at all. */
export function getOwnedTier(state: GameState, cityId: CityId): number | null {
  const holding = state.hotels?.[cityId]
  return holding ? holding.tier : null
}

/** True iff the player owns `cityId`'s hotel (any tier) — the single
 * predicate `stay()` (actions/stay.ts) uses for T055's free-stays rule, and
 * that this file's own revenue/sell-back logic also uses. */
export function isHotelOwnedByPlayer(state: GameState, cityId: CityId): boolean {
  return getOwnedTier(state, cityId) !== null
}

/** The tier index that the NEXT `buildOrUpgradeHotel` call would purchase
 * for `cityId` — `0` (Inn) if unowned, `currentTier + 1` otherwise. Returns
 * `null` once already at the top tier (Resort, index `tiers.length - 1`) —
 * there is nothing further to upgrade to. */
export function getNextTierIndex(state: GameState, cityId: CityId): number | null {
  const currentTier = getOwnedTier(state, cityId)
  const nextTierIndex = currentTier === null ? 0 : currentTier + 1
  return nextTierIndex < CONFIG.hotel.tiers.length ? nextTierIndex : null
}

/** Marginal cost (dollars) to build (if unowned) or upgrade (if owned) to
 * the NEXT tier for `city` — `null` if already at the top tier. */
export function getNextUpgradeCost(state: GameState, city: City): number | null {
  const nextTierIndex = getNextTierIndex(state, city.id)
  if (nextTierIndex === null) return null
  return tierConfigAt(nextTierIndex).buildOrUpgradeCostMultiplier * city.hotelPerNight
}

/** Sum of every tier's MARGINAL build/upgrade cost from tier 0 up to and
 * including `tierIndex`, in dollars for `city` — i.e. the player's actual
 * cumulative total invested to reach `tierIndex`, used only by `sellHotel`'s
 * 50%-of-total-invested payout (§15). */
export function cumulativeInvested(city: City, tierIndex: number): number {
  let total = 0
  for (let i = 0; i <= tierIndex; i++) {
    total += tierConfigAt(i).buildOrUpgradeCostMultiplier
  }
  return total * city.hotelPerNight
}

/** `cityId`'s owned hotel's CURRENT daily passive revenue, in dollars —
 * this tier's OWN flat rate (never additive across tiers, see file header),
 * ignoring any epidemic pause (that's `accruePassiveHotelRevenue`'s job, not
 * this pure lookup's — this is what the Real Estate screen, T058, shows as
 * the hotel's "normal" earning rate). `null` if unowned. */
export function getDailyRevenue(state: GameState, city: City): number | null {
  const tier = getOwnedTier(state, city.id)
  if (tier === null) return null
  return tierConfigAt(tier).passiveRevenueMultiplier * city.hotelPerNight
}

// ---------------------------------------------------------------------------
// Epidemic-pause check (T056) — see file header for the full rationale.
// ---------------------------------------------------------------------------

/** True iff a FIRED `'epidemic'` event is currently active (`day` within its
 * `[scheduledFireDay, activeUntilDay)` window) with a city-scope matching
 * `cityId`. See file header for why this duplicates
 * `getActiveEventEffectsFor`'s (events/resolution.ts) matching shape rather
 * than reusing that function directly. */
export function isEpidemicActiveInCity(cityId: CityId, day: number, activeEvents: readonly Event[]): boolean {
  return activeEvents.some(
    (event) =>
      event.typeId === 'epidemic' &&
      event.fired === true &&
      event.activeUntilDay !== undefined &&
      day >= event.scheduledFireDay &&
      day < event.activeUntilDay &&
      event.scope.kind === 'city' &&
      event.scope.cityId === cityId,
  )
}

// ---------------------------------------------------------------------------
// buildOrUpgradeHotel (T054) — purchases the NEXT tier, marginal cost only.
// ---------------------------------------------------------------------------

/**
 * Builds (if `cityId`'s hotel is unowned) or upgrades (if already owned, and
 * not yet at the top tier) `cityId`'s hotel to the next tier in order
 * (Inn -> Lodge -> Grand Hotel -> Resort).
 *
 * Validates:
 *   - `state.currentCity === cityId` (location gate — see file header)
 *   - `cityId` resolves to a known `City`
 *   - a next tier actually exists (not already owning a Resort, the top tier)
 *   - `state.cash >= ` the next tier's MARGINAL cost (never the cumulative
 *     total — see file header)
 *
 * On success: deducts exactly the marginal cost from `state.cash` and sets
 * `state.hotels[cityId] = { tier: nextTierIndex }`.
 *
 * Rejected (returns the identical `state` reference, unchanged) when any
 * validation fails.
 */
export function buildOrUpgradeHotel(state: GameState, cityId: CityId): GameState {
  if (state.currentCity !== cityId) return state

  const city = CITIES.find((c) => c.id === cityId)
  if (!city) return state

  const nextTierIndex = getNextTierIndex(state, cityId)
  if (nextTierIndex === null) return state // already at the top tier (Resort)

  const cost = tierConfigAt(nextTierIndex).buildOrUpgradeCostMultiplier * city.hotelPerNight
  if (state.cash < cost) return state

  return {
    ...state,
    cash: state.cash - cost,
    hotels: { ...(state.hotels ?? {}), [cityId]: { tier: nextTierIndex } },
  }
}

// ---------------------------------------------------------------------------
// sellHotel (T057) — 50% of total invested, matching Warehouse salvage rate.
// ---------------------------------------------------------------------------

/**
 * Sells `cityId`'s owned hotel back for `CONFIG.hotel.sellBackFraction`
 * (50%) of the player's total cumulative investment in it (every marginal
 * build/upgrade cost paid to reach its current tier — see
 * `cumulativeInvested`).
 *
 * Validates:
 *   - `state.currentCity === cityId` (location gate — see file header)
 *   - `cityId`'s hotel is actually owned
 *   - `cityId` resolves to a known `City`
 *
 * On success: credits the payout to `state.cash` and removes `cityId`'s
 * entry from `state.hotels` entirely (not a "tier -1" sentinel — a later
 * rebuild starts fresh at Inn, tier 0).
 *
 * Rejected (returns the identical `state` reference, unchanged) when any
 * validation fails.
 */
export function sellHotel(state: GameState, cityId: CityId): GameState {
  if (state.currentCity !== cityId) return state

  const tier = getOwnedTier(state, cityId)
  if (tier === null) return state

  const city = CITIES.find((c) => c.id === cityId)
  if (!city) return state

  const payout = cumulativeInvested(city, tier) * CONFIG.hotel.sellBackFraction

  const remainingHotels = { ...state.hotels }
  delete remainingHotels[cityId]

  return {
    ...state,
    cash: state.cash + payout,
    hotels: remainingHotels,
  }
}

// ---------------------------------------------------------------------------
// accruePassiveHotelRevenue (T055/T056) — the daily-tick hook.
// ---------------------------------------------------------------------------

/**
 * Credits one day's passive revenue for EVERY owned hotel, regardless of
 * `state.currentCity`/`state.travelInProgress` (§15 — see file header),
 * zeroing out (not merely reducing) any city whose hotel is currently
 * paused by an active epidemic there (T056).
 *
 * Intended to be called ONCE PER DAY-TICK, unconditionally — see
 * /src/engine/turnLoop.ts's `advanceDay`, which wires this in as a separate,
 * additive step alongside T022-T024/T030's daily accruals.
 *
 * Pure function: returns a NEW `GameState` when total revenue credited today
 * is non-zero; returns the identical `state` reference, unchanged, otherwise
 * (no owned hotels, or every owned hotel's city is currently epidemic-paused)
 * — mirrors `accrueDepositInterest`'s no-op contract.
 */
export function accruePassiveHotelRevenue(state: GameState): GameState {
  const hotels = state.hotels
  if (!hotels) return state

  let totalRevenue = 0

  for (const cityId of Object.keys(hotels)) {
    const holding = hotels[cityId]
    if (!holding) continue

    const city = CITIES.find((c) => c.id === cityId)
    if (!city) continue // defensive — should never happen, mirrors accrueDepositInterest's own guard

    if (isEpidemicActiveInCity(cityId, state.day, state.activeEvents)) continue // T056: paused, contributes $0

    totalRevenue += tierConfigAt(holding.tier).passiveRevenueMultiplier * city.hotelPerNight
  }

  if (totalRevenue === 0) return state

  return { ...state, cash: state.cash + totalRevenue }
}

// ---------------------------------------------------------------------------
// computeHotelLicenseFeeOwed (T057) — pure calculation consumed by
// tax.ts's `runYearEnd`. Deduction/forced-debt mechanics live there.
// ---------------------------------------------------------------------------

/**
 * Total annual license fee owed across EVERY currently-owned hotel, in
 * dollars — §15: "Annual license fee bills at the same year-end cadence as
 * CA fees and warehouse maintenance." No proration for a hotel bought
 * partway through the fiscal year (documented judgment call, matching how
 * CA annual fees/Warehouse maintenance elsewhere in this codebase are also
 * flat, non-prorated annual charges) — every hotel owned AT THE MOMENT
 * `runYearEnd` runs owes its tier's full annual fee. `0` if the player owns
 * no hotels.
 */
export function computeHotelLicenseFeeOwed(state: GameState): number {
  const hotels = state.hotels
  if (!hotels) return 0

  let total = 0
  for (const cityId of Object.keys(hotels)) {
    const holding = hotels[cityId]
    if (!holding) continue

    const city = CITIES.find((c) => c.id === cityId)
    if (!city) continue // defensive — should never happen

    total += tierConfigAt(holding.tier).annualLicenseFeeMultiplier * city.hotelPerNight
  }
  return total
}

/** Convenience list of every owned hotel, resolved against `CITIES`, for the
 * Real Estate screen (T058) to render — skips any `cityId` that fails to
 * resolve (defensive, should never happen in a well-formed `GameState`). */
export function listOwnedHotels(state: GameState): Array<{ city: City; tier: number }> {
  const hotels = state.hotels
  if (!hotels) return []

  const result: Array<{ city: City; tier: number }> = []
  for (const cityId of Object.keys(hotels)) {
    const holding = hotels[cityId]
    if (!holding) continue
    const city = CITIES.find((c) => c.id === cityId)
    if (!city) continue
    result.push({ city, tier: holding.tier })
  }
  return result
}
