import { useEffect, useRef, useState } from 'react'
import './App.css'
import { useGameStore } from './store/gameStore'
import TitleScreen from './screens/TitleScreen'
import MarketScreen from './screens/MarketScreen'
import TravelScreen from './screens/TravelScreen'
import BankScreen from './screens/BankScreen'
import WarehouseScreen from './screens/WarehouseScreen'
import NewspaperScreen from './screens/NewspaperScreen'
import YearEndScreen from './screens/YearEndScreen'
import GameOverScreen from './screens/GameOverScreen'
import RealEstateScreen from './screens/RealEstateScreen'
import HubScene from './scene/HubScene'
import Hud, { type PopupKind } from './components/Hud'
import PopupLayer from './components/PopupLayer'
import DayTransition from './components/DayTransition'
import { CITIES } from '../engine/data/cities'
import { cargoUsed } from '../engine/cargo'
import { isHotelOwnedByPlayer } from '../engine/hotel'

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
  const buildOrUpgradeHotel = useGameStore((s) => s.buildOrUpgradeHotel)
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

  // How many of `game.taxHistory`'s entries have already been SHOWN (not
  // necessarily "acknowledged" in a persisted sense — see below) to the
  // player this session. An INDEX, not a length-diff/boolean, because a
  // multi-day Travel jump can make `runYearEnd` fire more than once in a
  // single store action — an index lets each one surface in turn across
  // subsequent renders instead of the intermediate one being silently
  // dropped. Initialized to the ALREADY-EXISTING history length the moment
  // a game first becomes active this session (fresh game: 0; a loaded save
  // with prior years: however many it already has) so re-opening an old
  // save never re-shows year-ends from a previous session.
  const [acknowledgedYearEnd, setAcknowledgedYearEnd] = useState(0)
  const wasGameNullRef = useRef(true)
  useEffect(() => {
    if (game && wasGameNullRef.current) {
      setAcknowledgedYearEnd(game.taxHistory.length)
    }
    wasGameNullRef.current = !game
  }, [game])

  if (!game) {
    return (
      <div className="app-frame">
        <TitleScreen />
      </div>
    )
  }

  if (game.gameOver) {
    // T043: a true full-screen takeover (the run has ended) rather than a
    // popup over the hub scene — matches the doc's own allowance for this
    // one screen. Score was already recorded by the store the instant
    // `gameOver` flipped true (see gameStore.ts's `commit`), never here.
    return (
      <div className="app-frame">
        <GameOverScreen />
      </div>
    )
  }

  const city = CITIES.find((c) => c.id === game.currentCity)
  const ownedGoodCount = Object.values(game.cargo).filter((holding) => holding.qty > 0).length

  // Automatic overlays take priority over whatever the player manually
  // opened, in this order: an outstanding default decision (the bank
  // literally will not let the player ignore it) beats an unshown year-end
  // statement, which beats the player's own popup choice. Both automatic
  // cases are pure derivations of `game`/`acknowledgedYearEnd` — recomputed
  // every render, not tracked via a separate "is this open" flag — so
  // dismissing one correctly reveals whichever is next without any extra
  // coordination code.
  const pendingYearEnd =
    game.taxHistory.length > acknowledgedYearEnd ? game.taxHistory[acknowledgedYearEnd] : undefined
  const effectivePopup: PopupKind | 'yearend' = game.awaitingDefaultDecision ? 'bank' : pendingYearEnd ? 'yearend' : popup

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
        currentCityHotelUnowned={!isHotelOwnedByPlayer(game, game.currentCity)}
        onBuyHotelHere={() => buildOrUpgradeHotel(game.currentCity)}
      />

      {transition && <DayTransition key={transition.key} message={transition.message} variant={transition.variant} />}

      {effectivePopup === 'market' && (
        <PopupLayer title="Market" onClose={() => setPopup(null)}>
          <MarketScreen />
        </PopupLayer>
      )}
      {effectivePopup === 'travel' && (
        <PopupLayer title="Travel" onClose={() => setPopup(null)}>
          <TravelScreen onClose={() => setPopup(null)} />
        </PopupLayer>
      )}
      {effectivePopup === 'bank' && (
        <PopupLayer
          title="Bank"
          // The default-decision prompt (BankScreen renders it internally
          // whenever game.awaitingDefaultDecision is set) cannot be
          // dismissed via the X — the player must actually pick one of the
          // three choices, which is what clears it.
          onClose={() => {
            if (!game.awaitingDefaultDecision) setPopup(null)
          }}
        >
          <BankScreen />
        </PopupLayer>
      )}
      {effectivePopup === 'newspaper' && (
        <PopupLayer title="Newspaper" onClose={() => setPopup(null)}>
          <NewspaperScreen />
        </PopupLayer>
      )}
      {effectivePopup === 'warehouse' && (
        <PopupLayer title="Warehouse" onClose={() => setPopup(null)}>
          <WarehouseScreen />
        </PopupLayer>
      )}
      {effectivePopup === 'realestate' && (
        <PopupLayer title="Real Estate" onClose={() => setPopup(null)}>
          <RealEstateScreen />
        </PopupLayer>
      )}
      {effectivePopup === 'yearend' && pendingYearEnd && (
        <PopupLayer title="Year-End" onClose={() => setAcknowledgedYearEnd((n) => n + 1)}>
          <YearEndScreen record={pendingYearEnd} onDismiss={() => setAcknowledgedYearEnd((n) => n + 1)} />
        </PopupLayer>
      )}
    </div>
  )
}

export default App
