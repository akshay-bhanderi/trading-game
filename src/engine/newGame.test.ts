import { describe, expect, it } from 'vitest'
import { createNewGame } from './newGame'

describe('createNewGame', () => {
  it('seeds a Pro-mode game at day 1 with starting cash/city and live prices', () => {
    const state = createNewGame('Pro', 12345)

    expect(state.day).toBe(1)
    expect(state.currentCity).toBe('farrow')
    expect(state.cash).toBe(1000)
    expect(state.cargo).toEqual({})
    expect(state.unlockedGoodIds).toEqual(expect.arrayContaining(['grain', 'cotton', 'iron']))
    expect(state.unlockedCityIds.length).toBe(4)

    const grainHere = state.priceStates[state.currentCity]?.grain
    expect(grainHere?.currentPrice).toBeGreaterThan(0)
    expect(grainHere?.lastSeenDay).toBe(1)
    expect(grainHere?.lastSeenPrice).toBe(grainHere?.currentPrice)
  })

  it('seeds an Expert-mode game starting in Copperfell with its own starting cash', () => {
    const state = createNewGame('Expert', 999)
    expect(state.currentCity).toBe('copperfell')
    expect(state.cash).toBe(500)
  })

  it('same seed produces an identical fresh state', () => {
    const a = createNewGame('Pro', 42)
    const b = createNewGame('Pro', 42)
    expect(a).toEqual(b)
  })
})
