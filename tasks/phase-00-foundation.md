# Phase 0 — Foundation

[← Back to index](../TASK.md)

Status: **Complete** (all tasks below are shipped).

- [x] **T001 — Scaffold Vite+React+TS project with engine/ui split**
  - Doc references: §17
  - Dependencies: none
  - File path hints: repo root (`vite.config.ts`, `tsconfig.json`, `package.json`), `/src/engine/`, `/src/ui/`
  - Acceptance criteria: `npm run dev` and `npm run build` succeed on a blank scaffold; `/src/engine` and `/src/ui` directories exist with a README or comment stating the "no React imports in engine" rule; a lint rule or CI check (e.g. ESLint `no-restricted-imports`) blocks `react` imports inside `/src/engine`; a test runner (Vitest recommended, since it runs headless in Node matching the §17 bot-harness requirement) is configured and a trivial passing test exists.
  - Mobile/desktop note: N/A — tooling/scaffold only, no rendered UI yet.

- [x] **T002 — Core TypeScript types (City, Good, Event, GameState, etc.)**
  - Doc references: §4, §5, §6, §7, §9, §10, §17
  - Dependencies: T001
  - File path hints: `/src/engine/types.ts`
  - Acceptance criteria: Types/interfaces exist for `City`, `Good`, `CityGoodModifier`, `PriceState`, `Event`, `NewspaperStory`, `Cargo`, `BankAccount` (loan+deposit), `TaxRecord`, `Rank` inputs, `GameState` (day, currentCity, cash, cargo, deposits/loans map, owned goods with cost basis, unlocked cities/goods, peakNetWorth, seed, difficulty, repaymentRecord, rank cache). File compiles with `strict: true`, zero `any`. A short comment block notes these types will be extended in Phase 2 (warehouse/hotel/aviation fields added later, not now).
  - Mobile/desktop note: N/A — engine only, no UI.

- [x] **T003 — config.ts skeleton with all ⚙ tunable constants**
  - Doc references: §3, §4, §5, §6, §7, §9, §10 (Phase 2 sections §14–§16 get placeholder stubs only, filled in later tasks)
  - Dependencies: T002
  - File path hints: `/src/engine/config.ts`
  - Acceptance criteria: A single exported `CONFIG` object (or several named exports re-exported from one barrel file) contains every ⚙-marked number from §3–§10 (difficulty multipliers, cargo upgrade costs, mean-reversion pull %, floor/ceiling multipliers, wire/gossip accuracy, insider pricing formula constants, rank weights, loan baseCaps/rankFactor/interest rates, deposit interest rates, default thresholds, tax year length, CA tiers). Values match the doc's tables exactly. Empty/commented placeholder sections exist for Warehouse/Hotel/Aviation constants (to be populated in T046/T053/T059) so the file's structure doesn't need reshaping later. No magic numbers for these systems exist anywhere else in the codebase (this is the acceptance bar to enforce going forward).
  - Mobile/desktop note: N/A — engine only, no UI.

- [x] **T004 — Seeded RNG utility with unit tests**
  - Doc references: §6 ("Deterministic seeded RNG per run")
  - Dependencies: T002
  - File path hints: `/src/engine/rng.ts`, `/src/engine/rng.test.ts`
  - Acceptance criteria: A `createRng(seed: number)` function returns a generator object with at least `next(): number` (0–1 float) and `int(min,max)`/`pick<T>(arr:T[])` helpers; same seed always produces the identical sequence (test asserts this); different seeds produce different sequences (test asserts this with statistical/inequality check, not just "not equal once"); no use of `Math.random` anywhere else in `/src/engine` going forward (documented as a rule for future tasks).
  - Mobile/desktop note: N/A — engine only, no UI.
