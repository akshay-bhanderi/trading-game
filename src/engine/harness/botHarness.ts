/**
 * Bot balance-test harness — Trade Winds of Selvara.
 *
 * Design doc reference: §11 "Balance test harness (build this before the
 * UI): three scripted bots... Run 1,000 seeded games each, 360 days." This
 * file implements the RUNNER only (`runHarness`) — the three bots themselves
 * (random/greedy/news) are already built (T025-T027, /src/engine/bots/*.ts).
 * `botHarness.test.ts` (same directory) is where the actual §11 health-check
 * ASSERTIONS against Pro-mode targets live; this file is bot-agnostic
 * plumbing that any of the three bots (or a future 4th) can be run through.
 *
 * TASK.md T028 (verbatim acceptance criteria): "`runHarness({ bot,
 * seedsCount, days })` simulates N seeded games (must support the full spec
 * of 1,000 seeds x 360 days, though CI-run tests may use a smaller sample
 * for speed) and returns per-day-checkpoint net worth stats (median, etc.)
 * per bot."
 *
 * Pure TypeScript, zero React imports (see /src/engine/README.md). Runs
 * fully headless in Node — only imports from `/src/engine/*`. Never uses
 * `Math.random` (every draw comes from a seeded `Rng`, per rng.ts's
 * project-wide rule).
 *
 * ---------------------------------------------------------------------------
 * `BotStep` — the shared bot-function shape
 * ---------------------------------------------------------------------------
 * All three existing bots (`randomBotStep`, `greedyBotStep`, `newsBotStep`,
 * T025-T027) share the EXACT signature `(state: GameState, rng: Rng) =>
 * GameState` — confirmed by reading each file directly (see their own doc
 * headers). `BotStep` below is that shared shape, so `runHarness` (and any
 * future bot) can be driven identically without a bot-specific adapter.
 *
 * ---------------------------------------------------------------------------
 * Seed choice: `0, 1, 2, ..., seedsCount - 1`
 * ---------------------------------------------------------------------------
 * Documented choice (task brief explicitly leaves this open, "e.g. seeds 0,
 * 1, 2, ... seedsCount-1, or derive them some other deterministic way — your
 * call, document it"). Plain sequential integers are used: simplest possible
 * scheme, trivially reproducible, and every seed is used for exactly one
 * purpose (see below) so there's no risk of correlated streams across seeds.
 *
 * Each seed is used for TWO distinct things per run, mirroring the split
 * already established by the bots' own 90-day smoke tests
 * (randomBot.test.ts/greedyBot.test.ts/newsBot.test.ts's `run90Days`
 * helpers):
 *   1. `createRng(seed)` — the "driver" `Rng` instance threaded through every
 *      `bot(state, rng)` call for that seed's WHOLE run (created ONCE per
 *      seed, reused/advanced across every turn — never recreated per call,
 *      since bots need a continuously-advancing stream, per the task brief).
 *      This is the RNG that drives the bot's own DECISIONS (which good to
 *      buy, buy-vs-sell, travel-vs-stay, etc.).
 *   2. `state.seed = seed * 104_729` (104,729 is simply a largeish prime,
 *      the same multiplier the existing bot smoke tests already use) — fed
 *      into `GameState.seed`, which `advanceDay` (turnLoop.ts) hashes
 *      per-day to derive its OWN independent price-noise/event-resolution
 *      RNG streams (see turnLoop.ts's "per-day RNG derivation" section).
 * Deliberately DIFFERENT numbers (not both literally `seed`) so the bot's
 * decision stream and the world's price/event stream are never trivially
 * the same sequence — matching the existing bot-test convention exactly,
 * for consistency across the codebase rather than inventing a third scheme.
 *
 * ---------------------------------------------------------------------------
 * Fresh-`GameState` construction: `makeFreshGameState`
 * ---------------------------------------------------------------------------
 * Cribbed from (and kept structurally identical to) the `makeFreshState`
 * helper duplicated across randomBot.test.ts/greedyBot.test.ts/
 * newsBot.test.ts/turnLoop.test.ts — Tier 1 cities unlocked (all four,
 * regardless of `difficulty`'s starting city, since §4 unlocks all Tier 1
 * cities from game start), the three free starter goods unlocked
 * (Grain/Cotton/Iron), empty cargo, starting cash/city per
 * `CONFIG.difficulty[difficulty]`. Exported (rather than kept file-private)
 * since it's a legitimate, reusable piece of the harness's public surface —
 * a future caller building a custom harness variant, or T045/T067/T068's
 * later extensions, may want the exact same fresh-state shape without
 * reimplementing it a fifth time.
 *
 * ---------------------------------------------------------------------------
 * Checkpoint value: `calcNetWorth(state)` at the moment `state.day` FIRST
 * reaches/passes the checkpoint — NOT `state.peakNetWorth`
 * ---------------------------------------------------------------------------
 * Documented choice (task brief explicitly invites either interpretation).
 * §11's targets table reads "Day | Net worth target" — i.e. net worth AT
 * that specific day, not "the highest net worth ever reached by that day"
 * (which is what `peakNetWorth` tracks, and is explicitly the game's SCORE
 * per §1, a different concept). Using `calcNetWorth(state)` at the exact
 * checkpoint day is the reading that matches the table's own phrasing, and
 * is also strictly harder to hit than `peakNetWorth` would be (a bot that
 * spikes to $50k on day 40 and craters to $5k by day 90 would wrongly look
 * "on target" at day 90 under a peak-based reading) — so this is also the
 * more honest/conservative choice for a balance-tuning harness (T029).
 *
 * A single day's `bot()` call can advance `state.day` by MORE than 1 (e.g.
 * the first leg of a multi-day Travel still only consumes one call, but a
 * LATER call mid-trip via `advanceTravelDay` also only advances by 1 — in
 * practice `state.day` never jumps by more than 1 per `bot()` call today,
 * since every bot's mid-travel branch calls `advanceTravelDay` exactly once
 * per step; this mirrors the exact "day may advance by more than 1 per call"
 * caution the task brief raises, so the checkpoint scan below re-checks
 * every checkpoint after EVERY step, not just once, in case a future bot
 * ever changes that). The FIRST call after which `state.day >= checkpoint`
 * is what gets recorded — never re-recorded on a later call.
 *
 * ---------------------------------------------------------------------------
 * KNOWN GAP — the "bankruptcy rate" health check (§11: "Bankruptcy rate on
 * Expert ~= 25-40% by day 90")
 * ---------------------------------------------------------------------------
 * Chosen approach: (a) — do NOT auto-resolve default decisions inside this
 * harness's turn loop. `resolveDefault` (bank/default.ts, T024) is a
 * PLAYER-CHOICE function; none of the three bots (T025-T027) ever call it
 * (by design — wiring bots to handle default prompts was explicitly out of
 * scope for T025-T027 and isn't required by T028 either). Auto-picking a
 * branch (e.g. always 'bankruptcy') INSIDE the harness would let a run
 * terminate cleanly and produce a bankruptcy-RATE number, but that number
 * would not honestly represent "how often a real player/bot combo goes
 * bankrupt" — it would really measure "how often the default TRIGGER fires",
 * inflated by an arbitrary always-worst-case resolution the bots never
 * actually choose. Forcing that fake precision would be dishonest (per the
 * task brief's own framing), so it is NOT done here.
 *
 * Instead, `HarnessResult` reports two clearly-labeled PROXY diagnostics,
 * not a real bankruptcy rate:
 *   - `defaultTriggeredRate` — the fraction of seeds where
 *     `awaitingDefaultDecision` became non-null at ANY point during the run
 *     (i.e. the §9 default TRIGGER condition fired at least once). Since no
 *     bot ever resolves it, this flag is STICKY for the rest of that seed's
 *     run once set (see bank/default.ts: "once true, leave it true until
 *     resolveDefault clears it").
 *   - `gameOverRate` — the fraction of seeds where `state.gameOver` became
 *     true. Under the CURRENT bots this will always be 0 (or near-0): the
 *     only paths that set `gameOver` are `resolveDefault(state,
 *     'bankruptcy')` and `checkRestructureRecheck` (itself only reachable
 *     after a PRIOR `resolveDefault(state, 'restructure')` call) — both are
 *     player-choice-gated, and no bot calls them. This field is included
 *     anyway for forward-compatibility: once T067 (or any future task) wires
 *     a bot to actually make default decisions, `gameOverRate` becomes a
 *     real, meaningful bankruptcy rate with ZERO changes needed here.
 *
 * `botHarness.test.ts`'s own §11 bankruptcy-rate check is written against
 * `defaultTriggeredRate` with this gap explicitly called out in its
 * description/comments (not silently treated as a real pass) — see that
 * file for the exact framing. T029 (balance tuning) needs to know this
 * nuance: config.ts changes CANNOT make the real §11 bankruptcy-rate target
 * pass today, because bots structurally never bankrupt themselves.
 *
 * ---------------------------------------------------------------------------
 * T067 addition — `phase2AssetCheckpoints`, alongside `checkpoints`
 * ---------------------------------------------------------------------------
 * Now that newsBot (T067) opportunistically invests in §14-§16, this harness
 * records a SECOND per-checkpoint stat set — `calcPhase2AssetValue(state)`
 * (netWorth.ts) — at the exact same checkpoint days/moments as the existing
 * net-worth checkpoints, using the exact same `computeCheckpointStats`
 * aggregation. This lets a caller (T068's balance pass) see, e.g., "at day
 * 90 the median bot holds $X in Phase 2 assets out of a $Y net worth" —
 * whether these systems are a meaningful, load-bearing part of net worth
 * growth or a rarely-triggered rounding error, without re-running the
 * simulation a second time. See `calcPhase2AssetValue`'s own doc comment for
 * why this is a separate lens from net worth, not a subset/superset of it.
 *
 * ---------------------------------------------------------------------------
 * Never crashes on a stuck seed — but DOES throw if one is actually stuck
 * ---------------------------------------------------------------------------
 * Every bot (T025-T027) is documented to always advance `state.day` by at
 * least 1 per call and never throw. As a defensive bound (mirroring the
 * `MAX_ITERATIONS` safety valve already used by every bot's own 90-day
 * smoke test), each seed's simulation loop caps its iteration count at
 * `days * MAX_ITERATIONS_PER_DAY_MULTIPLIER` and throws a descriptive error
 * if that bound is exceeded without reaching the target day — surfacing a
 * genuine stall loudly rather than silently producing wrong/incomplete
 * stats for that seed. This is DIFFERENT from the `gameOver` early-exit
 * below, which is an intentional, expected stop (not a stall).
 */

