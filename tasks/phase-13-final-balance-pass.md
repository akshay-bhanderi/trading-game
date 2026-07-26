# Phase 13 — Final Balance Pass (Phase 2 Included)

[← Back to index](../TASK.md)

Status: **Not started.** This is the last phase — T068 is the full-development test checkpoint (see policy note below).

> **Testing policy:** Phases 10–12 deliberately deferred their per-task unit tests to save time during feature-building (see the policy note in each of those phase files). **T068 below is where that deferred testing bill comes due** — it now explicitly includes writing and running the unit tests skipped across T046–T067, not just re-tuning balance. Do not check T068 off until that full test pass is green.

- [ ] **T067 — Extend bots to optionally use Phase 2 wealth systems**
  - Doc references: §11 (bots), §14, §15, §16
  - Dependencies: T025, T026, T027, T048, T054, T061, T062, T063
  - File path hints: `/src/engine/bots/newsBot.ts` (extend, primary candidate for using these systems since it's the most sophisticated bot; document if greedy/random are left unchanged), `/src/engine/harness/botHarness.ts` (extend to record Phase 2 asset holdings in stats)
  - Acceptance criteria: At least one bot strategy (news-follower recommended) is extended to opportunistically build warehouses, buy hotels, and buy/lease planes when cash allows, so the harness can measure Phase 2's effect on net worth growth. Harness output now reports Phase 2 asset value as a stat alongside net worth.
  - Mobile/desktop note: N/A — engine only, no UI.

- [ ] **T068 — Re-run §11 bot harness with §14–§16 included; write the deferred unit tests; re-tune Phase 2 ⚙ numbers**
  - Doc references: §17 (build step 13), §11
  - Dependencies: T067, T028, T045
  - File path hints: `/src/engine/config.ts` (edits only, Phase 2 sections), `/src/engine/harness/baseline.v2.json` (or similar new snapshot), plus new/extended `*.test.ts` files across `/src/engine/warehouse.ts`, `/src/engine/hotel.ts`, `/src/engine/aviation.ts`, `/src/engine/events/eventTable.ts`, and their year-end billing hooks in `/src/engine/tax.ts`
  - Acceptance criteria:
    1. **Full deferred test pass:** write and run unit tests covering everything built in T046–T067 that was left untested at the time (Warehouse floor math/build/store/maintenance/fire/insurance/sell-back; Hotel build/upgrade/revenue/epidemic-pause/license/sell-back; Aviation purchase/status income/cancellation/personal-use bonus/depreciation/events; the bot's Phase 2 usage from T067). All must pass.
    2. **Harness re-run:** run the full-spec harness again with Phase 2 systems active. Confirm the original day-10/30/90 targets (T029's baseline) still hold — Phase 2 income must not be assumed by or silently inflate those numbers, per §13's explicit warning.
    3. **Re-tune:** iteratively tune Warehouse/Hotel/Aviation ⚙ constants (still only editing `config.ts`) so that no strategy exceeds 3× targets and Phase 2 assets meaningfully move net worth without being a dominant no-brainer over pure trading.
    4. Persist the new harness snapshot and document, in the commit message, both the diff from T045's baseline and which constants changed and why. This is the final gate before Phase 2 ships.
  - Mobile/desktop note: N/A — engine/tooling only, no UI.
