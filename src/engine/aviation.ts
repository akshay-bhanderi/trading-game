/**
 * Aviation — Plane Ownership & Leasing — Trade Winds of Selvara.
 *
 * Design doc reference: §16 "Aviation — Plane Ownership & Leasing" — buy
 * planes at Medium+ bank cities, then either lease them out for passive
 * income or fly them yourself (Personal use). Four classes (Prop Feeder,
 * Regional Jet, Freighter, Widebody — `CONFIG.aviation.classes`, T059), four
 * statuses per plane (Idle / Leased Monthly / Leased Annual / Personal),
 * year-end maintenance billing, depreciation/resale, and two event
 * interactions (Fuel price spike surcharge, Aviation safety incident
 * grounding).
 *
 * Pure TypeScript, zero React imports (see /src/engine/README.md).
 *
 * ---------------------------------------------------------------------------
 * DESIGN — Medium+ bank gating: same ordered-rank pattern as ca.ts/informant.ts
 * ---------------------------------------------------------------------------
 * `isPlanePurchaseAvailable` reuses the exact `BANK_SIZE_RANK` comparison
 * ca.ts's `isCAHiringAvailable` (itself copied from informant.ts) already
 * established for "Medium+ bank city" gates — a small, self-contained
 * duplicate rather than a shared import, matching this codebase's own stated
 * precedent (ca.ts's file header) for why a two-line comparison isn't worth
 * a cross-subsystem dependency. Comparing ordinal rank rather than a
 * hardcoded city-id list means a future Tier 3/4 city with a Large/Huge bank
 * (out of v1 scope, §13) needs no special-casing here either. In v1, the
 * Medium+ bank cities are Port Vela, Ironvale, and Silkden
 * (/src/engine/data/cities.ts) — Large/Huge-tier cities are unreachable in
 * v1 per §13, same as ca.ts's own note.
 *
 * ---------------------------------------------------------------------------
 * DESIGN — `setPlaneStatus` enforces the Leased Annual "firm term" and
 * Leased Monthly "pending notice" locks
 * ---------------------------------------------------------------------------
 * §16: "Neither side can cancel [a Leased Annual lease] early without
 * penalty." If `setPlaneStatus` freely let a caller reassign a plane away
 * from `'leasedAnnual'` mid-term, a player could dodge that whole rule for
 * free (just re-toggle status instead of calling the penalty-charging
 * `terminateAnnualLease`). So `setPlaneStatus` REJECTS any attempt to move a
 * plane OFF `'leasedAnnual'` while `state.day` is still before
 * `annualLeaseStartDay + YEAR_LENGTH_DAYS` — `terminateAnnualLease` (paying
 * the 50% penalty) is the only early exit; otherwise the daily-tick
 * `accruePlaneIncome` auto-reverts the plane to `'idle'` once the term
 * completes naturally. The identical reasoning applies to a Leased Monthly
 * plane with a pending cancellation notice (`monthlyLeaseCancelEffectiveDay`
 * set) — reassigning it away mid-notice would let a player skip the
 * mandatory 3-day wait; `setPlaneStatus` rejects that too until the notice
 * elapses (at which point `accruePlaneIncome` auto-reverts it to `'idle'`
 * and any status is selectable again).
 *
 * Reassigning a plane to the SAME status it already has is explicitly
 * ALLOWED (not treated as a no-op rejection) — this is how a plane that's
 * already `'personal'` but has already consumed its single-use travel bonus
 * gets RE-ARMED (see the next section). The two lock-checks above only
 * block leaving `'leasedAnnual'`/pending-cancellation-`'leasedMonthly'` for
 * a genuinely DIFFERENT status, never a same-status call.
 *
 * ---------------------------------------------------------------------------
 * DESIGN — the Personal-use bonus is armed per-CALL, not implied by status
 * ---------------------------------------------------------------------------
 * §16: "Personal use — no lease income; applies that plane's fare/day/cargo
 * bonus to your next Travel action instead." Read literally, the bonus is
 * consumed by exactly ONE future `travel()` call, not "every trip taken
 * while status stays 'personal'". If `travel()` instead checked "is ANY
 * plane currently `status === 'personal'`", the bonus would silently
 * reapply to every trip forever (as long as the player never changes that
 * plane's status) — a much bigger, undocumented buff than "your NEXT Travel
 * action" describes.
 *
 * So this file tracks a single explicit "which plane is armed right now"
 * pointer on `GameState` (`armedPersonalUsePlaneId`, types.ts) rather than
 * deriving "is the bonus available" from `plane.status === 'personal'`
 * alone:
 *   - `setPlaneStatus(state, planeId, 'personal')` sets
 *     `armedPersonalUsePlaneId = planeId` — including when the plane is
 *     ALREADY `'personal'` (re-arming after a previous consumption; see the
 *     "same status is allowed" note above).
 *   - `travel()` (actions/travel.ts, T063) reads `armedPersonalUsePlaneId`,
 *     applies that plane's class bonus to THIS ONE trip if the pointer
 *     resolves to a real, still-`'personal'` plane, then unconditionally
 *     clears the pointer back to `null` on any successful trip — whether or
 *     not it actually found a valid bonus to apply (a stale pointer, e.g.
 *     the armed plane was sold or reassigned in between, is a silent no-op,
 *     not an error).
 *   - Only ONE plane can be armed at a time. If a player sets a second plane
 *     to `'personal'` before ever traveling, the SECOND call overwrites the
 *     pointer — the doc's singular "your next Travel action" phrasing never
 *     contemplates stacking multiple planes' bonuses onto one trip, and
 *     "most recently armed wins" is the simplest, most predictable tie-break
 *     (matches the intuitive UI story: the player's last tap is what
 *     "sticks").
 *
 * ---------------------------------------------------------------------------
 * DESIGN — maintenance accrues DAILY into a fiscal-year accumulator, billed
 * by tax.ts's `runYearEnd` (mirrors realized-profit/deposit-interest exactly)
 * ---------------------------------------------------------------------------
 * §16: "every owned plane...owes maintenance/insurance of 0.3%/month of
 * purchase price, billed at year-end alongside tax, CA fee, warehouse
 * maintenance, and hotel license." Two ways to implement "billed at
 * year-end" were considered:
 *   (a) Compute the WHOLE year's maintenance bill fresh, once, inside
 *       `runYearEnd` itself (`sum(plane.purchasePrice * monthlyRate * 3)` for
 *       every plane currently owned) — simple, but WRONG the moment a fuel-
 *       price-spike event (T065, 5-8 day duration) is active for only part
 *       of the year: a single flat "×3 months" multiply has no way to apply
 *       the +30% surcharge to just the days the event was actually active.
 *   (b) Accrue ONE DAY's maintenance (at that day's correct surcharge state)
 *       every day-tick into a running fiscal-year accumulator
 *       (`state.planeMaintenanceOwedThisFiscalYear`), then have `runYearEnd`
 *       simply read-and-reset that total — exactly the pattern already
 *       established by `realizedProfitThisFiscalYear`
 *       (actions/trade.ts's `sell`) and `depositInterestThisFiscalYear`
 *       (bank/deposits.ts's `accrueDepositInterest`).
 *
 * Option (b) is used here (`accruePlaneMaintenanceForDay`, wired into
 * turnLoop.ts's `advanceDay` as a sibling to those two functions) — it's the
 * only approach that actually gives T065's fuel-spike surcharge day-by-day
 * fidelity, and it reuses an established codebase pattern rather than
 * inventing a new one. `tax.ts`'s `runYearEnd` (T064) reads
 * `state.planeMaintenanceOwedThisFiscalYear ?? 0`, bills it ALONGSIDE that
 * year's tax (same combined cash-then-deposits-then-forced-loan deduction
 * flow — see tax.ts's own updated file header for the exact payment-order
 * tie-break), and resets the accumulator to `0`. Maintenance is billed
 * regardless of a Noob first-tax-year waiver — §3's waiver text is
 * specifically about the TAX bill, and plane maintenance is a distinct
 * carrying cost the doc never connects to that waiver.
 *
 * Maintenance is owed for EVERY plane regardless of status (idle, leased, or
 * personal) and regardless of grounding (§16: "maintenance still owed"; T065
 * repeats this explicitly for grounding) — `accruePlaneMaintenanceForDay`
 * never branches on `status`/`groundedUntilDay` at all, only on the fuel
 * surcharge.
 *
 * ---------------------------------------------------------------------------
 * DESIGN — the "Fuel price spike" event: reusing `warScare`, checked generically
 * ---------------------------------------------------------------------------
 * §16's events table extension says: "Fuel price spike (existing
 * Fuel-commodity event, §5) also raises all plane maintenance +30% for 5-8
 * days." But §7's actual base 11-event table (eventTable.ts, T016) has NO
 * event type literally named "Fuel price spike" — the only base event that
 * ever moves the Fuel good's price at all is `warScare` ("War scare
 * (regional): Steel/Fuel +40-80%"), whose duration range (5-8 days) matches
 * this task's "5-8 days" wording exactly. Rather than inventing a
 * conspicuously-named-but-functionally-redundant second event type, this
 * file treats `warScare` as the "existing Fuel price spike event" the doc
 * refers to.
 *
 * `isFuelPriceSpikeActive` is written GENERICALLY, though: it checks
 * `state.activeEvents` for ANY fired, currently-active event whose
 * `affectedGoodIds` includes `'fuel'` (matching data/goods.ts's Fuel good
 * id), regardless of `typeId`. This is deliberately more robust than
 * hardcoding `event.typeId === 'warScare'` — if a future balance pass adds a
 * more literal "Fuel price spike" event type (or Government tariff happens
 * to randomly pick Fuel as its one affected good), the surcharge correctly
 * applies to that too, with no code change needed here.
 *
 * ---------------------------------------------------------------------------
 * DESIGN — "Aviation safety incident" grounding: consumed directly from
 * `resolveDueEvents`'s resolutions, not via a new `Event` field
 * ---------------------------------------------------------------------------
 * See eventTable.ts's own file-header note for why this event type is
 * data-defined as an inert, price-neutral entry. The remaining question this
 * file answers: HOW does "one random leased plane" actually get grounded?
 *
 * `applyAviationSafetyIncidents(state, resolutions, rng)` is called from
 * turnLoop.ts's `advanceDay` immediately after `resolveDueEvents` runs for
 * `newDay` — i.e. at exactly the moment (per events/resolution.ts's file
 * header) a same-day-due event's `fired` flag is decided. It filters
 * `resolutions` for `fired === true && event.typeId ===
 * 'aviationSafetyIncident'`, and for each one:
 *   - Builds the pool of "groundable" planes: `status` is
 *     `'leasedMonthly'`/`'leasedAnnual'` AND not already grounded
 *     (`groundedUntilDay === undefined`) — an Idle/Personal plane can't be
 *     "grounded" out of a lease it was never earning from, and a plane
 *     already grounded by an earlier incident this run isn't re-picked
 *     (stacking two groundings on one plane while ignoring every other
 *     leased plane would be a strange outcome no reading of §16 supports).
 *   - If the pool is empty (no eligible plane exists — e.g. an all-idle
 *     fleet, or no planes at all), the event still fires (its `Event` record
 *     is unchanged) but simply has nothing to ground — a documented,
 *     harmless no-op edge case, not an error.
 *   - Otherwise picks one plane uniformly via `rng.pick` and sets its
 *     `groundedUntilDay = event.activeUntilDay` — REUSING the exact
 *     duration/end-day the ordinary event-resolution machinery already
 *     computed (`resolveEvent`, events/resolution.ts) rather than drawing a
 *     second, independent "how long" value. `event.activeUntilDay` is always
 *     defined here because `resolutions` only ever contains freshly-resolved
 *     events, and a `fired === true` event always has `activeUntilDay` set
 *     (see resolution.ts).
 *
 * This keeps events/resolution.ts and eventTable.ts entirely plane-agnostic
 * (no import of anything aviation-specific), at the cost of turnLoop.ts
 * needing one extra wiring line — the same trade-off ca.ts/tax.ts already
 * accept for their own turnLoop.ts hooks.
 *
 * ---------------------------------------------------------------------------
 * DESIGN — depreciation is CONTINUOUS (prorated by fractional years owned),
 * not a discrete step at each year-end
 * ---------------------------------------------------------------------------
 * §16: "a plane's value for net worth and for sale starts at 90% of purchase
 * price and depreciates 2%/game-year, floored at 40%." `planeDepreciatedValue`
 * computes `yearsOwned = (currentDay - purchaseDay) / YEAR_LENGTH_DAYS` as a
 * FRACTIONAL value (not floored to whole years), so a plane's resale/net-worth
 * value ticks down smoothly every single day rather than jumping only on
 * year-end boundaries (days 90, 180, 270...). This is a deliberate,
 * documented choice: net worth (§4) is read continuously throughout the run
 * (unlocks, the score/peak-net-worth tracker, city-tier gates), and a value
 * that suddenly cliffs down once every 90 days would be a strange, very
 * un-smooth net-worth signal compared to every other net-worth component
 * (cargo/deposits/debt all change continuously). Continuous depreciation
 * also needs no extra wiring into `runYearEnd` at all — `calcNetWorth`
 * (netWorth.ts, extended by this task) and `sellPlane` below both just call
 * this same pure function with `state.day`, any day, with no special-casing.
 *
 * ---------------------------------------------------------------------------
 * DESIGN — `sellPlane` does NOT also charge the annual-lease-termination
 * penalty
 * ---------------------------------------------------------------------------
 * §16 describes lease termination (`terminateAnnualLease`) as a transaction
 * between "lessor" and "lessee" over a specific LEASE commitment; selling the
 * physical aircraft outright is a different, simpler transaction the doc
 * never connects to that penalty. `sellPlane` always pays out
 * `planeDepreciatedValue(...) * (1 - liquidationFeePct)` and removes the
 * plane from `state.planes`, regardless of its current status (including an
 * active Leased Annual mid-term) — a documented simplification, not an
 * oversight. A player mid-Annual-lease who wants to exit the LEASE
 * specifically (keeping the plane) still must go through
 * `terminateAnnualLease`; selling is a strictly bigger, separate decision
 * (losing the asset entirely) that this file treats as always available.
 */

