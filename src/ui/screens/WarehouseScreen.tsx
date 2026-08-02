/**
 * Warehouse screen (T052, §14 "Warehouse Storage") — vertical building
 * elevation, one row per floor (per §14's graphic description: "lit/filled =
 * built, dim outline = not yet built and purchasable inline. Each built
 * floor is its own mini used/free capacity bar; stacked, they read as one
 * building-height meter. Same bar-fill visual language as the Market
 * screen's cargo bar, for consistency"), plus store/withdraw controls, an
 * insurance toggle, and a sell-back button.
 *
 * ---------------------------------------------------------------------------
 * SCOPE JUDGMENT CALL — this screen only ever acts on `game.currentCity`
 * ---------------------------------------------------------------------------
 * The engine (warehouse.ts) deliberately allows `buildWarehouseFloor`/
 * `buyWarehouseInsurance`/`sellWarehouse` to target ANY unlocked city
 * remotely (§14: "own warehouses in several cities at once — a distributed
 * storage network"), while `storeGoods`/`withdrawGoods` require physical
 * presence. Exposing a full multi-city warehouse-management picker in ONE
 * popup would be a much bigger UI than every other Phase-1 popup (Market/
 * Bank/Travel/Newspaper all scope themselves to `game.currentCity` too) and
 * isn't required by T052's acceptance criteria. This screen therefore only
 * ever shows/acts on `game.currentCity`'s warehouse — a player who wants a
 * distributed network simply travels to each city and opens this same
 * screen there, exactly like they already must for Bank deposits/loans
 * (§9's own "no cross-city banking" precedent). This is a UI-scope
 * simplification only; the underlying engine functions remain fully
 * general or cross-referenced from the file-level docs above.
 *
 * ---------------------------------------------------------------------------
 * "Stacked to read as one building-height meter" — per-floor fill
 * ---------------------------------------------------------------------------
 * `state.warehouseGoods` tracks a single POOLED per-city quantity, not a
 * separate figure per floor (there is no "floor 3's own goods" concept in
 * the engine — capacity is just cumulative). To still render "each built
 * floor is its own mini used/free capacity bar" per §14, this screen derives
 * a per-floor fill by treating the total stored quantity as filling the
 * building from the GROUND UP: floor 1's bar fills first (0 up to its own
 * `capacityAdded`), then floor 2's, and so on. This is a pure display
 * derivation (`floorFill` below) — it has no bearing on which actual goods
 * are "in" which floor (the engine tracks no such distinction; a `sell`
 * or `fire` destruction touches the pooled total, not any one floor).
 *
 * Floors are rendered top-down (6/Penthouse at the top, 1/Ground at the
 * bottom) to match a real building's elevation, per §14's own "Ground"/
 * "Penthouse" floor-1/floor-6 naming.
 */

