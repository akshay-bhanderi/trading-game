/**
 * Aviation / Fleet screen (T066) — trade-winds-design-doc.md §12 screen 11:
 * "list of owned planes, each with a status toggle (Idle / Leased Monthly /
 * Leased Annual / Personal use) and running income/maintenance totals."
 *
 * Follows the same "flat list of `.card`s inside a popup" shape as
 * BankScreen.tsx (T040) rather than MarketScreen's drill-down pattern — a
 * plane's whole interaction surface (status toggle + the couple of
 * lease-specific actions) fits comfortably in one card, so there's no need
 * for a separate detail view to navigate into.
 *
 * Buying is gated by `isPlanePurchaseAvailable` (aviation.ts, T060 — Medium+
 * bank city) exactly like BankScreen gates its "Hire an Accountant" card on
 * the equivalent CA check; the purchase buttons themselves are left
 * clickable even when `game.cash` is short (the engine call silently
 * no-ops on rejection, matching every other action in this store) but are
 * visually `disabled` as a courtesy, the same treatment BankScreen doesn't
 * bother with for its CA fees (small, fixed amounts) but is worth it here
 * given planes cost up to $4,000,000.
 *
 * Per-plane income/maintenance figures reuse aviation.ts's exported
 * `planeDailyIncome`/`planeDailyMaintenance`/`isFuelPriceSpikeActive` pure
 * helpers directly — this file never reimplements §16's rate formulas.
 */

import { useGameStore } from '../store/gameStore'
import { CITIES } from '../../engine/data/cities'
import { CONFIG, YEAR_LENGTH_DAYS } from '../../engine/config'
import {
  isPlanePurchaseAvailable,
  planeDailyIncome,
  planeDailyMaintenance,
  planeDepreciatedValue,
  isFuelPriceSpikeActive,
} from '../../engine/aviation'
import { formatMoney } from '../format'
import type { Plane, PlaneClass, PlaneStatus } from '../../engine/types'

const CLASS_LABELS: Record<PlaneClass, string> = {
  propFeeder: 'Prop Feeder',
  regionalJet: 'Regional Jet',
  freighter: 'Freighter',
  widebody: 'Widebody',
}

const STATUS_LABELS: Record<PlaneStatus, string> = {
  idle: 'Idle',
  leasedMonthly: 'Leased Monthly',
  leasedAnnual: 'Leased Annual',
  personal: 'Personal use',
}

const PLANE_CLASSES = Object.keys(CONFIG.aviation.classes) as PlaneClass[]
const PLANE_STATUSES: PlaneStatus[] = ['idle', 'leasedMonthly', 'leasedAnnual', 'personal']

function money(n: number): string {
  return `$${formatMoney(n)}`
}

export default function AviationScreen() {
  const game = useGameStore((s) => s.game)
  const buyPlane = useGameStore((s) => s.buyPlane)
  const setPlaneStatus = useGameStore((s) => s.setPlaneStatus)
  const cancelMonthlyLease = useGameStore((s) => s.cancelMonthlyLease)
  const terminateAnnualLease = useGameStore((s) => s.terminateAnnualLease)
  const sellPlane = useGameStore((s) => s.sellPlane)

  if (!game) return null

  const planes = game.planes ?? []
  const city = CITIES.find((c) => c.id === game.currentCity)
  const purchaseAvailable = isPlanePurchaseAvailable(game)
  const fuelSpikeActive = isFuelPriceSpikeActive(game)

  const fleetDailyIncome = planes.reduce((sum, p) => sum + planeDailyIncome(p, game.day), 0)
  const fleetDailyMaintenance = planes.reduce((sum, p) => sum + planeDailyMaintenance(p, fuelSpikeActive), 0)

  return (
    <div className="aviation-screen">
      {planes.length > 0 && (
        <div className="card">
          <h2>Fleet — {planes.length} plane{planes.length === 1 ? '' : 's'}</h2>
          <div className="row">
            <span>Income/day</span>
            <strong className="market-sell-profit">+{money(fleetDailyIncome)}</strong>
          </div>
          <div className="row">
            <span>Maintenance/day</span>
            <strong className="market-sell-loss">-{money(fleetDailyMaintenance)}</strong>
          </div>
          {fuelSpikeActive && (
            <p className="muted">Fuel price spike in effect — maintenance is +30% until it passes.</p>
          )}
        </div>
      )}

      <div className="card">
        <h2>Buy a plane — {city?.name ?? game.currentCity}</h2>
        {purchaseAvailable ? (
          <div className="nav-grid">
            {PLANE_CLASSES.map((planeClass) => {
              const classConfig = CONFIG.aviation.classes[planeClass]
              return (
                <button
                  key={planeClass}
                  className="secondary"
                  disabled={game.cash < classConfig.purchasePrice}
                  onClick={() => buyPlane(game.currentCity, planeClass)}
                >
                  {CLASS_LABELS[planeClass]}
                  <br />
                  {money(classConfig.purchasePrice)}
                </button>
              )
            })}
          </div>
        ) : (
          <p className="muted">
            Plane purchases require a Medium-or-larger bank (Port Vela, Ironvale, or Silkden).
          </p>
        )}
      </div>

      {planes.length === 0 && <p className="muted">No planes owned yet.</p>}

      {planes.map((plane) => (
        <PlaneCard
          key={plane.id}
          plane={plane}
          day={game.day}
          fuelSpikeActive={fuelSpikeActive}
          onSetStatus={(status) => setPlaneStatus(plane.id, status)}
          onCancelMonthly={() => cancelMonthlyLease(plane.id)}
          onTerminateAnnual={() => terminateAnnualLease(plane.id)}
          onSell={() => sellPlane(plane.id)}
        />
      ))}
    </div>
  )
}

