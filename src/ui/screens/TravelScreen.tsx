import { useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { calcFare, getTravelDays } from '../../engine/travel'
import { cargoUsed } from '../../engine/cargo'
import { CITIES } from '../../engine/data/cities'
import { GOODS } from '../../engine/data/goods'
import type { CityId } from '../../engine/types'

export default function TravelScreen({ onClose }: { onClose: () => void }) {
  const game = useGameStore((s) => s.game)
  const travelTo = useGameStore((s) => s.travelTo)
  const [expandedCityId, setExpandedCityId] = useState<CityId | null>(null)
  if (!game) return null

  const cargoUsedPct = cargoUsed(game) / game.cargoCapacity
  const destinations = CITIES.filter(
    (c) => game.unlockedCityIds.includes(c.id) && c.id !== game.currentCity,
  )

  const tradeableGoods = GOODS.filter(
    (g) =>
      game.unlockedGoodIds.includes(g.id) &&
      (g.licenseFee === null || game.purchasedLicenseGoodIds.includes(g.id)),
  )

  return (
    <>
      {destinations.map((city) => {
        const days = getTravelDays(game.currentCity, city.id)
        const fare = calcFare(days, city.tier, cargoUsedPct)
        const cityPrices = game.priceStates[city.id]
        const anyLastSeenDay = cityPrices
          ? Object.values(cityPrices).find((p) => p !== undefined)?.lastSeenDay
          : undefined
        const isExpanded = expandedCityId === city.id

        return (
          <div className="card" key={city.id}>
            <div className="row">
              <strong>{city.name}</strong>
              <span className="muted">Tier {city.tier}</span>
            </div>
            <div className="row muted">
              <span>
                {days} day{days === 1 ? '' : 's'} · ${fare.toFixed(0)} fare
              </span>
              <button
                className="secondary travel-expand-btn"
                onClick={() => setExpandedCityId(isExpanded ? null : city.id)}
              >
                {anyLastSeenDay === undefined ? 'never visited' : isExpanded ? 'hide ▲' : `seen d${anyLastSeenDay} ▾`}
              </button>
            </div>

            {isExpanded && (
              <div className="travel-price-list">
                {tradeableGoods.map((good) => {
                  const priceState = cityPrices?.[good.id]
                  if (!priceState) {
                    return (
                      <div className="row muted" key={good.id}>
                        <span>{good.name}</span>
                        <span>never seen</span>
                      </div>
                    )
                  }
                  const staleness = game.day - priceState.lastSeenDay
                  return (
                    <div className="row muted" key={good.id}>
                      <span>{good.name}</span>
                      <span>
                        ${priceState.lastSeenPrice.toFixed(2)} ({staleness === 0 ? 'today' : `${staleness}d old`})
                      </span>
                    </div>
                  )
                })}
              </div>
            )}

            <button
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
    </>
  )
}
