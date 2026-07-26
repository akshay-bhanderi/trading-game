/**
 * Bank loans — Trade Winds of Selvara.
 *
 * Design doc reference: §9 "Loans (city bank size × trader rank)" —
 *   "Max principal = baseCap(bankSize) × rankFactor(rank) ... Interest:
 *   Small 0.9%/day · Medium 0.7% · Large 0.55% · Huge 0.4% (× difficulty
 *   multiplier). Simple daily interest added to balance. One active loan
 *   per bank; up to 3 banks concurrently."
 *
 * Pure TypeScript, zero React imports (see /src/engine/README.md).
 *
 * ---------------------------------------------------------------------------
 * Convention: follows the same pure-function precedent established by
 * /src/engine/bank/deposits.ts's `deposit`/`withdraw`/`accrueDepositInterest`
 * (T022) — on success these return a NEW `GameState`; on rejection (any
 * validation failure) they return the identical `state` reference, unchanged,
 * with no throw and no mutation, so callers can detect rejection cheaply via
 * `result === state`.
 *
 * ---------------------------------------------------------------------------
 * v1 simplification: no cross-city banking (same as deposits.ts).
 * ---------------------------------------------------------------------------
 * `takeLoan`/`repayLoan` both ONLY succeed while `state.currentCity ===
 * cityId` — the player must be physically standing in the city whose bank
 * they want to transact with (§9's explicit call-out, reused verbatim from
 * T022's deposits.ts).
 *
 * ---------------------------------------------------------------------------
 * DESIGN DECISION — cached vs. freshly-recomputed rank for the loan cap
 * ---------------------------------------------------------------------------
 * The loan cap formula (`maxPrincipal = baseCap(bankSize) *
 * rankFactorBase^(rank-1)`) needs a rank number. This file deliberately reads
 * `state.rankCache.value` (the possibly-up-to-6-days-stale cached rank, per
 * §8 "recomputed weekly") rather than calling `computeRank(state)` fresh on
 * every loan request. Reasons:
 *   - Consistency with §8's own cadence: the bank's file on the player is
 *     only as current as the last weekly recompute everywhere else in the
 *     game (rank.ts's `maybeRecomputeRank`, wired into turnLoop.ts). Loans
 *     shouldn't be a special case that sees a truer, fresher number than any
 *     other rank-consuming system does.
 *   - `takeLoan` staying a simple, self-contained validation+mutation
 *     function is preferable to it silently forcing an off-schedule rank
 *     recompute as a side effect of a bank transaction — recomputation is
 *     `maybeRecomputeRank`'s job, driven by `advanceDay`, not a loan
 *     application's.
 *   - Thematically apt: the bank hasn't updated your file yet. A stale
 *     cached rank producing a cap that's a little behind the player's true
 *     current standing (in either direction) is an acceptable, even fitting,
 *     quirk — not a bug to route around.
 *
 * ---------------------------------------------------------------------------
 * DESIGN DECISION — simple interest (loans) vs. compound interest (deposits)
 * ---------------------------------------------------------------------------
 * §9 gives loans and deposits two DIFFERENTLY WORDED interest rules on
 * purpose: loans get "Simple daily interest added to balance"; deposits get
 * "Interest compounds daily" (see deposits.ts's `accrueDepositInterest`).
 * These are deliberately different formulas, not the same pattern reused
 * twice:
 *   - Deposits (compound): `newBalance = balance * (1 + rate)` — interest
 *     earns interest, growing the balance itself each day.
 *   - Loans (simple): `accruedInterest += principal * rate *
 *     difficultyMultiplier` — interest is computed ONLY off the fixed
 *     original `principal` every day and piles up in a SEPARATE
 *     `accruedInterest` bucket. `principal` itself never grows from interest
 *     accrual (contrast with compounding, where the base grows daily). This
 *     also gives `repayLoan` a natural two-part balance to pay down (see
 *     next section) that a single compounding balance wouldn't have.
 *
 * ---------------------------------------------------------------------------
 * DESIGN DECISION — repayment order: accruedInterest first, then principal
 * ---------------------------------------------------------------------------
 * `repayLoan` applies a repayment amount to `accruedInterest` FIRST, and only
 * once that reaches 0 does any remainder reduce `principal`. This is the
 * standard real-world debt-repayment convention (interest-first amortization)
 * and, practically, it's also the only ordering under which "the loan is
 * fully cleared" has one unambiguous meaning: both fields must independently
 * reach exactly 0.
 *
 * ---------------------------------------------------------------------------
 * DESIGN DECISION — what counts as "on-time" for the repaymentRecord bump
 * ---------------------------------------------------------------------------
 * §9/TASK.md T023: "on full on-time repayment, bumps `repaymentRecord` by
 * +0.1 (clamped)." A FULL repayment (both `accruedInterest` and `principal`
 * reach exactly 0 as a result of this call) is interpreted as "on time" when
 * it happens at or before the loan's term expires:
 * `state.day <= loan.startDay + loan.termDays`. If the loan is repaid in
 * full but AFTER its term has elapsed, the loan still clears (the debt is
 * gone either way — there is no reason to keep a fully-paid-off loan record
 * around), but `repaymentRecord` is NOT bumped, since the repayment wasn't
 * on time. This file does not concern itself with what happens to loans that
 * go entirely UNPAID past their term (the 15-days-overdue default trigger,
 * §9's default section) — that is explicitly T024's job
 * (/src/engine/bank/default.ts), a distinct and more severe case than "paid
 * late but eventually paid in full", which this file treats leniently (no
 * bump, no penalty — just no reward).
 *
 * A PARTIAL repayment (anything left owing afterward) never bumps
 * `repaymentRecord`, on-time or not — only a full clear does.
 */

