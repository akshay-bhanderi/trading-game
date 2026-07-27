# Phase 13 — Final Balance Pass (Phase 2 Included)

[← Back to index](../TASK.md)

Status: **Not started.** This is the last phase — T068 is the full-development test checkpoint (see policy note below).

> **Testing policy:** Phases 10–12 deliberately deferred their per-task unit tests to save time during feature-building (see the policy note in each of those phase files). **T068 below is where that deferred testing bill comes due** — it now explicitly includes writing and running the unit tests skipped across T046–T067, not just re-tuning balance. Do not check T068 off until that full test pass is green.

- [x] **T067 — Extend bots to optionally use Phase 2 wealth systems**
  - Doc references: §11 (bots), §14, §15, §16
  - Dependencies: T025, T026, T027, T048, T054, T061, T062, T063
  - File path hints: `/src/engine/bots/newsBot.ts` (extended — see its own T067 doc-comment section), `/src/engine/harness/botHarness.ts` (extended with `phase2AssetCheckpoints`), `/src/engine/netWorth.ts` (new `calcPhase2AssetValue` helper, kept deliberately separate from `calcNetWorth`)
  - Done: `newsBotStep` now runs `maybeInvestInPhase2Assets` once per non-travel day (after that day's rumor-driven trading, before the travel/stay decision) — it considers building/upgrading a warehouse floor, building/upgrading a hotel, and (at a Medium+ bank city) buying-and-monthly-leasing the cheapest plane class in its CURRENT city, and takes the cheapest AFFORDABLE one (cash >= cost × 8, a documented cushion above the license-purchase multiplier since these are large, only-partially-liquid commitments) — at most one Phase 2 purchase per day. Greedy/random bots are deliberately left unchanged (see newsBot.ts's file header for why). Storing/withdrawing cargo through a built warehouse, and `'leasedAnnual'`/`'personal'` plane statuses, are explicitly OUT of scope for this task (see file header) — deferred to a future pass if the harness data below shows it's worth adding.
  - Harness: `runHarness`'s `HarnessResult` now includes `phase2AssetCheckpoints` (same shape/days as `checkpoints`), backed by `netWorth.ts`'s new `calcPhase2AssetValue(state)` — book value across warehouse build equity + stored goods, hotel cumulative investment, and plane depreciated value. Manually verified via a 20-seed/100-day run: news bot holds ~$0 Phase 2 assets at day 10 (cash too low to clear the affordability bar), ~$4.5k median by day 30, ~$165k median by day 90 — a real, measurable signal, not a no-op.
  - Balance note for T068: because hotel investment was never added to `calcNetWorth`'s formula (only warehouse goods and plane value were, via T048/T064) and an un-stocked warehouse is a pure capital sink under the current formula, this bot's Phase 2 spending now pulls the existing §11 day-90 news-bot net-worth health check further out of band (median dropped from an already-failing ~$411k to ~$123k against the $200k-$400k target) — expected and by design per this doc's own testing-policy note above ("T068... it now explicitly includes... re-tuning balance"), not a bug introduced here. T068 should decide, with this new `phase2AssetCheckpoints` data in hand, whether to retune `PHASE2_AFFORDABILITY_MULTIPLE`/§14-§16 ⚙ constants, or whether hotel investment belongs in `calcNetWorth` after all.
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
