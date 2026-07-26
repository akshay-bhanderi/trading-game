# Phase 12 — Phase 2: Aviation Leasing

[← Back to index](../TASK.md)

Status: **✅ Complete (T059–T066).** Built ahead of T045 per explicit user direction (testing/harness gates deferred to T068; see project memory) — functionality verified by inspection + `tsc -b`/`vite build`, not by dedicated tests.

> **Testing policy (deferred):** Per-task unit tests for T059–T065 are **not** required to check a box off in this phase — build the functionality, confirm it behaves correctly by inspection/manual exercise, and move on. All deferred tests for this phase get written and run together at [T068](phase-13-final-balance-pass.md) (Phase 13), alongside the final harness re-run. Don't skip testing altogether — just don't gate each task on it.

- [x] **T059 — Aviation config & data (4 plane classes)**
  - Doc references: §16 (class table)
  - Dependencies: T045, T003
  - File path hints: `/src/engine/config.ts` (fill Aviation placeholder section), `/src/engine/data/aviation.ts`
  - Acceptance criteria: Prop Feeder, Regional Jet, Freighter, Widebody data entries (purchase price, monthly/annual lease rate, fare/day/cargo personal-travel bonuses) match §16's table exactly, with the doc's clarification that "annual" = one 90-day game year, not a calendar year, encoded as a named constant (reused by tax/CA/warehouse/hotel year-end cadence — ideally the same `YEAR_LENGTH_DAYS = 90` constant is reused everywhere, not redefined here).
  - Mobile/desktop note: N/A — engine only, no UI.

- [x] **T060 — Aviation plane purchase**
  - Doc references: §16 (Purchase — Medium+ bank city, no fleet cap), §9
  - Dependencies: T059, T005
  - File path hints: `/src/engine/aviation.ts`
  - Acceptance criteria: `buyPlane(state, cityId, class)` only succeeds at Medium+ bank cities (Port Vela/Ironvale/Silkden in v1 — note in a comment that Large/Huge-tier cities are unreachable in v1 per §13, same pattern as T031's CA gating) and only if cash covers the price; no cap on fleet size beyond cash.
  - Mobile/desktop note: N/A — engine only, no UI.

- [x] **T061 — Plane status management (Idle/Leased Monthly/Leased Annual/Personal) + income accrual**
  - Doc references: §16 (per-plane status table)
  - Dependencies: T060, T015
  - File path hints: `/src/engine/aviation.ts` (extend)
  - Acceptance criteria: `setPlaneStatus(state, planeId, status)` and a daily-tick hook (from `advanceDay`) credit income correctly per status: Leased Monthly = price×monthlyRate÷30 per day; Leased Annual = price×annualRate÷90 per day for a firm 90-day term; Idle and Personal earn $0, matching the doc's per-day division rules exactly.
  - Mobile/desktop note: N/A — engine only, no UI.

- [x] **T062 — Lease cancellation (Monthly, 3-day notice) and early-termination penalty (Annual)**
  - Doc references: §16 (cancellation/termination rules)
  - Dependencies: T061
  - File path hints: `/src/engine/aviation.ts` (extend)
  - Acceptance criteria: `cancelMonthlyLease(state, planeId)` stops income after a 3-day notice period elapses (not instantly). `terminateAnnualLease(state, planeId)` charges the lessee 50% of the term's remaining revenue immediately and forfeits the rest to the lessor (i.e. the player, as owner, either pays or receives depending on which side is modeled — clarify in implementation that the player is always the lessor in this game, so early termination initiated by the "lessee" is an event/mechanic the player can trigger to exit a bad commitment, paying the 50% penalty themselves; document this interpretation clearly since §16 doesn't specify who initiates it).
  - Mobile/desktop note: N/A — engine only, no UI.

- [x] **T063 — Personal-use travel bonus integration**
  - Doc references: §16 (Personal use), §4 (fare/day/cargo formula it modifies)
  - Dependencies: T061, T013
  - File path hints: `/src/engine/actions/travel.ts` (extend), `/src/engine/aviation.ts` (extend)
  - Acceptance criteria: When a plane is set to Personal-use status, the next `travel()` call (T013) applies that plane's fare reduction, travel-days reduction (min 1 day), and cargo-capacity bonus exactly per §16's per-class table, then the bonus is consumed (single-use per the doc's "applies... to your next Travel action" — must not apply to any travel action after that one).
  - Mobile/desktop note: N/A — engine only, no UI.

- [x] **T064 — Plane maintenance/insurance billing + depreciation & resale**
  - Doc references: §16 (Carrying cost, Depreciation & resale)
  - Dependencies: T060, T030
  - File path hints: `/src/engine/aviation.ts` (extend), `/src/engine/tax.ts` (extend `runYearEnd`)
  - Acceptance criteria: `runYearEnd` bills 0.3%/month × purchase price maintenance for every owned plane (leased or idle) alongside tax/CA/warehouse/hotel billing. Plane net-worth/sale value starts at 90% of purchase price, depreciates 2%/game-year, floored at 40% of purchase price. `sellPlane(state, planeId)` pays current depreciated value minus a 10% liquidation fee.
  - Mobile/desktop note: N/A — engine only, no UI.

- [x] **T065 — Aviation events (Fuel spike surcharge, safety incident grounding)**
  - Doc references: §16 (Events table extension), §7, §5 (existing Fuel commodity event)
  - Dependencies: T016, T017, T061
  - File path hints: `/src/engine/events/eventTable.ts` (extend), `/src/engine/aviation.ts` (extend)
  - Acceptance criteria: The existing Fuel price-spike event (already present from T016's base table) is extended so that, when active, all plane maintenance is also raised +30% for the event's 5–8 day duration. A new "Aviation safety incident" event type grounds one random leased plane for 5–10 days (income paused, maintenance still owed during grounding).
  - Mobile/desktop note: N/A — engine only, no UI.

- [x] **T066 — UI Screen 11: Aviation/Fleet screen**
  - Doc references: §12 (screen 11)
  - Dependencies: T035, T060, T061, T062, T063, T064, T065
  - File path hints: `/src/ui/screens/AviationScreen.tsx`
  - Acceptance criteria: Lists owned planes, each with a status toggle (Idle/Leased Monthly/Leased Annual/Personal use) wired to T061/T062, and running income/maintenance totals per plane and fleet-wide.
  - Mobile/desktop note: Primary target mobile-portrait 360×740; desktop secondary fallback only.