import { CONFIG } from '../config'
import { calcNetWorth, calcPhase2AssetValue } from '../netWorth'
import { createRng, type Rng } from '../rng'
import type { Difficulty, GameState } from '../types'

// ---------------------------------------------------------------------------
// Shared bot-function shape (see file header)
// ---------------------------------------------------------------------------

export type BotStep = (state: GameState, rng: Rng) => GameState

// ---------------------------------------------------------------------------
// Fresh-state construction
// ---------------------------------------------------------------------------

/** Tier 1 city ids — unlocked from game start regardless of `difficulty`'s
 * starting city (§4). Matches /src/engine/data/cities.ts's four Tier 1
 * records exactly (farrow, saltmere, copperfell, millbrook). */
const TIER_1_CITY_IDS = ['farrow', 'saltmere', 'copperfell', 'millbrook']

/** The three free starter goods (§5: license fee "-", `{ kind: 'start' }`
 * unlock condition) — matches /src/engine/data/goods.ts's grain/cotton/iron
 * records. */
const STARTER_GOOD_IDS = ['grain', 'cotton', 'iron']

/**
 * Builds a minimal-but-valid fresh `GameState` for `difficulty`, seeded with
 * `seed` — see the file header's "Fresh-`GameState` construction" section.
 * Exported for reuse by future harness variants/tests.
 */
