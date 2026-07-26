import { describe, it } from 'vitest'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { runHarness, type HarnessResult } from './botHarness'
import { randomBotStep } from '../bots/randomBot'
import { greedyBotStep } from '../bots/greedyBot'
import { newsBotStep } from '../bots/newsBot'

/**
 * T045 — locked v1 baseline generator. NOT a health-check test (nothing here
 * asserts pass/fail) — this is the one-time (well, once per Phase-1/Phase-2
 * balance milestone) script that runs the FULL §11 spec (1,000 seeds x 360
 * days x 3 bots, as opposed to botHarness.test.ts's CI-sized 30x100 sample)
 * and writes the resulting summary stats to baseline.v1.json, committed to
 * the repo. T068 (Phase 2's final balance pass) diffs its own post-Phase-2
 * run against this exact file.
 *
 * Run directly via `npx vitest run src/engine/harness/generateBaseline.test.ts`
 * — deliberately excluded from the normal `npm test` suite's concerns (it's
 * not a correctness assertion, just a slow snapshot-writer), but left as a
 * plain .test.ts file (matching this repo's vitest include glob) rather than
 * a separate script runner, since this codebase has no ts-node/tsx installed
 * and this is the simplest way to reuse the existing bot/harness imports
 * as-is.
 */

const SEEDS_COUNT = 1_000
const DAYS = 360

function summarize(result: HarnessResult) {
  return {
    bot: result.bot,
    seedsCount: result.seedsCount,
    days: result.days,
    difficulty: result.difficulty,
    checkpoints: Object.fromEntries(
      Object.entries(result.checkpoints).map(([day, stats]) => [
        day,
        { median: stats.median, mean: stats.mean, min: stats.min, max: stats.max },
      ]),
    ),
    defaultTriggeredRate: result.defaultTriggeredRate,
    gameOverRate: result.gameOverRate,
  }
}

describe('T045 — generate locked v1 baseline snapshot', () => {
  it(
    'runs the full §11 spec (1,000 seeds x 360 days) for all three bots and writes baseline.v1.json',
    () => {
      const random = runHarness({ bot: randomBotStep, seedsCount: SEEDS_COUNT, days: DAYS, difficulty: 'Pro' })
      const greedy = runHarness({ bot: greedyBotStep, seedsCount: SEEDS_COUNT, days: DAYS, difficulty: 'Pro' })
      const news = runHarness({ bot: newsBotStep, seedsCount: SEEDS_COUNT, days: DAYS, difficulty: 'Pro' })

      const snapshot = {
        generatedAt: new Date().toISOString(),
        spec: { seedsCount: SEEDS_COUNT, days: DAYS, difficulty: 'Pro' },
        bots: {
          random: summarize(random),
          greedy: summarize(greedy),
          news: summarize(news),
        },
      }

      const here = dirname(fileURLToPath(import.meta.url))
      writeFileSync(join(here, 'baseline.v1.json'), JSON.stringify(snapshot, null, 2) + '\n')

      console.log('[T045] baseline.v1.json written:', JSON.stringify(snapshot.bots, null, 2))
    },
    600_000,
  )
})
