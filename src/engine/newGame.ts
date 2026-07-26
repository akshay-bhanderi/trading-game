/**
 * New-game seeding — Trade Winds of Selvara.
 *
 * Every earlier task's tests built their own minimal `GameState` fixture and
 * explicitly left "whatever seeds a real new game" as someone else's job
 * (see e.g. rank.ts's and unlocks.ts's own doc comments). This is that job —
 * the first place a complete, playable `GameState` gets constructed from
 * just a difficulty choice.
 *
 * Pure TypeScript, zero React imports (see /src/engine/README.md).
 */

import { CONFIG } from './config'
import { CITIES } from './data/cities'
import { GOODS } from './data/goods'
import { advanceDay } from './turnLoop'
import type { Difficulty, GameState } from './types'

/**
 * Builds a fresh `GameState` for `difficulty`, seeded with `seed` (the
 * run's RNG seed — callers typically pass `Date.now()` or similar).
 *
 * Starts at a synthetic "day 0" with empty `priceStates`, then runs one
 * `advanceDay` (T015/T017/T021-T024's single day-tick function) to reach
 * day 1 — this populates real day-1 prices for every city/good via the
 * normal price engine path rather than duplicating that logic here, and
 * naturally refreshes the starting city's `lastSeenPrice` since the player
 * is "present" there from day 1 (see turnLoop.ts's staleness invariant).
 */
export function createNewGame(difficulty: Difficulty, seed: number): GameState {
  const config = CONFIG.difficulty[difficulty]
  const tier1CityIds = CITIES.filter((c) => c.tier === 1).map((c) => c.id)
  const startGoodIds = GOODS.filter((g) => g.unlockCondition.kind === 'start').map((g) => g.id)

  const rawState: GameState = {
    day: 0,
    currentCity: config.startingCityId,
    cash: config.startingCash,
    cargo: {},
    cargoCapacity: CONFIG.cargo.startingCapacity,
    bankAccounts: {},
    priceStates: {},
    unlockedCityIds: tier1CityIds,
    unlockedGoodIds: startGoodIds,
    purchasedLicenseGoodIds: [],
    activeEvents: [],
    currentNewspaper: [],
    pendingResolutions: [],
    taxHistory: [],
    travelInProgress: null,
    peakNetWorth: config.startingCash,
    seed,
    difficulty,
    repaymentRecord: 0,
    cumulativeTradeVolume: 0,
    rankCache: { value: 1, computedOnDay: 0 },
    debtOverThresholdSinceDay: null,
    awaitingDefaultDecision: null,
    restructureRecheckDay: null,
    gameOver: false,
  }

  return advanceDay(rawState)
}
