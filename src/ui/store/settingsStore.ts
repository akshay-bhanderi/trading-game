/**
 * Player preference store (Menu — Sound/Music toggles) — separate from
 * `gameStore.ts` since these are device/browser preferences, not part of any
 * run's `GameState` (no RNG/save-file/bot-harness relevance).
 *
 * NOTE: sound/music are explicitly OUT of v1 scope per the design doc's §13
 * scope fence. Music (not sound effects — no SFX engine exists yet) was
 * wired up post-v1 per tasks/phase-15-background-music.md (T071/T072):
 * `musicOn` and `musicVolume` here now have a real audible effect via
 * `src/ui/audio/backgroundMusic.ts`. `soundOn` still has no effect — no SFX
 * asset/engine exists — the Menu screen labels that one accordingly.
 */

import { create } from 'zustand'

const STORAGE_KEY = 'tradeWindsOfSelvara.settings'

interface Settings {
  soundOn: boolean
  musicOn: boolean
  /** 0–1. Independent of `musicOn` — muting via the On/Off toggle doesn't
   * reset this, so unmuting restores the player's chosen level. */
  musicVolume: number
}

const DEFAULT_SETTINGS: Settings = { soundOn: true, musicOn: true, musicVolume: 0.6 }

function storage(): Storage | null {
  return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage
}

function clampVolume(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : DEFAULT_SETTINGS.musicVolume
}

function loadSettings(): Settings {
  const store = storage()
  if (!store) return DEFAULT_SETTINGS

  try {
    const raw = store.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const parsed = JSON.parse(raw) as Partial<Settings>
    return {
      soundOn: typeof parsed.soundOn === 'boolean' ? parsed.soundOn : DEFAULT_SETTINGS.soundOn,
      musicOn: typeof parsed.musicOn === 'boolean' ? parsed.musicOn : DEFAULT_SETTINGS.musicOn,
      musicVolume: clampVolume(parsed.musicVolume),
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

function persist(settings: Settings): void {
  const store = storage()
  if (!store) return
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Swallowed deliberately — see saveLoad.ts's own precedent.
  }
}

interface SettingsStoreState extends Settings {
  toggleSound: () => void
  toggleMusic: () => void
  setMusicVolume: (v: number) => void
}

export const useSettingsStore = create<SettingsStoreState>((set, get) => ({
  ...loadSettings(),

  toggleSound: () => {
    const next = { ...get(), soundOn: !get().soundOn }
    persist(next)
    set(next)
  },

  toggleMusic: () => {
    const next = { ...get(), musicOn: !get().musicOn }
    persist(next)
    set(next)
  },

  setMusicVolume: (v: number) => {
    const next = { ...get(), musicVolume: clampVolume(v) }
    persist(next)
    set(next)
  },
}))