import { CONFIG, YEAR_LENGTH_DAYS } from './config'
import { CITIES } from './data/cities'
import type { BankSize, CityId, GameState, Plane, PlaneClass, PlaneId, PlaneStatus } from './types'
import type { EventResolution } from './events/resolution'
import type { Rng } from './rng'

// ---------------------------------------------------------------------------
// Medium+ bank gating (see file header) — same pattern as ca.ts/informant.ts
// ---------------------------------------------------------------------------

const BANK_SIZE_RANK: Record<BankSize, number> = {
  Small: 0,
  Medium: 1,
  Large: 2,
  Huge: 3,
}

/**
 * True only when the player's current city has a Medium-or-larger bank
 * (§16: "available at any Medium+ bank city"). Returns `false` (never
 * throws) if `state.currentCity` isn't found in `CITIES` at all.
 */
export function isPlanePurchaseAvailable(state: GameState): boolean {
  const city = CITIES.find((c) => c.id === state.currentCity)
  if (!city) return false
  return BANK_SIZE_RANK[city.bankSize] >= BANK_SIZE_RANK.Medium
}

// ---------------------------------------------------------------------------
// buyPlane (T060)
// ---------------------------------------------------------------------------

/**
 * Buys a new plane of `planeClass` at `cityId`'s Medium+ bank.
 *
 * Validates:
 *   - `state.currentCity === cityId` (the player must be physically standing
 *     in the purchasing city — mirrors bank/loans.ts's `takeLoan(state,
 *     cityId, amount)` "no cross-city banking" convention)
 *   - `isPlanePurchaseAvailable(state)` (Medium+ bank gate, see above)
 *   - `state.cash >= CONFIG.aviation.classes[planeClass].purchasePrice`
 *
 * On success: deducts the class's purchase price from `state.cash` and
 * appends a new `Plane` (status `'idle'` — §16 gives no "default to leased"
 * behavior; a freshly bought plane earns nothing until the player explicitly
 * picks a status via `setPlaneStatus`) to `state.planes`. No cap on fleet
 * size beyond cash on hand (§16: "No fleet-size cap beyond cash on hand").
 *
 * Rejected (returns the identical `state` reference, unchanged) when any
 * validation fails.
 */
