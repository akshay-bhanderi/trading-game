# Phase 2 — Events & Newspaper Engine

[← Back to index](../TASK.md)

Status: **Complete** (all tasks below are shipped).

- [x] **T016 — Base event table data + scheduling engine**
  - Doc references: §7 (event types table; pipeline steps 1–2)
  - Dependencies: T015, T004, T005, T006
  - File path hints: `/src/engine/events/eventTable.ts`, `/src/engine/events/eventEngine.ts`
  - Acceptance criteria: All 11 base event types from §7's table are data-defined (affected good(s), city-or-global scope, multiplier range, duration). `scheduleEvent(state, rng)` schedules an event 2–4 days in the future with a hidden truth flag. Events are stored in `state` so the daily tick (T015) can check for events becoming due. Unit test: scheduling produces an event whose fire date is strictly 2–4 days after the current day.
  - Mobile/desktop note: N/A — engine only, no UI.

- [x] **T017 — Event resolution (fire/fizzle) + price multiplier application**
  - Doc references: §7 (pipeline steps 3–5)
  - Dependencies: T016, T008
  - File path hints: `/src/engine/events/resolution.ts`
  - Acceptance criteria: On an event's due date, `resolveEvent(state, rng)` decides fire-vs-fizzle based on the event's hidden truth flag and applies the correct price multiplier (feeding T008's `eventMultiplier` term) for its duration if fired; does nothing to prices if fizzled. A resolution record is stored for next-day newspaper consumption (T018). Unit test: a "fired" event measurably shifts the affected good's price relative to a control run with the event disabled; a "fizzled" event does not.
  - Mobile/desktop note: N/A — engine only, no UI.

- [x] **T018 — Newspaper generation pipeline (rumors, filler, false rumors, source styles, resolution stories, unlock headlines)**
  - Doc references: §7 (pipeline, resolution-story requirement), §4 (city-unlock headline)
  - Dependencies: T016, T017, T010
  - File path hints: `/src/engine/newspaper.ts`
  - Acceptance criteria: `generateDailyPaper(state, rng)` produces 2–4 stories per day mixing scheduled-event rumors, filler, and deliberate false rumors, each tagged with a source style ("wire" ≈80% accurate, "gossip" ≈50%, values from config). The morning after any event's due date, a resolution story explaining why it fired or fizzled is always included (unit test enforces this is non-optional — every resolved event produces exactly one resolution story the next day). When a city unlocks (via T010), a headline story is generated that day. Unit test: over many simulated days, resolution stories appear 1:1 with resolved events.
  - Mobile/desktop note: N/A — engine only, no UI (consumed by UI in T039).

- [x] **T019 — Fog of wealth (rumor specificity scaling by net worth)**
  - Doc references: §7 (Fog of wealth)
  - Dependencies: T018, T009
  - File path hints: `/src/engine/fogOfWealth.ts`
  - Acceptance criteria: Rumor text generation applies exact city+good detail below $50k net worth, good+region only from $50k–$500k, and directional-only phrasing above $500k, per the three tiers in §7. Unit test asserts the same underlying rumor event produces progressively vaguer text as a mocked net worth increases across the three bands.
  - Mobile/desktop note: N/A — engine only, no UI.

- [x] **T020 — Insider information / Informant system**
  - Doc references: §7 (Insider information), §9 (bank size tiers, for Medium+ gating)
  - Dependencies: T018, T009, T005
  - File path hints: `/src/engine/informant.ts`
  - Acceptance criteria: Informant tips are only offerable in Medium+ bank cities (Port Vela, Ironvale, Silkden in v1 — note in code comment that Novara Heights' 75%-accuracy bonus and cheapest pricing are unreachable in v1 since Novara is Tier 4/out of scope per §13, so only the generic 70% base accuracy applies; the formula should still be written generically so a future Tier 4 addition needs no special-casing). Tip price = `max($500, 1% of net worth)`. Tip accuracy is 70% (config-driven), adjusted by difficulty's rumor-accuracy-bonus per §3. Purchased tips resolve through the same resolution-story mechanism as regular rumors (reuses T017/T018). Unit test covers price formula at low and high net worth, and gating rejection in a Small-bank city.
  - Mobile/desktop note: N/A — engine only, no UI (consumed by UI in T039).
