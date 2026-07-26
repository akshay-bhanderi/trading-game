# Phase 10 — Phase 2: Warehouse Storage

[← Back to index](../TASK.md)

Status: **✅ Complete (T046–T052).** Built ahead of T045 per explicit user direction (testing/harness gates deferred to T068; see project memory) — functionality verified by inspection + `tsc -b`/`vite build`, not by dedicated tests.

> **Testing policy (deferred):** Per-task unit tests for T046–T051 are **not** required to check a box off in this phase — build the functionality, confirm it behaves correctly by inspection/manual exercise, and move on. All deferred tests for this phase get written and run together at [T068](phase-13-final-balance-pass.md) (Phase 13), alongside the final harness re-run. Don't skip testing altogether — just don't gate each task on it.

- [x] **T046 — Warehouse config & data (floor costs/capacities/maintenance)**
  - Doc references: §14 (floor table)
  - Dependencies: T045, T003, T005
  - File path hints: `/src/engine/config.ts` (fill in the Warehouse placeholder section from T003), `/src/engine/data/warehouse.ts`
  - Acceptance criteria: All 6 floor tiers' capacity-added, cumulative capacity, build cost, and annual maintenance values from §14's table are entered into config, keyed for lookup by floor number, matching the doc's numbers exactly (cumulative capacity sums floor-by-floor: 150→400→800→1,450→2,450→4,050).
  - Mobile/desktop note: N/A — engine only, no UI.

- [x] **T047 — Warehouse build/ownership engine (sequential floor purchase)**
  - Doc references: §14 (Ownership, Floors)
  - Dependencies: T046, T002
  - File path hints: `/src/engine/warehouse.ts`
  - Acceptance criteria: `buildWarehouseFloor(state, cityId)` allows purchasing the next floor in order only (rejects skip-ahead), tracks ownership per city (a player can own warehouses in multiple cities), deducts build cost. `state` gains a `warehouses: Record<cityId, { floorsBuilt: number, insured: boolean }>` field (extend types from T002 here).
  - Mobile/desktop note: N/A — engine only, no UI.

- [x] **T048 — Warehouse store/withdraw goods (separate from cargo)**
  - Doc references: §14 (separate capacity system, no remote trading, net worth inclusion)
  - Dependencies: T047, T008, T009
  - File path hints: `/src/engine/warehouse.ts` (extend)
  - Acceptance criteria: `storeGoods(state, cityId, good, qty)` / `withdrawGoods(state, cityId, good, qty)` only succeed while `state.currentCity === cityId` (no remote trading, matching §6/§14's rule), respect the city's total built floor capacity, and do not consume cargo capacity (T011 untouched). Stored goods are included in net worth (T009 extended to sum warehouse goods at last-known local price).
  - Mobile/desktop note: N/A — engine only, no UI.

- [x] **T049 — Warehouse annual maintenance billing**
  - Doc references: §14 (maintenance bills at year-end, unpaid → Small-bank-rate debt)
  - Dependencies: T047, T030
  - File path hints: `/src/engine/warehouse.ts` (extend), `/src/engine/tax.ts` (extend `runYearEnd` to include warehouse maintenance)
  - Acceptance criteria: `runYearEnd` now sums maintenance across every owned warehouse/floor and deducts it alongside tax; if unpayable, the shortfall accrues as Small-bank-rate debt (per §14, distinct from the Huge-rate tax shortfall loan in T030 — confirm this distinction explicitly in the implementation).
  - Mobile/desktop note: N/A — engine only, no UI.

- [x] **T050 — Warehouse fire event + insurance mitigation**
  - Doc references: §14 (Risk: Warehouse fire, insurance), §7 (event table extension)
  - Dependencies: T016, T017, T048
  - File path hints: `/src/engine/events/eventTable.ts` (extend), `/src/engine/warehouse.ts` (extend)
  - Acceptance criteria: A new low-probability "Warehouse fire" event type is added to the event table (city-scoped), destroying 10–40% of that city's stored goods when it fires. `buyWarehouseInsurance(state, cityId)` costs 2%/year of stored goods' value (billed with maintenance, T049) and caps fire loss at 10% when active.
  - Mobile/desktop note: N/A — engine only, no UI.

- [x] **T051 — Warehouse sell-back**
  - Doc references: §14 (Sell-back)
  - Dependencies: T047
  - File path hints: `/src/engine/warehouse.ts` (extend)
  - Acceptance criteria: `sellWarehouse(state, cityId)` liquidates all floors for 50% of total cumulative build cost, removes ownership and any stored goods' value from net worth (goods themselves — decide and document whether they're forfeited or must be withdrawn first; recommended: reject sell-back if goods are still stored, requiring withdrawal first, to avoid ambiguous value loss).
  - Mobile/desktop note: N/A — engine only, no UI.

- [x] **T052 — UI Screen 9: Warehouse screen**
  - Doc references: §12 (screen 9), §14 (graphic description)
  - Dependencies: T035, T038, T047, T048, T049, T050, T051
  - File path hints: `/src/ui/screens/WarehouseScreen.tsx`
  - Acceptance criteria: Renders a vertical building elevation, one row per floor, lit/filled = built, dim outline = not-yet-built with an inline "buy next floor" button. Each built floor shows its own used/free capacity bar reusing the `CapacityBar` component from T038, stacked to read as one building-height meter, per §14's explicit visual-consistency requirement. Includes store/withdraw controls, insurance toggle, and sell-back button.
  - Mobile/desktop note: Primary target mobile-portrait 360×740, vertically-scrolling elevation view suits portrait well; desktop secondary fallback only.
