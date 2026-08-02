/**
 * Warehouse screen (T052, §14 "Warehouse Storage") — a city picker, a
 * floor-count summary, a goods panel (Store/Withdraw/Buy), an insurance
 * toggle, and a sell-back button.
 *
 * ---------------------------------------------------------------------------
 * COMPACTED (2026-08, user-requested) — the old per-floor building
 * elevation is gone
 * ---------------------------------------------------------------------------
 * This screen used to render a vertical building graphic, one row per
 * floor, each with its own mini used/free capacity bar (per §14's original
 * graphic description). The user explicitly asked for that removed: no
 * per-floor breakdown, no Ground/Penthouse naming, no visual "building" at
 * all — just a floor COUNT ("Floors: N/6") plus a Build button when not
 * maxed, and ONE overall capacity bar for the whole warehouse (not broken
 * down per floor). `CONFIG.warehouse.floors` is still keyed by floor number
 * under the hood (unchanged, engine-side) — only this screen's rendering
 * collapsed from "one row per floor" down to a single summary line.
 *
 * ---------------------------------------------------------------------------
 * MANAGE ANY CITY'S WAREHOUSE REMOTELY (2026-08, user-requested)
 * ---------------------------------------------------------------------------
 * This screen used to only ever show/act on `game.currentCity`'s warehouse.
 * The engine already allowed `buildWarehouseFloor`/`buyWarehouseInsurance`/
 * `sellWarehouse` to target ANY unlocked city without requiring presence
 * (§14: "own warehouses in several cities at once — a distributed storage
 * network") — this screen just never exposed that. It now does, via a city
 * picker at the top (`selectedCityId`, defaulting to the current city):
 *   - Floor count, build-next-floor, insurance, maintenance, and sell-back
 *     all now act on WHICHEVER city is selected, current or remote — no
 *     engine change needed there, purely a UI-scope change.
 *   - `buyIntoWarehouse` was relaxed engine-side (see warehouse.ts's file
 *     header) to allow targeting ANY city's warehouse too, by explicit user
 *     choice — always priced off the player's CURRENT city's live price,
 *     never the remote city's (which the player can't see live anyway, per
 *     §6's information model). So Buy is available regardless of which
 *     city is selected.
 *   - `storeGoods`/`withdrawGoods`/`sellFromWarehouse` were explicitly left
 *     presence-gated (user's own choice, not selected for remote access) —
 *     moving ALREADY-OWNED cargo into/out of a warehouse, and selling out of
 *     one, still require physically being in that city. The goods panel
 *     below disables those two tabs (not Buy) when viewing a remote city.
 */

