# Phase 4 — Bots & Balance Harness (First Pass)

[← Back to index](../TASK.md)

Status: **Complete** (all tasks below are shipped).

- [x] **T025 — Random bot strategy**
  - Doc references: §11 ("random trader")
  - Dependencies: T011, T012, T013, T014, T015, T004
  - File path hints: `/src/engine/bots/randomBot.ts`
  - Acceptance criteria: A pure function `randomBotStep(state, rng)` picks a random valid action each day (random buy/sell qty within limits, random travel-or-stay) using only the seeded RNG — no use of newspaper/rank/loans. Runs 90 simulated days without throwing in a smoke test.
  - Mobile/desktop note: N/A — engine only, no UI.

- [x] **T026 — Greedy spread-chaser bot strategy**
  - Doc references: §11 ("greedy spread-chaser ignoring news")
  - Dependencies: T011, T012, T013, T014, T015, T008, T004
  - File path hints: `/src/engine/bots/greedyBot.ts`
  - Acceptance criteria: `greedyBotStep(state, rng)` always buys the currently-cheapest-relative-to-base good it can afford/carry and travels toward the best known remembered sell price, ignoring newspaper/rumor state entirely (must not import `newspaper.ts` — enforce via code review/comment). Smoke test runs 90 days without throwing.
  - Mobile/desktop note: N/A — engine only, no UI.

- [x] **T027 — News-follower bot strategy (uses rumors + loans)**
  - Doc references: §11 ("news-follower using rumors + loans")
  - Dependencies: T018, T023, T015, T004
  - File path hints: `/src/engine/bots/newsBot.ts`
  - Acceptance criteria: `newsBotStep(state, rng)` reads the current day's newspaper (T018) to bias buy/sell/travel decisions toward rumored price moves, and opportunistically takes/repays loans (T023) to fund larger trades when a high-confidence wire rumor is active. Smoke test runs 90 days without throwing.
  - Mobile/desktop note: N/A — engine only, no UI.

- [x] **T028 — Bot harness runner + health-check assertions**
  - Doc references: §11 (harness description, health checks)
  - Dependencies: T025, T026, T027, T004
  - File path hints: `/src/engine/harness/botHarness.ts`, `/src/engine/harness/botHarness.test.ts`
  - Acceptance criteria: `runHarness({ bot, seedsCount, days })` simulates N seeded games (must support the full spec of 1,000 seeds × 360 days, though CI-run tests may use a smaller sample for speed) and returns per-day-checkpoint net worth stats (median, etc.) per bot. A test/report step checks: random bot median net worth at day 90 < $10k; greedy bot ≈0.5× the §11 targets; news bot ≈ the §11 targets; no bot exceeds 3× targets; Expert-mode bankruptcy rate ≈25–40% by day 90. This test is REQUIRED to exist and pass (or to clearly report which check fails, feeding into T029) — per the task's mandate that harness/price-engine tests are non-negotiable.
  - Mobile/desktop note: N/A — engine only, no UI.

- [x] **T029 — First balance pass (tune config.ts against §11 targets)**
  - Doc references: §11 (targets table), §3 (difficulty multipliers)
  - Dependencies: T028, T003
  - File path hints: `/src/engine/config.ts` (edits only — no new files)
  - Acceptance criteria: Iteratively adjust ⚙ constants in `config.ts` (and only that file — per §17's "balancing = editing one file" rule) until T028's harness health checks all pass on Pro mode for day-10/30/90 targets (day-180/360 are explicitly aspirational/v2 per §13 and not required to pass in v1). Document which constants were changed and why in the commit message. Re-run and paste the passing harness output as part of the PR/commit description.
  - Mobile/desktop note: N/A — engine only, no UI.