export function makeFreshGameState(seed: number, difficulty: Difficulty = 'Pro'): GameState {
  const difficultyConfig = CONFIG.difficulty[difficulty]

  return {
    day: 1,
    currentCity: difficultyConfig.startingCityId,
    cash: difficultyConfig.startingCash,
    cargo: {},
    cargoCapacity: CONFIG.cargo.startingCapacity,
    bankAccounts: {},
    priceStates: {},
    unlockedCityIds: [...TIER_1_CITY_IDS],
    unlockedGoodIds: [...STARTER_GOOD_IDS],
    purchasedLicenseGoodIds: [],
    activeEvents: [],
    currentNewspaper: [],
    taxHistory: [],
    travelInProgress: null,
    peakNetWorth: difficultyConfig.startingCash,
    seed: seed * 104_729,
    difficulty,
    repaymentRecord: 0,
    cumulativeTradeVolume: 0,
    rankCache: { value: 1, computedOnDay: 0 },
  }
}

// ---------------------------------------------------------------------------
// Options / result shapes
// ---------------------------------------------------------------------------

/**
 * §11's own target-table days, used as the DEFAULT checkpoint set whenever
 * `options.checkpointDays` isn't supplied — filtered down to whatever is
 * `<= days` by `runHarness` itself (see task brief: "a shorter test run
 * doesn't try to check day 360 if `days` is only 100").
 */
