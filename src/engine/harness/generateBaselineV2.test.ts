import { describe, it } from 'vitest'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { runHarness, type HarnessResult } from './botHarness'
import { randomBotStep } from '../bots/randomBot'
import { greedyBotStep } from '../bots/greedyBot'
import { newsBotStep } from '../bots/newsBot'

/**
 * T068 — post-Phase-2 full-spec baseline generator, sibling to
 * `generateBaseline.test.ts` (T045's `baseline.v1.json`). NOT a health-check
 * test (nothing here asserts pass/fail) — runs the full §11 spec (1,000
 * seeds x 360 days x 3 bots) with §14-§16 (Warehouse/Hotel/Aviation) fully
 * active — newsBot now opportunistically invests in them (T067) — and writes
 * `baseline.v2.json`, the reference snapshot this task's own acceptance
 * criteria calls for ("persist the new harness snapshot").
 *
 * Deliberately a SEPARATE file/output from `generateBaseline.test.ts`, never
 * overwriting `baseline.v1.json` — that file is the LOCKED pre-Phase-2
 * reference T068 diffs against (see this file's own diff summary below, and
 * tasks/phase-13-final-balance-pass.md's T068 entry for the human-readable
 * writeup). Run directly via
 * `npx vitest run src/engine/harness/generateBaselineV2.test.ts` — excluded
 * from casual `npm test` runs by nobody in particular (same include-glob
 * caveat as T045's generator: don't run a bare `vitest run` with no path
 * filter without remembering both generator files will re-execute).
 *
 * random/greedy are expected to be BIT-IDENTICAL to baseline.v1.json (neither
 * bot touches any Phase 2 code path — see newsBot.ts's own T067 file-header
 * note on why only newsBot was extended). news differs: T067's Phase 2
 * investment logic runs every day now, at `PHASE2_AFFORDABILITY_MULTIPLE =
 * 20` (T068-retuned from T067's original 8 — see newsBot.ts's own doc comment
 * for the full retuning story).
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
    // T067/T068 addition — Phase 2 book-value stats alongside net worth, same
    // shape/days as `checkpoints` above (see netWorth.ts's `calcPhase2AssetValue`
    // and botHarness.ts's `phase2AssetCheckpoints`).
    phase2AssetCheckpoints: Object.fromEntries(
      Object.entries(result.phase2AssetCheckpoints).map(([day, stats]) => [
        day,
        { median: stats.median, mean: stats.mean, min: stats.min, max: stats.max },
      ]),
    ),
    defaultTriggeredRate: result.defaultTriggeredRate,
    gameOverRate: result.gameOverRate,
  }
}

describe('T068 — generate post-Phase-2 baseline snapshot', () => {
  it(
    'runs the full §11 spec (1,000 seeds x 360 days) for all three bots, Phase 2 active, and writes baseline.v2.json',
    () => {
      const random = runHarness({ bot: randomBotStep, seedsCount: SEEDS_COUNT, days: DAYS, difficulty: 'Pro' })
      const greedy = runHarness({ bot: greedyBotStep, seedsCount: SEEDS_COUNT, days: DAYS, difficulty: 'Pro' })
      const news = runHarness({ bot: newsBotStep, seedsCount: SEEDS_COUNT, days: DAYS, difficulty: 'Pro' })

      const snapshot = {
        generatedAt: new Date().toISOString(),
        spec: { seedsCount: SEEDS_COUNT, days: DAYS, difficulty: 'Pro' },
        comparedAgainst: 'baseline.v1.json (T045, pre-Phase-2)',
        bots: {
          random: summarize(random),
          greedy: summarize(greedy),
          news: summarize(news),
        },
      }

      const here = dirname(fileURLToPath(import.meta.url))
      writeFileSync(join(here, 'baseline.v2.json'), JSON.stringify(snapshot, null, 2) + '\n')

      console.log('[T068] baseline.v2.json written:', JSON.stringify(snapshot.bots, null, 2))
    },
    600_000,
  )
})
