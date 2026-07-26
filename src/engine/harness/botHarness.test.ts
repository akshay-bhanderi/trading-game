import { beforeAll, describe, expect, it } from 'vitest'
import { greedyBotStep } from '../bots/greedyBot'
import { newsBotStep } from '../bots/newsBot'
import { randomBotStep } from '../bots/randomBot'
import { runHarness, type HarnessResult } from './botHarness'

/**
 * §11 balance-test harness health checks — Trade Winds of Selvara.
 *
 * TASK.md T028: "This test is REQUIRED to exist and pass (or to clearly
 * report which check fails, feeding into T029)... It's ACCEPTABLE for this
 * test to currently FAIL some assertions (that's expected and by design —
 * T029 will fix config.ts to make them pass) AS LONG AS the failures are
 * clear/legible."
 *
 * Structure: ONE `beforeAll` runs the harness ONCE per bot (Pro mode, plus
 * one Expert-mode run for the bankruptcy-proxy diagnostic — see below) and
 * caches the results; every health check below is then its OWN independent
 * `it()` block reading from that cache. This gives the clearest possible
 * diagnostic output (vitest's own per-`it()` pass/fail list IS the "clearly
 * report which check fails" report the task asks for) without re-running
 * the simulation once per assertion.
 *
 * Seed count / day count: 30 seeds x 100 days per bot (100, not exactly 90,
 * so the day-90 checkpoint is comfortably reached even for a bot that ends
 * its very last step slightly past day 100). Per TASK.md's own allowance:
 * "CI-run tests may use a smaller sample for speed... e.g. 20-50 seeds, NOT
 * the full 1,000". `runHarness` itself (botHarness.ts) has no hardcoded
 * limit — a future caller (T045) can request 1,000 seeds x 360 days with the
 * exact same function.
 *
 * Day-180/360 targets are explicitly ASPIRATIONAL/v2 per §13 and are NOT
 * checked here at all (not even loosely) — per TASK.md T029's own note:
 * "day-180/360 are explicitly aspirational/v2 per §13 and not required to
 * pass in v1". `days: 100` also means `runHarness`'s default checkpoint
 * filtering (`<= days`) naturally excludes 180/360 without any extra code.
 */

const SEEDS_COUNT = 30
const DAYS = 100

/** §11's own Pro-mode target table (day -> [min, max] net worth), for the
 * three checkpoints required in v1 (day-180/360 are v2/aspirational, see
 * above). */
const PRO_TARGETS: Record<number, { min: number; max: number }> = {
  10: { min: 4_000, max: 6_000 },
  30: { min: 30_000, max: 60_000 },
  90: { min: 200_000, max: 400_000 },
}

/** §11: "Greedy bot ~= 0.5x targets." */
const GREEDY_TARGETS: Record<number, { min: number; max: number }> = Object.fromEntries(
  Object.entries(PRO_TARGETS).map(([day, { min, max }]) => [day, { min: min * 0.5, max: max * 0.5 }]),
)

/** §11: "No strategy should exceed 3x targets" — the ceiling is 3x the FULL
 * (news-bot-equivalent) target's upper bound, applied to EVERY bot. */
const EXPLOIT_CEILING: Record<number, number> = Object.fromEntries(
  Object.entries(PRO_TARGETS).map(([day, { max }]) => [day, max * 3]),
)

let randomResult: HarnessResult
let greedyResult: HarnessResult
let newsResult: HarnessResult
/** Expert-mode run, used ONLY for the bankruptcy-rate KNOWN-GAP diagnostic
 * below — see botHarness.ts's file header "KNOWN GAP" section for why this
 * is a proxy metric, not a real bankruptcy rate. */
let newsExpertResult: HarnessResult