export function buyPlane(state: GameState, cityId: CityId, planeClass: PlaneClass): GameState {
  if (state.currentCity !== cityId) return state
  if (!isPlanePurchaseAvailable(state)) return state

  const classConfig = CONFIG.aviation.classes[planeClass]
  if (state.cash < classConfig.purchasePrice) return state

  const planes = state.planes ?? []
  const plane: Plane = {
    id: `plane-d${state.day}-${planes.length}-${planeClass}`,
    class: planeClass,
    status: 'idle',
    purchaseCityId: cityId,
    purchaseDay: state.day,
    purchasePrice: classConfig.purchasePrice,
  }

  return {
    ...state,
    cash: state.cash - classConfig.purchasePrice,
    planes: [...planes, plane],
  }
}

// ---------------------------------------------------------------------------
// setPlaneStatus (T061/T062/T063)
// ---------------------------------------------------------------------------

/**
 * Reassigns `planeId`'s status to `status` (Idle / Leased Monthly / Leased
 * Annual / Personal use).
 *
 * Validates:
 *   - `planeId` resolves to a plane in `state.planes`
 *   - NOT currently locked out of reassignment by an in-progress Leased
 *     Annual firm term or a pending Leased Monthly cancellation notice (see
 *     file header's "firm term / pending notice locks" design section) —
 *     UNLESS `status` is the plane's own current status (always allowed; see
 *     the same section for why re-arming Personal use depends on this).
 *
 * On success, returns a NEW `GameState` where the plane's record is updated:
 *   - `status` is set to the requested value.
 *   - `annualLeaseStartDay` is set to `state.day` if entering
 *     `'leasedAnnual'` (fresh OR re-armed), else cleared to `undefined`.
 *   - `monthlyLeaseCancelEffectiveDay` is always cleared to `undefined` — any
 *     (re-)assignment starts fresh with no pending cancellation.
 *   - `groundedUntilDay` is left untouched (T065 grounding is independent of
 *     player-chosen status — a grounded plane's status can still be
 *     reassigned for when the grounding lifts; see file header).
 *   - `state.armedPersonalUsePlaneId` is set to `planeId` when `status ===
 *     'personal'` (arming/re-arming the single-use travel bonus, T063); if
 *     this plane was the previously-armed plane and `status` is something
 *     ELSE now, the pointer is cleared back to `null` (a plane no longer in
 *     Personal-use status shouldn't silently keep an armed bonus); any OTHER
 *     plane's armed pointer is left untouched.
 *
 * Rejected (returns the identical `state` reference, unchanged) when either
 * validation fails.
 */
