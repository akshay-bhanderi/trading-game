/**
 * Buy/sell detail panel — shown in place of the Market list once a commodity
 * row is tapped (user-requested redesign: the old always-visible +1/+10/Max
 * buy AND sell steppers on every single row were too much friction/clutter
 * at once; tap-to-drill-down is the simpler flow). Offers a Buy/Sell tab, a
 * quantity control that stays in sync across a numeric input, -/+ buttons,
 * AND a range slider (all three requested explicitly), and a running total.
 */

import { useEffect, useState } from 'react'
import type { Good } from '../../engine/types'
import { CoinIcon } from './PixelIcons'

interface TradePanelProps {
  good: Good
  price: number
  ownedQty: number
  avgBuyCost: number | null
  maxBuy: number
  maxSell: number
  onBuy: (qty: number) => void
  onSell: (qty: number) => void
  onBack: () => void
}

type Mode = 'buy' | 'sell'

export default function TradePanel({
  good,
  price,
  ownedQty,
  avgBuyCost,
  maxBuy,
  maxSell,
  onBuy,
  onSell,
  onBack,
}: TradePanelProps) {
  const [mode, setMode] = useState<Mode>(maxBuy > 0 ? 'buy' : 'sell')
  const [qty, setQty] = useState(0)

  const max = mode === 'buy' ? maxBuy : maxSell

  // Re-clamp qty whenever the mode (or its max) changes, so switching tabs
  // never leaves a stale quantity that's now out of range.
  useEffect(() => {
    setQty((q) => Math.min(q, max))
  }, [max])

  function setClamped(next: number) {
    setQty(Math.max(0, Math.min(max, Math.round(next))))
  }

  const total = qty * price
  const canConfirm = qty > 0 && qty <= max

  return (
    <div className="trade-panel">
      <button className="secondary trade-panel-back" onClick={onBack}>
        ← Back
      </button>

      <div className="trade-panel-title">
        <strong>{good.name}</strong>
        <span className="icon-label">
          <CoinIcon size={13} />${price.toFixed(2)}
        </span>
      </div>

      <div className="row muted">
        <span>Owned: {ownedQty}</span>
        <span>Avg cost: {avgBuyCost !== null ? `$${avgBuyCost.toFixed(2)}` : '—'}</span>
      </div>

      <div className="trade-tabs">
        <button
          className={mode === 'buy' ? 'trade-tab trade-tab--active' : 'trade-tab secondary'}
          disabled={maxBuy < 1}
          onClick={() => setMode('buy')}
        >
          Buy
        </button>
        <button
          className={mode === 'sell' ? 'trade-tab trade-tab--active trade-tab--sell' : 'trade-tab secondary'}
          disabled={maxSell < 1}
          onClick={() => setMode('sell')}
        >
          Sell
        </button>
      </div>

      {max < 1 ? (
        <p className="muted">{mode === 'buy' ? 'Cannot afford or no cargo space.' : 'Nothing to sell.'}</p>
      ) : (
        <>
          <div className="trade-qty-row">
            <button className="secondary trade-qty-btn" disabled={qty <= 0} onClick={() => setClamped(qty - 1)}>
              −
            </button>
            <input
              className="trade-qty-input"
              type="number"
              inputMode="numeric"
              min={0}
              max={max}
              value={qty}
              onChange={(e) => setClamped(Number(e.target.value))}
            />
            <button className="secondary trade-qty-btn" disabled={qty >= max} onClick={() => setClamped(qty + 1)}>
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
            value={qty}
            onChange={(e) => setClamped(Number(e.target.value))}
          />

          <div className="row trade-total">
            <span>Total {mode === 'buy' ? 'cost' : 'proceeds'}</span>
            <strong>${total.toFixed(2)}</strong>
          </div>

          <button
            className={mode === 'sell' ? 'trade-confirm trade-confirm--sell' : 'trade-confirm'}
            disabled={!canConfirm}
            onClick={() => {
              if (mode === 'buy') onBuy(qty)
              else onSell(qty)
              onBack()
            }}
          >
            {mode === 'buy' ? `Buy ${qty}` : `Sell ${qty}`}
          </button>
        </>
      )}
    </div>
  )
}
