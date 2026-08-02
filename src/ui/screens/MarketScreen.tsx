import { useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { CONFIG } from '../../engine/config'
import { cargoUsed } from '../../engine/cargo'
import { GOODS } from '../../engine/data/goods'
import { warehouseCapacity, warehouseGoodsUsed } from '../../engine/warehouse'
import type { GoodId } from '../../engine/types'
import TradePanel from '../components/TradePanel'
import CapacityBar from '../components/CapacityBar'
import { formatMoney } from '../format'

/** Where a Buy/Sell in the TradePanel actually reads/writes — user-requested
 * (2026-08): lets the Market screen trade straight against the current
 * city's warehouse instead of always going through cargo. Only offered when
 * a warehouse is actually built here (see `hasWarehouse` below). */
type TradeDestination = 'cargo' | 'warehouse'

export default function MarketScreen() {
  const game = useGameStore((s) => s.game)
  const buy = useGameStore((s) => s.buy)
  const sell = useGameStore((s) => s.sell)
  const buyCargoUpgrade = useGameStore((s) => s.buyCargoUpgrade)
  const buyIntoWarehouse = useGameStore((s) => s.buyIntoWarehouse)
  const sellFromWarehouse = useGameStore((s) => s.sellFromWarehouse)
  const [selectedGoodId, setSelectedGoodId] = useState<GoodId | null>(null)
  const [destination, setDestination] = useState<TradeDestination>('cargo')

  if (!game) return null

  const tradeableGoods = GOODS.filter(
    (g) =>
      game.unlockedGoodIds.includes(g.id) &&
      (g.licenseFee === null || game.purchasedLicenseGoodIds.includes(g.id)),
  )

  const remainingCargoCapacity = game.cargoCapacity - cargoUsed(game)
  const hasWarehouse = (game.warehouses?.[game.currentCity]?.floorsBuilt ?? 0) > 0
  const remainingWarehouseCapacity = hasWarehouse
    ? warehouseCapacity(game, game.currentCity) - warehouseGoodsUsed(game, game.currentCity)
    : 0

  const selectedGood = selectedGoodId ? tradeableGoods.find((g) => g.id === selectedGoodId) : undefined

  if (selectedGood) {
    const price = game.priceStates[game.currentCity]?.[selectedGood.id]?.currentPrice ?? 0
    const cargoHolding = game.cargo[selectedGood.id]
    const warehouseHolding = game.warehouseGoods?.[game.currentCity]?.[selectedGood.id]
    const effectiveDestination: TradeDestination = hasWarehouse ? destination : 'cargo'
    const holding = effectiveDestination === 'cargo' ? cargoHolding : warehouseHolding
    const remainingCapacity = effectiveDestination === 'cargo' ? remainingCargoCapacity : remainingWarehouseCapacity
    const maxBuy = price > 0 ? Math.max(0, Math.min(Math.floor(game.cash / price), remainingCapacity)) : 0
    const maxSell = holding?.qty ?? 0

    return (
      <>
        {hasWarehouse && (
          <div className="trade-tabs market-destination-tabs">
            <button
              className={destination === 'cargo' ? 'trade-tab trade-tab--active' : 'trade-tab secondary'}
              onClick={() => setDestination('cargo')}
            >
              Cargo
            </button>
            <button
              className={destination === 'warehouse' ? 'trade-tab trade-tab--active' : 'trade-tab secondary'}
              onClick={() => setDestination('warehouse')}
            >
              Warehouse
            </button>
          </div>
        )}
        <TradePanel
          good={selectedGood}
          price={price}
          ownedQty={holding?.qty ?? 0}
          avgBuyCost={holding ? holding.avgBuyCost : null}
          maxBuy={maxBuy}
          maxSell={maxSell}
          onBuy={(qty) =>
            effectiveDestination === 'cargo'
              ? buy(selectedGood.id, qty)
              : buyIntoWarehouse(game.currentCity, selectedGood.id, qty)
          }
          onSell={(qty) =>
            effectiveDestination === 'cargo' ? sell(selectedGood.id, qty) : sellFromWarehouse(selectedGood.id, qty)
          }
          onBack={() => setSelectedGoodId(null)}
        />
      </>
    )
  }

  // User-requested addition (2026-08): `buyCargoUpgrade` (cargo.ts) has
  // existed since T011 but was never wired to any UI — surfaced here, next
  // to the Cargo bar it directly affects.
  const nextCargoTier = CONFIG.cargo.upgrades.find((tier) => tier.capacity > game.cargoCapacity) ?? null

  return (
    <div className="market-list">
      <CapacityBar used={cargoUsed(game)} capacity={game.cargoCapacity} label="Cargo" />

      {nextCargoTier ? (
        <button
          className="secondary market-cargo-upgrade-btn"
          disabled={game.cash < nextCargoTier.cost}
          onClick={() => buyCargoUpgrade()}
        >
          Upgrade cargo to {nextCargoTier.capacity.toLocaleString()} — ${formatMoney(nextCargoTier.cost)}
        </button>
      ) : (
        <p className="muted market-cargo-upgrade-btn">Cargo capacity maxed.</p>
      )}

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