export function setPlaneStatus(state: GameState, planeId: PlaneId, status: PlaneStatus): GameState {
  const planes = state.planes ?? []
  const plane = planes.find((p) => p.id === planeId)
  if (!plane) return state

  // Leased Annual firm-term lock (see file header) — only blocks moving AWAY
  // from 'leasedAnnual' to something else, never a same-status call.
  if (
    plane.status === 'leasedAnnual' &&
    status !== 'leasedAnnual' &&
    plane.annualLeaseStartDay !== undefined &&
    state.day < plane.annualLeaseStartDay + YEAR_LENGTH_DAYS
  ) {
    return state
  }

  // Leased Monthly pending-cancellation-notice lock (see file header) — same
  // "only blocks moving away" shape as the Annual lock above.
  if (plane.status === 'leasedMonthly' && status !== 'leasedMonthly' && plane.monthlyLeaseCancelEffectiveDay !== undefined) {
    return state
  }

  const nextPlane: Plane = {
    ...plane,
    status,
    annualLeaseStartDay: status === 'leasedAnnual' ? state.day : undefined,
    monthlyLeaseCancelEffectiveDay: undefined,
  }

  const newPlanes = planes.map((p) => (p.id === planeId ? nextPlane : p))

  const armedPersonalUsePlaneId: PlaneId | null =
    status === 'personal'
      ? planeId
      : state.armedPersonalUsePlaneId === planeId
        ? null
        : (state.armedPersonalUsePlaneId ?? null)

  return { ...state, planes: newPlanes, armedPersonalUsePlaneId }
}

