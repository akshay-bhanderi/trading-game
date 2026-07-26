# Phase 3 — Rank & Banking

[← Back to index](../TASK.md)

Status: **Complete** (all tasks below are shipped).

- [x] **T021 — Hidden trader rank engine**
  - Doc references: §8
  - Dependencies: T002, T009, T012, T015
  - File path hints: `/src/engine/rank.ts`
  - Acceptance criteria: `computeRank(state)` implements the exact formula (0.5×log10(netWorth+1) + 0.3×log10(cumulativeTradeVolume+1) + 1.5×repaymentRecord[-2,+2] + 0.2×log10(daysSurvived+1)), clamps floor to [1,10], weights read from config. Recomputation is wired to occur every 7 days via the turn loop (T015 hook or an explicit `maybeRecomputeRank(state)` called from `advanceDay`). Rank value is never exposed by any exported "display" helper (acceptance check: no function in this file formats rank for direct UI display — that's a deliberate design constraint, per §8, not an oversight). Unit test verifies the formula against hand-computed example inputs.
  - Mobile/desktop note: N/A — engine only, no UI.

- [x] **T022 — Bank deposits (per-city, compounding interest)**
  - Doc references: §9 (Deposits)
  - Dependencies: T002, T003, T005
  - File path hints: `/src/engine/bank/deposits.ts`
  - Acceptance criteria: `deposit(state, cityId, amount)` and `withdraw(state, cityId, amount)` only succeed while `state.currentCity === cityId` (v1's explicit simplification — deposits/loans live at the specific city's bank, no cross-city routing). Daily compounding interest rates by bank size (Small 0.10%, Medium 0.14%, Large 0.18%, Huge/Novara 0.25% — Large/Huge/Novara unreachable in v1 scope per §13, implement generically anyway) accrue via a `accrueDepositInterest(state)` hook intended to be called once per day-tick. Unit test covers multi-day compounding matches a hand-computed value within floating-point tolerance.
  - Mobile/desktop note: N/A — engine only, no UI.

- [x] **T023 — Bank loans (issuance, rank-scaled cap, interest, repayment)**
  - Doc references: §9 (Loans)
  - Dependencies: T021, T022, T003
  - File path hints: `/src/engine/bank/loans.ts`
  - Acceptance criteria: `takeLoan(state, cityId, amount)` computes max principal as `baseCap(bankSize) × rankFactor(rank)` (rankFactor = 1.8^(rank-1)) and rejects amounts above it. Enforces one active loan per bank and a max of 3 concurrent banks with active loans. Daily simple interest accrues by bank size (0.9/0.7/0.55/0.4%) × difficulty's loan-interest multiplier (§3). `repayLoan(state, cityId, amount)` reduces principal+accrued interest and, on full on-time repayment, bumps `repaymentRecord` by +0.1 (clamped). Unit tests cover cap rejection at low rank, interest accrual over N days, and the repayment-record bump.
  - Mobile/desktop note: N/A — engine only, no UI.

- [x] **T024 — Default flow (three player-choice branches)**
  - Doc references: §9 (Default)
  - Dependencies: T023, T009
  - File path hints: `/src/engine/bank/default.ts`
  - Acceptance criteria: `checkDefaultTrigger(state)` detects (a) a loan 15 days past its 60-day term, or (b) total debt > 2× net worth for 7 consecutive days, and flags the game state as "awaiting default decision" (never auto-resolves — must be surfaced for a player choice, later wired to UI in T040/T043). `resolveDefault(state, choice)` implements: Surrender (seize deposits+cargo at 70% value, repaymentRecord −0.5, run continues), Restructure (2× interest + 0.5%/day collector fee, repaymentRecord −0.3, forced game-over if still >2× net worth after 15 more days — implement as a re-check hook), Bankruptcy (run ends, final score = peakNetWorth). Unit tests cover trigger detection for both conditions and each of the three resolution branches' state mutations.
  - Mobile/desktop note: N/A — engine only, no UI.
