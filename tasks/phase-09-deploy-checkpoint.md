# Phase 9 — Deploy Checkpoint (v1 Core Loop Ships)

[← Back to index](../TASK.md)

Status: **1 of 2 tasks complete.** T045 is the required gate before any Phase 10–13 work may begin (per §13 of the design doc).

- [x] **T044 — Playtest build polish & deploy configuration**
  - Doc references: §17 (build step 9)
  - Dependencies: T036, T037, T038, T039, T040, T041, T042, T043
  - File path hints: repo root (`vercel.json` or Netlify config, `package.json` build scripts)
  - Acceptance criteria: `npm run build` produces a deployable static bundle; a Vercel or Netlify config is committed; a manual playtest checklist (new game → trade → travel → bank → year-end → default → game over) is walked through and confirmed working end-to-end on a 360×740 viewport (browser devtools device emulation is acceptable evidence).
  - Mobile/desktop note: Verify specifically at 360×740 viewport before signing off, per §1's mobile-first mandate.

- [ ] **T045 — Re-run §11 bot harness against v1 as locked baseline**
  - Doc references: §17 (build step 10, first half), §11
  - Dependencies: T044, T028
  - File path hints: `/src/engine/harness/baseline.v1.json` (or similar snapshot output), `/src/engine/harness/botHarness.test.ts` (extended)
  - Acceptance criteria: Run the full-spec harness (1,000 seeds × 360 days ×3 bots) against the shipped v1 build and persist the resulting summary stats as a committed baseline snapshot file. This snapshot is the reference T068 will diff against after Phase 2 lands. All §11 health checks pass at this checkpoint. **No Phase 2 task may begin until this task is checked off** — this is the explicit gate from §13's "Phase 2… sequenced after the core loop ships and clears the bot-harness balance pass."
  - Mobile/desktop note: N/A — engine/tooling only, no UI.
