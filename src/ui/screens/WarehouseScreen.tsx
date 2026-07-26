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

import { useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { CONFIG } from '../../engine/config'
import { GOODS } from '../../engine/data/goods'
import {
  calcWarehouseAnnualBill,
  calcWarehouseGoodsValue,
  cumulativeBuildCost,
  warehouseCapacity,
  warehouseGoodsUsed,
} from '../../engine/warehouse'
import CapacityBar from '../components/CapacityBar'
import type { GoodId } from '../../engine/types'

function goodName(goodId: GoodId): string {
  return GOODS.find((g) => g.id === goodId)?.name ?? goodId
}

export default function WarehouseScreen() {
  const game = useGameStore((s) => s.game)
  const buildWarehouseFloor = useGameStore((s) => s.buildWarehouseFloor)
  const storeGoods = useGameStore((s) => s.storeGoods)
  const withdrawGoods = useGameStore((s) => s.withdrawGoods)
  const buyWarehouseInsurance = useGameStore((s) => s.buyWarehouseInsurance)
  const sellWarehouse = useGameStore((s) => s.sellWarehouse)

  const [storeGoodId, setStoreGoodId] = useState<GoodId | ''>('')
  const [storeQty, setStoreQty] = useState('')
  const [withdrawGoodId, setWithdrawGoodId] = useState<GoodId | ''>('')
  const [withdrawQty, setWithdrawQty] = useState('')

  if (!game) return null

  const cityId = game.currentCity
  const warehouse = game.warehouses?.[cityId]
  const floorsBuilt = warehouse?.floorsBuilt ?? 0
  const insured = warehouse?.insured ?? false

  const capacity = warehouseCapacity(game, cityId)
  const used = warehouseGoodsUsed(game, cityId)
  const storedValue = calcWarehouseGoodsValue(game, cityId)
  const annualBill = calcWarehouseAnnualBill(game)

  // Goods currently in cargo (storable) / currently stored here (withdrawable).
  const storableGoods = Object.keys(game.cargo).filter((goodId) => (game.cargo[goodId]?.qty ?? 0) > 0)
  const cityWarehouseGoods = game.warehouseGoods?.[cityId] ?? {}
  const withdrawableGoods = Object.keys(cityWarehouseGoods).filter(
    (goodId) => (cityWarehouseGoods[goodId]?.qty ?? 0) > 0,
  )

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
                  Build — ${tier.buildCost.toLocaleString()}
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
          <div className="card">
            <h2>Store / Withdraw</h2>

            <div className="row muted">
              <span>Stored value (last-known local price)</span>
              <strong>${storedValue.toFixed(0)}</strong>
            </div>

            <p className="muted">Store goods from cargo here.</p>
            <div className="bank-amount-row">
              <select
                className="trade-qty-input"
                value={storeGoodId}
                onChange={(e) => setStoreGoodId(e.target.value)}
              >
                <option value="">Select good…</option>
                {storableGoods.map((goodId) => (
                  <option key={goodId} value={goodId}>
                    {goodName(goodId)} ({game.cargo[goodId]?.qty ?? 0} carried)
                  </option>
                ))}
              </select>
              <input
                className="trade-qty-input"
                type="number"
                min={0}
                placeholder="Qty"
                value={storeQty}
                onChange={(e) => setStoreQty(e.target.value)}
              />
              <div className="bank-amount-row-buttons">
                <button
                  disabled={!storeGoodId}
                  onClick={() => {
                    const qty = Number(storeQty)
                    if (storeGoodId && qty > 0) storeGoods(cityId, storeGoodId, qty)
                    setStoreQty('')
                  }}
                >
                  Store
                </button>
              </div>
            </div>

            <p className="muted">Withdraw stored goods back into cargo.</p>
            <div className="bank-amount-row">
              <select
                className="trade-qty-input"
                value={withdrawGoodId}
                onChange={(e) => setWithdrawGoodId(e.target.value)}
              >
                <option value="">Select good…</option>
                {withdrawableGoods.map((goodId) => (
                  <option key={goodId} value={goodId}>
                    {goodName(goodId)} ({cityWarehouseGoods[goodId]?.qty ?? 0} stored)
                  </option>
                ))}
              </select>
              <input
                className="trade-qty-input"
                type="number"
                min={0}
                placeholder="Qty"
                value={withdrawQty}
                onChange={(e) => setWithdrawQty(e.target.value)}
              />
              <div className="bank-amount-row-buttons">
                <button
                  className="secondary"
                  disabled={!withdrawGoodId}
                  onClick={() => {
                    const qty = Number(withdrawQty)
                    if (withdrawGoodId && qty > 0) withdrawGoods(cityId, withdrawGoodId, qty)
                    setWithdrawQty('')
                  }}
                >
                  Withdraw
                </button>
              </div>
            </div>
          </div>

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
                {Array.from({ length: floorsBuilt }, (_, i) => CONFIG.warehouse.floors[i + 1]?.annualMaintenance ?? 0)
                  .reduce((a, b) => a + b, 0)
                  .toLocaleString()}
                /yr
              </strong>
            </div>
            <div className="row muted">
              <span>All warehouses' combined year-end bill</span>
              <strong>${annualBill.toFixed(0)}</strong>
            </div>
            {game.warehouseMaintenanceDebt && (
              <div className="row">
                <span>Outstanding maintenance debt</span>
                <strong>
                  $
                  {(
                    game.warehouseMaintenanceDebt.principal + game.warehouseMaintenanceDebt.accruedInterest
                  ).toFixed(2)}
                </strong>
              </div>
            )}
          </div>

          <div className="card">
            <h2>Sell warehouse</h2>
            <p className="muted">
              Liquidates all {floorsBuilt} floor{floorsBuilt === 1 ? '' : 's'} for 50% of total build cost ($
              {(cumulativeBuildCost(floorsBuilt) * CONFIG.warehouse.sellBackFraction).toLocaleString()}).
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
