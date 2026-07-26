import { describe, expect, it } from 'vitest'
import { useGameStore } from './gameStore'

/**
 * T034 smoke test — no React rendering needed: Zustand's `create()` return
 * value exposes `getState()`/`setState()` directly on the hook itself, so a
 * plain Node test can dispatch actions and read the resulting `GameState`
 * exactly like a component would via the hook. Confirms the store is wired
 * to real /src/engine functions (not a stub) end-to-end.
 */
describe('useGameStore — T034 smoke test', () => {
  it('dispatching buy() decreases cash by qty * price', () => {
    useGameStore.getState().newGame('Pro')
    const game = useGameStore.getState().game
    expect(game).not.toBeNull()
    if (!game) return

    const cashBefore = game.cash
    const price = game.priceStates[game.currentCity]?.grain?.currentPrice
    expect(price).toBeDefined()
    if (price === undefined) return

    useGameStore.getState().buy('grain', 1)

    const after = useGameStore.getState().game
    expect(after).not.toBeNull()
    expect(after?.cash).toBeCloseTo(cashBefore - price, 6)
    expect(after?.cargo.grain?.qty).toBe(1)
  })
})
