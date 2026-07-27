/**
 * Pause/settings menu — opened via the HUD's hamburger button (`Hud.tsx`).
 * Opening it already "pauses" the game in the only sense that applies to
 * this turn-based loop: it's rendered inside the same `PopupLayer` overlay
 * every other panel uses, whose backdrop sits above the HUD (z-index) and
 * blocks every other action underneath — no separate `paused` flag needed.
 *
 * Backup Save reuses the store's existing `save()` (the same manual-save
 * action the HUD's old Save button called — see gameStore.ts's own doc
 * comment on why it exists alongside the auto-save every action already
 * triggers). Sound/Music toggle player PREFERENCE only — see
 * settingsStore.ts's file header for why there's no audible effect yet.
 */

import { useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { useSettingsStore } from '../store/settingsStore'
import ConfirmDialog from '../components/ConfirmDialog'

interface MenuScreenProps {
  onClose: () => void
}

type PendingAction = 'newGame' | 'exit' | null

export default function MenuScreen({ onClose }: MenuScreenProps) {
  const game = useGameStore((s) => s.game)
  const save = useGameStore((s) => s.save)
  const justSaved = useGameStore((s) => s.justSaved)
  const newGame = useGameStore((s) => s.newGame)
  const returnToTitle = useGameStore((s) => s.returnToTitle)

  const soundOn = useSettingsStore((s) => s.soundOn)
  const musicOn = useSettingsStore((s) => s.musicOn)
  const toggleSound = useSettingsStore((s) => s.toggleSound)
  const toggleMusic = useSettingsStore((s) => s.toggleMusic)

  const [pending, setPending] = useState<PendingAction>(null)

  return (
    <div className="menu-screen">
      <div className="card">
        <h2>Save</h2>
        <button onClick={() => save()}>{justSaved ? 'Saved ✓' : 'Backup Save'}</button>
      </div>

      <div className="card">
        <h2>Audio</h2>
        <div className="row">
          <span>Sound effects</span>
          <button className="secondary" onClick={toggleSound}>
            {soundOn ? 'On' : 'Off'}
          </button>
        </div>
        <div className="row">
          <span>Music</span>
          <button className="secondary" onClick={toggleMusic}>
            {musicOn ? 'On' : 'Off'}
          </button>
        </div>
        <p className="muted">Audio isn't wired up yet — these just save your preference for when it is.</p>
      </div>

      <div className="card">
        <h2>Game</h2>
        <button className="secondary" onClick={() => setPending('newGame')}>
          New Game
        </button>
        <button className="secondary" onClick={() => setPending('exit')}>
          Exit to Title
        </button>
      </div>

      {pending === 'newGame' && (
        <ConfirmDialog
          message="Start a new game? Your current run will be overwritten."
          confirmLabel="Start New Game"
          onConfirm={() => {
            if (game) newGame(game.difficulty)
            setPending(null)
            onClose()
          }}
          onCancel={() => setPending(null)}
        />
      )}
      {pending === 'exit' && (
        <ConfirmDialog
          message="Exit to the title screen? Your progress is already saved."
          confirmLabel="Exit"
          onConfirm={() => {
            returnToTitle()
            setPending(null)
            onClose()
          }}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  )
}
