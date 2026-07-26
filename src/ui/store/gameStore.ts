/**
 * Zustand game store — thin adapter wiring UI actions into /src/engine.
 *
 * No game logic lives here: every action just calls an engine function and
 * writes back whatever GameState it returns. This is a minimal playable
 * slice (fast-tracked ahead of the full T034 store per user request) — it
 * only wires the actions the current MVP screens need (new game, buy/sell,
 * travel, stay, save/continue). Deposits/loans/CA/tax dispatch are left for
 * a later pass.
 *
 * Save/load (fast-tracked ahead of the full T032 persistence task, same
 * spirit as the rest of this file): every mutating action runs its result
 * through `persist()` before `set()`, so the current run auto-saves to
 * localStorage after every buy/sell/travel/stay — reloading the page never
 * loses more than the single in-flight action. `save()` is an ADDITIONAL
 * manual trigger purely for player-visible reassurance (flips `justSaved`
 * for 2s so the HUD can show a brief confirmation); it doesn't do anything
 * auto-save hasn't already done. `continueGame()` is what the Title screen's
 * "Continue" button calls.
 */

import { create } from 'zustand'
import { createNewGame } from '../../engine/newGame'
import { buy as engineBuy, sell as engineSell } from '../../engine/actions/trade'
import { travel as engineTravel, advanceTravelDay } from '../../engine/actions/travel'
import { stay as engineStay } from '../../engine/actions/stay'
import { checkCityUnlocks, checkGoodUnlocks } from '../../engine/unlocks'
import { hasSavedGame, loadGame, saveGame } from '../../engine/persistence/saveLoad'
import type { CityId, Difficulty, GameState, GoodId } from '../../engine/types'

interface GameStoreState {
  game: GameState | null
  /** True for a few seconds right after a successful `save()` call, so the
   * UI can show a brief "Saved!" confirmation without a separate toast
   * system — see `save()` below. */
  justSaved: boolean
  newGame: (difficulty: Difficulty) => void
  buy: (goodId: GoodId, qty: number) => void
  sell: (goodId: GoodId, qty: number) => void
  travelTo: (cityId: CityId) => void
  stay: () => void
  /** Explicit manual save, for the HUD's Save button. Auto-save (see
   * `persist` below) already covers every mutating action, so this exists
   * purely to give the player an on-demand confirmation that their progress
   * is safe — matches "Save" per §1/§17. */
  save: () => void
  /** Loads the last auto/manually-saved run, if one exists. Returns whether
   * a save was actually found and restored — the Title screen's "Continue"
   * action uses this to know whether to fall through to a fresh game. */
  continueGame: () => boolean
  hasSave: () => boolean
}

/** Auto-save hook: every mutating store action funnels its resulting state
 * through this before `set()`, so a save is never more than one action
 * stale — reloading the page (or a crash) loses at most the current
 * in-progress action, not the whole run. Manual `save()` (below) is
 * additive on top of this, purely for player-visible reassurance. */
function persist(state: GameState): GameState {
  saveGame(state)
  return state
}

/** Runs the two unlock-check functions (T010) — safe/cheap no-ops when
 * nothing newly qualifies. Called after every state-changing action so the
 * UI always reflects current unlock status. */
function refreshUnlocks(state: GameState): GameState {
  return checkGoodUnlocks(checkCityUnlocks(state))
}

export const useGameStore = create<GameStoreState>((set, get) => ({
  game: null,
  justSaved: false,

  newGame: (difficulty) => {
    set({ game: persist(createNewGame(difficulty, Date.now())) })
  },

  buy: (goodId, qty) => {
    const { game } = get()
    if (!game) return
    const price = game.priceStates[game.currentCity]?.[goodId]?.currentPrice
    if (price === undefined) return
    set({ game: persist(refreshUnlocks(engineBuy(game, goodId, qty, price))) })
  },

  sell: (goodId, qty) => {
    const { game } = get()
    if (!game) return
    const price = game.priceStates[game.currentCity]?.[goodId]?.currentPrice
    if (price === undefined) return
    set({ game: persist(refreshUnlocks(engineSell(game, goodId, qty, price))) })
  },

  travelTo: (cityId) => {
    const { game } = get()
    if (!game) return
    let next = engineTravel(game, cityId)
    if (next === game) return // rejected (insufficient fare, already traveling, etc.)
    // Multi-day trips: the UI doesn't need to render intermediate transit
    // days for this MVP, so run advanceTravelDay to completion here. Capped
    // so a data bug can never spin forever.
    let guard = 0
    while (next.travelInProgress !== null && guard < 30) {
      next = advanceTravelDay(next)
      guard++
    }
    set({ game: persist(refreshUnlocks(next)) })
  },

  stay: () => {
    const { game } = get()
    if (!game) return
    set({ game: persist(refreshUnlocks(engineStay(game))) })
  },

  save: () => {
    const { game } = get()
    if (!game) return
    saveGame(game)
    set({ justSaved: true })
    setTimeout(() => set({ justSaved: false }), 2000)
  },

  continueGame: () => {
    const loaded = loadGame()
    if (!loaded) return false
    set({ game: loaded })
    return true
  },

  hasSave: () => hasSavedGame(),
}))