interface PlaneCardProps {
  plane: Plane
  day: number
  fuelSpikeActive: boolean
  onSetStatus: (status: PlaneStatus) => void
  onCancelMonthly: () => void
  onTerminateAnnual: () => void
  onSell: () => void
}

function PlaneCard({ plane, day, fuelSpikeActive, onSetStatus, onCancelMonthly, onTerminateAnnual, onSell }: PlaneCardProps) {
  const income = planeDailyIncome(plane, day)
  const maintenance = planeDailyMaintenance(plane, fuelSpikeActive)
  const value = planeDepreciatedValue(plane, day)
  const grounded = plane.groundedUntilDay !== undefined && day < plane.groundedUntilDay

  // Preview-only figures (same formulas as aviation.ts's terminateAnnualLease/
  // sellPlane — duplicated here purely for display, never used to actually
  // charge/pay anything; the store's action calls the real engine function).
  const classConfig = CONFIG.aviation.classes[plane.class]
  const annualTermEndDay = plane.annualLeaseStartDay !== undefined ? plane.annualLeaseStartDay + YEAR_LENGTH_DAYS : undefined
  const annualRemainingDays = annualTermEndDay !== undefined ? Math.max(0, annualTermEndDay - day) : 0
  const annualDailyRevenue = (plane.purchasePrice * classConfig.annualLeaseRatePctOfPrice) / YEAR_LENGTH_DAYS
  const terminationPenalty = annualRemainingDays * annualDailyRevenue * CONFIG.aviation.annualLeaseEarlyTerminationPenaltyPct
  const saleProceeds = value * (1 - CONFIG.aviation.liquidationFeePct)

  const annualLocked =
    plane.status === 'leasedAnnual' && plane.annualLeaseStartDay !== undefined && day < plane.annualLeaseStartDay + YEAR_LENGTH_DAYS
  const monthlyNoticePending = plane.status === 'leasedMonthly' && plane.monthlyLeaseCancelEffectiveDay !== undefined

  return (
    <div className="card">
      <h2>
        {CLASS_LABELS[plane.class]} <span className="muted">— {STATUS_LABELS[plane.status]}</span>
      </h2>

      {grounded && (
        <p className="muted market-sell-loss">
          Grounded (safety incident) until day {plane.groundedUntilDay} — income paused, maintenance still owed.
        </p>
      )}

      <div className="row">
        <span>Value</span>
        <span>{money(value)}</span>
      </div>
      <div className="row">
        <span>Income/day</span>
        <strong className="market-sell-profit">+{money(income)}</strong>
      </div>
      <div className="row">
        <span>Maintenance/day</span>
        <strong className="market-sell-loss">-{money(maintenance)}</strong>
      </div>

      <div className="nav-grid">
        {PLANE_STATUSES.map((status) => {
          // Locked out per aviation.ts's setPlaneStatus rules (firm Annual
          // term / pending Monthly notice) — same-status re-selection is
          // always allowed (it re-arms Personal use's bonus).
          const locked = status !== plane.status && ((annualLocked && plane.status === 'leasedAnnual') || (monthlyNoticePending && plane.status === 'leasedMonthly'))
          return (
            <button
              key={status}
              className={status === plane.status ? undefined : 'secondary'}
              disabled={locked}
              onClick={() => onSetStatus(status)}
            >
              {STATUS_LABELS[status]}
            </button>
          )
        })}
      </div>

      {plane.status === 'leasedMonthly' && (
        <p className="muted">
          {monthlyNoticePending
            ? `Cancellation notice given — income stops day ${plane.monthlyLeaseCancelEffectiveDay}.`
            : `Cancellable anytime with ${CONFIG.aviation.monthlyLeaseCancelNoticeDays} days' notice.`}
        </p>
      )}
      {!monthlyNoticePending && plane.status === 'leasedMonthly' && (
        <button className="secondary" onClick={onCancelMonthly}>
          Give cancellation notice
        </button>
      )}

      {plane.status === 'leasedAnnual' && (
        <>
          <p className="muted">
            Firm term through day {annualTermEndDay}. Early exit forfeits the rest and costs a 50% penalty on
            remaining revenue (currently ~{money(terminationPenalty)}).
          </p>
          <button className="secondary" onClick={onTerminateAnnual}>
            Terminate lease early (~{money(terminationPenalty)})
          </button>
        </>
      )}

      <button className="secondary" onClick={onSell}>
        Sell plane ({money(saleProceeds)})
      </button>
    </div>
  )
}
