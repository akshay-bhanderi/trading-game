import { useGameStore } from '../store/gameStore'
import { cargoUsed } from '../../engine/cargo'
import { GOODS } from '../../engine/data/goods'
import { CoinIcon } from '../components/PixelIcons'

export default function MarketScreen() {
  const game = useGameStore((s) => s.game)
  const buy = useGameStore((s) => s.buy)
  const sell = useGameStore((s) => s.sell)
  if (!game) return null

  const tradeableGoods = GOODS.filter(
    (g) =>
      game.unlockedGoodIds.includes(g.id) &&
      (g.licenseFee === null || game.purchasedLicenseGoodIds.includes(g.id)),
  )

  const remainingCapacity = game.cargoCapacity - cargoUsed(game)

  return (
    <>
      {tradeableGoods.map((good) => {
        const price = game.priceStates[game.currentCity]?.[good.id]?.currentPrice
        const holding = game.cargo[good.id]

        const maxBuy = price ? Math.max(0, Math.min(Math.floor(game.cash / price), remainingCapacity)) : 0
        const maxSell = holding?.qty ?? 0

        return (
          <div className="card" key={good.id}>
            <div className="row">
              <strong>{good.name}</strong>
              <span className="icon-label">
                <CoinIcon size={12} />
                {price !== undefined ? `$${price.toFixed(2)}` : '—'}
              </span>
            </div>
            <div className="row muted">
              <span>Owned: {holding?.qty ?? 0}</span>
              <span>Avg cost: {holding ? `$${holding.avgBuyCost.toFixed(2)}` : '—'}</span>
            </div>
            <div className="row trade-controls">
              <div className="stepper">
                <span className="muted">Buy</span>
                <button disabled={!price || maxBuy < 1} onClick={() => buy(good.id, 1)}>
                  +1
                </button>
                <button disabled={!price || maxBuy < 10} onClick={() => buy(good.id, 10)}>
                  +10
                </button>
                <button disabled={!price || maxBuy < 1} onClick={() => buy(good.id, maxBuy)}>
                  Max
                </button>
              </div>
              <div className="stepper">
                <span className="muted">Sell</span>
                <button disabled={!price || maxSell < 1} onClick={() => sell(good.id, Math.min(1, maxSell))}>
                  -1
                </button>
                <button disabled={!price || maxSell < 10} onClick={() => sell(good.id, Math.min(10, maxSell))}>
                  -10
                </button>
                <button disabled={!price || maxSell < 1} onClick={() => sell(good.id, maxSell)}>
                  Max
                </button>
              </div>
            </div>
          </div>
        )
      })}
    </>
  )
}
