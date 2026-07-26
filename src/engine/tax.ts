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
 * T031 addition — CA tiers (rate/profit-cap/above-cap formula)
 * ---------------------------------------------------------------------------
 * §10's CA tiers table (`CONFIG.tax.caTiers`, keyed by `CATier`) gives EVERY
 * tier — including `'none'` (annualFee 0, taxRate 0.3, profitCap null,
 * aboveCapTaxRate 0.3) — the same four fields, so `computeTaxOwed` below
 * reads `state.hiredCATierThisFiscalYear ?? 'none'` and applies ONE unified
 * formula for all four tiers rather than a special-cased flat-rate branch
 * for `'none'` plus a separate tiered branch for a hired CA: `profitCap ===
 * null` (true only for `'none'`) means no cap ever applies, so the formula
 * degenerates to exactly the old flat `taxableBase * noCaRate` in that case
 * — `CONFIG.tax.noCaRate` and `caTiers.none.taxRate` are kept numerically
 * identical (0.3) by construction, not read from two different places.
 * `hireCA` (ca.ts, T031) is the sole writer of
 * `state.hiredCATierThisFiscalYear`; this file is the sole READER, and also
 * the one that resets it back to `'none'` once used (§10: "hire for the
 * year... effective that fiscal year" — a one-year contract, not a standing
 * subscription — see ca.ts's own file header for the full rationale).
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
 *
 * ---------------------------------------------------------------------------
 * T057 addition (§15 Hotel Ownership) — hotel annual license fee billing
 * ---------------------------------------------------------------------------
 * §15: "Annual license fee bills at the same year-end cadence as CA fees and
 * warehouse maintenance." `runYearEnd` now ALSO deducts, in a SECOND
 * sequential pass immediately after the existing tax deduction (steps 3a/3b
 * above), the total annual license fee owed across every hotel the player
 * currently owns (`computeHotelLicenseFeeOwed`, /src/engine/hotel.ts) —
 * continuing to drain from whatever cash/deposits the tax deduction left
 * behind, using the exact same cash-first-then-deposits cascade.
 *
 * Two deliberate design choices, both documented judgment calls since
 * neither §15 nor TASK.md's T057 acceptance criteria specify them exactly:
 *
 *   1. SEQUENTIAL, not combined, deduction passes. Tax is fully resolved
 *      first (unchanged math, unchanged `TaxRecord.taxPaid` semantics), THEN
 *      the hotel fee is deducted from whatever remains. This keeps each
 *      obligation's own "how much was actually paid vs. shortfalled" cleanly
 *      separable (`TaxRecord` now carries `hotelLicenseFeesPaid` as a
 *      distinct field from `taxPaid` — see types.ts) rather than needing to
 *      prorate a single combined shortfall back across two conceptually
 *      different bills.
 *   2. The hotel-fee shortfall (if cash+deposits still can't cover it after
 *      tax already took its share) rolls into the SAME `state.taxDebt`
 *      bucket the tax shortfall uses, rather than a separate hotel-specific
 *      debt field. §15 gives hotel license fees no explicit "what happens if
 *      you can't pay" rule the way §9's Default flow or this file's own tax
 *      shortfall get one — but conceptually it's the exact same shape
 *      (forced obligation, cash/deposits insufficient, becomes an
 *      interest-accruing debt) and `taxDebt`'s own accrual/repayment
 *      machinery (`accrueTaxDebtInterest`/`repayTaxDebt` below) already
 *      exists and needs no changes to also carry this. `taxDebt` is
 *      effectively widened in meaning from "forced TAX-shortfall debt" to
 *      "forced GOVERNMENT-OBLIGATIONS-shortfall debt" (tax + hotel license
 *      fees) — documented here explicitly rather than silently. Building a
 *      whole parallel debt bucket (new field, new accrual function, new
 *      repayment function, all identical to the existing ones) for a single
 *      extra fee source would be pure duplication with no behavioral
 *      benefit.
 *
 * The Noob first-tax-year waiver (see above) does NOT extend to the hotel
 * license fee — §3's waiver text is specifically about "First tax year",
 * i.e. the 30%-of-profit tax bill, and §15 gives no indication hotel
 * ownership gets any equivalent grace period. A Noob player who owns a
 * hotel by their first year-end still owes its full license fee that year.
 */

import { CONFIG } from './config'
import { computeHotelLicenseFeeOwed } from './hotel'
import type { BankAccount, CATier, CityId, GameState, TaxRecord } from './types'

/**
 * Applies the active CA tier's rate/profit-cap/above-cap formula to a
 * (already floored-at-0) `taxableBase` — see file header for why one
 * formula covers all four tiers, including `'none'`.
 */
function computeTaxOwed(taxableBase: number, tier: CATier): number {
  const tierConfig = CONFIG.tax.caTiers[tier]

  if (tierConfig.profitCap === null || taxableBase <= tierConfig.profitCap) {
    return taxableBase * tierConfig.taxRate
  }

  return tierConfig.profitCap * tierConfig.taxRate + (taxableBase - tierConfig.profitCap) * tierConfig.aboveCapTaxRate
}

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
 *   2. Computes `taxOwed` via `computeTaxOwed` using whichever CA tier was
 *      hired for this fiscal year (`state.hiredCATierThisFiscalYear ??
 *      'none'`, T031/ca.ts) — UNLESS this is a Noob-difficulty game's
 *      first-ever year-end (`fiscalYear === 1`), in which case `taxOwed` is
 *      forced to `0` (§3 waiver — see file header).
 *   3. Deducts `taxOwed` from `state.cash` first, then from
 *      `state.bankAccounts[*].depositBalance` (iteration order =
 *      `Object.keys(state.bankAccounts)`, see file header) until covered or
 *      every source is drained to exactly `0`.
 *   4. Any remaining shortfall becomes (or tops up) `state.taxDebt` — see
 *      file header for why this is a dedicated field rather than a `Loan`.
 *   5. (T057) Runs the SAME cash-then-deposits deduction again, continuing
 *      from wherever step 3 left off, for the total hotel annual license fee
 *      owed across every owned hotel (`computeHotelLicenseFeeOwed`,
 *      hotel.ts) — any shortfall here ALSO tops up `state.taxDebt` (see file
 *      header's T057 addition for why the two obligations share one debt
 *      bucket).
 *   6. Appends a `TaxRecord` to `state.taxHistory`, with `taxPaid` and the
 *      new `hotelLicenseFeesPaid` field tracked separately even though both
 *      were deducted through the same cascade.
 *   7. Resets `realizedProfitThisFiscalYear`/`depositInterestThisFiscalYear`
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

  const caTierActive: CATier = state.hiredCATierThisFiscalYear ?? 'none'

  const isNoobFirstYearWaiver =
    state.difficulty === 'Noob' && fiscalYear === 1 && CONFIG.difficulty.Noob.firstTaxYearWaived

  const taxOwed = isNoobFirstYearWaiver ? 0 : computeTaxOwed(taxableBase, caTierActive)

  // Step 3a: deduct tax from cash first.
  let taxRemaining = taxOwed
  const taxCashPayment = Math.min(state.cash, taxRemaining)
  const cashAfterTax = state.cash - taxCashPayment
  taxRemaining -= taxCashPayment

  // Step 3b: deduct any remainder from deposits, city by city, in
  // `Object.keys` order (see file header).
  const bankAccountsAfterTax: Record<CityId, BankAccount> = { ...state.bankAccounts }
  if (taxRemaining > 0) {
    for (const cityId of Object.keys(state.bankAccounts)) {
      if (taxRemaining <= 0) break
      const account = state.bankAccounts[cityId]
      if (!account || account.depositBalance <= 0) continue

      const depositPayment = Math.min(account.depositBalance, taxRemaining)
      bankAccountsAfterTax[cityId] = { ...account, depositBalance: account.depositBalance - depositPayment }
      taxRemaining -= depositPayment
    }
  }

  const taxShortfall = taxRemaining
  const taxPaid = taxOwed - taxShortfall

  // ---------------------------------------------------------------------
  // T057: hotel annual license fee — a SECOND, sequential deduction pass
  // continuing from `cashAfterTax`/`bankAccountsAfterTax` (see file header).
  // ---------------------------------------------------------------------
  const hotelLicenseFeeOwed = computeHotelLicenseFeeOwed(state)

  let hotelFeeRemaining = hotelLicenseFeeOwed
  const hotelFeeCashPayment = Math.min(cashAfterTax, hotelFeeRemaining)
  const cashAfterHotelFee = cashAfterTax - hotelFeeCashPayment
  hotelFeeRemaining -= hotelFeeCashPayment

  const bankAccountsAfterHotelFee: Record<CityId, BankAccount> = { ...bankAccountsAfterTax }
  if (hotelFeeRemaining > 0) {
    for (const cityId of Object.keys(bankAccountsAfterTax)) {
      if (hotelFeeRemaining <= 0) break
      const account = bankAccountsAfterTax[cityId]
      if (!account || account.depositBalance <= 0) continue

      const depositPayment = Math.min(account.depositBalance, hotelFeeRemaining)
      bankAccountsAfterHotelFee[cityId] = { ...account, depositBalance: account.depositBalance - depositPayment }
      hotelFeeRemaining -= depositPayment
    }
  }

  const hotelFeeShortfall = hotelFeeRemaining
  const hotelLicenseFeesPaid = hotelLicenseFeeOwed - hotelFeeShortfall

  // Step 4/5: whatever's still unpaid across EITHER obligation becomes/
  // extends the forced debt (widened bucket — see file header's T057 note).
  const totalShortfall = taxShortfall + hotelFeeShortfall
  const forcedLoanTriggered = totalShortfall > 0

  let newTaxDebt = state.taxDebt ?? null
  if (forcedLoanTriggered) {
    newTaxDebt = {
      principal: (newTaxDebt?.principal ?? 0) + totalShortfall,
      accruedInterest: newTaxDebt?.accruedInterest ?? 0,
      startDay: newTaxDebt?.startDay ?? state.day,
    }
  }

  const record: TaxRecord = {
    fiscalYear,
    yearEndDay: state.day,
    realizedProfit,
    depositInterestEarned,
    taxPaid,
    caTierActive,
    forcedLoanTriggered,
    hotelLicenseFeesPaid,
  }

  return {
    ...state,
    cash: cashAfterHotelFee,
    bankAccounts: bankAccountsAfterHotelFee,
    taxDebt: newTaxDebt,
    taxHistory: [...state.taxHistory, record],
    realizedProfitThisFiscalYear: 0,
    depositInterestThisFiscalYear: 0,
    // T031: the CA engagement was for THIS fiscal year only (§10 "effective
    // that fiscal year") — reset so next year defaults back to no-CA unless
    // `hireCA` (ca.ts) is called again before the next year-end.
    hiredCATierThisFiscalYear: 'none',
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
