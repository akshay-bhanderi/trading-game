/**
 * Zustand game store — thin adapter wiring UI actions into /src/engine.
 *
 * No game logic lives here: every action just calls an engine function and
 * writes back whatever GameState it returns. This is a minimal playable
 * slice (fast-tracked ahead of the full T034 store per user request) — it
 * only wires the actions the current MVP screens need (new game, buy/sell,
 * travel, stay). Deposits/loans/CA/tax dispatch are left for a later pass.
 */

import { create } from 'zustand'
import { createNewGame } from '../../engine/newGame'
import { buy as engineBuy, sell as engineSell } from '../../engine/actions/trade'
import { travel as engineTravel, advanceTravelDay } from '../../engine/actions/travel'
import { stay as engineStay } from '../../engine/actions/stay'
import { checkCityUnlocks, checkGoodUnlocks } from '../../engine/unlocks'
import type { CityId, Difficulty, GameState, GoodId } from '../../engine/types'

interface GameStoreState {
  game: GameState | null
  newGame: (difficulty: Difficulty) => void
  buy: (goodId: GoodId, qty: number) => void
  sell: (goodId: GoodId, qty: number) => void
  travelTo: (cityId: CityId) => void
  stay: () => void
}

/** Runs the two unlock-check functions (T010) — safe/cheap no-ops when
 * nothing newly qualifies. Called after every state-changing action so the
 * UI always reflects current unlock status. */
function refreshUnlocks(state: GameState): GameState {
  return checkGoodUnlocks(checkCityUnlocks(state))
}

export const useGameStore = create<GameStoreState>((set, get) => ({
  game: null,

  newGame: (difficulty) => {
    set({ game: createNewGame(difficulty, Date.now()) })
  },

  buy: (goodId, qty) => {
    const { game } = get()
    if (!game) return
    const price = game.priceStates[game.currentCity]?.[goodId]?.currentPrice
    if (price === undefined) return
    set({ game: refreshUnlocks(engineBuy(game, goodId, qty, price)) })
  },

  sell: (goodId, qty) => {
    const { game } = get()
    if (!game) return
    const price = game.priceStates[game.currentCity]?.[goodId]?.currentPrice
    if (price === undefined) return
    set({ game: refreshUnlocks(engineSell(game, goodId, qty, price)) })
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
    set({ game: refreshUnlocks(next) })
  },

  stay: () => {
    const { game } = get()
    if (!game) return
    set({ game: refreshUnlocks(engineStay(game)) })
  },
}))
