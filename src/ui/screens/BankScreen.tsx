/**
 * Bank screen (T040) — deposits, loan take/repay, and the mandatory
 * 3-choice default-resolution prompt when `game.awaitingDefaultDecision` is
 * set (App.tsx force-opens this screen whenever that's true, ahead of
 * anything the player manually opened — see App.tsx's `deriveOverlay`).
 *
 * ---------------------------------------------------------------------------
 * 2026-08 redesign (user-requested)
 * ---------------------------------------------------------------------------
 *   - Deposits are now a single pooled balance (`game.deposit`), reachable
 *     from any city — see /src/engine/bank/deposits.ts's file header for the
 *     full rationale. No more "Deposits — {city name}" framing.
 *   - Deposit/Withdraw and Take Loan/Repay amount entry now use the same
 *     stepper + range-slider + Max control as the Market's TradePanel
 *     (`AmountStepper` below), instead of a bare number input.
 *   - CA hiring moved OUT of this screen entirely, into its own HUD tab
 *     beside Aviation (see CAScreen.tsx) — this screen no longer renders it.
 */

import { useEffect, useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { CITIES } from '../../engine/data/cities'
import { CONFIG } from '../../engine/config'
import { rankFactor } from '../../engine/bank/loans'
import { calcTotalDebt } from '../../engine/bank/default'
import { calcNetWorth } from '../../engine/netWorth'

/**
 * Shared amount-entry control (stepper + slider + Max), mirroring
 * TradePanel.tsx's quantity control exactly — reused here for deposit/
 * withdraw/take-loan/repay so every money-amount input in the game looks and
 * behaves the same way. `max <= 0` disables everything and shows `emptyText`
 * instead (matching TradePanel's own "nothing to buy/sell" treatment).
 */
function AmountStepper({
  max,
  onConfirm,
  confirmLabel,
  confirmClassName,
  emptyText,
}: {
  max: number
  onConfirm: (amount: number) => void
  confirmLabel: (amount: number) => string
  confirmClassName?: string
  emptyText: string
}) {
  const [amount, setAmount] = useState(0)

  useEffect(() => {
    setAmount((a) => Math.min(a, max))
  }, [max])

  function setClamped(next: number) {
    setAmount(Math.max(0, Math.min(max, Math.round(next))))
  }

  if (max < 1) {
    return <p className="muted">{emptyText}</p>
  }

  const canConfirm = amount > 0 && amount <= max

  return (
    <>
      <div className="trade-qty-row">
        <button className="secondary trade-qty-btn" disabled={amount <= 0} onClick={() => setClamped(amount - 1)}>
          −
        </button>
        <input
          className="trade-qty-input"
          type="number"
          inputMode="numeric"
          min={0}
          max={max}
          value={amount}
          onChange={(e) => setClamped(Number(e.target.value))}
        />
        <button className="secondary trade-qty-btn" disabled={amount >= max} onClick={() => setClamped(amount + 1)}>
          +
        </button>
        <button className="secondary" onClick={() => setClamped(max)}>
          Max
        </button>
      </div>

      <input
        className="trade-qty-slider"
        type="range"
        min={0}
        max={max}
        value={amount}
        onChange={(e) => setClamped(Number(e.target.value))}
      />

      <button
        className={confirmClassName ?? 'trade-confirm'}
        disabled={!canConfirm}
        onClick={() => {
          onConfirm(amount)
          setAmount(0)
        }}
      >
        {confirmLabel(amount)}
      </button>
    </>
  )
}

type DepositMode = 'deposit' | 'withdraw'

export default function BankScreen() {
  const game = useGameStore((s) => s.game)
  const deposit = useGameStore((s) => s.deposit)
  const withdraw = useGameStore((s) => s.withdraw)
  const takeLoan = useGameStore((s) => s.takeLoan)
  const repayLoan = useGameStore((s) => s.repayLoan)
  const resolveDefault = useGameStore((s) => s.resolveDefault)

  const [depositMode, setDepositMode] = useState<DepositMode>('deposit')

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
  const depositBalance = game.deposit ?? 0
  const maxLoan = city ? CONFIG.banking.loanBaseCaps[city.bankSize] * rankFactor(game.rankCache.value) : 0
  const outstanding = account?.loan ? account.loan.principal + account.loan.accruedInterest : 0

  return (
    <div className="bank-screen">
      <div className="card">
        <h2>Bank Balance</h2>
        <div className="row">
          <span>Balance (any city)</span>
          <strong>${depositBalance.toFixed(2)}</strong>
        </div>

        <div className="trade-tabs">
          <button
            className={depositMode === 'deposit' ? 'trade-tab trade-tab--active' : 'trade-tab secondary'}
            disabled={game.cash < 1}
            onClick={() => setDepositMode('deposit')}
          >
            Deposit
          </button>
          <button
            className={
              depositMode === 'withdraw' ? 'trade-tab trade-tab--active trade-tab--sell' : 'trade-tab secondary'
            }
            disabled={depositBalance < 1}
            onClick={() => setDepositMode('withdraw')}
          >
            Withdraw
          </button>
        </div>

        {depositMode === 'deposit' ? (
          <AmountStepper
            max={Math.floor(game.cash)}
            onConfirm={(amt) => deposit(amt)}
            confirmLabel={(amt) => `Deposit $${amt}`}
            emptyText="No cash on hand to deposit."
          />
        ) : (
          <AmountStepper
            max={Math.floor(depositBalance)}
            onConfirm={(amt) => withdraw(amt)}
            confirmLabel={(amt) => `Withdraw $${amt}`}
            confirmClassName="trade-confirm trade-confirm--sell"
            emptyText="Nothing deposited to withdraw."
          />
        )}
      </div>

      <div className="card">
        <h2>Loan — {city?.name ?? game.currentCity}</h2>
        <p className="muted">Loans stay tied to this city's bank — you must be here to take or repay one.</p>

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

            <AmountStepper
              max={Math.min(Math.floor(game.cash), Math.ceil(outstanding))}
              onConfirm={(amt) => repayLoan(game.currentCity, Math.min(amt, outstanding))}
              confirmLabel={(amt) => `Repay $${amt}`}
              emptyText="No cash on hand to repay with."
            />

            <button
              className="secondary"
              disabled={game.cash < outstanding}
              onClick={() => repayLoan(game.currentCity, outstanding)}
            >
              Repay Full (${outstanding.toFixed(2)})
            </button>
          </>
        ) : (
          <>
            <p className="muted">No active loan here. Max available: ${maxLoan.toFixed(0)}.</p>
            <AmountStepper
              max={Math.floor(maxLoan)}
              onConfirm={(amt) => takeLoan(game.currentCity, amt)}
              confirmLabel={(amt) => `Take Loan $${amt}`}
              emptyText="No loan available at this bank."
            />
          </>
        )}
      </div>
    </div>
  )
}