beforeAll(() => {
  randomResult = runHarness({ bot: randomBotStep, seedsCount: SEEDS_COUNT, days: DAYS, difficulty: 'Pro' })
  greedyResult = runHarness({ bot: greedyBotStep, seedsCount: SEEDS_COUNT, days: DAYS, difficulty: 'Pro' })
  newsResult = runHarness({ bot: newsBotStep, seedsCount: SEEDS_COUNT, days: DAYS, difficulty: 'Pro' })
  newsExpertResult = runHarness({ bot: newsBotStep, seedsCount: SEEDS_COUNT, days: DAYS, difficulty: 'Expert' })

  // Full diagnostic dump — always printed (pass or fail) so a human reading
  // `npm run test` output can see every bot's actual numbers at a glance,
  // per TASK.md's "clearly report which check fails" mandate.
  for (const result of [randomResult, greedyResult, newsResult]) {
    console.log(
      `[botHarness] ${result.bot} (${result.difficulty}, ${result.seedsCount} seeds, ${result.days} days):`,
      Object.fromEntries(
        Object.entries(result.checkpoints).map(([day, stats]) => [
          `day${day}`,
          { median: Math.round(stats.median), mean: Math.round(stats.mean), min: Math.round(stats.min), max: Math.round(stats.max) },
        ]),
      ),
    )
  }
  console.log(
    `[botHarness] newsBotStep (Expert, ${newsExpertResult.seedsCount} seeds, ${newsExpertResult.days} days): ` +
      `defaultTriggeredRate=${(newsExpertResult.defaultTriggeredRate * 100).toFixed(1)}% ` +
      `gameOverRate=${(newsExpertResult.gameOverRate * 100).toFixed(1)}% (KNOWN GAP proxy — see file header)`,
  )
}, 60_000)

describe('runHarness (T028)', () => {
  it('supports an arbitrary seedsCount/days without a hardcoded cap (smoke test at a larger sample)', () => {
    // Not the full §11 spec (1,000 x 360 — that's T045's job, a separate,
    // slower baseline run) but large enough to prove there is no artificial
    // limit baked into runHarness itself.
    const result = runHarness({ bot: randomBotStep, seedsCount: 60, days: 150, difficulty: 'Pro' })
    expect(result.seedsCount).toBe(60)
    expect(result.days).toBe(150)
    expect(result.checkpointDays).toEqual([10, 30, 90])
    expect(result.checkpoints[90]?.values).toHaveLength(60)
  })

  it('is deterministic: re-running the same options produces identical stats', () => {
    const a = runHarness({ bot: greedyBotStep, seedsCount: 10, days: 40, difficulty: 'Pro' })
    const b = runHarness({ bot: greedyBotStep, seedsCount: 10, days: 40, difficulty: 'Pro' })
    expect(a).toEqual(b)
  })

  it('defaults difficulty to Pro when not specified', () => {
    const result = runHarness({ bot: randomBotStep, seedsCount: 5, days: 20 })
    expect(result.difficulty).toBe('Pro')
  })
})

describe('§11 health check — random bot (worst-case baseline)', () => {
  // §11: "Random bot should hover near broke (median < $10k at day 90)."
  it('median net worth at day 90 is below $10,000', () => {
    const median = randomResult.checkpoints[90]?.median as number
    console.log(`[health check] random bot day-90 median = $${Math.round(median)} (target: < $10,000)`)
    expect(median).toBeLessThan(10_000)
  })
})

describe('§11 health check — greedy bot (~0.5x targets)', () => {
  for (const day of [10, 30, 90]) {
    const target = GREEDY_TARGETS[day] as { min: number; max: number }
    it(`median net worth at day ${day} is within ~0.5x of the §11 target ($${target.min}-${target.max})`, () => {
      const median = greedyResult.checkpoints[day]?.median as number
      console.log(
        `[health check] greedy bot day-${day} median = $${Math.round(median)} (target: $${target.min}-${target.max})`,
      )
      expect(median).toBeGreaterThanOrEqual(target.min)
      expect(median).toBeLessThanOrEqual(target.max)
    })
  }
})