export const DEFAULT_CHECKPOINT_DAYS = [10, 30, 90, 180, 360]

/** How many bot-step iterations a single seed's simulation loop is allowed
 * per target day before it's considered genuinely stuck (never expected to
 * be hit — see file header's "never crashes... but DOES throw" section). */
const MAX_ITERATIONS_PER_DAY_MULTIPLIER = 10

export interface RunHarnessOptions {
  /** The bot function to drive — any of `randomBotStep`/`greedyBotStep`/
   * `newsBotStep`, or a future 4th, all sharing the `BotStep` shape. */
  bot: BotStep
  /** Number of distinct seeded games to simulate (seeds `0..seedsCount-1` —
   * see file header). Must support up to 1,000 per the §11 full spec; no
   * hardcoded limit is imposed here. */
  seedsCount: number
  /** Number of days to simulate each game forward (each seed's loop runs
   * until `state.day` has advanced to AT LEAST this many days past day 1,
   * mirroring the bot test files' 90-day smoke-test loop pattern). Must
   * support up to 360 per the §11 full spec. */
  days: number
  /** Defaults to 'Pro' per §11's "a competent Pro-mode player" framing. */
  difficulty?: Difficulty
  /** Defaults to `DEFAULT_CHECKPOINT_DAYS` filtered to `<= days`. */
  checkpointDays?: number[]
}

export interface CheckpointStats {
  median: number
  mean: number
  min: number
  max: number
  /** Every seed's raw recorded net worth at this checkpoint, in seed order —
   * kept for richer reporting and so a caller can persist a full JSON
   * snapshot later (T045) without re-running the simulation. */
  values: number[]
}

