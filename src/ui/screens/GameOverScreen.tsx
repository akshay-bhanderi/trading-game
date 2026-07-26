/**
 * Game over / score screen (T043) — shown automatically once
 * `game.gameOver` is true (App.tsx's `deriveOverlay`, highest priority: it
 * can't be dismissed except by returning to the Title screen). The score
 * itself is already recorded to the high-score table by the STORE (T034's
 * `commit`, the instant `gameOver` first flips true) — this screen only
 * reads the resulting table back via `getHighScores`, never records it
 * itself, so re-rendering never double-counts.
 *
 * A real net-worth-over-time series isn't tracked anywhere in `GameState`
 * (only the scalar `peakNetWorth` survives) — per T043's own allowance
 * ("placeholder chart acceptable"), this renders a clearly-labeled
 * placeholder rather than fabricating a fake trend line from data that
 * doesn't exist.
 */

import { useGameStore } from '../store/gameStore'
import { getHighScores } from '../../engine/persistence/highScore'

export default function GameOverScreen() {
  const game = useGameStore((s) => s.game)
  const returnToTitle = useGameStore((s) => s.returnToTitle)

  if (!game) return null

  const scores = getHighScores()

  return (
    <div className="game-over-screen">
      <h1>Run Over</h1>

      <div className="card">
        <div className="row">
          <span>Peak net worth (score)</span>
          <strong>${game.peakNetWorth.toFixed(0)}</strong>
        </div>
        <div className="row">
          <span>Days survived</span>
          <strong>{game.day}</strong>
        </div>
        <div className="row">
          <span>Difficulty</span>
          <strong>{game.difficulty}</strong>
        </div>
      </div>

      <div className="game-over-chart-placeholder muted">Net-worth-over-time graph — coming in a later pass</div>

      <div className="card">
        <h2>Top 10</h2>
        {scores.length === 0 && <p className="muted">No scores recorded yet.</p>}
        {scores.map((s, i) => (
          <div className="row" key={`${s.recordedAt}-${i}`}>
            <span>
              #{i + 1} · {s.difficulty}
            </span>
            <strong>
              ${s.peakNetWorth.toFixed(0)} ({s.daysSurvived}d)
            </strong>
          </div>
        ))}
      </div>

      <button onClick={returnToTitle}>Back to Title</button>
    </div>
  )
}
