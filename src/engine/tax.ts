/**
 * Tax engine — Trade Winds of Selvara.
 *
 * Design doc reference: §10 "Tax & CA System" —
 *   "1 game year = 90 days ... Year-end statement appears on days 90, 180,
 *   270... Taxable base = realized profit for the year (sum of sell
 *   proceeds - matched buy costs, FIFO) + deposit interest earned.
 *   Unrealized cargo gains untaxed. No CA: 30% of taxable profit. Tax is
 *   auto-deducted at year end; if cash + deposits can't cover it, the
 *   shortfall becomes a forced Huge-bank loan at penalty rate 1.2%/day."
 *
 * Pure TypeScript, zero React imports (see /src/engine/README.md).
 *
 * ---------------------------------------------------------------------------
 * Where the taxable-base inputs come from (T030 additions elsewhere)
 * ---------------------------------------------------------------------------
 * Neither FIFO realized profit nor deposit interest earned was previously
 * tracked anywhere in `GameState` — `sell()` (/src/engine/actions/trade.ts)
 * only maintained the FIFO lot ledger itself (cost basis is gone once a lot
 * is consumed), and `accrueDepositInterest`
 * (/src/engine/bank/deposits.ts) only compounded `depositBalance` in place.
 * Both files were extended (purely additively — no change to their existing
 * validation/rejection behavior or core cash/cargo/balance math) to also
 * accumulate onto two new optional `GameState` fields as it happens:
 *   - `state.realizedProfitThisFiscalYear` — incremented by `sell()` on
 *     every successful sale.
 *   - `state.depositInterestThisFiscalYear` — incremented by
 *     `accrueDepositInterest()` every time it runs.
 * See each file's own updated doc comments, and types.ts's field docs, for
 * the full rationale. This file is the sole READER (and resetter) of both.
 *
 * ---------------------------------------------------------------------------
 * `runYearEnd` — when it's called, and its own defensive check
 * ---------------------------------------------------------------------------
 * The CALLER decides when to invoke `runYearEnd` (per the task brief) —
 * `turnLoop.ts`'s `advanceDay` calls it only when `newDay %
 * CONFIG.tax.yearLengthDays === 0` (see that file's own T030 wiring
 * comment), AFTER every other daily accrual step (deposit/loan interest,
 * default checks, tax-debt interest), so the fiscal year's numbers are
 * fully settled before tax is computed. `runYearEnd` ALSO defensively
 * re-checks `state.day % CONFIG.tax.yearLengthDays === 0` itself and no-ops
 * (returns `state` unchanged) otherwise — this makes the function safe to
 * call directly from a unit test on a known year-end day without needing to
 * drive the whole turn loop there, and harmless (a no-op) if some future
 * caller ever calls it on a non-year-end day by mistake.
 *
 * ---------------------------------------------------------------------------
 * Fiscal year numbering
 * ---------------------------------------------------------------------------
 * `fiscalYear = state.day / CONFIG.tax.yearLengthDays` — since this only
 * ever runs when `state.day` is an exact multiple of `yearLengthDays` (90),
 * this is always a whole number: day 90 -> year 1, day 180 -> year 2, day
 * 270 -> year 3, etc. Matches `TaxRecord.fiscalYear`'s doc comment in
 * types.ts ("year 1 = days 1-90, year 2 = days 91-180...").
 *
 * ---------------------------------------------------------------------------
 * T031 forward reference — CA tiers not implemented yet
 * ---------------------------------------------------------------------------
 * §10 describes CA hiring (Junior/Senior/Elite) changing both the tax rate
 * and adding a profit-cap/above-cap split. T031 (not built yet) owns that.
 * For T030, tax is ALWAYS computed at the flat `CONFIG.tax.noCaRate` (30%)
 * regardless of any future CA state — `TaxRecord.caTierActive` is always
 * recorded as `'none'` here. T031 is expected to extend `runYearEnd` (or
 * wrap it) to look up an active CA tier and use its rate/cap instead.
 *
 * ---------------------------------------------------------------------------
 * Deduction order: cash, then deposits (deterministic iteration order),
 * then forced loan on remaining shortfall
 * ---------------------------------------------------------------------------
 * Per §10: "Tax is auto-deducted at year end; if cash + deposits can't
 * cover it, the shortfall becomes a forced ... loan". `runYearEnd` deducts
 * from `state.cash` first, then walks `Object.keys(state.bankAccounts)` (JS
 * object key insertion order — not sorted by any city property; this is a
 * simple, deterministic-enough choice per the task brief's "doesn't need to
 * be sophisticated") draining each account's `depositBalance` until the
 * bill is covered or every account is drained to `0`. Neither cash nor any
 * deposit balance is ever driven negative — at most fully drained to `0`.
 * Any bill remaining after that becomes (or tops up) `state.taxDebt`.
 *
 * ---------------------------------------------------------------------------
 * Tax-debt representation: a separate `GameState.taxDebt` field, NOT a
 * `Loan`/`BankAccount`
 * ---------------------------------------------------------------------------
 * §13 notes v1 has no reachable Huge-bank city, yet §10's forced-loan
 * shortfall rule must still apply "in full" using the Huge rate constant
 * generically. A `Loan` (per §9's `BankAccount` shape) is always attached
 * to a specific city's bank via `bankAccounts[cityId]` — there is no city
 * this debt could sensibly be keyed under (it isn't "Huge-bank's loan to
 * you", it's the tax authority's). So `taxDebt` lives as its own top-level
 * `GameState` field: `{ principal, accruedInterest, startDay } | null`. It
 * still conceptually accrues the same way a `Loan` does — simple daily
 * interest on the fixed `principal`, via the sibling `accrueTaxDebtInterest`
 * function below (mirroring `accrueLoanInterest`,
 * /src/engine/bank/loans.ts), wired into `advanceDay` unconditionally every
 * day (like the other daily bank accruals), so it keeps growing exactly
 * like a real overdue loan would, even outside a year-end tick.
 *
 * §10/TASK.md do not specify a repayment path for this debt, which would
 * otherwise make it permanent and undischargeable — almost certainly an
 * oversight rather than intent (every other debt in the game, including
 * defaulted loans via §9's Restructure branch, has SOME resolution path).
 * `repayTaxDebt(state, amount)` is added below as a reasonable, in-scope
 * fix, mirroring `repayLoan`'s interest-first pay-down logic exactly. It
 * does NOT touch `repaymentRecord` (§8's rank input) — this debt was never
 * a `Loan` participating in that system's on-time/default bookkeeping in
 * the first place, and §10 gives no indication it should feed the trader
 * rank formula.
 *
 * ---------------------------------------------------------------------------
 * Negative taxable base (a losing year): clamped to $0 tax, never a refund
 * ---------------------------------------------------------------------------
 * §10 doesn't address a year where realized losses outweigh deposit
 * interest (a negative taxable base). This file clamps the taxable base to
 * a minimum of `0` before applying the rate, so a losing year always owes
 * exactly `$0` tax rather than producing a negative "tax bill" (i.e. an
 * implied refund) — the doc gives no indication refunds exist, and a
 * negative deduction would need to ADD cash, which is a much larger design
 * question than this task's scope.
 *
 * ---------------------------------------------------------------------------
 * Noob's first-tax-year waiver
 * ---------------------------------------------------------------------------
 * §3: "First tax year — waived" for Noob only
 * (`CONFIG.difficulty.Noob.firstTaxYearWaived`). On a Noob-difficulty game's
 * FIRST year-end (`fiscalYear === 1`) only, `runYearEnd` skips the tax
 * deduction entirely (`taxOwed` forced to `0`) but still records a
 * `TaxRecord` (with `taxPaid: 0`, `forcedLoanTriggered: false`) for history
 * consistency, and still resets the fiscal-year accumulators — the waiver
 * only forgives the BILL, not the bookkeeping. Every later year-end
 * (`fiscalYear >= 2`), even on Noob, taxes normally.
 */

