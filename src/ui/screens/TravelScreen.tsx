/**
 * Travel screen — user-requested redesign (2026-08). Previously one full-
 * width card per city with an expandable "seen dNN ▾" toggle that revealed
 * a full last-known-price list for every tradeable good — required
 * scrolling once more than a couple of cities were unlocked, and the price
 * list was cut entirely per the user's own answer ("drop it, just the
 * one-liner"). Then: a compact 2-column grid, each tile with fare/days on
 * one line, "Last visited N days ago" on another, and a Travel button.
 *
 * FURTHER COMPACTED (2026-08, user-requested): all of a tile's info now
 * sits on ONE line — name, tier, travel days, fare, and days-since-last-
 * visit — each trimmed to its smallest legible form ("1d" not "1 day",
 * "$15" not "$15 fare", "6d" not "Last visited 6 days ago") specifically so
 * the tile shrinks. Only the Travel button gets its own (now much shorter)
 * row below.
 *
 * CURRENT CITY NOW SHOWN TOO (2026-08, user-requested): the grid used to
 * filter the current city out entirely, so there was no way to see "where
 * am I" among the unlocked-cities list. It's now included, with its Travel
 * button disabled and relabeled "You are here" instead of removed — same
 * tile shape as every other city, just non-actionable.
 */

import { useGameStore } from '../store/gameStore'
import { calcFare, getTravelDays } from '../../engine/travel'
import { cargoUsed } from '../../engine/cargo'
import { CITIES } from '../../engine/data/cities'
import { formatMoney } from '../format'

export default function TravelScreen({ onClose }: { onClose: () => void }) {
  const game = useGameStore((s) => s.game)
  const travelTo = useGameStore((s) => s.travelTo)
  if (!game) return null

  const cargoUsedPct = cargoUsed(game) / game.cargoCapacity
  const destinations = CITIES.filter((c) => game.unlockedCityIds.includes(c.id))

  return (
    <div className="travel-grid">
      {destinations.map((city) => {
        const isCurrent = city.id === game.currentCity
        const days = getTravelDays(game.currentCity, city.id)
        const fare = calcFare(days, city.tier, cargoUsedPct)
        const lastVisitedDay = game.lastVisitedDayByCity?.[city.id]
        const daysSinceVisit = lastVisitedDay !== undefined ? game.day - lastVisitedDay : undefined

        return (
          <div className={isCurrent ? 'card travel-tile travel-tile--current' : 'card travel-tile'} key={city.id}>
            <div className="travel-tile-line">
              <strong>{city.name}</strong>
              <span className="muted">T{city.tier}</span>
              <span className="muted">{days}d</span>
              <span className="muted">${formatMoney(fare)}</span>
              <span className="muted">{daysSinceVisit === undefined ? '—' : `${daysSinceVisit}d`}</span>
            </div>
            <button
              className="travel-tile-btn"
              disabled={isCurrent}
              onClick={() => {
                travelTo(city.id)
                onClose()
              }}
            >
              {isCurrent ? 'You are here' : 'Travel'}
            </button>
          </div>
        )
      })}
    </div>
  )
}