// ---------------------------------------------------------------------------
// cancelMonthlyLease / terminateAnnualLease (T062)
// ---------------------------------------------------------------------------

/**
 * Begins the 3-day cancellation notice on a `'leasedMonthly'` plane (§16:
 * "Cancellable anytime with 3 days' notice, at which point income stops").
 *
 * Validates:
 *   - `planeId` resolves to a plane in `state.planes`
 *   - `plane.status === 'leasedMonthly'`
 *   - no cancellation is already pending on this plane (calling this twice
 *     does not restart/shorten the notice window)
 *
 * On success: sets `monthlyLeaseCancelEffectiveDay = state.day +
 * CONFIG.aviation.monthlyLeaseCancelNoticeDays`. Income keeps accruing
 * normally (see `accruePlaneIncome` below) for every remaining day of the
 * notice period; the daily tick auto-reverts the plane to `'idle'` and
 * clears this field the day the notice elapses.
 *
 * Rejected (returns the identical `state` reference, unchanged) when any
 * validation fails.
 */
export function cancelMonthlyLease(state: GameState, planeId: PlaneId): GameState {
  const planes = state.planes ?? []
  const plane = planes.find((p) => p.id === planeId)
  if (!plane) return state

  if (plane.status !== 'leasedMonthly') return state
  if (plane.monthlyLeaseCancelEffectiveDay !== undefined) return state

  const newPlanes = planes.map((p) =>
    p.id === planeId
      ? { ...p, monthlyLeaseCancelEffectiveDay: state.day + CONFIG.aviation.monthlyLeaseCancelNoticeDays }
      : p,
  )

  return { ...state, planes: newPlanes }
}

/**
 * Immediately ends a `'leasedAnnual'` plane's firm 90-day term early,
 * charging the early-termination penalty (§16: "the lessee must pay 50% of
 * the term's remaining revenue immediately, and the lessor forfeits the
 * rest").
 *
 * WHO PAYS — documented interpretation (§16 doesn't specify who initiates
 * early termination): this game only ever models the PLAYER as the plane's
 * owner/lessor, never as a lessee. There is no simulated third-party lessee
 * who could call this function on their own initiative. So "early
 * termination" here is read as something the PLAYER (as lessor) chooses to
 * do to exit a bad commitment — e.g. they'd rather sell the plane, switch it
 * to Personal use, or simply stop the guaranteed-but-lower Annual rate — and
 * in doing so, they pay the 50% penalty THEMSELVES, exactly as if they were
 * standing in for whichever side initiates the break. This makes
 * `terminateAnnualLease` a strictly costly action the player takes
 * voluntarily (never a random event that happens TO the player), matching
 * this task's own framing of it as an "exit a bad commitment" escape hatch.
 *
 * Validates:
 *   - `planeId` resolves to a plane in `state.planes`
 *   - `plane.status === 'leasedAnnual'` with a valid `annualLeaseStartDay`
 *
 * On success:
 *   1. `remainingDays = max(0, annualLeaseStartDay + YEAR_LENGTH_DAYS -
 *      state.day)`.
 *   2. `remainingRevenue = remainingDays * (purchasePrice *
 *      annualLeaseRatePctOfPrice / YEAR_LENGTH_DAYS)` — the same per-day
 *      formula `accruePlaneIncome` uses, so "remaining revenue" is exactly
 *      what the plane would have earned had the term run its course.
 *   3. `penalty = remainingRevenue * CONFIG.aviation.annualLeaseEarlyTerminationPenaltyPct`
 *      (50%), deducted from `state.cash` UNCONDITIONALLY — even if it drives
 *      cash negative. This is deliberate: the entire point of this function
 *      is to give the player an escape hatch from a bad commitment; silently
 *      rejecting the termination for insufficient cash would trap them in
 *      the lease with no way out, defeating that purpose (mirrors
 *      actions/travel.ts's `travel()`'s own explicit "fare can drive cash
 *      negative" precedent).
 *   4. The plane's status reverts to `'idle'` and `annualLeaseStartDay` is
 *      cleared.
 *
 * Rejected (returns the identical `state` reference, unchanged) only when
 * the plane can't be found or isn't currently on an Annual lease.
 */
