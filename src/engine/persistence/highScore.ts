/**
 * Local high-score table — Trade Winds of Selvara.
 *
 * Design doc reference: §1 ("local high-score table" — score = peak net
 * worth ever reached). A separate localStorage key from the single
 * in-progress save (saveLoad.ts, T032) — this is a permanent HISTORY of
 * finished runs, never overwritten by `saveGame`/`loadGame`.
 *
 * Pure TypeScript, zero React imports (see /src/engine/README.md). Same
 * `globalThis.localStorage` (not `window.localStorage`) choice as
 * saveLoad.ts, for the same reason — see that file's header for the full
 * rationale (lets a Node test environment exercise this with a plain
 * in-memory `Storage` stub, no `jsdom` required).
 */

import type { Difficulty } from '../types'

const HIGH_SCORE_KEY = 'tradeWindsOfSelvara.highScores'

/** Top-10, per §1. */
const MAX_ENTRIES = 10

export interface ScoreEntry {
  peakNetWorth: number
  daysSurvived: number
  difficulty: Difficulty
  /** `Date.now()` at the moment this run was recorded — not used for
   * ordering (peakNetWorth alone decides that), only kept so a future UI
   * can show "when" without needing a separate lookup. */
  recordedAt: number
}

function storage(): Storage | null {
  return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage
}

/**
 * Returns the current top-10 table, sorted descending by `peakNetWorth`.
 * Never throws: returns `[]` when there's no table yet, storage is
 * unavailable, or the stored JSON is corrupt/unreadable.
 */
export function getHighScores(): ScoreEntry[] {
  const store = storage()
  if (!store) return []

  try {
    const raw = store.getItem(HIGH_SCORE_KEY)
    if (raw === null) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as ScoreEntry[]) : []
  } catch {
    return []
  }
}

/**
 * Inserts a finished run's score into the top-10 table (§1), re-sorts
 * descending by `peakNetWorth`, and evicts the lowest entry once there are
 * more than `MAX_ENTRIES` (i.e. an 11th entry always knocks out whichever
 * entry is now last, including the one just inserted if it doesn't make the
 * cut). Persists the trimmed table and returns it. A storage failure (quota,
 * disabled storage) is swallowed — the in-memory trimmed table is still
 * returned so callers can render it even if persistence itself failed.
 */
export function recordScore(entry: { peakNetWorth: number; daysSurvived: number; difficulty: Difficulty }): ScoreEntry[] {
  const withTimestamp: ScoreEntry = { ...entry, recordedAt: Date.now() }
  const combined = [...getHighScores(), withTimestamp].sort((a, b) => b.peakNetWorth - a.peakNetWorth)
  const trimmed = combined.slice(0, MAX_ENTRIES)

  const store = storage()
  if (store) {
    try {
      store.setItem(HIGH_SCORE_KEY, JSON.stringify(trimmed))
    } catch {
      // Swallowed deliberately — see file header/doc comment above.
    }
  }

  return trimmed
}
