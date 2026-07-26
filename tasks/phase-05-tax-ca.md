# Phase 5 — Tax & CA

[← Back to index](../TASK.md)

Status: **Complete** (all tasks below are shipped).

- [x] **T030 — Tax engine (FIFO realized profit, 90-day year-end, forced loan on shortfall)**
  - Doc references: §10 (tax rules, no-CA rate, forced loan)
  - Dependencies: T012, T015, T023
  - File path hints: `/src/engine/tax.ts`
  - Acceptance criteria: `runYearEnd(state)` triggers on days 90/180/270… computing taxable base = FIFO realized profit for the elapsed year + deposit interest earned, taxed at 30% absent a CA (unrealized cargo gains excluded). If cash+deposits can't cover the tax bill, the shortfall becomes a forced Huge-bank-rate loan (note: v1 has no Huge bank city reachable — implement generically using the Huge rate constant from config regardless, per §13's instruction that CA/tax "still apply in full"). Unit tests cover a profitable year's tax deduction and a shortfall producing the forced loan.
  - Mobile/desktop note: N/A — engine only, no UI.

- [x] **T031 — CA hiring system (Junior/Senior/Elite tiers)**
  - Doc references: §10 (CA tiers table)
  - Dependencies: T030, T005
  - File path hints: `/src/engine/ca.ts`
  - Acceptance criteria: `hireCA(state, tier)` is only available at Medium+ bank cities while `state.currentCity` matches, deducts the annual fee, and applies the correct tax rate/profit cap/above-cap rate for that fiscal year in `runYearEnd` (T030). Unit tests cover all three tiers plus the no-CA default, verifying the correct blended rate is applied when realized profit exceeds a tier's cap.
  - Mobile/desktop note: N/A — engine only, no UI.
