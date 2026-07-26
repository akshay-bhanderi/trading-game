import { useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { cargoUsed } from '../../engine/cargo'
import { GOODS } from '../../engine/data/goods'
import type { GoodId } from '../../engine/types'
import TradePanel from '../components/TradePanel'

export default function MarketScreen() {
  const game = useGameStore((s) => s.game)
  const buy = useGameStore((s) => s.buy)
  const sell = useGameStore((s) => s.sell)
  const [selectedGoodId, setSelectedGoodId] = useState<GoodId | null>(null)

  if (!game) return null

  const tradeableGoods = GOODS.filter(
    (g) =>
      game.unlockedGoodIds.includes(g.id) &&
      (g.licenseFee === null || game.purchasedLicenseGoodIds.includes(g.id)),
  )

  const remainingCapacity = game.cargoCapacity - cargoUsed(game)

  const selectedGood = selectedGoodId ? tradeableGoods.find((g) => g.id === selectedGoodId) : undefined

  if (selectedGood) {
    const price = game.priceStates[game.currentCity]?.[selectedGood.id]?.currentPrice ?? 0
    const holding = game.cargo[selectedGood.id]
    const maxBuy = price > 0 ? Math.max(0, Math.min(Math.floor(game.cash / price), remainingCapacity)) : 0
    const maxSell = holding?.qty ?? 0

    return (
      <TradePanel
        good={selectedGood}
        price={price}
        ownedQty={holding?.qty ?? 0}
        avgBuyCost={holding ? holding.avgBuyCost : null}
        maxBuy={maxBuy}
        maxSell={maxSell}
        onBuy={(qty) => buy(selectedGood.id, qty)}
        onSell={(qty) => sell(selectedGood.id, qty)}
        onBack={() => setSelectedGoodId(null)}
      />
    )
  }

  return (
    <div className="market-list">
      {tradeableGoods.map((good) => {
        const price = game.priceStates[game.currentCity]?.[good.id]?.currentPrice
        const holding = game.cargo[good.id]
        const owns = (holding?.qty ?? 0) > 0

        // Buy/sell happen at the same market price (no bid-ask spread in
        // this engine) — shown as two separately-colored figures anyway
        // per the requested layout: "Buy" in the accent/gold buy color,
        // "Sell" tinted green/red against the player's own avg cost (only
        // meaningful once they actually hold some), gray otherwise.
        const sellColorClass = !owns
          ? 'market-sell-neutral'
          : price !== undefined && price >= (holding?.avgBuyCost ?? 0)
            ? 'market-sell-profit'
            : 'market-sell-loss'

        return (
          <button className="market-row" key={good.id} onClick={() => setSelectedGoodId(good.id)}>
            <span className="market-row-name">
              {good.name}
              {owns && <span className="muted market-row-owned"> · {holding?.qty} owned</span>}
            </span>
            <span className="market-row-prices">
              <span className="market-buy-price">Buy ${price !== undefined ? price.toFixed(2) : '—'}</span>
              <span className={sellColorClass}>Sell ${price !== undefined ? price.toFixed(2) : '—'}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