import { useEffect, useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { CONFIG } from '../../engine/config'
import { cargoUsed } from '../../engine/cargo'
import { CITIES } from '../../engine/data/cities'
import { GOODS } from '../../engine/data/goods'
import {
  calcWarehouseAnnualBill,
  calcWarehouseGoodsValue,
  cumulativeBuildCost,
  warehouseCapacity,
  warehouseGoodsUsed,
} from '../../engine/warehouse'
import CapacityBar from '../components/CapacityBar'
import { formatMoney } from '../format'
import type { CityId, GoodId } from '../../engine/types'

function goodName(goodId: GoodId): string {
  return GOODS.find((g) => g.id === goodId)?.name ?? goodId
}

/**
 * Store/Withdraw/Buy detail panel — mirrors TradePanel.tsx's Buy/Sell shape
 * (tabs, -/+ stepper, range slider, Max button). Store/Withdraw move
 * ALREADY-OWNED cargo into/out of the selected city's warehouse (disabled
 * when `canStoreWithdraw` is false — i.e. the selected city isn't where the
 * player currently is); Buy spends cash at the player's CURRENT city's live
 * price to deposit new goods directly into the selected warehouse, and is
 * always available regardless of location (see file header).
 */
type WarehouseMode = 'store' | 'withdraw' | 'buy'

function WarehouseTradePanel({
  goodId,
  cargoQty,
  storedQty,
  maxStore,
  maxWithdraw,
  canStoreWithdraw,
  remoteCityName,
  price,
  maxBuy,
  onStore,
  onWithdraw,
  onBuy,
  onBack,
}: {
  goodId: GoodId
  cargoQty: number
  storedQty: number
  maxStore: number
  maxWithdraw: number
  canStoreWithdraw: boolean
  remoteCityName: string
  price: number | undefined
  maxBuy: number
  onStore: (qty: number) => void
  onWithdraw: (qty: number) => void
  onBuy: (qty: number) => void
  onBack: () => void
}) {
  const effectiveMaxStore = canStoreWithdraw ? maxStore : 0
  const effectiveMaxWithdraw = canStoreWithdraw ? maxWithdraw : 0

  const [mode, setMode] = useState<WarehouseMode>(
    effectiveMaxStore > 0 ? 'store' : effectiveMaxWithdraw > 0 ? 'withdraw' : 'buy',
  )
  const [qty, setQty] = useState(0)

  const max = mode === 'store' ? effectiveMaxStore : mode === 'withdraw' ? effectiveMaxWithdraw : maxBuy

  useEffect(() => {
    setQty((q) => Math.min(q, max))
  }, [max])

  function setClamped(next: number) {
    setQty(Math.max(0, Math.min(max, Math.round(next))))
  }

  const canConfirm = qty > 0 && qty <= max
  const total = mode === 'buy' && price !== undefined ? qty * price : null

  return (
    <div className="trade-panel">
      <button className="secondary trade-panel-back" onClick={onBack}>
        ← Back
      </button>

      <div className="trade-panel-title">
        <strong>{goodName(goodId)}</strong>
        {mode === 'buy' && price !== undefined && <span className="icon-label">${price.toFixed(2)}</span>}
      </div>

      <div className="row muted">
        <span>Carried: {cargoQty}</span>
        <span>Stored here: {storedQty}</span>
      </div>

      {!canStoreWithdraw && (
        <p className="muted">Travel to {remoteCityName} to store or withdraw goods directly.</p>
      )}

      <div className="trade-tabs warehouse-tabs">
        <button
          className={mode === 'store' ? 'trade-tab trade-tab--active' : 'trade-tab secondary'}
          disabled={effectiveMaxStore < 1}
          onClick={() => setMode('store')}
        >
          Store
        </button>
        <button
          className={mode === 'withdraw' ? 'trade-tab trade-tab--active trade-tab--sell' : 'trade-tab secondary'}
          disabled={effectiveMaxWithdraw < 1}
          onClick={() => setMode('withdraw')}
        >
          Withdraw
        </button>
        <button
          className={mode === 'buy' ? 'trade-tab trade-tab--active' : 'trade-tab secondary'}
          disabled={maxBuy < 1}
          onClick={() => setMode('buy')}
        >
          Buy
        </button>
      </div>

      {max < 1 ? (
        <p className="muted">
          {mode === 'store' && (canStoreWithdraw ? 'Nothing carried, or the warehouse is full.' : 'Not here.')}
          {mode === 'withdraw' && (canStoreWithdraw ? 'Nothing stored here to withdraw.' : 'Not here.')}
          {mode === 'buy' && (price === undefined ? 'No live price for this good right now.' : "Can't afford any, or the warehouse is full.")}
        </p>
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

          {total !== null && (
            <div className="row trade-total">
              <span>Total cost</span>
              <strong>${total.toFixed(2)}</strong>
            </div>
          )}

          <button
            className={mode === 'withdraw' ? 'trade-confirm trade-confirm--sell' : 'trade-confirm'}
            disabled={!canConfirm}
            onClick={() => {
              if (mode === 'store') onStore(qty)
              else if (mode === 'withdraw') onWithdraw(qty)
              else onBuy(qty)
              onBack()
            }}
          >
            {mode === 'store' ? `Store ${qty}` : mode === 'withdraw' ? `Withdraw ${qty}` : `Buy ${qty}`}
          </button>
        </>
      )}
    </div>
  )
}

export default function WarehouseScreen() {
  const game = useGameStore((s) => s.game)
  const buildWarehouseFloor = useGameStore((s) => s.buildWarehouseFloor)
  const storeGoods = useGameStore((s) => s.storeGoods)
  const withdrawGoods = useGameStore((s) => s.withdrawGoods)
  const buyIntoWarehouse = useGameStore((s) => s.buyIntoWarehouse)
  const buyWarehouseInsurance = useGameStore((s) => s.buyWarehouseInsurance)
  const sellWarehouse = useGameStore((s) => s.sellWarehouse)

  const [selectedGoodId, setSelectedGoodId] = useState<GoodId | null>(null)
  const [selectedCityIdOverride, setSelectedCityIdOverride] = useState<CityId | null>(null)

  if (!game) return null

  const selectedCityId = selectedCityIdOverride ?? game.currentCity
  const selectedCity = CITIES.find((c) => c.id === selectedCityId)
  const isViewingCurrentCity = selectedCityId === game.currentCity
  const unlockedCities = CITIES.filter((c) => game.unlockedCityIds.includes(c.id))

  const cityId = selectedCityId
  const warehouse = game.warehouses?.[cityId]
  const floorsBuilt = warehouse?.floorsBuilt ?? 0
  const insured = warehouse?.insured ?? false

  const capacity = warehouseCapacity(game, cityId)
  const used = warehouseGoodsUsed(game, cityId)
  const storedValue = calcWarehouseGoodsValue(game, cityId)
  const annualBill = calcWarehouseAnnualBill(game)

  // Every tradeable good (not just ones already carried/stored) so Buy is
  // reachable even for a good the player has never touched here before —
  // same "show the full list, not just what you own" pattern MarketScreen
  // already uses.
  const tradeableGoodIds = GOODS.filter(
    (g) => game.unlockedGoodIds.includes(g.id) && (g.licenseFee === null || game.purchasedLicenseGoodIds.includes(g.id)),
  ).map((g) => g.id)
  const cityWarehouseGoods = game.warehouseGoods?.[cityId] ?? {}
  const remainingWarehouseCapacity = Math.max(0, capacity - used)
  const remainingCargoCapacity = Math.max(0, game.cargoCapacity - cargoUsed(game))

  const nextFloor = floorsBuilt < CONFIG.warehouse.maxFloors ? floorsBuilt + 1 : null
  const nextFloorTier = nextFloor !== null ? CONFIG.warehouse.floors[nextFloor] : null

  return (
    <div className="warehouse-screen">
      <div className="card">
        <h2>Warehouse — {selectedCity?.name ?? selectedCityId}</h2>
        <select
          className="trade-qty-input warehouse-city-picker"
          value={selectedCityId}
          onChange={(e) => setSelectedCityIdOverride(e.target.value)}
        >
          {unlockedCities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.id === game.currentCity ? ' (here)' : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="card warehouse-summary">
        <div className="row">
          <span>Floors</span>
          <strong>
            {floorsBuilt}/{CONFIG.warehouse.maxFloors}
          </strong>
        </div>
        {capacity > 0 && <CapacityBar used={used} capacity={capacity} label="Stored" />}
        {nextFloorTier && (
          <button
            className="secondary warehouse-build-btn"
            disabled={game.cash < nextFloorTier.buildCost}
            onClick={() => buildWarehouseFloor(cityId)}
          >
            Build floor {nextFloor} — ${formatMoney(nextFloorTier.buildCost)}
          </button>
        )}
      </div>

      {floorsBuilt > 0 && (
        <>
          {selectedGoodId ? (
            <div className="card">
              <WarehouseTradePanel
                goodId={selectedGoodId}
                cargoQty={game.cargo[selectedGoodId]?.qty ?? 0}
                storedQty={cityWarehouseGoods[selectedGoodId]?.qty ?? 0}
                maxStore={Math.min(game.cargo[selectedGoodId]?.qty ?? 0, remainingWarehouseCapacity)}
                maxWithdraw={Math.min(cityWarehouseGoods[selectedGoodId]?.qty ?? 0, remainingCargoCapacity)}
                canStoreWithdraw={isViewingCurrentCity}
                remoteCityName={selectedCity?.name ?? selectedCityId}
                price={game.priceStates[game.currentCity]?.[selectedGoodId]?.currentPrice}
                maxBuy={(() => {
                  const price = game.priceStates[game.currentCity]?.[selectedGoodId]?.currentPrice
                  if (price === undefined || price <= 0) return 0
                  return Math.max(0, Math.min(Math.floor(game.cash / price), remainingWarehouseCapacity))
                })()}
                onStore={(qty) => storeGoods(cityId, selectedGoodId, qty)}
                onWithdraw={(qty) => withdrawGoods(cityId, selectedGoodId, qty)}
                onBuy={(qty) => buyIntoWarehouse(cityId, selectedGoodId, qty)}
                onBack={() => setSelectedGoodId(null)}
              />
            </div>
          ) : (
            <div className="card">
              <h2>Store / Withdraw / Buy</h2>
              <div className="row muted">
                <span>Stored value (last-known local price)</span>
                <strong>${formatMoney(storedValue)}</strong>
              </div>
              <div className="market-list">
                {tradeableGoodIds.map((goodId) => (
                  <button className="market-row" key={goodId} onClick={() => setSelectedGoodId(goodId)}>
                    <span className="market-row-name">{goodName(goodId)}</span>
                    <span className="market-row-prices">
                      <span className="market-buy-price">{game.cargo[goodId]?.qty ?? 0} carried</span>
                      <span className="market-sell-neutral">{cityWarehouseGoods[goodId]?.qty ?? 0} stored</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="card">
            <h2>Insurance</h2>
            <p className="muted">
              {insured
                ? `Insured — caps fire loss at ${(CONFIG.warehouse.fire.insuredLossPct * 100).toFixed(0)}%. Premium ` +
                  `(${(CONFIG.warehouse.fire.insuranceAnnualRatePctOfStoredValue * 100).toFixed(0)}%/yr of stored ` +
                  `value) bills at year-end alongside maintenance.`
                : `Uninsured — a fire here could destroy ${(CONFIG.warehouse.fire.lossPct.min * 100).toFixed(0)}-` +
                  `${(CONFIG.warehouse.fire.lossPct.max * 100).toFixed(0)}% of stored goods.`}
            </p>
            <button className="secondary" onClick={() => buyWarehouseInsurance(cityId)}>
              {insured ? 'Cancel insurance' : 'Buy insurance'}
            </button>
          </div>

          <div className="card">
            <h2>Maintenance</h2>
            <div className="row muted">
              <span>This city's floors' upkeep</span>
              <strong>
                $
                {formatMoney(
                  Array.from(
                    { length: floorsBuilt },
                    (_, i) => CONFIG.warehouse.floors[i + 1]?.annualMaintenance ?? 0,
                  ).reduce((a, b) => a + b, 0),
                )}
                /yr
              </strong>
            </div>
            <div className="row muted">
              <span>All warehouses' combined year-end bill</span>
              <strong>${formatMoney(annualBill)}</strong>
            </div>
            {game.warehouseMaintenanceDebt && (
              <div className="row">
                <span>Outstanding maintenance debt</span>
                <strong>
                  $
                  {formatMoney(
                    game.warehouseMaintenanceDebt.principal + game.warehouseMaintenanceDebt.accruedInterest,
                  )}
                </strong>
              </div>
            )}
          </div>

          <div className="card">
            <h2>Sell warehouse</h2>
            <p className="muted">
              Liquidates all {floorsBuilt} floor{floorsBuilt === 1 ? '' : 's'} for 50% of total build cost ($
              {formatMoney(cumulativeBuildCost(floorsBuilt) * CONFIG.warehouse.sellBackFraction)}).
              {used > 0 && ' Withdraw all stored goods first.'}
            </p>
            <button className="secondary" disabled={used > 0} onClick={() => sellWarehouse(cityId)}>
              Sell warehouse
            </button>
          </div>
        </>
      )}
    </div>
  )
}
