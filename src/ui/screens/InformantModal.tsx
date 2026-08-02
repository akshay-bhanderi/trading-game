/**
 * Informant tip-purchase modal (T039, §7 Insider information). Only ever
 * rendered from NewspaperScreen when `isInformantAvailable(game)` (Medium+
 * bank city). The purchased tip's hint text is NOT persisted anywhere in
 * `GameState` (only the underlying scheduled Event is) — `buyInformantTip`
 * returns it directly, so this component holds it in local state purely to
 * reveal it once, immediately after purchase.
 */

import { useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { calcTipPrice } from '../../engine/informant'
import type { InformantTip } from '../../engine/informant'
import { CITIES } from '../../engine/data/cities'
import { GOODS } from '../../engine/data/goods'
import { formatMoney } from '../format'

function cityName(cityId: string): string {
  return CITIES.find((c) => c.id === cityId)?.name ?? cityId
}

function goodName(goodId: string): string {
  return GOODS.find((g) => g.id === goodId)?.name ?? goodId
}

export default function InformantModal({ onClose }: { onClose: () => void }) {
  const game = useGameStore((s) => s.game)
  const buyInformantTip = useGameStore((s) => s.buyInformantTip)
  const [tip, setTip] = useState<InformantTip | null>(null)
  const [rejected, setRejected] = useState(false)

  if (!game) return null

  const price = calcTipPrice(game)

  return (
    <div className="informant-modal">
      <button className="secondary" onClick={onClose}>
        ← Back to paper
      </button>

      <h2>The Informant</h2>

      {!tip ? (
        <>
          <p className="muted">
            A tip on an upcoming price move, whispered for a price. Accuracy isn't guaranteed.
          </p>
          <div className="row">
            <span>Tip price</span>
            <strong>${formatMoney(price)}</strong>
          </div>
          {rejected && <p className="muted">Couldn't afford that tip.</p>}
          <button
            onClick={() => {
              const result = buyInformantTip()
              if (!result) {
                setRejected(true)
                return
              }
              setTip(result)
            }}
          >
            Buy Tip (${formatMoney(price)})
          </button>
        </>
      ) : (
        <div className="informant-tip-reveal">
          <p>
            "Word is, <strong>{goodName(tip.hintedGoodId)}</strong> in{' '}
            <strong>{cityName(tip.hintedCityId)}</strong> is about to{' '}
            <strong>{tip.hintedDirection === 'up' ? 'rise' : 'fall'}</strong>."
          </p>
          <p className="muted">— your Informant (take it with a grain of salt)</p>
          <button onClick={onClose}>Done</button>
        </div>
      )}
    </div>
  )
}
