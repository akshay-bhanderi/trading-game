import { beforeEach, describe, expect, it } from 'vitest'
import { getHighScores, recordScore } from './highScore'

/** Same in-memory Storage stub pattern as saveLoad.test.ts. */
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

describe('recordScore / getHighScores', () => {
  beforeEach(() => {
    globalThis.localStorage.clear()
  })

  it('returns an empty table when nothing has been recorded', () => {
    expect(getHighScores()).toEqual([])
  })

  it('inserts and keeps the table sorted descending by peakNetWorth', () => {
    recordScore({ peakNetWorth: 10_000, daysSurvived: 30, difficulty: 'Pro' })
    recordScore({ peakNetWorth: 50_000, daysSurvived: 60, difficulty: 'Expert' })
    recordScore({ peakNetWorth: 25_000, daysSurvived: 45, difficulty: 'Noob' })

    const scores = getHighScores()
    expect(scores.map((s) => s.peakNetWorth)).toEqual([50_000, 25_000, 10_000])
  })

  it('evicts the lowest entry once an 11th score is recorded', () => {
    for (let i = 1; i <= 10; i++) {
      recordScore({ peakNetWorth: i * 1_000, daysSurvived: i, difficulty: 'Pro' })
    }
    expect(getHighScores()).toHaveLength(10)
    expect(getHighScores().map((s) => s.peakNetWorth)).toContain(1_000) // lowest of the 10 still present

    // 11th score, higher than the current lowest ($1,000) — should knock it out.
    const result = recordScore({ peakNetWorth: 5_500, daysSurvived: 11, difficulty: 'Pro' })

    expect(result).toHaveLength(10)
    expect(result.map((s) => s.peakNetWorth)).not.toContain(1_000)
    expect(result.map((s) => s.peakNetWorth)).toContain(5_500)
    // Still sorted descending.
    expect(result.map((s) => s.peakNetWorth)).toEqual([...result.map((s) => s.peakNetWorth)].sort((a, b) => b - a))
  })

  it('a low 11th score that does not beat the current worst is itself evicted', () => {
    for (let i = 1; i <= 10; i++) {
      recordScore({ peakNetWorth: i * 1_000, daysSurvived: i, difficulty: 'Pro' })
    }

    const result = recordScore({ peakNetWorth: 1, daysSurvived: 1, difficulty: 'Pro' })

    expect(result).toHaveLength(10)
    expect(result.map((s) => s.peakNetWorth)).not.toContain(1)
  })
})
