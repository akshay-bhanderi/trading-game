# Phase 11 — Phase 2: Hotel Ownership

[← Back to index](../TASK.md)

Status: **Not started.** Blocked until [Phase 9](phase-09-deploy-checkpoint.md)'s T045 is checked off.

> **Testing policy (deferred):** Per-task unit tests for T053–T057 are **not** required to check a box off in this phase — build the functionality, confirm it behaves correctly by inspection/manual exercise, and move on. All deferred tests for this phase get written and run together at [T068](phase-13-final-balance-pass.md) (Phase 13), alongside the final harness re-run. Don't skip testing altogether — just don't gate each task on it.

- [ ] **T053 — Hotel config & data (tier costs/revenue/license off city nightly rate)**
  - Doc references: §15 (tier table)
  - Dependencies: T045, T003, T005
  - File path hints: `/src/engine/config.ts` (fill Hotel placeholder section), `/src/engine/data/hotel.ts`
  - Acceptance criteria: The 4 tiers' build/upgrade multiplier, passive revenue multiplier, and annual license multiplier (all × city nightly rate, per §15's table) are entered as config multipliers, not hardcoded per-city values, matching the doc's explicit config-driven intent. The doc's own worked example must reproduce exactly (Silkden $60/night Inn = $30,000 cost, $48/day revenue, $1,200/yr license).
  - Mobile/desktop note: N/A — engine only, no UI.

- [ ] **T054 — Hotel build/upgrade engine (marginal cost stacking)**
  - Doc references: §15 (Ownership, upgrade cost is marginal)
  - Dependencies: T053, T002
  - File path hints: `/src/engine/hotel.ts`
  - Acceptance criteria: `buildOrUpgradeHotel(state, cityId)` purchases the next tier in order (Inn→Lodge→Grand→Resort), charging only the marginal upgrade cost on top of what was already paid (e.g. Lodge's "+1,200×" charged on top of Inn's cost, not replacing it). Ownership tracked per city, multiple cities allowed simultaneously. The Silkden example across two upgrade steps should reproduce the doc's numbers exactly (cumulative spend matches manual calculation).
  - Mobile/desktop note: N/A — engine only, no UI.

- [ ] **T055 — Hotel passive revenue accrual + free stays for owner**
  - Doc references: §15 (Free stays, Passive revenue accrues daily)
  - Dependencies: T054, T015
  - File path hints: `/src/engine/hotel.ts` (extend), `/src/engine/actions/stay.ts` (extend)
  - Acceptance criteria: A daily-tick hook (called from `advanceDay`, T015) credits passive revenue for every owned hotel regardless of the player's current location, including while traveling multiple days. `stay()` (T014) is modified so it costs $0 in a city where the player owns the hotel.
  - Mobile/desktop note: N/A — engine only, no UI.

- [ ] **T056 — Hotel epidemic-pause interaction**
  - Doc references: §15 (Epidemic pauses revenue), §7 (epidemic event's "hotel closed" effect)
  - Dependencies: T055, T016
  - File path hints: `/src/engine/hotel.ts` (extend)
  - Acceptance criteria: The existing epidemic event (already in the §7 base table from T016) is checked in the daily revenue-accrual hook; while an epidemic is active in a city, that city's owned-hotel revenue is $0 for the event's duration, then resumes automatically. No new event type is added (explicitly reuses the existing effect, per §15).
  - Mobile/desktop note: N/A — engine only, no UI.

- [ ] **T057 — Hotel annual license fee billing + sell-back**
  - Doc references: §15 (Annual license fee, Sell-back)
  - Dependencies: T054, T030
  - File path hints: `/src/engine/hotel.ts` (extend), `/src/engine/tax.ts` (extend `runYearEnd`)
  - Acceptance criteria: `runYearEnd` now also deducts each owned hotel's annual license fee (× nightly rate, per tier). `sellHotel(state, cityId)` liquidates for 50% of total invested (build + all upgrade costs), matching the Warehouse salvage rate per §15's explicit parity note.
  - Mobile/desktop note: N/A — engine only, no UI.

- [ ] **T058 — UI Screen 10: Real Estate/Hotels screen + City-screen "buy hotel here" button**
  - Doc references: §12 (screen 10)
  - Dependencies: T035, T037, T054, T055, T056, T057
  - File path hints: `/src/ui/screens/RealEstateScreen.tsx`, `/src/ui/screens/CityScreen.tsx` (modify — this file was created in T037)
  - Acceptance criteria: Real Estate screen lists owned hotels by city with tier, daily revenue, and an upgrade button. The City screen (T037) gains a "buy hotel here" button shown only when the current city's hotel is not yet owned, per §12's explicit placement requirement.
  - Mobile/desktop note: Primary target mobile-portrait 360×740; desktop secondary fallback only.
