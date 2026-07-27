# Trade Winds of Selvara — TASK.md (Index)

> Generated from `trade-winds-design-doc.md` (single source of truth — if a task and the doc disagree, the doc wins; update the relevant phase file in `tasks/` to match).
> Executed one task at a time by separate Claude Code agents, each starting cold with no memory of other tasks.
> This file used to contain every task inline. It's now split into one file per phase under `tasks/`, linked below — each phase file is self-contained and lists its own tasks, dependencies, and acceptance criteria.

## How to use this file

1. Look at the phase table below and find the lowest-numbered phase that is not yet **Complete**.
2. Open that phase's file and find the lowest-numbered unchecked task whose **Dependencies** are all already checked off (dependencies may reference tasks in earlier phase files — check there if a task ID isn't in the current file).
3. Execute it — read only the **Doc references** listed (plus the design doc's own cross-references if it points elsewhere) and the **File path hints**. Each task is self-contained: a fresh agent with no memory of other tasks should be able to complete it using only `trade-winds-design-doc.md` and the task's own text.
4. Check the box in that phase's file when the task's acceptance criteria pass, and move to the next eligible task. Do not skip ahead out of dependency order even if a later task looks easy — later tasks assume earlier files/exports exist exactly as specified.

**Phase 10–13 tasks must not start until T045 (the locked v1 bot-harness baseline, in [Phase 9](tasks/phase-09-deploy-checkpoint.md)) is checked off**, per §13/§17 of the design doc.

## Testing policy

Phases 0–9 were each built with unit tests required as part of that task's acceptance criteria, per the design doc's original mandate — that's already done and isn't being redone.

**Going forward (Phase 10 onward), testing is deferred to the end of development instead of gating every task.** Build the functionality for each task, confirm by inspection/manual exercise that it does what the acceptance criteria describe, and check the box — without writing/running a dedicated unit test for it first. This is a deliberate speed tradeoff: fewer stops for test-writing while the Warehouse/Hotel/Aviation systems (Phases 10–12) are being built out.

The bill comes due at **T068** (end of [Phase 13](tasks/phase-13-final-balance-pass.md)): that task now explicitly includes writing and running the full deferred test suite for everything built in Phases 10–12, alongside the bot-harness re-run and balance re-tune. T068 is not checked off until that full pass is green. The exceptions that still require tests as originally specified are the structural checkpoints the design doc itself calls non-negotiable: T045 (locked v1 baseline) and T068 (final gate) — these are testing tasks by nature, not feature tasks with a testing tax bolted on.

**Resolved (2026-07-27):** both gates are checked off — see [Phase 13](tasks/phase-13-final-balance-pass.md)'s T068 entry for the full file-by-file test list and harness diff.

## Phase index

| Phase | Title | File | Status |
|---|---|---|---|
| 0 | Foundation | [tasks/phase-00-foundation.md](tasks/phase-00-foundation.md) | ✅ Complete (T001–T004) |
| 1 | Core World & Price Engine | [tasks/phase-01-core-world-price-engine.md](tasks/phase-01-core-world-price-engine.md) | ✅ Complete (T005–T015) |
| 2 | Events & Newspaper Engine | [tasks/phase-02-events-newspaper-engine.md](tasks/phase-02-events-newspaper-engine.md) | ✅ Complete (T016–T020) |
| 3 | Rank & Banking | [tasks/phase-03-rank-banking.md](tasks/phase-03-rank-banking.md) | ✅ Complete (T021–T024) |
| 4 | Bots & Balance Harness (First Pass) | [tasks/phase-04-bots-balance-harness.md](tasks/phase-04-bots-balance-harness.md) | ✅ Complete (T025–T029) |
| 5 | Tax & CA | [tasks/phase-05-tax-ca.md](tasks/phase-05-tax-ca.md) | ✅ Complete (T030–T031) |
| 6 | Persistence | [tasks/phase-06-persistence.md](tasks/phase-06-persistence.md) | ✅ Complete (T032–T033) |
| 7 | App Shell & State Wiring | [tasks/phase-07-app-shell-state-wiring.md](tasks/phase-07-app-shell-state-wiring.md) | ✅ Complete (T034–T035) |
| 8 | UI Screens (1–8) | [tasks/phase-08-ui-screens.md](tasks/phase-08-ui-screens.md) | ✅ Complete (T036–T043, T069) |
| 9 | Deploy Checkpoint (v1 Core Loop Ships) | [tasks/phase-09-deploy-checkpoint.md](tasks/phase-09-deploy-checkpoint.md) | ✅ Complete (T044–T045) |
| 10 | Phase 2: Warehouse Storage | [tasks/phase-10-warehouse-storage.md](tasks/phase-10-warehouse-storage.md) | ✅ Complete (T046–T052) |
| 11 | Phase 2: Hotel Ownership | [tasks/phase-11-hotel-ownership.md](tasks/phase-11-hotel-ownership.md) | ✅ Complete (T053–T058) |
| 12 | Phase 2: Aviation Leasing | [tasks/phase-12-aviation-leasing.md](tasks/phase-12-aviation-leasing.md) | ✅ Complete (T059–T066) |
| 13 | Final Balance Pass (Phase 2 Included) | [tasks/phase-13-final-balance-pass.md](tasks/phase-13-final-balance-pass.md) | ✅ Complete (T067–T068) |

**All phases complete.** T045's baseline (`baseline.v1.json`) and the full deferred test suite were both reconciled as part of T068's final pass — see [Phase 13](tasks/phase-13-final-balance-pass.md) for the harness diff, the deferred-test file list, and which constant was re-tuned (and why).
