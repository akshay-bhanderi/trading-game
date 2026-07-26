/**
 * Year-end tax statement (T042) — shown automatically whenever
 * `runYearEnd` (tax.ts) appends a new `TaxRecord` to `state.taxHistory`
 * (App.tsx's `deriveOverlay` detects this via an acknowledged-count index,
 * not a length diff, so multiple year-ends from one multi-day travel jump
 * are shown one at a time rather than one being silently skipped).
 */

import type { TaxRecord } from '../../engine/types'

export default function YearEndScreen({ record, onDismiss }: { record: TaxRecord; onDismiss: () => void }) {
  const taxableBase = record.realizedProfit + record.depositInterestEarned

  return (
    <div className="year-end-screen">
      <h2>Year {record.fiscalYear} — Tax Statement</h2>

      <div className="row">
        <span>Realized trading profit</span>
        <strong>${record.realizedProfit.toFixed(2)}</strong>
      </div>
      <div className="row">
        <span>Deposit interest earned</span>
        <strong>${record.depositInterestEarned.toFixed(2)}</strong>
      </div>
      <div className="row">
        <span>Taxable base</span>
        <strong>${taxableBase.toFixed(2)}</strong>
      </div>
      <div className="row">
        <span>CA on file</span>
        <strong>{record.caTierActive === 'none' ? 'None (30% flat)' : record.caTierActive}</strong>
      </div>
      <div className="row">
        <span>Tax paid</span>
        <strong>${record.taxPaid.toFixed(2)}</strong>
      </div>
      {!!record.hotelLicenseFeesPaid && (
        <div className="row">
          <span>Hotel license fees</span>
          <strong>${record.hotelLicenseFeesPaid.toFixed(2)}</strong>
        </div>
      )}

      {record.forcedLoanTriggered && (
        <p className="muted">
          Cash and deposits couldn't cover the bill — the shortfall became a forced high-interest loan.
        </p>
      )}

      <button onClick={onDismiss}>Continue</button>
    </div>
  )
}