export function terminateAnnualLease(state: GameState, planeId: PlaneId): GameState {
  const planes = state.planes ?? []
  const plane = planes.find((p) => p.id === planeId)
  if (!plane) return state

  if (plane.status !== 'leasedAnnual' || plane.annualLeaseStartDay === undefined) return state

  const termEndDay = plane.annualLeaseStartDay + YEAR_LENGTH_DAYS
  const remainingDays = Math.max(0, termEndDay - state.day)
  const classConfig = CONFIG.aviation.classes[plane.class]
  const dailyRevenue = (plane.purchasePrice * classConfig.annualLeaseRatePctOfPrice) / YEAR_LENGTH_DAYS
  const remainingRevenue = remainingDays * dailyRevenue
  const penalty = remainingRevenue * CONFIG.aviation.annualLeaseEarlyTerminationPenaltyPct

  const newPlanes = planes.map((p): Plane => (p.id === planeId ? { ...p, status: 'idle', annualLeaseStartDay: undefined } : p))

  return { ...state, cash: state.cash - penalty, planes: newPlanes }
}

// ---------------------------------------------------------------------------
// planeDailyIncome — pure per-plane rate lookup, shared by accruePlaneIncome
// below and the Aviation screen's (T066) live display.
// ---------------------------------------------------------------------------

/**
 * The lease income `plane` earns on `day`, assuming neither auto-revert
 * transition (Monthly notice elapsing / Annual term completing) fires TODAY
 * — i.e. exactly the amount `accruePlaneIncome` credits once it has already
 * handled those two transitions itself. Returns `0` for a grounded plane
 * (`day < groundedUntilDay`) and for Idle/Personal status, matching §16's
 * per-status income rules exactly.
 *
 * Exported so the Aviation screen (T066) can show a live "$X/day" figure per
 * plane using the SAME formula the engine actually bills, rather than
 * reimplementing §16's monthly-÷30/annual-÷90 division rules a second time
 * in UI code.
 */
export function planeDailyIncome(plane: Plane, day: number): number {
  if (plane.groundedUntilDay !== undefined && day < plane.groundedUntilDay) return 0

  if (plane.status === 'leasedMonthly') {
    const classConfig = CONFIG.aviation.classes[plane.class]
    return (plane.purchasePrice * classConfig.monthlyLeaseRatePctOfPrice) / CONFIG.aviation.leaseDaysPerMonth
  }

  if (plane.status === 'leasedAnnual' && plane.annualLeaseStartDay !== undefined) {
    const classConfig = CONFIG.aviation.classes[plane.class]
    return (plane.purchasePrice * classConfig.annualLeaseRatePctOfPrice) / YEAR_LENGTH_DAYS
  }

  // Idle / Personal — earns $0 (§16).
  return 0
}

// ---------------------------------------------------------------------------
// accruePlaneIncome — the daily-tick hook (T061/T062/T065)
// ---------------------------------------------------------------------------

/**
 * Credits one day of lease income for every owned plane, per its current
 * status (§16), and handles the two auto-reversion-to-Idle transitions
 * (Leased Monthly's notice period elapsing; Leased Annual's firm term
 * completing naturally):
 *
 *   - Grounded (T065, `groundedUntilDay !== undefined`): earns $0 today,
 *     regardless of `status` — income is paused while grounded. Once
 *     `state.day >= groundedUntilDay`, clears `groundedUntilDay` (grounding
 *     over; income resumes from tomorrow per whatever status the plane still
 *     carries).
 *   - `'leasedMonthly'`: if a cancellation notice is pending AND its
 *     effective day has arrived (`state.day >= monthlyLeaseCancelEffectiveDay`),
 *     stops income as of today and reverts to `'idle'` (T062). Otherwise
 *     credits `purchasePrice * monthlyLeaseRatePctOfPrice /
 *     CONFIG.aviation.leaseDaysPerMonth` (§16: "rate / 30/day").
 *   - `'leasedAnnual'`: if the firm term has completed
 *     (`state.day >= annualLeaseStartDay + YEAR_LENGTH_DAYS`), stops income
 *     and reverts to `'idle'`. Otherwise credits `purchasePrice *
 *     annualLeaseRatePctOfPrice / YEAR_LENGTH_DAYS` (§16: "rate / 90/day").
 *   - `'idle'` / `'personal'`: earns $0 (§16).
 *
 * Intended to be called ONCE PER DAY-TICK from turnLoop.ts's `advanceDay`,
 * as a sibling to `accrueDepositInterest`/`accrueLoanInterest`/
 * `accrueTaxDebtInterest`.
 *
 * Pure function: returns a NEW `GameState` when anything changed (income
 * credited or a plane's status/bookkeeping transitioned); returns the
 * identical `state` reference, unchanged, when there are no planes at all
 * or nothing changed this tick.
 */