import { CONFIG } from './config'
import type { BankAccount, CityId, GameState, TaxRecord } from './types'

/**
 * Runs the year-end tax statement for the fiscal year that just elapsed.
 *
 * Defensively no-ops (returns `state` unchanged) unless `state.day` is an
 * exact multiple of `CONFIG.tax.yearLengthDays` (90) — see file header.
 *
 * On a real year-end day:
 *   1. Computes `taxableBase = max(0, realizedProfitThisFiscalYear +
 *      depositInterestThisFiscalYear)` (unrealized cargo gains excluded per
 *      §10 — this function never touches `state.cargo`/`priceStates`).
 *   2. Computes `taxOwed = taxableBase * CONFIG.tax.noCaRate` — UNLESS this
 *      is a Noob-difficulty game's first-ever year-end
 *      (`fiscalYear === 1`), in which case `taxOwed` is forced to `0` (§3
 *      waiver — see file header).
 *   3. Deducts `taxOwed` from `state.cash` first, then from
 *      `state.bankAccounts[*].depositBalance` (iteration order =
 *      `Object.keys(state.bankAccounts)`, see file header) until covered or
 *      every source is drained to exactly `0`.
 *   4. Any remaining shortfall becomes (or tops up) `state.taxDebt` — see
 *      file header for why this is a dedicated field rather than a `Loan`.
 *   5. Appends a `TaxRecord` to `state.taxHistory`.
 *   6. Resets `realizedProfitThisFiscalYear`/`depositInterestThisFiscalYear`
 *      to `0` for the new fiscal year, regardless of whether tax was
 *      actually charged.
 *
 * Pure function: returns a NEW `GameState`; never mutates its argument.
 */
