/**
 * Zustand game store (T034) — thin adapter wiring UI actions into
 * /src/engine. No game logic lives here: every action just calls an engine
 * function and writes back whatever GameState it returns, funneled through
 * `commit()` first (see its own doc comment). Covers trade, travel, stay,
 * deposit/withdraw, loan take/repay, default resolution, CA hiring, and
 * save/load — the full T034 action surface. T052 (§14 Warehouse Storage)
 * additively extends this with build/store/withdraw/insurance/sell-back
 * actions — see those five entries below.
 *
 * Save/load (fast-tracked ahead of the full T032 persistence task before
 * T032 itself was built — both are done now): every mutating action runs
 * its result through `commit()` before `set()`, which auto-saves to
 * localStorage — reloading the page never loses more than the single
 * in-flight action. `save()` is an ADDITIONAL manual trigger purely for
 * player-visible reassurance (flips `justSaved` for 2s so the HUD can show
 * a brief confirmation); it doesn't do anything auto-save hasn't already
 * done. `continueGame()` is what the Title screen's "Continue" button calls.
 */

import { create } from 'zustand'
import { createNewGame } from '../../engine/newGame'
import { buy as engineBuy, sell as engineSell } from '../../engine/actions/trade'
import { travel as engineTravel, advanceTravelDay } from '../../engine/actions/travel'
import { stay as engineStay } from '../../engine/actions/stay'
import { checkCityUnlocks, checkGoodUnlocks } from '../../engine/unlocks'
import { hasSavedGame, loadGame, saveGame } from '../../engine/persistence/saveLoad'
import { recordScore } from '../../engine/persistence/highScore'
import { deposit as engineDeposit, withdraw as engineWithdraw } from '../../engine/bank/deposits'
import { takeLoan as engineTakeLoan, repayLoan as engineRepayLoan } from '../../engine/bank/loans'
import { resolveDefault as engineResolveDefault } from '../../engine/bank/default'
import { hireCA as engineHireCA } from '../../engine/ca'
import {
  buildWarehouseFloor as engineBuildWarehouseFloor,
  buyWarehouseInsurance as engineBuyWarehouseInsurance,
  sellWarehouse as engineSellWarehouse,
  storeGoods as engineStoreGoods,
  withdrawGoods as engineWithdrawGoods,
} from '../../engine/warehouse'
import { generateDailyPaper } from '../../engine/newspaper'
import { buyInformantTip as engineBuyInformantTip, type InformantTip } from '../../engine/informant'
import { createRng } from '../../engine/rng'
import type { CATier, CityId, Difficulty, GameState, GoodId } from '../../engine/types'

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
  deposit: (cityId: CityId, amount: number) => void
  withdraw: (cityId: CityId, amount: number) => void
  takeLoan: (cityId: CityId, amount: number) => void
  repayLoan: (cityId: CityId, amount: number) => void
  resolveDefault: (choice: 'surrender' | 'restructure' | 'bankruptcy') => void
  hireCA: (tier: Exclude<CATier, 'none'>) => void
  /** T052 — Warehouse screen actions (§14). Each is a thin pass-through to
   * its /src/engine/warehouse.ts counterpart, following the exact same
   * "call the engine function, commit whatever it returns" pattern as every
   * other action above — a rejected call (bad validation) simply results in
   * `commit` re-saving/re-setting the SAME `game` reference the engine
   * function itself returned unchanged, which is a harmless no-op. */
  buildWarehouseFloor: (cityId: CityId) => void
  storeGoods: (cityId: CityId, goodId: GoodId, qty: number) => void
  withdrawGoods: (cityId: CityId, goodId: GoodId, qty: number) => void
  buyWarehouseInsurance: (cityId: CityId) => void
  sellWarehouse: (cityId: CityId) => void
  /** Generates today's newspaper if it hasn't been generated yet (§7's
   * pipeline is "screen-driven" per newsBot.ts's own doc comment — nothing
   * in the engine's daily tick calls `generateDailyPaper` automatically).
   * Safe to call every time the Newspaper popup opens: a no-op once
   * `game.currentNewspaper` already has today's stories, so re-opening the
   * same day's paper never re-rolls it or double-marks events as announced. */
  refreshNewspaper: () => void
  /** Purchases one Informant tip (§7 Insider information) and returns the
   * tip result directly (not just via `game`) so the caller can show it
   * once, immediately — the hint itself isn't persisted anywhere in
   * `GameState` (only the underlying scheduled Event is), so this is the
   * only moment it's ever available. `null` if the purchase was rejected
   * (wrong bank tier, insufficient cash) or there's no game in progress. */
  buyInformantTip: () => InformantTip | null
  /** Explicit manual save, for the HUD's Save button. Auto-save (see
   * `commit` below) already covers every mutating action, so this exists
   * purely to give the player an on-demand confirmation that their progress
   * is safe — matches "Save" per §1/§17. */
  save: () => void
  /** Loads the last auto/manually-saved run, if one exists. Returns whether
   * a save was actually found and restored — the Title screen's "Continue"
   * action uses this to know whether to fall through to a fresh game. */
  continueGame: () => boolean
  hasSave: () => boolean
  /** Returns to the Title screen without touching the saved run (the
   * finished/abandoned game stays on disk — starting a New Game from the
   * Title screen simply overwrites it on its first action, matching this
   * project's single-save-slot design, §13 "multiple save slots" is
   * explicitly out of v1 scope). Used by the Game Over screen's "Back to
   * Title" button. */
  returnToTitle: () => void
}

