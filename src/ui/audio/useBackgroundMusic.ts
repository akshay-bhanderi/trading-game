/**
 * Thin hook wiring `backgroundMusic.ts`'s imperative engine to render state.
 * Called once, unconditionally, at the top of `App.tsx` — ABOVE the
 * `!game`/`game.gameOver` early returns, so it keeps driving music across
 * every branch of the app without itself ever unmounting (App itself never
 * unmounts across newGame/returnToTitle/game-over — those only flip
 * `gameStore.game` and re-render into a different branch).
 */

import { useEffect } from 'react'
import { useSettingsStore } from '../store/settingsStore'
import { primeOnFirstGesture, setMuted, setTrack, setVolume, type MusicTrack } from './backgroundMusic'

/** @param track 'menu' while on the Title screen, Game Over, or with any
 * popup open (Market/Bank/Newspaper/Travel/Warehouse/Real Estate/Aviation/
 * Menu/Year-End); 'gameplay' on the bare hub scene. See T072's trigger
 * mapping in tasks/phase-15-background-music.md for the full rationale,
 * including why "paused" needs no separate case (opening the Menu popup
 * already covers it). */
export function useBackgroundMusic(track: MusicTrack): void {
  const musicOn = useSettingsStore((s) => s.musicOn)
  const musicVolume = useSettingsStore((s) => s.musicVolume)

  useEffect(() => {
    primeOnFirstGesture()
  }, [])

  useEffect(() => {
    setTrack(track)
  }, [track])

  useEffect(() => {
    setMuted(!musicOn)
  }, [musicOn])

  useEffect(() => {
    setVolume(musicVolume)
  }, [musicVolume])
}
