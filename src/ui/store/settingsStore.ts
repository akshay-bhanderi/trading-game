/**
 * Player preference store (Menu — Sound/Music toggles) — separate from
 * `gameStore.ts` since these are device/browser preferences, not part of any
 * run's `GameState` (no RNG/save-file/bot-harness relevance).
 *
 * NOTE: sound/music are explicitly OUT of v1 scope per the design doc's §13
 * scope fence — there is no audio engine or asset wired up anywhere in this
 * codebase yet. These toggles persist the player's PREFERENCE now (to
 * localStorage, mirroring `persistence/saveLoad.ts`'s guarded-storage
 * pattern) so a future audio pass has something to read; toggling currently
 * has no audible effect. The Menu screen surfaces this honestly rather than
 * implying a working audio toggle.
 */

import { create } from 'zustand'

const STORAGE_KEY = 'tradeWindsOfSelvara.settings'

interface Settings {
  soundOn: boolean
  musicOn: boolean
}

const DEFAULT_SETTINGS: Settings = { soundOn: true, musicOn: true }

function storage(): Storage | null {
  return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage
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
}

export const useSettingsStore = create<SettingsStoreState>((set, get) => ({
  ...loadSettings(),

  toggleSound: () => {
    const next = { soundOn: !get().soundOn, musicOn: get().musicOn }
    persist(next)
    set(next)
  },

  toggleMusic: () => {
    const next = { soundOn: get().soundOn, musicOn: !get().musicOn }
    persist(next)
    set(next)
  },
}))