export interface HarnessResult {
  /** The bot function's own `name` (e.g. `"randomBotStep"`) — every bot in
   * this codebase is a named export, so `Function.prototype.name` gives a
   * legible label with no extra parameter required. Falls back to
   * `'anonymousBot'` for a bot passed as an unnamed arrow function. */
  bot: string
  seedsCount: number
  days: number
  difficulty: Difficulty
  /** The actual checkpoint days used (after filtering `<= days`), ascending. */
  checkpointDays: number[]
  /** Per-checkpoint-day statistics across all seeds — see `CheckpointStats`. */
  checkpoints: Record<number, CheckpointStats>
  /**
   * T067 addition — per-checkpoint-day `calcPhase2AssetValue` statistics
   * (same seeds, same checkpoint days, same aggregation as `checkpoints`
   * above) — see file header's "T067 addition" section.
   */
  phase2AssetCheckpoints: Record<number, CheckpointStats>
  /**
   * PROXY diagnostic, NOT a real bankruptcy rate — see file header's "KNOWN
   * GAP" section. Fraction of seeds where `awaitingDefaultDecision` became
   * non-null at any point during the run (the §9 default TRIGGER condition
   * fired at least once), regardless of whether it was ever resolved (no bot
   * currently resolves it).
   */
  defaultTriggeredRate: number
  /** Raw count backing `defaultTriggeredRate`. */
  defaultTriggeredCount: number
  /**
   * Fraction of seeds where `state.gameOver` became true. Always ~0 under
   * the current bots (see file header) — included for forward-compatibility
   * once a bot is wired to make default decisions (e.g. T067+).
   */
  gameOverRate: number
  /** Raw count backing `gameOverRate`. */
  gameOverCount: number
}

// ---------------------------------------------------------------------------
// Per-seed simulation
// ---------------------------------------------------------------------------

interface SeedRunResult {
  /** Net worth recorded at each requested checkpoint day (see file header's
   * "Checkpoint value" section). Every requested checkpoint is always
   * present — see the backfill note in `simulateOneSeed`. */
  checkpointNetWorth: Record<number, number>
  /** T067 addition — `calcPhase2AssetValue` recorded at the same moments as
   * `checkpointNetWorth` above (see file header's "T067 addition" section). */
  checkpointPhase2AssetValue: Record<number, number>
  /** Whether `awaitingDefaultDecision` was ever non-null during this run. */
  everAwaitingDefaultDecision: boolean
  /** Whether `state.gameOver` became true during this run. */
  gameOver: boolean
}

/**
 * Simulates ONE seeded game forward to (at least) `days`, recording net
 * worth at each requested checkpoint the first time `state.day` reaches or
 * passes it. See file header for the full rationale on RNG threading,
 * checkpoint semantics, and the default-decision KNOWN GAP.
 */