export function accruePlaneIncome(state: GameState): GameState {
  const planes = state.planes ?? []
  if (planes.length === 0) return state

  let cashDelta = 0
  let changed = false

  const newPlanes = planes.map((plane) => {
    if (plane.groundedUntilDay !== undefined) {
      if (state.day >= plane.groundedUntilDay) {
        changed = true
        return { ...plane, groundedUntilDay: undefined }
      }
      // Still grounded — income paused (maintenance is handled separately
      // by accruePlaneMaintenanceForDay, and still applies).
      return plane
    }

    if (plane.status === 'leasedMonthly' && plane.monthlyLeaseCancelEffectiveDay !== undefined && state.day >= plane.monthlyLeaseCancelEffectiveDay) {
      changed = true
      return { ...plane, status: 'idle' as PlaneStatus, monthlyLeaseCancelEffectiveDay: undefined }
    }

    if (plane.status === 'leasedAnnual' && plane.annualLeaseStartDay !== undefined) {
      const termEndDay = plane.annualLeaseStartDay + YEAR_LENGTH_DAYS
      if (state.day >= termEndDay) {
        changed = true
        return { ...plane, status: 'idle' as PlaneStatus, annualLeaseStartDay: undefined }
      }
    }

    // Neither auto-revert transition applies today — credit whatever
    // `planeDailyIncome` says this plane earns (0 for Idle/Personal, the
    // per-day lease formula otherwise). Shared with the Aviation screen's
    // (T066) live display so the rate formulas exist in exactly one place.
    cashDelta += planeDailyIncome(plane, state.day)
    return plane
  })

  if (cashDelta === 0 && !changed) return state

  return { ...state, cash: state.cash + cashDelta, planes: newPlanes }
}

// ---------------------------------------------------------------------------
// Fuel price spike maintenance surcharge (T065) — see file header
// ---------------------------------------------------------------------------

/** The Fuel good's id (data/goods.ts) — hardcoded the same way eventTable.ts
 * hardcodes good ids directly (e.g. `['grain', 'cotton']`) rather than
 * importing the whole GOODS array just to look up one literal. */
const FUEL_GOOD_ID = 'fuel'

/**
 * True when ANY currently-fired, currently-active event in
 * `state.activeEvents` affects the Fuel good — see file header for why this
 * is checked generically (not hardcoded to `warScare`'s type id) and why
 * `warScare` is this codebase's "existing Fuel price spike event". Exported
 * so the Aviation screen (T066) can show a "Fuel price spike surcharge
 * active" note without duplicating this lookup.
 */
export function isFuelPriceSpikeActive(state: GameState): boolean {
  const day = state.day
  return state.activeEvents.some(
    (event) =>
      event.fired === true &&
      event.activeUntilDay !== undefined &&
      day >= event.scheduledFireDay &&
      day < event.activeUntilDay &&
      event.affectedGoodIds.includes(FUEL_GOOD_ID),
  )
}

/**
 * The maintenance `plane` owes for ONE DAY (§16: 0.3%/month of purchase
 * price), optionally with T065's +30% fuel-price-spike surcharge applied.
 * Pure per-plane rate lookup, shared by `accruePlaneMaintenanceForDay` below
 * and the Aviation screen's (T066) live display — same "one formula, two
 * consumers" pattern as `planeDailyIncome` above.
 */
export function planeDailyMaintenance(plane: Plane, fuelSpikeActive: boolean): number {
  const dailyRate = CONFIG.aviation.maintenanceMonthlyRatePctOfPrice / CONFIG.aviation.leaseDaysPerMonth
  const surchargeMultiplier = fuelSpikeActive ? 1 + CONFIG.aviation.events.fuelSpikeMaintenanceSurchargePct : 1
  return plane.purchasePrice * dailyRate * surchargeMultiplier
}

// ---------------------------------------------------------------------------
// accruePlaneMaintenanceForDay — the daily-tick hook (T064/T065)
// ---------------------------------------------------------------------------

/**
 * Accrues ONE DAY's plane maintenance/insurance (§16: 0.3%/month of purchase
 * price, for every owned plane regardless of status or grounding) into
 * `state.planeMaintenanceOwedThisFiscalYear` — see file header's "maintenance
 * accrues daily" design section for why this is a running accumulator rather
 * than a lump sum computed inside `runYearEnd` (tax.ts) directly.
 *
 * Sums `planeDailyMaintenance(plane, fuelSpikeActive)` (see above) across
 * every plane in `state.planes`, where `fuelSpikeActive =
 * isFuelPriceSpikeActive(state)` is resolved once per call (T065).
 *
 * Intended to be called ONCE PER DAY-TICK from turnLoop.ts's `advanceDay`,
 * as a sibling to `accruePlaneIncome` above (and, more distantly,
 * `accrueDepositInterest`/`accrueLoanInterest`).
 *
 * Pure function: returns a NEW `GameState` when there is at least one plane
 * to accrue maintenance for; returns the identical `state` reference,
 * unchanged, when `state.planes` is empty.
 */
