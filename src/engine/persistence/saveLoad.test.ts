import { beforeEach, describe, expect, it } from 'vitest'
import { clearSavedGame, hasSavedGame, loadGame, saveGame } from './saveLoad'
import { createNewGame } from '../newGame'

/**
 * This repo's engine tests run headless in Node (§17) — no `jsdom`, so no
 * real `localStorage` global exists. `saveLoad.ts` deliberately reads
 * `globalThis.localStorage` (not `window.localStorage`) for exactly this
 * reason (see its own file header) — a plain in-memory `Storage` stand-in
 * here is all a Node test needs; no browser polyfill required.
 */
class MemoryStorage implements Storage {
  private data = new Map<string, string>()
  get length(): number {
    return this.data.size
  }
  clear(): void {
    this.data.clear()
  }
  getItem(key: string): string | null {
    return this.data.has(key) ? (this.data.get(key) as string) : null
  }
  key(index: number): string | null {
    return Array.from(this.data.keys())[index] ?? null
  }
  removeItem(key: string): void {
    this.data.delete(key)
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value)
  }
}

globalThis.localStorage = new MemoryStorage()

describe('saveGame / loadGame', () => {
  beforeEach(() => {
    clearSavedGame()
  })

  it('round-trips a full GameState (including seed) exactly', () => {
    const state = createNewGame('Pro', 12345)

    expect(hasSavedGame()).toBe(false)
    expect(saveGame(state)).toBe(true)
    expect(hasSavedGame()).toBe(true)

    const loaded = loadGame()
    expect(loaded).toEqual(state)
  })

  it('returns null when nothing has been saved', () => {
    expect(loadGame()).toBeNull()
  })

  it('clearSavedGame removes a previously saved game', () => {
    saveGame(createNewGame('Noob', 1))
    expect(hasSavedGame()).toBe(true)
    clearSavedGame()
    expect(hasSavedGame()).toBe(false)
    expect(loadGame()).toBeNull()
  })

  it('returns null for corrupt JSON instead of throwing', () => {
    globalThis.localStorage.setItem('tradeWindsOfSelvara.save', '{not json')
    expect(loadGame()).toBeNull()
  })
})
