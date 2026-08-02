import { beforeEach, describe, expect, it } from 'vitest'
import { clearSavedGame, hasSavedGame, loadGame, saveGame, SCHEMA_VERSION } from './saveLoad'
import { createNewGame } from '../newGame'
import { deposit } from '../bank/deposits'

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

  it('a normal deposit round-trips correctly through save/load (regression guard for the reported "deposit vanished" bug)', () => {
    const funded = { ...createNewGame('Pro', 1), cash: 150_000 }
    const state = deposit(funded, 100_000)
    expect(state.deposit).toBe(100_000)

    saveGame(state)
    const loaded = loadGame()
    expect(loaded?.deposit).toBe(100_000)
  })
})

describe('loadGame — orphaned per-city depositBalance reclaim (2026-08 bug fix)', () => {
  beforeEach(() => {
    clearSavedGame()
  })

  /** Writes a raw save envelope directly to localStorage, bypassing
   * `saveGame`'s type-safe serialization — needed to simulate a save
   * containing a stray `depositBalance` field the CURRENT `BankAccount`
   * type no longer declares (exactly what an old, stale-cached bundle could
   * have written during the pooled-deposit deploy — see saveLoad.ts's
   * `reclaimOrphanedDepositBalances` doc comment for the full scenario). */
  function writeRawEnvelope(schemaVersion: number, statePatch: Record<string, unknown>): void {
    const base = createNewGame('Pro', 1)
    const raw = { ...base, ...statePatch }
    globalThis.localStorage.setItem('tradeWindsOfSelvara.save', JSON.stringify({ schemaVersion, state: raw }))
  }

  it('folds a valid stray depositBalance into the pooled deposit field, even when tagged as the CURRENT schema version', () => {
    writeRawEnvelope(SCHEMA_VERSION, {
      deposit: 0,
      bankAccounts: { saltmere: { cityId: 'saltmere', depositBalance: 100_000, loan: null } },
    })

    const loaded = loadGame()
    expect(loaded?.deposit).toBe(100_000)
    expect((loaded?.bankAccounts.saltmere as unknown as { depositBalance?: number })?.depositBalance).toBeUndefined()
  })

  it('sums stray depositBalance across multiple cities and ADDS to any existing pooled deposit', () => {
    writeRawEnvelope(SCHEMA_VERSION, {
      deposit: 500,
      bankAccounts: {
        farrow: { cityId: 'farrow', depositBalance: 1_000, loan: null },
        saltmere: { cityId: 'saltmere', depositBalance: 2_000, loan: null },
      },
    })

    expect(loadGame()?.deposit).toBe(3_500)
  })

  it('strips a corrupted (non-finite, e.g. JSON-serialized NaN -> null) depositBalance as dead weight WITHOUT adding it to the pool', () => {
    writeRawEnvelope(SCHEMA_VERSION, {
      deposit: 0,
      bankAccounts: { saltmere: { cityId: 'saltmere', depositBalance: null, loan: null } },
    })

    const loaded = loadGame()
    expect(loaded?.deposit).toBe(0)
    expect((loaded?.bankAccounts.saltmere as unknown as { depositBalance?: unknown })?.depositBalance).toBeUndefined()
  })

  it('leaves an active loan on the account untouched while stripping the stray depositBalance', () => {
    writeRawEnvelope(SCHEMA_VERSION, {
      bankAccounts: {
        saltmere: {
          cityId: 'saltmere',
          depositBalance: 5_000,
          loan: { principal: 1_000, accruedInterest: 10, startDay: 1, termDays: 60 },
        },
      },
    })

    const loaded = loadGame()
    expect(loaded?.deposit).toBe(5_000)
    expect(loaded?.bankAccounts.saltmere?.loan).toEqual({ principal: 1_000, accruedInterest: 10, startDay: 1, termDays: 60 })
  })

  it('is a true no-op when there is no stray depositBalance anywhere', () => {
    const state = createNewGame('Pro', 1)
    saveGame(state)
    expect(loadGame()).toEqual(state)
  })
})