export function accruePlaneMaintenanceForDay(state: GameState): GameState {
  const planes = state.planes ?? []
  if (planes.length === 0) return state

  const fuelSpikeActive = isFuelPriceSpikeActive(state)

  let dailyMaintenanceTotal = 0
  for (const plane of planes) {
    dailyMaintenanceTotal += planeDailyMaintenance(plane, fuelSpikeActive)
  }

  return {
    ...state,
    planeMaintenanceOwedThisFiscalYear: (state.planeMaintenanceOwedThisFiscalYear ?? 0) + dailyMaintenanceTotal,
  }
}

// ---------------------------------------------------------------------------
// applyAviationSafetyIncidents — the grounding hook (T065), called from
// turnLoop.ts right after resolveDueEvents (see file header for the full
// design rationale on why grounding is applied here, not in resolution.ts).
// ---------------------------------------------------------------------------

/**
 * Scans `resolutions` (this day-tick's freshly-resolved events, from
 * `events/resolution.ts`'s `resolveDueEvents`) for any fired
 * `'aviationSafetyIncident'` occurrence, and for each one grounds ONE random
 * eligible plane (status `'leasedMonthly'`/`'leasedAnnual'`, not already
 * grounded) by setting `groundedUntilDay = event.activeUntilDay` — see file
 * header for why no new plane is picked when the eligible pool is empty
 * (documented no-op, not an error).
 *
 * Pure function: returns a NEW `GameState` only when at least one plane was
 * actually grounded; returns the identical `state` reference, unchanged,
 * when there are no fired safety-incident resolutions this tick, no planes
 * at all, or no eligible plane to ground.
 */
export function applyAviationSafetyIncidents(
  state: GameState,
  resolutions: readonly EventResolution[],
  rng: Rng,
): GameState {
  const firedIncidents = resolutions.filter((r) => r.fired && r.event.typeId === 'aviationSafetyIncident')
  if (firedIncidents.length === 0) return state

  let planes = state.planes ?? []
  if (planes.length === 0) return state

  let changed = false

  for (const { event } of firedIncidents) {
    const eligible = planes.filter(
      (p) => (p.status === 'leasedMonthly' || p.status === 'leasedAnnual') && p.groundedUntilDay === undefined,
    )
    if (eligible.length === 0) continue // nothing to ground — documented no-op (see file header)

    const picked = rng.pick(eligible)
    const groundedUntilDay = event.activeUntilDay ?? state.day
    planes = planes.map((p) => (p.id === picked.id ? { ...p, groundedUntilDay } : p))
    changed = true
  }

  if (!changed) return state
  return { ...state, planes }
}

// ---------------------------------------------------------------------------
// Depreciation / resale (T064)
// ---------------------------------------------------------------------------

/**
 * Computes `plane`'s current depreciated value as of `currentDay` — the
 * figure used both by `calcNetWorth` (netWorth.ts, extended by this task)
 * and by `sellPlane` below. See file header for why depreciation is
 * CONTINUOUS (prorated by fractional years owned) rather than a discrete
 * once-per-year step.
 *
 * `valuePct = max(floorValuePct, startingValuePct - perGameYearDepreciationPct
 * * yearsOwned)`, where `yearsOwned = max(0, currentDay - purchaseDay) /
 * YEAR_LENGTH_DAYS` — returns `plane.purchasePrice * valuePct`.
 */
export function planeDepreciatedValue(plane: Plane, currentDay: number): number {
  const daysOwned = Math.max(0, currentDay - plane.purchaseDay)
  const yearsOwned = daysOwned / YEAR_LENGTH_DAYS

  const { startingValuePct, perGameYearDepreciationPct, floorValuePct } = CONFIG.aviation.depreciation
  const valuePct = Math.max(floorValuePct, startingValuePct - perGameYearDepreciationPct * yearsOwned)

  return plane.purchasePrice * valuePct
}

/**
 * Sells `planeId` outright for its current depreciated value minus the
 * liquidation fee (§16: "Selling pays out current depreciated value minus a
 * 10% liquidation fee") — see file header for why this does NOT also charge
 * the annual-lease-termination penalty, even if the plane is mid-term.
 *
 * On success: adds `planeDepreciatedValue(plane, state.day) * (1 -
 * CONFIG.aviation.liquidationFeePct)` to `state.cash`, removes the plane from
 * `state.planes` entirely, and clears `state.armedPersonalUsePlaneId` if it
 * was pointing at this now-sold plane.
 *
 * Rejected (returns the identical `state` reference, unchanged) when
 * `planeId` doesn't resolve to a plane in `state.planes`.
 */
export function sellPlane(state: GameState, planeId: PlaneId): GameState {
  const planes = state.planes ?? []
  const plane = planes.find((p) => p.id === planeId)
  if (!plane) return state

  const proceeds = planeDepreciatedValue(plane, state.day) * (1 - CONFIG.aviation.liquidationFeePct)
  const newPlanes = planes.filter((p) => p.id !== planeId)
  const armedPersonalUsePlaneId = state.armedPersonalUsePlaneId === planeId ? null : (state.armedPersonalUsePlaneId ?? null)

  return {
    ...state,
    cash: state.cash + proceeds,
    planes: newPlanes,
    armedPersonalUsePlaneId,
  }
}
