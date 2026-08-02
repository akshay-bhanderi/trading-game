/**
 * Travel screen — user-requested redesign (2026-08). Previously one full-
 * width card per city with an expandable "seen dNN ▾" toggle that revealed
 * a full last-known-price list for every tradeable good — required
 * scrolling once more than a couple of cities were unlocked, and the price
 * list was cut entirely per the user's own answer ("drop it, just the
 * one-liner"). Now: a compact 2-column grid, each city a small tile with
 * fare/days, a one-line "Last visited N days ago" (or "Never visited"), and
 * the Travel button inline in the SAME tile — no separate button row, no
 * expand/collapse, so more cities fit on screen without scrolling.
 */

import { useGameStore } from '../store/gameStore'
import { calcFare, getTravelDays } from '../../engine/travel'
import { cargoUsed } from '../../engine/cargo'
import { CITIES } from '../../engine/data/cities'

export default function TravelScreen({ onClose }: { onClose: () => void }) {
  const game = useGameStore((s) => s.game)
  const travelTo = useGameStore((s) => s.travelTo)
  if (!game) return null

  const cargoUsedPct = cargoUsed(game) / game.cargoCapacity
  const destinations = CITIES.filter(
    (c) => game.unlockedCityIds.includes(c.id) && c.id !== game.currentCity,
  )

  return (
    <div className="travel-grid">
      {destinations.map((city) => {
        const days = getTravelDays(game.currentCity, city.id)
        const fare = calcFare(days, city.tier, cargoUsedPct)
        const lastVisitedDay = game.lastVisitedDayByCity?.[city.id]
        const daysSinceVisit = lastVisitedDay !== undefined ? game.day - lastVisitedDay : undefined

        return (
          <div className="card travel-tile" key={city.id}>
            <div className="row">
              <strong>{city.name}</strong>
              <span className="muted">Tier {city.tier}</span>
            </div>
            <div className="muted travel-tile-fare">
              {days} day{days === 1 ? '' : 's'} · ${fare.toFixed(0)} fare
            </div>
            <div className="muted travel-tile-visited">
              {daysSinceVisit === undefined
                ? 'Never visited'
                : daysSinceVisit === 0
                  ? 'Last visited today'
                  : `Last visited ${daysSinceVisit} day${daysSinceVisit === 1 ? '' : 's'} ago`}
            </div>
            <button
              className="travel-tile-btn"
              onClick={() => {
                travelTo(city.id)
                onClose()
              }}
            >
              Travel
            </button>
          </div>
        )
      })}
    </div>
  )
}
