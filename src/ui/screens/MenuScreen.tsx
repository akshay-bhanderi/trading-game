/**
 * Pause/settings menu — opened via the HUD's hamburger button (`Hud.tsx`).
 * Opening it already "pauses" the game in the only sense that applies to
 * this turn-based loop: it's rendered inside the same `PopupLayer` overlay
 * every other panel uses, whose backdrop sits above the HUD (z-index) and
 * blocks every other action underneath — no separate `paused` flag needed.
 * Opening this popup also switches background music to the menu track
 * (T072 — see App.tsx's `effectivePopup`-driven `useBackgroundMusic` call).
 *
 * Backup Save reuses the store's existing `save()` (the same manual-save
 * action the HUD's old Save button called — see gameStore.ts's own doc
 * comment on why it exists alongside the auto-save every action already
 * triggers). Music On/Off + volume slider are real (T071/T072, wired to
 * `src/ui/audio/backgroundMusic.ts`). Sound effects toggle is still
 * preference-only — no SFX engine/assets exist yet, see settingsStore.ts's
 * file header.
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
  const musicVolume = useSettingsStore((s) => s.musicVolume)
  const toggleSound = useSettingsStore((s) => s.toggleSound)
  const toggleMusic = useSettingsStore((s) => s.toggleMusic)
  const setMusicVolume = useSettingsStore((s) => s.setMusicVolume)

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
        <div className="row">
          <span>Music volume</span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round(musicVolume * 100)}
            disabled={!musicOn}
            aria-label="Music volume"
            onChange={(e) => setMusicVolume(Number(e.target.value) / 100)}
          />
        </div>
        <p className="muted">Sound effects aren't wired up yet — that toggle just saves your preference.</p>
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