export function runYearEnd(state: GameState): GameState {
  if (state.day % CONFIG.tax.yearLengthDays !== 0) return state

  const fiscalYear = state.day / CONFIG.tax.yearLengthDays

  const realizedProfit = state.realizedProfitThisFiscalYear ?? 0
  const depositInterestEarned = state.depositInterestThisFiscalYear ?? 0
  const taxableBase = Math.max(0, realizedProfit + depositInterestEarned)

  const isNoobFirstYearWaiver =
    state.difficulty === 'Noob' && fiscalYear === 1 && CONFIG.difficulty.Noob.firstTaxYearWaived

  const taxOwed = isNoobFirstYearWaiver ? 0 : taxableBase * CONFIG.tax.noCaRate

  // Step 3a: deduct from cash first.
  let remaining = taxOwed
  const cashPayment = Math.min(state.cash, remaining)
  const newCash = state.cash - cashPayment
  remaining -= cashPayment

  // Step 3b: deduct any remainder from deposits, city by city, in
  // `Object.keys` order (see file header).
  const newBankAccounts: Record<CityId, BankAccount> = { ...state.bankAccounts }
  if (remaining > 0) {
    for (const cityId of Object.keys(state.bankAccounts)) {
      if (remaining <= 0) break
      const account = state.bankAccounts[cityId]
      if (!account || account.depositBalance <= 0) continue

      const depositPayment = Math.min(account.depositBalance, remaining)
      newBankAccounts[cityId] = { ...account, depositBalance: account.depositBalance - depositPayment }
      remaining -= depositPayment
    }
  }

  // Step 4: whatever's still unpaid becomes/extends the forced tax debt.
  const shortfall = remaining
  const forcedLoanTriggered = shortfall > 0

  let newTaxDebt = state.taxDebt ?? null
  if (forcedLoanTriggered) {
    newTaxDebt = {
      principal: (newTaxDebt?.principal ?? 0) + shortfall,
      accruedInterest: newTaxDebt?.accruedInterest ?? 0,
      startDay: newTaxDebt?.startDay ?? state.day,
    }
  }

  const taxPaid = taxOwed - shortfall

  const record: TaxRecord = {
    fiscalYear,
    yearEndDay: state.day,
    realizedProfit,
    depositInterestEarned,
    taxPaid,
    caTierActive: 'none', // T031 will extend this to reflect a hired CA tier.
    forcedLoanTriggered,
  }

  return {
    ...state,
    cash: newCash,
    bankAccounts: newBankAccounts,
    taxDebt: newTaxDebt,
    taxHistory: [...state.taxHistory, record],
    realizedProfitThisFiscalYear: 0,
    depositInterestThisFiscalYear: 0,
  }
}

