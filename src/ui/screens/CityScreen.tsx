import { useGameStore } from '../store/gameStore'
import { cargoUsed } from '../../engine/cargo'
import { CITIES } from '../../engine/data/cities'
import type { Screen } from '../App'

export default function CityScreen({ navigate }: { navigate: (screen: Screen) => void }) {
  const game = useGameStore((s) => s.game)
  const stay = useGameStore((s) => s.stay)
  if (!game) return null

  const city = CITIES.find((c) => c.id === game.currentCity)

  return (
    <div className="screen">
      <div className="skyline">🏙️</div>
      <h1>{city?.name ?? game.currentCity}</h1>
      <p className="muted">{city?.character}</p>

      <div className="card row">
        <span>Day {game.day}</span>
        <span>${game.cash.toFixed(0)}</span>
        <span>
          Cargo {cargoUsed(game)}/{game.cargoCapacity}
        </span>
      </div>

      <div className="nav-grid">
        <button onClick={() => navigate('market')}>Market</button>
        <button onClick={() => navigate('travel')}>Travel</button>
        <button className="secondary" onClick={() => stay()}>
          Stay ({city ? `$${city.hotelPerNight}` : '…'})
        </button>
        <button className="secondary" disabled>
          Bank (soon)
        </button>
      </div>
    </div>
  )
}
