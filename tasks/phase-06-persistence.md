# Phase 6 — Persistence

[← Back to index](../TASK.md)

Status: **Complete** (all tasks below are shipped).

- [x] **T032 — localStorage save/load with schema versioning**
  - Doc references: §17 (localStorage persistence, schema version), §1 (Save)
  - Dependencies: T031
  - File path hints: `/src/engine/persistence/saveLoad.ts`
  - Acceptance criteria: `saveGame(state)` serializes full `GameState` (including RNG seed) to a single localStorage key with an embedded `schemaVersion` number; `loadGame()` deserializes and, if the stored version is older than current, runs a migration function (a no-op passthrough stub is acceptable for v1 as long as the mechanism exists and is documented). Round-trip test: save then load produces a deep-equal state.
  - Mobile/desktop note: N/A — engine only, no UI.

- [x] **T033 — Local high-score table (top 10 runs)**
  - Doc references: §1 (local high-score table)
  - Dependencies: T032
  - File path hints: `/src/engine/persistence/highScore.ts`
  - Acceptance criteria: `recordScore({ peakNetWorth, daysSurvived, difficulty })` maintains a sorted (descending by peakNetWorth) top-10 list in a separate localStorage key, evicting the lowest entry when full. Unit test covers insertion, ordering, and eviction at exactly 11 entries.
  - Mobile/desktop note: N/A — engine only, no UI.
