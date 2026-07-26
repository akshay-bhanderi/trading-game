import { describe, it } from 'vitest'
import { runHarness } from './botHarness'
import { greedyBotStep } from '../bots/greedyBot'

describe('diag', () => {
  it(
    'greedy 200 seeds',
    () => {
      const r = runHarness({ bot: greedyBotStep, seedsCount: 200, days: 100, checkpointDays: [10, 30, 90] })
      for (const day of [10, 30, 90]) {
        console.log(`day=${day} median=${Math.round(r.checkpoints[day].median)}`)
      }
    },
    60_000,
  )
})