import { CONFIG } from '../config'
import { CITIES } from '../data/cities'
import type { BankAccount, CityId, GameState, Loan } from '../types'

/** Clamps `value` into `[min, max]`. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * §9: `rankFactor(rank) = rankFactorBase ^ (rank - 1)` — rank 1 = 1x, each
 * rank up multiplies by `CONFIG.banking.rankFactorBase` (1.8), so rank 10 ≈
 * 198x. Exported for reuse (e.g. future UI showing "how big a loan could I
 * theoretically get" without exposing the underlying hidden rank itself).
 */
export function rankFactor(rank: number): number {
  return Math.pow(CONFIG.banking.rankFactorBase, rank - 1)
}

/**
 * Computes the maximum loan principal available at `cityId`'s bank for the
 * given hidden `rank`, per §9: `baseCap(bankSize) × rankFactor(rank)`.
 * Returns 0 if `cityId` doesn't resolve to a known city (defensive — should
 * never happen in practice, mirrors deposits.ts's `accrueDepositInterest`
 * skip-unknown-city convention).
 */
function maxLoanPrincipal(cityId: CityId, rank: number): number {
  const city = CITIES.find((c) => c.id === cityId)
  if (!city) return 0
  return CONFIG.banking.loanBaseCaps[city.bankSize] * rankFactor(rank)
}

/**
 * Counts how many DIFFERENT cities in `state.bankAccounts` currently carry
 * an active (non-null) loan.
 */
function countActiveLoanBanks(state: GameState): number {
  return Object.values(state.bankAccounts).filter((account) => account.loan !== null && account.loan !== undefined)
    .length
}

/**
 * Issues a new loan of `amount` at `cityId`'s bank.
 *
 * Validates:
 *   - `state.currentCity === cityId` (v1's no-cross-city-banking rule)
 *   - `amount > 0`
 *   - the city's bank does not already have an active loan (§9: "one active
 *     loan per bank")
 *   - if this WOULD be a brand-new bank relationship (the city's
 *     `BankAccount` has no active loan, which is always true given the
 *     check above), the player must not already have active loans at
 *     `CONFIG.banking.maxConcurrentBankLoans` (3) OTHER banks (§9: "up to 3
 *     banks concurrently")
 *   - `amount <= maxLoanPrincipal(cityId, state.rankCache.value)` — see the
 *     file header's cached-vs-fresh-rank design decision
 *
 * On success: ADDS `amount` to `state.cash` (a loan is borrowed cash paid
 * out to the player) and creates/updates `state.bankAccounts[cityId].loan =
 * { principal: amount, accruedInterest: 0, startDay: state.day, termDays:
 * CONFIG.banking.loanTermDays }` — creating the `BankAccount` entry (with
 * `depositBalance: 0`) if this is the player's first-ever interaction with
 * this city's bank, matching T022's deposits.ts pattern.
 *
 * Rejected (returns the identical `state` reference, unchanged) when any
 * validation fails.
 */
export function takeLoan(state: GameState, cityId: CityId, amount: number): GameState {
  if (state.currentCity !== cityId) return state
  if (amount <= 0) return state

  const existing = state.bankAccounts[cityId]
  if (existing?.loan) return state

  // A brand-new bank relationship (this city has no active loan, per the
  // check above) — only relevant when the player isn't already banked here.
  if (countActiveLoanBanks(state) >= CONFIG.banking.maxConcurrentBankLoans) return state

  const cap = maxLoanPrincipal(cityId, state.rankCache.value)
  if (amount > cap) return state

  const loan: Loan = {
    principal: amount,
    accruedInterest: 0,
    startDay: state.day,
    termDays: CONFIG.banking.loanTermDays,
  }

  const account: BankAccount = existing
    ? { ...existing, loan }
    : { cityId, depositBalance: 0, loan }

  return {
    ...state,
    cash: state.cash + amount,
    bankAccounts: { ...state.bankAccounts, [cityId]: account },
  }
}

