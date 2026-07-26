import { useState } from 'react'
import './App.css'
import { useGameStore } from './store/gameStore'
import TitleScreen from './screens/TitleScreen'
import MarketScreen from './screens/MarketScreen'
import TravelScreen from './screens/TravelScreen'
import HubScene from './scene/HubScene'
import Hud, { type PopupKind } from './components/Hud'
import PopupLayer from './components/PopupLayer'
import { CITIES } from '../engine/data/cities'
import { cargoUsed } from '../engine/cargo'

function App() {
  const game = useGameStore((s) => s.game)
  const stay = useGameStore((s) => s.stay)
  const save = useGameStore((s) => s.save)
  const justSaved = useGameStore((s) => s.justSaved)
  const [popup, setPopup] = useState<PopupKind>(null)

  if (!game) {
    return (
      <div className="app-frame">
        <TitleScreen />
      </div>
    )
  }

  const city = CITIES.find((c) => c.id === game.currentCity)
  const ownedGoodCount = Object.values(game.cargo).filter((holding) => holding.qty > 0).length

  return (
    <div className="app-frame app-frame--scene">
      <HubScene cityId={game.currentCity} />
      <Hud
        cityName={city?.name ?? game.currentCity}
        day={game.day}
        cash={game.cash}
        ownedGoodCount={ownedGoodCount}
        cargoUsed={cargoUsed(game)}
        cargoCapacity={game.cargoCapacity}
        onOpen={setPopup}
        onStay={() => stay()}
        onSave={() => save()}
        justSaved={justSaved}
      />

      {popup === 'market' && (
        <PopupLayer title="Market" onClose={() => setPopup(null)}>
          <MarketScreen />
        </PopupLayer>
      )}
      {popup === 'travel' && (
        <PopupLayer title="Travel" onClose={() => setPopup(null)}>
          <TravelScreen onClose={() => setPopup(null)} />
        </PopupLayer>
      )}
      {popup === 'bank' && (
        <PopupLayer title="Bank" onClose={() => setPopup(null)}>
          <p className="muted">Coming soon.</p>
        </PopupLayer>
      )}
      {popup === 'newspaper' && (
        <PopupLayer title="Newspaper" onClose={() => setPopup(null)}>
          <p className="muted">Coming soon.</p>
        </PopupLayer>
      )}
    </div>
  )
}

export default App