describe('§11 health check — news bot (~= targets)', () => {
  for (const day of [10, 30, 90]) {
    const target = PRO_TARGETS[day] as { min: number; max: number }
    it(`median net worth at day ${day} is within the §11 target ($${target.min}-${target.max})`, () => {
      const median = newsResult.checkpoints[day]?.median as number
      console.log(
        `[health check] news bot day-${day} median = $${Math.round(median)} (target: $${target.min}-${target.max})`,
      )
      expect(median).toBeGreaterThanOrEqual(target.min)
      expect(median).toBeLessThanOrEqual(target.max)
    })
  }
})

describe('§11 health check — exploit ceiling (no bot > 3x targets)', () => {
  const bots: Array<{ label: string; get: () => HarnessResult }> = [
    { label: 'random', get: () => randomResult },
    { label: 'greedy', get: () => greedyResult },
    { label: 'news', get: () => newsResult },
  ]

  for (const { label, get } of bots) {
    for (const day of [10, 30, 90]) {
      const ceiling = EXPLOIT_CEILING[day] as number
      it(`${label} bot median net worth at day ${day} does not exceed 3x target ($${ceiling})`, () => {
        const median = get().checkpoints[day]?.median as number
        console.log(`[health check] ${label} bot day-${day} median = $${Math.round(median)} (ceiling: $${ceiling})`)
        expect(median).toBeLessThanOrEqual(ceiling)
      })
    }
  }
})

describe('§11 health check — Expert-mode bankruptcy rate (KNOWN GAP, see botHarness.ts)', () => {
  /**
   * §11: "Bankruptcy rate on Expert ~= 25-40% by day 90." This CANNOT be
   * honestly checked today: none of the three bots (T025-T027) ever call
   * `resolveDefault` (bank/default.ts, T024) to actually pick Surrender /
   * Restructure / Bankruptcy when the bank confronts them — that's a
   * documented, deliberate scope gap (wiring bots to handle default
   * decisions was out of scope for T025-T027 and isn't required by T028).
   * `state.gameOver` (the only real "this run ended in bankruptcy" signal)
   * therefore never becomes true under the current bots, so a literal
   * `gameOverRate` check would trivially read 0% forever — asserting
   * anything numeric against it would be a dishonest pass, not a real
   * balance signal. T029 should NOT expect config.ts changes to move this
   * number; it structurally cannot change until a future task (see T067's
   * "extend bots to use Phase 2 systems" note, or an earlier dedicated task)
   * teaches at least one bot to resolve default prompts.
   *
   * What CAN be reported honestly: `defaultTriggeredRate` — how often the
   * §9 default TRIGGER condition fires at all (overdue loan, or debt > 2x
   * net worth for 7 days), regardless of resolution. This is logged for
   * T029's benefit (a config.ts tuning pass that makes Expert-mode debt
   * meaningfully risky should move THIS number, even before any bot resolves
   * it) but is NOT asserted against the §11 25-40% figure, since it measures
   * a different (looser) condition than "ended in bankruptcy".
   */
  it('reports the default-trigger-rate proxy (informational — not a real bankruptcy-rate assertion)', () => {
    console.log(
      `[health check] Expert news-bot default-triggered-rate = ` +
        `${(newsExpertResult.defaultTriggeredRate * 100).toFixed(1)}% ` +
        `(§11 target for an ACTUAL bankruptcy rate is 25-40%; this is a looser proxy — see comment above)`,
    )
    // The only thing safe to assert: the harness ran to completion and
    // produced a well-formed rate in [0, 1]. No numeric target assertion —
    // see the file-level comment for why that would be dishonest today.
    expect(newsExpertResult.defaultTriggeredRate).toBeGreaterThanOrEqual(0)
    expect(newsExpertResult.defaultTriggeredRate).toBeLessThanOrEqual(1)
    expect(newsExpertResult.gameOverRate).toBe(0) // documents the current known-gap state explicitly
  })
})