/** Runs the two unlock-check functions (T010) — safe/cheap no-ops when
 * nothing newly qualifies. Called after every state-changing action so the
 * UI always reflects current unlock status. */
function refreshUnlocks(state: GameState): GameState {
  return checkGoodUnlocks(checkCityUnlocks(state))
}

/**
 * The single funnel EVERY mutating action's resulting state passes through
 * before `set()`. Two responsibilities:
 *   1. Auto-save (`saveGame`) — every action is durable to localStorage
 *      immediately, not just on an explicit `save()` call.
 *   2. Exactly-once score recording (T043 prep) — the moment `gameOver`
 *      is true and this run hasn't recorded its score yet
 *      (`!state.scoreRecorded`), calls `recordScore` (T033) and stamps
 *      `scoreRecorded: true` onto the state BEFORE it's saved. Guarding on
 *      a field persisted IN `GameState` itself (rather than component/ref
 *      state) means this stays exactly-once even across a page reload —
 *      a finished run auto-saves like any other, so re-loading it via
 *      "Continue" must not re-record (and duplicate) its high-score entry.
 *      Centralized here (not in a React effect) so it's a synchronous,
 *      unmissable part of whichever action actually flips `gameOver`,
 *      regardless of render timing.
 */
function commit(set: (partial: Partial<GameStoreState>) => void, state: GameState): void {
  let next = state

  if (next.gameOver && !next.scoreRecorded) {
    recordScore({ peakNetWorth: next.peakNetWorth, daysSurvived: next.day, difficulty: next.difficulty })
    next = { ...next, scoreRecorded: true }
  }

  saveGame(next)
  set({ game: next })
}

export const useGameStore = create<GameStoreState>((set, get) => ({
  game: null,
  justSaved: false,

  newGame: (difficulty) => {
    commit(set, createNewGame(difficulty, Date.now()))
  },

  buy: (goodId, qty) => {
    const { game } = get()
    if (!game) return
    const price = game.priceStates[game.currentCity]?.[goodId]?.currentPrice
    if (price === undefined) return
    commit(set, refreshUnlocks(engineBuy(game, goodId, qty, price)))
  },

  sell: (goodId, qty) => {
    const { game } = get()
    if (!game) return
    const price = game.priceStates[game.currentCity]?.[goodId]?.currentPrice
    if (price === undefined) return
    commit(set, refreshUnlocks(engineSell(game, goodId, qty, price)))
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
    commit(set, refreshUnlocks(next))
  },

  stay: () => {
    const { game } = get()
    if (!game) return
    commit(set, refreshUnlocks(engineStay(game)))
  },

  deposit: (cityId, amount) => {
    const { game } = get()
    if (!game) return
    commit(set, refreshUnlocks(engineDeposit(game, cityId, amount)))
  },

  withdraw: (cityId, amount) => {
    const { game } = get()
    if (!game) return
    commit(set, refreshUnlocks(engineWithdraw(game, cityId, amount)))
  },

  takeLoan: (cityId, amount) => {
    const { game } = get()
    if (!game) return
    commit(set, refreshUnlocks(engineTakeLoan(game, cityId, amount)))
  },

  repayLoan: (cityId, amount) => {
    const { game } = get()
    if (!game) return
    commit(set, refreshUnlocks(engineRepayLoan(game, cityId, amount)))
  },

  resolveDefault: (choice) => {
    const { game } = get()
    if (!game) return
    commit(set, refreshUnlocks(engineResolveDefault(game, choice)))
  },

  hireCA: (tier) => {
    const { game } = get()
    if (!game) return
    commit(set, refreshUnlocks(engineHireCA(game, tier)))
  },

  buildWarehouseFloor: (cityId) => {
    const { game } = get()
    if (!game) return
    commit(set, refreshUnlocks(engineBuildWarehouseFloor(game, cityId)))
  },

  storeGoods: (cityId, goodId, qty) => {
    const { game } = get()
    if (!game) return
    commit(set, refreshUnlocks(engineStoreGoods(game, cityId, goodId, qty)))
  },

  withdrawGoods: (cityId, goodId, qty) => {
    const { game } = get()
    if (!game) return
    commit(set, refreshUnlocks(engineWithdrawGoods(game, cityId, goodId, qty)))
  },

  buyWarehouseInsurance: (cityId) => {
    const { game } = get()
    if (!game) return
    commit(set, refreshUnlocks(engineBuyWarehouseInsurance(game, cityId)))
  },

  sellWarehouse: (cityId) => {
    const { game } = get()
    if (!game) return
    commit(set, refreshUnlocks(engineSellWarehouse(game, cityId)))
  },

  refreshNewspaper: () => {
    const { game } = get()
    if (!game) return
    if (game.currentNewspaper.length > 0 && game.currentNewspaper[0]?.day === game.day) return
    const rng = createRng(Date.now())
    const { state: next } = generateDailyPaper(game, rng)
    commit(set, next)
  },

  buyInformantTip: () => {
    const { game } = get()
    if (!game) return null
    const rng = createRng(Date.now())
    const result = engineBuyInformantTip(game, rng)
    if (!result) return null
    commit(set, result.state)
    return result.tip
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

  returnToTitle: () => {
    set({ game: null })
  },
}))
