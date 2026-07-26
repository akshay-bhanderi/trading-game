/**
 * Bank screen (T040) — deposits, loan take/repay, CA hiring (Medium+ bank
 * cities only), and the mandatory 3-choice default-resolution prompt when
 * `game.awaitingDefaultDecision` is set (App.tsx force-opens this screen
 * whenever that's true, ahead of anything the player manually opened — see
 * App.tsx's `deriveOverlay`).
 */

import { useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { CITIES } from '../../engine/data/cities'
import { CONFIG } from '../../engine/config'
import { rankFactor } from '../../engine/bank/loans'
import { calcTotalDebt } from '../../engine/bank/default'
import { calcNetWorth } from '../../engine/netWorth'
import type { BankSize } from '../../engine/types'

const BANK_SIZE_RANK: Record<BankSize, number> = { Small: 0, Medium: 1, Large: 2, Huge: 3 }

export default function BankScreen() {
  const game = useGameStore((s) => s.game)
  const deposit = useGameStore((s) => s.deposit)
  const withdraw = useGameStore((s) => s.withdraw)
  const takeLoan = useGameStore((s) => s.takeLoan)
  const repayLoan = useGameStore((s) => s.repayLoan)
  const resolveDefault = useGameStore((s) => s.resolveDefault)
  const hireCA = useGameStore((s) => s.hireCA)

  const [depositAmount, setDepositAmount] = useState('')
  const [loanAmount, setLoanAmount] = useState('')

  if (!game) return null

  if (game.awaitingDefaultDecision) {
    const debt = calcTotalDebt(game)
    const netWorth = calcNetWorth(game)

    return (
      <div className="default-prompt">
        <h2>The bank is calling in your debt</h2>
        <p className="muted">
          {game.awaitingDefaultDecision.triggeredBy === 'overdueLoan'
            ? 'A loan is well past its term.'
            : `Your debt ($${debt.toFixed(0)}) has stayed over 2x your net worth ($${netWorth.toFixed(0)}) too long.`}{' '}
          Choose how to respond.
        </p>

        <div className="card">
          <strong>Surrender assets</strong>
          <p className="muted">Bank seizes deposits + cargo at 70% value. Run continues. Rank record −0.5.</p>
          <button className="secondary" onClick={() => resolveDefault('surrender')}>
            Surrender
          </button>
        </div>

        <div className="card">
          <strong>Restructure</strong>
          <p className="muted">
            Debt refinanced at 2x interest + a daily collector fee. Forced game-over if still over 2x net worth 15
            days from now. Rank record −0.3.
          </p>
          <button className="secondary" onClick={() => resolveDefault('restructure')}>
            Restructure
          </button>
        </div>

        <div className="card">
          <strong>Declare bankruptcy</strong>
          <p className="muted">Run ends now. Final score = peak net worth ever reached.</p>
          <button className="secondary" onClick={() => resolveDefault('bankruptcy')}>
            Declare Bankruptcy
          </button>
        </div>
      </div>
    )
  }

  const city = CITIES.find((c) => c.id === game.currentCity)
  const account = game.bankAccounts[game.currentCity]
  const isMediumPlus = city ? BANK_SIZE_RANK[city.bankSize] >= BANK_SIZE_RANK.Medium : false
  const maxLoan = city ? CONFIG.banking.loanBaseCaps[city.bankSize] * rankFactor(game.rankCache.value) : 0

  return (
    <div className="bank-screen">
      <div className="card">
        <h2>Deposits — {city?.name ?? game.currentCity}</h2>
        <div className="row">
          <span>Balance</span>
          <strong>${(account?.depositBalance ?? 0).toFixed(2)}</strong>
        </div>
        <div className="bank-amount-row">
          <input
            className="trade-qty-input"
            type="number"
            min={0}
            placeholder="Amount"
            value={depositAmount}
            onChange={(e) => setDepositAmount(e.target.value)}
          />
          <div className="bank-amount-row-buttons">
            <button
              onClick={() => {
                const amt = Number(depositAmount)
                if (amt > 0) deposit(game.currentCity, amt)
                setDepositAmount('')
              }}
            >
              Deposit
            </button>
            <button
              className="secondary"
              onClick={() => {
                const amt = Number(depositAmount)
                if (amt > 0) withdraw(game.currentCity, amt)
                setDepositAmount('')
              }}
            >
              Withdraw
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Loan</h2>
        {account?.loan ? (
          <>
            <div className="row muted">
              <span>Principal</span>
              <span>${account.loan.principal.toFixed(2)}</span>
            </div>
            <div className="row muted">
              <span>Accrued interest</span>
              <span>${account.loan.accruedInterest.toFixed(2)}</span>
            </div>
            <div className="bank-amount-row">
              <input
                className="trade-qty-input"
                type="number"
                min={0}
                placeholder="Amount"
                value={loanAmount}
                onChange={(e) => setLoanAmount(e.target.value)}
              />
              <div className="bank-amount-row-buttons">
                <button
                  onClick={() => {
                    const amt = Number(loanAmount)
                    if (amt > 0) repayLoan(game.currentCity, amt)
                    setLoanAmount('')
                  }}
                >
                  Repay
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <p className="muted">No active loan here. Max available: ${maxLoan.toFixed(0)}.</p>
            <div className="bank-amount-row">
              <input
                className="trade-qty-input"
                type="number"
                min={0}
                placeholder="Amount"
                value={loanAmount}
                onChange={(e) => setLoanAmount(e.target.value)}
              />
              <div className="bank-amount-row-buttons">
                <button
                  onClick={() => {
                    const amt = Number(loanAmount)
                    if (amt > 0) takeLoan(game.currentCity, amt)
                    setLoanAmount('')
                  }}
                >
                  Take Loan
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {isMediumPlus && (
        <div className="card">
          <h2>Hire an Accountant</h2>
          <p className="muted">
            {game.hiredCATierThisFiscalYear && game.hiredCATierThisFiscalYear !== 'none'
              ? `Currently hired: ${game.hiredCATierThisFiscalYear} (effective this fiscal year only)`
              : 'No CA hired this fiscal year — profit taxed at the flat 30% no-CA rate.'}
          </p>
          <div className="nav-grid">
            {(['junior', 'senior', 'elite'] as const).map((tier) => (
              <button key={tier} className="secondary" onClick={() => hireCA(tier)}>
                {tier} (${CONFIG.tax.caTiers[tier].annualFee.toLocaleString()})
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