function simulateOneSeed(
  bot: BotStep,
  seed: number,
  days: number,
  difficulty: Difficulty,
  checkpointDays: number[],
): SeedRunResult {
  const rng = createRng(seed)
  let state = makeFreshGameState(seed, difficulty)

  const startingDay = state.day
  const recorded = new Set<number>()
  const checkpointNetWorth: Record<number, number> = {}
  const checkpointPhase2AssetValue: Record<number, number> = {}
  let everAwaitingDefaultDecision = false

  const maxIterations = days * MAX_ITERATIONS_PER_DAY_MULTIPLIER
  let iterations = 0

  while (state.day < startingDay + days) {
    if (state.awaitingDefaultDecision) {
      everAwaitingDefaultDecision = true
    }

    // Intentional early exit (NOT a stall) — see file header's KNOWN GAP
    // section. No bot currently ever sets this under normal play, but the
    // harness respects it correctly in case a future bot does.
    if (state.gameOver) {
      break
    }

    iterations++
    if (iterations > maxIterations) {
      throw new Error(
        `runHarness: bot "${bot.name || 'anonymousBot'}" (seed ${seed}) never reached day ` +
          `${startingDay + days} within ${maxIterations} iterations (stuck at day ${state.day}). ` +
          `This indicates a genuine stall, not the expected gameOver early-exit.`,
      )
    }

    state = bot(state, rng)

    for (const checkpoint of checkpointDays) {
      if (!recorded.has(checkpoint) && state.day >= checkpoint) {
        checkpointNetWorth[checkpoint] = calcNetWorth(state)
        checkpointPhase2AssetValue[checkpoint] = calcPhase2AssetValue(state)
        recorded.add(checkpoint)
      }
    }
  }

  if (state.awaitingDefaultDecision) {
    everAwaitingDefaultDecision = true
  }

  // Backfill any checkpoint the run never reached (e.g. an early `gameOver`
  // exit, or `days` too small) with the FINAL simulated state's net worth,
  // so every checkpoint's `values` array always has exactly `seedsCount`
  // entries — no caller needs to special-case a missing/undefined data point.
  const finalNetWorth = calcNetWorth(state)
  const finalPhase2AssetValue = calcPhase2AssetValue(state)
  for (const checkpoint of checkpointDays) {
    if (!recorded.has(checkpoint)) {
      checkpointNetWorth[checkpoint] = finalNetWorth
      checkpointPhase2AssetValue[checkpoint] = finalPhase2AssetValue
    }
  }

  return {
    checkpointNetWorth,
    checkpointPhase2AssetValue,
    everAwaitingDefaultDecision,
    gameOver: state.gameOver === true,
  }
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

function computeCheckpointStats(values: number[]): CheckpointStats {
  if (values.length === 0) {
    return { median: 0, mean: 0, min: 0, max: 0, values: [] }
  }

  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const median =
    sorted.length % 2 === 0 ? ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2 : (sorted[mid] as number)
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length

  return {
    median,
    mean,
    min: sorted[0] as number,
    max: sorted[sorted.length - 1] as number,
    values,
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Runs `options.bot` through `options.seedsCount` independent seeded games,
 * each simulated forward to at least `options.days`, and returns
 * per-checkpoint net-worth statistics across all seeds — see the file
 * header for the full design rationale (seed scheme, checkpoint semantics,
 * the default-decision KNOWN GAP).
 *
 * No hardcoded limit on `seedsCount`/`days` — supports the full §11 spec
 * (1,000 seeds x 360 days) as well as small CI-run samples.
 */
export function runHarness(options: RunHarnessOptions): HarnessResult {
  const { bot, seedsCount, days } = options
  const difficulty = options.difficulty ?? 'Pro'
  const checkpointDays = [...(options.checkpointDays ?? DEFAULT_CHECKPOINT_DAYS)]
    .filter((d) => d <= days)
    .sort((a, b) => a - b)

  const valuesByCheckpoint: Record<number, number[]> = {}
  const phase2ValuesByCheckpoint: Record<number, number[]> = {}
  for (const checkpoint of checkpointDays) {
    valuesByCheckpoint[checkpoint] = []
    phase2ValuesByCheckpoint[checkpoint] = []
  }

  let defaultTriggeredCount = 0
  let gameOverCount = 0

  for (let seed = 0; seed < seedsCount; seed++) {
    const result = simulateOneSeed(bot, seed, days, difficulty, checkpointDays)

    for (const checkpoint of checkpointDays) {
      ;(valuesByCheckpoint[checkpoint] as number[]).push(result.checkpointNetWorth[checkpoint] as number)
      ;(phase2ValuesByCheckpoint[checkpoint] as number[]).push(result.checkpointPhase2AssetValue[checkpoint] as number)
    }
    if (result.everAwaitingDefaultDecision) defaultTriggeredCount++
    if (result.gameOver) gameOverCount++
  }

  const checkpoints: Record<number, CheckpointStats> = {}
  const phase2AssetCheckpoints: Record<number, CheckpointStats> = {}
  for (const checkpoint of checkpointDays) {
    checkpoints[checkpoint] = computeCheckpointStats(valuesByCheckpoint[checkpoint] as number[])
    phase2AssetCheckpoints[checkpoint] = computeCheckpointStats(phase2ValuesByCheckpoint[checkpoint] as number[])
  }

  return {
    bot: bot.name || 'anonymousBot',
    seedsCount,
    days,
    difficulty,
    checkpointDays,
    checkpoints,
    phase2AssetCheckpoints,
    defaultTriggeredRate: seedsCount === 0 ? 0 : defaultTriggeredCount / seedsCount,
    defaultTriggeredCount,
    gameOverRate: seedsCount === 0 ? 0 : gameOverCount / seedsCount,
    gameOverCount,
  }
}
