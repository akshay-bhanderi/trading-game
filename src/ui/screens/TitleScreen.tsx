import { useState } from 'react'
import { useGameStore } from '../store/gameStore'
import type { Difficulty } from '../../engine/types'

const DIFFICULTIES: Difficulty[] = ['Noob', 'Pro', 'Expert']

export default function TitleScreen() {
  const newGame = useGameStore((s) => s.newGame)
  const [selected, setSelected] = useState<Difficulty>('Pro')

  return (
    <div className="screen">
      <h1>Trade Winds of Selvara</h1>
      <p className="muted">Buy low, travel, sell high. Score = peak net worth.</p>

      <div className="card">
        <h2>Difficulty</h2>
        <div className="nav-grid">
          {DIFFICULTIES.map((d) => (
            <button
              key={d}
              className={d === selected ? '' : 'secondary'}
              onClick={() => setSelected(d)}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      <button onClick={() => newGame(selected)}>New Game</button>
    </div>
  )
}
