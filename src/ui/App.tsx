import { useEffect, useRef, useState } from 'react'
import './App.css'
import { useGameStore } from './store/gameStore'
import TitleScreen from './screens/TitleScreen'
import MarketScreen from './screens/MarketScreen'
import TravelScreen from './screens/TravelScreen'
import BankScreen from './screens/BankScreen'
import WarehouseScreen from './screens/WarehouseScreen'
import AviationScreen from './screens/AviationScreen'
import NewspaperScreen from './screens/NewspaperScreen'
import YearEndScreen from './screens/YearEndScreen'
import GameOverScreen from './screens/GameOverScreen'
import RealEstateScreen from './screens/RealEstateScreen'
import MenuScreen from './screens/MenuScreen'
import HubScene from './scene/HubScene'
import Hud, { type PopupKind } from './components/Hud'
import PopupLayer from './components/PopupLayer'
import DayTransition from './components/DayTransition'
import ConfirmDialog from './components/ConfirmDialog'
import UpdateToast from './components/UpdateToast'
import { CITIES } from '../engine/data/cities'
import { cargoUsed } from '../engine/cargo'
import { isHotelOwnedByPlayer } from '../engine/hotel'
import { useBackgroundMusic } from './audio/useBackgroundMusic'

function cityName(cityId: string): string {
  return CITIES.find((c) => c.id === cityId)?.name ?? cityId
}

/** How long a transition stays on screen before auto-dismissing — must
 * match the CSS animation duration in App.css's `.day-transition` rule. */
const TRANSITION_DURATION_MS = 1100

function App() {
  const game = useGameStore((s) => s.game)
  const stay = useGameStore((s) => s.stay)
  const justSaved = useGameStore((s) => s.justSaved)
  const buildOrUpgradeHotel = useGameStore((s) => s.buildOrUpgradeHotel)
  const [popup, setPopup] = useState<PopupKind>(null)
  // Confirmation gate in front of `stay()` — advancing the day is a
  // one-tap action right next to Travel/Market in the HUD, easy to hit by
  // accident; this makes it a deliberate two-tap action instead. Plain
  // component state (not tied to `PopupKind`) since a `ConfirmDialog` is a
  // short yes/no interrupt, not a browsable panel.
  const [showStayConfirm, setShowStayConfirm] = useState(false)

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

  // Automatic overlays take priority over whatever the player manually
  // opened, in this order: an outstanding default decision (the bank
  // literally will not let the player ignore it) beats an unshown year-end
  // statement, which beats the player's own popup choice. Both automatic
  // cases are pure derivations of `game`/`acknowledgedYearEnd` — recomputed
  // every render, not tracked via a separate "is this open" flag — so
  // dismissing one correctly reveals whichever is next without any extra
  // coordination code. Computed here (above the early returns below) so it
  // doubles as the single source of truth `useBackgroundMusic` reads to pick
  // gameplay vs. menu music (T072) — see that hook's own doc comment.
  const pendingYearEnd =
    game && game.taxHistory.length > acknowledgedYearEnd ? game.taxHistory[acknowledgedYearEnd] : undefined
  const effectivePopup: PopupKind | 'yearend' | null = game
    ? game.awaitingDefaultDecision
      ? 'bank'
      : pendingYearEnd
        ? 'yearend'
        : popup
    : null

  // No game yet (Title screen), the run just ended (Game Over takeover), or
  // any popup/automatic-overlay is covering the hub scene — all read as
  // "menu" music; only the bare hub scene (actively trading/traveling) gets
  // the gameplay loop. See tasks/phase-15-background-music.md's T072 trigger
  // mapping, including why no separate "paused" case is needed.
  useBackgroundMusic(!game || game.gameOver || effectivePopup !== null ? 'menu' : 'gameplay')

  if (!game) {
    return (
      <div className="app-frame">
        <TitleScreen />
        <UpdateToast />
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
        <UpdateToast />
      </div>
    )
  }

  const city = CITIES.find((c) => c.id === game.currentCity)
  const ownedGoodCount = Object.values(game.cargo).filter((holding) => holding.qty > 0).length

  return (
    <div className="app-frame app-frame--scene">
      <HubScene cityId={game.currentCity} cityName={city?.name ?? game.currentCity} />
      <Hud
        day={game.day}
        cash={game.cash}
        ownedGoodCount={ownedGoodCount}
        cargoUsed={cargoUsed(game)}
        cargoCapacity={game.cargoCapacity}
        onOpen={setPopup}
        onStayRequest={() => setShowStayConfirm(true)}
        justSaved={justSaved}
        currentCityHotelUnowned={!isHotelOwnedByPlayer(game, game.currentCity)}
        onBuyHotelHere={() => buildOrUpgradeHotel(game.currentCity)}
      />

      {transition && <DayTransition key={transition.key} message={transition.message} variant={transition.variant} />}

      {showStayConfirm && (
        <ConfirmDialog
          message="Move to the next day? Prices will shift and today's paper closes out."
          confirmLabel="Advance"
          onConfirm={() => {
            setShowStayConfirm(false)
            stay()
          }}
          onCancel={() => setShowStayConfirm(false)}
        />
      )}

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
      {effectivePopup === 'aviation' && (
        <PopupLayer title="Aviation" onClose={() => setPopup(null)}>
          <AviationScreen />
        </PopupLayer>
      )}
      {effectivePopup === 'menu' && (
        <PopupLayer title="Menu" onClose={() => setPopup(null)}>
          <MenuScreen onClose={() => setPopup(null)} />
        </PopupLayer>
      )}
      {effectivePopup === 'yearend' && pendingYearEnd && (
        <PopupLayer title="Year-End" onClose={() => setAcknowledgedYearEnd((n) => n + 1)}>
          <YearEndScreen record={pendingYearEnd} onDismiss={() => setAcknowledgedYearEnd((n) => n + 1)} />
        </PopupLayer>
      )}
      <UpdateToast />
    </div>
  )
}

export default App
