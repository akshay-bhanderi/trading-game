# Phase 9 — Deploy Checkpoint (v1 Core Loop Ships)

[← Back to index](../TASK.md)

Status: **✅ Complete (T044–T045).**

- [x] **T044 — Playtest build polish & deploy configuration**
  - Doc references: §17 (build step 9)
  - Dependencies: T036, T037, T038, T039, T040, T041, T042, T043
  - File path hints: repo root (`vercel.json` or Netlify config, `package.json` build scripts)
  - Acceptance criteria: `npm run build` produces a deployable static bundle; a Vercel or Netlify config is committed; a manual playtest checklist (new game → trade → travel → bank → year-end → default → game over) is walked through and confirmed working end-to-end on a 360×740 viewport (browser devtools device emulation is acceptable evidence).
  - Mobile/desktop note: Verify specifically at 360×740 viewport before signing off, per §1's mobile-first mandate.

- [x] **T045 — Re-run §11 bot harness against v1 as locked baseline**
  - Doc references: §17 (build step 10, first half), §11
  - Dependencies: T044, T028
  - File path hints: `/src/engine/harness/baseline.v1.json` (or similar snapshot output), `/src/engine/harness/botHarness.test.ts` (extended)
  - Done: full-spec harness (1,000 seeds × 360 days × 3 bots, `generateBaseline.test.ts`) run against pre-Phase-2 v1; `baseline.v1.json` committed as the locked reference. At full spec, news bot passes all three day-10/30/90 targets and greedy passes day-10/30; **greedy day-90 is a marginal miss** ($92,395 vs. the $100,000 floor, ~7.6% under) — a pre-existing v1/T029-era balance imprecision, not something reopened or introduced here. Reconciled as part of T068 (Phase 13) per this doc's own note below — see that task's write-up for the full harness diff once Phase 2 landed on top of this baseline.
  - Mobile/desktop note: N/A — engine/tooling only, no UI.
