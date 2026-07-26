/**
 * Deterministic seeded RNG utility for the game engine.
 *
 * Design doc reference: §6 — "Deterministic seeded RNG per run (seed saved
 * with the game) so bugs are reproducible."
 *
 * PROJECT-WIDE RULE (applies to every file under /src/engine, now and in all
 * future tasks): NEVER use `Math.random()` anywhere in /src/engine. Every
 * source of randomness — price noise, event scheduling, rumor truth flags,
 * bot decisions, etc. — must draw from an `Rng` created via `createRng`
 * (or an `Rng` instance threaded through from one), seeded from
 * `GameState.seed`. This is what makes a run reproducible from its saved
 * seed. This rule is documented here and in /src/engine/README.md; it is
 * not enforced by lint in this task, but every later task that adds
 * randomness must follow it.
 *
 * Algorithm: mulberry32 — a small, fast, well-known 32-bit PRNG with good
 * statistical quality for game use. Not cryptographically secure (not
 * needed here).
 */

/** A deterministic pseudo-random number generator seeded from a single number. */
export interface Rng {
  /** Returns the next float in [0, 1). */
  next(): number
  /** Returns a uniformly random integer in [min, max], inclusive of both ends. */
  int(min: number, max: number): number
  /** Returns a uniformly random element of a non-empty array. */
  pick<T>(arr: readonly T[]): T
}

/**
 * Creates a mulberry32-based seeded RNG.
 *
 * Same `seed` always produces the identical sequence of `next()` (and thus
 * `int`/`pick`) calls. Different seeds produce different sequences.
 *
 * @param seed - Any finite number. Only the low 32 bits of the integer
 *   part are used internally (mulberry32's state is a 32-bit unsigned int),
 *   so fractional or out-of-32-bit-range seeds are coerced deterministically.
 */
export function createRng(seed: number): Rng {
  // mulberry32 internal state, forced to an unsigned 32-bit integer.
  let state = seed >>> 0

  // The core mulberry32 step: advances state and returns a float in [0, 1).
  function nextFloat(): number {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  function next(): number {
    return nextFloat()
  }

  function int(min: number, max: number): number {
    const lo = Math.ceil(min)
    const hi = Math.floor(max)
    return lo + Math.floor(nextFloat() * (hi - lo + 1))
  }

  function pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) {
      throw new Error('Rng.pick: cannot pick from an empty array')
    }
    const idx = int(0, arr.length - 1)
    return arr[idx] as T
  }

  return { next, int, pick }
}
