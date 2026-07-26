import { useGameStore } from '../store/gameStore'
import { cargoUsed } from '../../engine/cargo'
import { CITIES } from '../../engine/data/cities'
import { SkylineIcon, CoinIcon, CargoIcon, CompassIcon, BedIcon, LedgerIcon } from '../components/PixelIcons'
import type { Screen } from '../App'

export default function CityScreen({ navigate }: { navigate: (screen: Screen) => void }) {
  const game = useGameStore((s) => s.game)
  const stay = useGameStore((s) => s.stay)
  if (!game) return null

  const city = CITIES.find((c) => c.id === game.currentCity)

  return (
    <div className="screen">
      <div className="skyline">
        <SkylineIcon size={64} />
      </div>
      <h1>{city?.name ?? game.currentCity}</h1>
      <p className="muted">{city?.character}</p>

      <div className="card row">
        <span>Day {game.day}</span>
        <span className="icon-label">
          <CoinIcon size={14} />${game.cash.toFixed(0)}
        </span>
        <span className="icon-label">
          <CargoIcon size={14} />
          {cargoUsed(game)}/{game.cargoCapacity}
        </span>
      </div>

      <div className="nav-grid">
        <button onClick={() => navigate('market')}>
          <span className="icon-label">
            <CoinIcon size={14} />
            Market
          </span>
        </button>
        <button onClick={() => navigate('travel')}>
          <span className="icon-label">
            <CompassIcon size={14} />
            Travel
          </span>
        </button>
        <button className="secondary" onClick={() => stay()}>
          <span className="icon-label">
            <BedIcon size={14} />
            Stay ({city ? `$${city.hotelPerNight}` : '…'})
          </span>
        </button>
        <button className="secondary" disabled>
          <span className="icon-label">
            <LedgerIcon size={14} />
            Bank (soon)
          </span>
        </button>
      </div>
    </div>
  )
}