import { useEffect, useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { CONFIG } from '../../engine/config'
import { cargoUsed } from '../../engine/cargo'
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
import type { GoodId } from '../../engine/types'

function goodName(goodId: GoodId): string {
  return GOODS.find((g) => g.id === goodId)?.name ?? goodId
}

/**
 * Store/Withdraw detail panel (user-requested redesign, 2026-08) — mirrors
 * TradePanel.tsx's Buy/Sell shape exactly (tabs, -/+ stepper, range slider,
 * Max button) instead of the old two stacked dropdown+qty rows. Deliberately
 * a LOCAL component (not a shared one with TradePanel) since the two differ
 * just enough — different tab labels, two independently-capped maxes, no
 * price/total line — that sharing would need more props than it saves.
 */
type WarehouseMode = 'store' | 'withdraw'

function WarehouseTradePanel({
  goodId,
  cargoQty,
  storedQty,
  maxStore,
  maxWithdraw,
  onStore,
  onWithdraw,
  onBack,
}: {
  goodId: GoodId
  cargoQty: number
  storedQty: number
  maxStore: number
  maxWithdraw: number
  onStore: (qty: number) => void
  onWithdraw: (qty: number) => void
  onBack: () => void
}) {
  const [mode, setMode] = useState<WarehouseMode>(maxStore > 0 ? 'store' : 'withdraw')
  const [qty, setQty] = useState(0)

  const max = mode === 'store' ? maxStore : maxWithdraw

  useEffect(() => {
    setQty((q) => Math.min(q, max))
  }, [max])

  function setClamped(next: number) {
    setQty(Math.max(0, Math.min(max, Math.round(next))))
  }

  const canConfirm = qty > 0 && qty <= max

  return (
    <div className="trade-panel">
      <button className="secondary trade-panel-back" onClick={onBack}>
        ← Back
      </button>

      <div className="trade-panel-title">
        <strong>{goodName(goodId)}</strong>
      </div>

      <div className="row muted">
        <span>Carried: {cargoQty}</span>
        <span>Stored here: {storedQty}</span>
      </div>

      <div className="trade-tabs">
        <button
          className={mode === 'store' ? 'trade-tab trade-tab--active' : 'trade-tab secondary'}
          disabled={maxStore < 1}
          onClick={() => setMode('store')}
        >
          Store
        </button>
        <button
          className={mode === 'withdraw' ? 'trade-tab trade-tab--active trade-tab--sell' : 'trade-tab secondary'}
          disabled={maxWithdraw < 1}
          onClick={() => setMode('withdraw')}
        >
          Withdraw
        </button>
      </div>

      {max < 1 ? (
        <p className="muted">
          {mode === 'store' ? 'Nothing carried, or the warehouse is full.' : 'Nothing stored here to withdraw.'}
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

          <button
            className={mode === 'withdraw' ? 'trade-confirm trade-confirm--sell' : 'trade-confirm'}
            disabled={!canConfirm}
            onClick={() => {
              if (mode === 'store') onStore(qty)
              else onWithdraw(qty)
              onBack()
            }}
          >
            {mode === 'store' ? `Store ${qty}` : `Withdraw ${qty}`}
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
  const buyWarehouseInsurance = useGameStore((s) => s.buyWarehouseInsurance)
  const sellWarehouse = useGameStore((s) => s.sellWarehouse)

  const [selectedGoodId, setSelectedGoodId] = useState<GoodId | null>(null)

  if (!game) return null

  const cityId = game.currentCity
  const warehouse = game.warehouses?.[cityId]
  const floorsBuilt = warehouse?.floorsBuilt ?? 0
  const insured = warehouse?.insured ?? false

  const capacity = warehouseCapacity(game, cityId)
  const used = warehouseGoodsUsed(game, cityId)
  const storedValue = calcWarehouseGoodsValue(game, cityId)
  const annualBill = calcWarehouseAnnualBill(game)

  // Goods currently in cargo (storable) / currently stored here (withdrawable) —
  // merged into ONE list so every good with either a carried or stored qty
  // shows up as a single tappable row (Market-list pattern), rather than the
  // old two separate dropdown+qty rows.
  const cityWarehouseGoods = game.warehouseGoods?.[cityId] ?? {}
  const relevantGoodIds = Array.from(
    new Set([
      ...Object.keys(game.cargo).filter((goodId) => (game.cargo[goodId]?.qty ?? 0) > 0),
      ...Object.keys(cityWarehouseGoods).filter((goodId) => (cityWarehouseGoods[goodId]?.qty ?? 0) > 0),
    ]),
  )
  const remainingWarehouseCapacity = Math.max(0, capacity - used)
  const remainingCargoCapacity = Math.max(0, game.cargoCapacity - cargoUsed(game))

  const nextFloor = floorsBuilt < CONFIG.warehouse.maxFloors ? floorsBuilt + 1 : null

  // Per-floor "fill from the ground up" derivation — see file header.
  function floorFill(floor: number): { floorUsed: number; floorCapacity: number } {
    const tier = CONFIG.warehouse.floors[floor]
    if (!tier) return { floorUsed: 0, floorCapacity: 0 }
    const floorStart = tier.cumulativeCapacity - tier.capacityAdded
    const floorUsed = Math.max(0, Math.min(tier.capacityAdded, used - floorStart))
    return { floorUsed, floorCapacity: tier.capacityAdded }
  }

  const floorNumbers = Array.from({ length: CONFIG.warehouse.maxFloors }, (_, i) => CONFIG.warehouse.maxFloors - i)

  return (
    <div className="warehouse-screen">
      <div className="card warehouse-elevation">
        <h2>Building — {capacity > 0 ? `${used}/${capacity} stored` : 'No warehouse yet'}</h2>
        {floorNumbers.map((floor) => {
          const built = floor <= floorsBuilt
          const tier = CONFIG.warehouse.floors[floor]
          const isNextFloor = floor === nextFloor

          if (built) {
            const { floorUsed, floorCapacity } = floorFill(floor)
            return (
              <div key={floor} className="warehouse-floor warehouse-floor--built">
                <span className="warehouse-floor-label">
                  {floor === 1 ? 'Floor 1 (Ground)' : floor === 6 ? 'Floor 6 (Penthouse)' : `Floor ${floor}`}
                </span>
                <CapacityBar used={floorUsed} capacity={floorCapacity} />
              </div>
            )
          }

          return (
            <div key={floor} className="warehouse-floor warehouse-floor--unbuilt">
              <span className="warehouse-floor-label muted">
                {floor === 1 ? 'Floor 1 (Ground)' : floor === 6 ? 'Floor 6 (Penthouse)' : `Floor ${floor}`}
              </span>
              {isNextFloor && tier ? (
                <button
                  className="secondary warehouse-build-btn"
                  disabled={game.cash < tier.buildCost}
                  onClick={() => buildWarehouseFloor(cityId)}
                >
                  Build — ${formatMoney(tier.buildCost)}
                </button>
              ) : (
                <span className="muted warehouse-floor-locked">Locked</span>
              )}
            </div>
          )
        })}
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
                onStore={(qty) => storeGoods(cityId, selectedGoodId, qty)}
                onWithdraw={(qty) => withdrawGoods(cityId, selectedGoodId, qty)}
                onBack={() => setSelectedGoodId(null)}
              />
            </div>
          ) : (
            <div className="card">
              <h2>Store / Withdraw</h2>
              <div className="row muted">
                <span>Stored value (last-known local price)</span>
                <strong>${formatMoney(storedValue)}</strong>
              </div>
              {relevantGoodIds.length === 0 ? (
                <p className="muted">Carry goods here, or store some, to manage them.</p>
              ) : (
                <div className="market-list">
                  {relevantGoodIds.map((goodId) => (
                    <button className="market-row" key={goodId} onClick={() => setSelectedGoodId(goodId)}>
                      <span className="market-row-name">{goodName(goodId)}</span>
                      <span className="market-row-prices">
                        <span className="market-buy-price">{game.cargo[goodId]?.qty ?? 0} carried</span>
                        <span className="market-sell-neutral">{cityWarehouseGoods[goodId]?.qty ?? 0} stored</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
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
