import { useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { CONFIG } from '../../engine/config'
import { CITIES } from '../../engine/data/cities'
import type { Difficulty } from '../../engine/types'

const DIFFICULTIES: Difficulty[] = ['Noob', 'Pro', 'Expert']

/** Short, doc-grounded (§3) blurb per difficulty — no invented flavor beyond
 * what its own config numbers already say. */
const TAGLINE: Record<Difficulty, string> = {
  Noob: 'Forgiving start — more cash, calmer prices, first tax year waived.',
  Pro: 'The standard run — balanced risk, no training wheels.',
  Expert: 'Brutal start — less cash, wilder prices, bigger score multiplier.',
}

function cityName(cityId: string): string {
  return CITIES.find((c) => c.id === cityId)?.name ?? cityId
}

export default function TitleScreen() {
  const newGame = useGameStore((s) => s.newGame)
  const continueGame = useGameStore((s) => s.continueGame)
  const hasSave = useGameStore((s) => s.hasSave)
  const [selected, setSelected] = useState<Difficulty>('Noob')

  return (
    <div className="screen">
      <h1>Trade Winds of Selvara</h1>
      <p className="muted">Buy low, travel, sell high. Score = peak net worth.</p>

      <div className="card">
        <h2>Difficulty</h2>
        <div className="difficulty-list">
          {DIFFICULTIES.map((d) => {
            const cfg = CONFIG.difficulty[d]
            const isSelected = d === selected
            return (
              <button
                key={d}
                className={`difficulty-row${isSelected ? ' difficulty-row--selected' : ' secondary'}`}
                aria-pressed={isSelected}
                onClick={() => setSelected(d)}
              >
                <span className="difficulty-row-top">
                  <span className="difficulty-row-name">{d}</span>
                  <span className="difficulty-row-stats">
                    ${cfg.startingCash.toLocaleString()} · {cityName(cfg.startingCityId)} · {cfg.scoreMultiplier}x score
                  </span>
                </span>
                <span className="difficulty-row-tagline">{TAGLINE[d]}</span>
              </button>
            )
          })}
        </div>
      </div>

      <button onClick={() => newGame(selected)}>New Game</button>
      <button
        className="secondary"
        disabled={!hasSave()}
        onClick={() => continueGame()}
      >
        Continue
      </button>
    </div>
  )
}