/**
 * Accrues one day of SIMPLE daily interest on `state.taxDebt.principal`, at
 * `CONFIG.tax.forcedLoanPenaltyDailyRate` (1.2%/day) — mirrors
 * `accrueLoanInterest`'s (/src/engine/bank/loans.ts) simple-interest,
 * separate-`accruedInterest`-bucket pattern exactly: `principal` itself
 * never grows from interest accrual.
 *
 * Intended to be called ONCE PER DAY-TICK, unconditionally (like the other
 * daily bank accruals) — see /src/engine/turnLoop.ts's `advanceDay`.
 *
 * Pure function: returns a NEW `GameState` when `state.taxDebt` is non-null;
 * returns the identical `state` reference, unchanged, when there is no
 * outstanding tax debt to accrue interest on.
 */
export function accrueTaxDebtInterest(state: GameState): GameState {
  if (!state.taxDebt) return state

  const interestToday = state.taxDebt.principal * CONFIG.tax.forcedLoanPenaltyDailyRate

  return {
    ...state,
    taxDebt: { ...state.taxDebt, accruedInterest: state.taxDebt.accruedInterest + interestToday },
  }
}

/**
 * Repays `amount` of cash toward the outstanding `state.taxDebt`. See file
 * header for why this function exists (§10 gives the forced tax-shortfall
 * debt no explicit repayment path, which would otherwise make it
 * permanent/undischargeable) and why it mirrors `repayLoan`
 * (/src/engine/bank/loans.ts) so closely.
 *
 * Validates:
 *   - an outstanding `state.taxDebt` exists
 *   - `amount > 0`
 *   - `amount <= state.cash`
 *
 * Applies `amount` first to `accruedInterest`, then any remainder to
 * `principal` (same interest-first order as `repayLoan`). The amount
 * actually applied is capped at the outstanding debt
 * (`accruedInterest + principal`) — a repayment can never charge MORE than
 * the debt actually owed; only that lesser amount is deducted from cash.
 *
 * On full repayment (both `accruedInterest` and `principal` reach exactly
 * `0`), `state.taxDebt` is cleared back to `null`. Unlike `repayLoan`, this
 * does NOT touch `state.repaymentRecord` — this debt was never a `Loan`
 * participating in that on-time/default bookkeeping system (see file
 * header).
 *
 * Rejected (returns the identical `state` reference, unchanged) when any
 * validation fails.
 */
export function repayTaxDebt(state: GameState, amount: number): GameState {
  if (!state.taxDebt) return state
  if (amount <= 0) return state
  if (amount > state.cash) return state

  const debt = state.taxDebt
  const outstanding = debt.accruedInterest + debt.principal
  const applied = Math.min(amount, outstanding)

  const interestPaydown = Math.min(applied, debt.accruedInterest)
  const remainderAfterInterest = applied - interestPaydown
  const principalPaydown = Math.min(remainderAfterInterest, debt.principal)

  const newAccruedInterest = debt.accruedInterest - interestPaydown
  const newPrincipal = debt.principal - principalPaydown
  const fullyRepaid = newAccruedInterest === 0 && newPrincipal === 0

  return {
    ...state,
    cash: state.cash - applied,
    taxDebt: fullyRepaid ? null : { ...debt, accruedInterest: newAccruedInterest, principal: newPrincipal },
  }
}