/**
 * Accrues one day of SIMPLE daily interest for EVERY city in
 * `state.bankAccounts` that has an active loan, at that city's bank-size
 * daily rate (`CONFIG.banking.loanInterestDailyRates`) times the current
 * difficulty's `loanInterestMultiplier` (§3, reused verbatim — not
 * redefined here).
 *
 * `interestToday = loan.principal * dailyRate * difficultyMultiplier`, added
 * to `loan.accruedInterest` — NOT to `principal` (simple interest; see the
 * file header's simple-vs-compound design decision). `rate` is looked up via
 * `CITIES.find(c => c.id === cityId)?.bankSize`; unresolvable city ids are
 * defensively skipped rather than throwing (mirrors deposits.ts).
 *
 * Intended to be called ONCE PER DAY-TICK, as a sibling to
 * `accrueDepositInterest` — see /src/engine/turnLoop.ts's `advanceDay`.
 *
 * Pure function: returns a NEW `GameState` on any change; returns the
 * identical `state` reference, unchanged, when there is nothing to accrue
 * (no accounts, or no account has an active loan).
 */
export function accrueLoanInterest(state: GameState): GameState {
  let changed = false
  const newAccounts: Record<CityId, BankAccount> = { ...state.bankAccounts }
  const difficultyMultiplier = CONFIG.difficulty[state.difficulty].loanInterestMultiplier

  for (const cityId of Object.keys(state.bankAccounts)) {
    const account = state.bankAccounts[cityId]
    if (!account?.loan) continue

    const city = CITIES.find((c) => c.id === cityId)
    if (!city) continue // defensive — should never happen, see doc comment above

    const dailyRate = CONFIG.banking.loanInterestDailyRates[city.bankSize]
    const interestToday = account.loan.principal * dailyRate * difficultyMultiplier

    newAccounts[cityId] = {
      ...account,
      loan: { ...account.loan, accruedInterest: account.loan.accruedInterest + interestToday },
    }
    changed = true
  }

  if (!changed) return state

  return { ...state, bankAccounts: newAccounts }
}

/**
 * Repays `amount` of cash toward `cityId`'s active loan.
 *
 * Validates:
 *   - `state.currentCity === cityId` (v1's no-cross-city-banking rule)
 *   - an active loan exists at that bank
 *   - `amount > 0`
 *   - `amount <= state.cash`
 *
 * Applies `amount` first to `accruedInterest`, then any remainder to
 * `principal` (see the file header's repayment-order design decision).
 * Deducts `amount` from `state.cash` in full regardless of whether it
 * overpays the loan — `amount` is validated against `state.cash`, not
 * against the outstanding debt, so callers should pass at most the
 * outstanding balance; any excess is simply not applied to anything.
 *
 * Note: to avoid silently discarding a caller's overpayment as pure waste,
 * the amount actually applied is capped at the outstanding debt
 * (`accruedInterest + principal`) and only that lesser amount is deducted
 * from cash — a repayment can never charge MORE than the loan actually
 * owed.
 *
 * On FULL repayment (both `accruedInterest` and `principal` reach exactly 0
 * afterward): clears `loan` back to `null` on that `BankAccount`, and, IF
 * this happened on or before the loan's term expired
 * (`state.day <= loan.startDay + loan.termDays` — see the file header's
 * "on-time" design decision), bumps `repaymentRecord` by `+0.1`, clamped to
 * `CONFIG.rank.repaymentRecordClamp` ([-2, +2]). A late-but-full repayment
 * still clears the loan but does NOT bump `repaymentRecord`. A PARTIAL
 * repayment never bumps `repaymentRecord`.
 *
 * Rejected (returns the identical `state` reference, unchanged) when any
 * validation fails.
 */
export function repayLoan(state: GameState, cityId: CityId, amount: number): GameState {
  if (state.currentCity !== cityId) return state
  if (amount <= 0) return state
  if (amount > state.cash) return state

  const existing = state.bankAccounts[cityId]
  if (!existing || !existing.loan) return state
  const loan = existing.loan

  const outstanding = loan.accruedInterest + loan.principal
  const applied = Math.min(amount, outstanding)

  const interestPaydown = Math.min(applied, loan.accruedInterest)
  const remainderAfterInterest = applied - interestPaydown
  const principalPaydown = Math.min(remainderAfterInterest, loan.principal)

  const newAccruedInterest = loan.accruedInterest - interestPaydown
  const newPrincipal = loan.principal - principalPaydown
  const fullyRepaid = newAccruedInterest === 0 && newPrincipal === 0

  const account: BankAccount = {
    ...existing,
    loan: fullyRepaid ? null : { ...loan, accruedInterest: newAccruedInterest, principal: newPrincipal },
  }

  const onTime = state.day <= loan.startDay + loan.termDays
  const shouldBumpRepaymentRecord = fullyRepaid && onTime

  return {
    ...state,
    cash: state.cash - applied,
    bankAccounts: { ...state.bankAccounts, [cityId]: account },
    repaymentRecord: shouldBumpRepaymentRecord
      ? clamp(state.repaymentRecord + 0.1, CONFIG.rank.repaymentRecordClamp.min, CONFIG.rank.repaymentRecordClamp.max)
      : state.repaymentRecord,
  }
}
