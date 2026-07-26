import { useEffect, useRef, useState } from 'react'
import './App.css'
import { useGameStore } from './store/gameStore'
import TitleScreen from './screens/TitleScreen'
import MarketScreen from './screens/MarketScreen'
import TravelScreen from './screens/TravelScreen'
import HubScene from './scene/HubScene'
import Hud, { type PopupKind } from './components/Hud'
import PopupLayer from './components/PopupLayer'
import DayTransition from './components/DayTransition'
import { CITIES } from '../engine/data/cities'
import { cargoUsed } from '../engine/cargo'

function cityName(cityId: string): string {
  return CITIES.find((c) => c.id === cityId)?.name ?? cityId
}

/** How long a transition stays on screen before auto-dismissing — must
 * match the CSS animation duration in App.css's `.day-transition` rule. */
const TRANSITION_DURATION_MS = 1100

function App() {
  const game = useGameStore((s) => s.game)
  const stay = useGameStore((s) => s.stay)
  const save = useGameStore((s) => s.save)
  const justSaved = useGameStore((s) => s.justSaved)
  const [popup, setPopup] = useState<PopupKind>(null)

  // Detects a day advancing (Stay) or the current city changing (Travel
  // completing) and shows a brief DayTransition overlay marking the moment
  // — see that component's own doc comment for why this exists. Tracks the
  // PREVIOUS day/city in refs (not state) purely to diff against on the
  // next render, without itself triggering a re-render.
  const prevDayRef = useRef<number | undefined>(undefined)
  const prevCityRef = useRef<string | undefined>(undefined)
  const [transition, setTransition] = useState<{ key: number; message: string; variant: 'day' | 'travel' } | null>(
    null,
  )

  useEffect(() => {
    if (!game) return
    const prevDay = prevDayRef.current
    const prevCity = prevCityRef.current

    if (prevCity !== undefined && prevCity !== game.currentCity) {
      setTransition({ key: Date.now(), message: `Arrived in ${cityName(game.currentCity)}`, variant: 'travel' })
    } else if (prevDay !== undefined && game.day !== prevDay) {
      setTransition({ key: Date.now(), message: `Day ${game.day}`, variant: 'day' })
    }

    prevDayRef.current = game.day
    prevCityRef.current = game.currentCity
  }, [game?.day, game?.currentCity])

  useEffect(() => {
    if (!transition) return
    const timer = setTimeout(() => setTransition(null), TRANSITION_DURATION_MS)
    return () => clearTimeout(timer)
  }, [transition])

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

      {transition && <DayTransition key={transition.key} message={transition.message} variant={transition.variant} />}

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
