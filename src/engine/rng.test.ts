import { describe, expect, it } from 'vitest'
import { createRng } from './rng'

/** Pulls `n` values from `next()` into an array. */
function drawN(seed: number, n: number): number[] {
  const rng = createRng(seed)
  const out: number[] = []
  for (let i = 0; i < n; i++) out.push(rng.next())
  return out
}

/** Pearson correlation coefficient between two equal-length numeric arrays. */
function correlation(a: number[], b: number[]): number {
  const n = a.length
  const meanA = a.reduce((s, v) => s + v, 0) / n
  const meanB = b.reduce((s, v) => s + v, 0) / n
  let cov = 0
  let varA = 0
  let varB = 0
  for (let i = 0; i < n; i++) {
    // Safe: i is bounded by n = a.length = b.length (asserted by caller).
    const da = (a[i] as number) - meanA
    const db = (b[i] as number) - meanB
    cov += da * db
    varA += da * da
    varB += db * db
  }
  if (varA === 0 || varB === 0) return 0
  return cov / Math.sqrt(varA * varB)
}

describe('createRng', () => {
  it('returns floats in [0, 1)', () => {
    const rng = createRng(42)
    for (let i = 0; i < 1000; i++) {
      const v = rng.next()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('same seed always produces the identical sequence', () => {
    const seed = 123456789
    const a = drawN(seed, 500)
    const b = drawN(seed, 500)
    expect(a).toEqual(b)
  })

  it('same seed produces identical int() and pick() sequences too', () => {
    const seed = 987654321
    const rngA = createRng(seed)
    const rngB = createRng(seed)
    const arr = ['a', 'b', 'c', 'd', 'e', 'f', 'g']

    const intsA = Array.from({ length: 200 }, () => rngA.int(1, 100))
    const intsB = Array.from({ length: 200 }, () => rngB.int(1, 100))
    expect(intsA).toEqual(intsB)

    const picksA = Array.from({ length: 200 }, () => rngA.pick(arr))
    const picksB = Array.from({ length: 200 }, () => rngB.pick(arr))
    expect(picksA).toEqual(picksB)
  })

  it('different seeds produce statistically different sequences (not a one-off fluke)', () => {
    const n = 2000
    const a = drawN(1, n)
    const b = drawN(2, n)

    // Exact-equality collisions between two independent continuous-uniform
    // streams should be effectively impossible; a handful would already be
    // suspicious, but we allow a generous margin instead of demanding zero.
    const exactMatches = a.filter((v, i) => v === b[i]).length
    expect(exactMatches).toBeLessThan(n * 0.01)

    // The two sequences should be uncorrelated (a broken/linked RNG would
    // show strong correlation here regardless of a few individual draws).
    const corr = correlation(a, b)
    expect(Math.abs(corr)).toBeLessThan(0.1)

    // Both sequences should independently look uniform-ish around 0.5 —
    // sanity check that we're not comparing two degenerate streams.
    const meanA = a.reduce((s, v) => s + v, 0) / n
    const meanB = b.reduce((s, v) => s + v, 0) / n
    expect(meanA).toBeGreaterThan(0.4)
    expect(meanA).toBeLessThan(0.6)
    expect(meanB).toBeGreaterThan(0.4)
    expect(meanB).toBeLessThan(0.6)

    // The running cumulative sums of the two sequences should diverge
    // substantially over many draws rather than tracking each other.
    let sumA = 0
    let sumB = 0
    let divergedCount = 0
    for (let i = 0; i < n; i++) {
      // Safe: i is bounded by n = a.length = b.length.
      sumA += a[i] as number
      sumB += b[i] as number
      if (Math.abs(sumA - sumB) > 5) divergedCount++
    }
    expect(divergedCount).toBeGreaterThan(0)
  })

  it('different seeds also diverge across many seed pairs (broad check)', () => {
    const seeds = [0, 1, 2, 42, 1000, 999999, -7, 7.9]
    const sequences = seeds.map((s) => drawN(s, 300))

    let comparedPairs = 0
    for (let i = 0; i < sequences.length; i++) {
      for (let j = i + 1; j < sequences.length; j++) {
        comparedPairs++
        // Safe: i, j are valid indices into `sequences` by the loop bounds.
        const seqA = sequences[i] as number[]
        const seqB = sequences[j] as number[]
        const matches = seqA.filter((v, k) => v === seqB[k]).length
        expect(matches).toBeLessThan(seqA.length * 0.01)
      }
    }
    expect(comparedPairs).toBeGreaterThan(10)
  })

  it('int(min, max) is always an integer within the inclusive range', () => {
    const rng = createRng(555)
    for (let i = 0; i < 2000; i++) {
      const v = rng.int(5, 10)
      expect(Number.isInteger(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(5)
      expect(v).toBeLessThanOrEqual(10)
    }
  })

  it('int(min, max) covers the full inclusive range over many draws', () => {
    const rng = createRng(777)
    const seen = new Set<number>()
    for (let i = 0; i < 2000; i++) seen.add(rng.int(1, 6))
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('int(n, n) always returns n', () => {
    const rng = createRng(1)
    for (let i = 0; i < 20; i++) {
      expect(rng.int(4, 4)).toBe(4)
    }
  })

  it('pick(arr) only returns elements from the array and covers all of them over many draws', () => {
    const rng = createRng(2024)
    const arr = ['red', 'green', 'blue', 'yellow']
    const seen = new Set<string>()
    for (let i = 0; i < 1000; i++) {
      const picked = rng.pick(arr)
      expect(arr).toContain(picked)
      seen.add(picked)
    }
    expect(seen.size).toBe(arr.length)
  })

  it('pick throws on an empty array', () => {
    const rng = createRng(1)
    expect(() => rng.pick([])).toThrow()
  })
})
