import { useGameStore } from '../store/gameStore'
import { calcFare, getTravelDays } from '../../engine/travel'
import { cargoUsed } from '../../engine/cargo'
import { CITIES } from '../../engine/data/cities'
import type { Screen } from '../App'

export default function TravelScreen({ navigate }: { navigate: (screen: Screen) => void }) {
  const game = useGameStore((s) => s.game)
  const travelTo = useGameStore((s) => s.travelTo)
  if (!game) return null

  const cargoUsedPct = cargoUsed(game) / game.cargoCapacity
  const destinations = CITIES.filter(
    (c) => game.unlockedCityIds.includes(c.id) && c.id !== game.currentCity,
  )

  return (
    <div className="screen">
      <button className="secondary" onClick={() => navigate('city')}>
        ← Back
      </button>
      <h1>Travel</h1>

      {destinations.map((city) => {
        const days = getTravelDays(game.currentCity, city.id)
        const fare = calcFare(days, city.tier, cargoUsedPct)
        const priceHere = game.priceStates[city.id]
        const lastSeenDay = priceHere?.grain?.lastSeenDay

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
              <span>{lastSeenDay ? `last seen day ${lastSeenDay}` : 'never visited'}</span>
            </div>
            <button
              onClick={() => {
                travelTo(city.id)
                navigate('city')
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
