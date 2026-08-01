/**
 * Background music engine (T071/T072) — module-scope singleton, not a React
 * component/hook itself. Two loops (gameplay, menu) crossfade based on what
 * the player is looking at; `useBackgroundMusic.ts` is the thin hook that
 * drives this from App.tsx's render state.
 *
 * Deliberately outside `/src/engine` (design doc §17 Architecture rule #1:
 * engine is pure TS with zero React/DOM/browser APIs) and deliberately a
 * plain module rather than a ref-based class inside a component — the actual
 * `Audio` elements are created lazily on first use and live for the whole
 * page session, so a React-owned lifecycle (mount/unmount/StrictMode's
 * double-invoke) would only add risk of orphaning/duplicating them for no
 * benefit. See tasks/phase-15-background-music.md for the design rationale.
 */

export type MusicTrack = 'gameplay' | 'menu'

const SOURCES: Record<MusicTrack, string> = {
  gameplay: 'assets/audio/bg-loop.mp3',
  menu: 'assets/audio/menu-loop.mp3',
}

const CROSSFADE_MS = 400

let gameplayAudio: HTMLAudioElement | null = null
let menuAudio: HTMLAudioElement | null = null
let primed = false
let removeGestureListener: (() => void) | null = null

let currentTrack: MusicTrack = 'menu'
/** How far the current crossfade has progressed, 0–1 (1 = fully on
 * `currentTrack`, the resting state between switches). Tracked explicitly
 * so `setMuted`/`setVolume` can re-apply their gates without disturbing
 * wherever an in-flight ramp currently is. */
let activeLevel = 1
let muted = false
/** Player-chosen master level, 0–1 (settingsStore's `musicVolume`) — a
 * separate multiplier from `muted` so the On/Off toggle doesn't clobber the
 * player's chosen level, and turning volume down to 0 via the slider reads
 * the same as muting without needing to touch the `musicOn` toggle. */
let masterVolume = 1
let rampHandle: number | null = null

function ensureElements(): void {
  if (gameplayAudio && menuAudio) return
  const base = import.meta.env.BASE_URL
  gameplayAudio = new Audio(`${base}${SOURCES.gameplay}`)
  menuAudio = new Audio(`${base}${SOURCES.menu}`)
  for (const el of [gameplayAudio, menuAudio]) {
    el.loop = true
    el.preload = 'auto'
  }
}

function cancelRamp(): void {
  if (rampHandle !== null) {
    cancelAnimationFrame(rampHandle)
    rampHandle = null
  }
}

function elementFor(track: MusicTrack): HTMLAudioElement {
  return track === 'gameplay' ? gameplayAudio! : menuAudio!
}

/** Applies `activeLevel` to both elements, gated by mute and scaled by the
 * player's master volume. Single code path for the crossfade ramp, the mute
 * toggle, AND the volume slider — all three are volume multipliers, not
 * pause/play, so playback position survives toggling any of them and
 * there's only one place that ever writes `.volume`. */
function applyVolumes(): void {
  const gate = (muted ? 0 : 1) * masterVolume
  if (gameplayAudio) gameplayAudio.volume = (currentTrack === 'gameplay' ? activeLevel : 1 - activeLevel) * gate
  if (menuAudio) menuAudio.volume = (currentTrack === 'menu' ? activeLevel : 1 - activeLevel) * gate
}

/** Call once, from a real user gesture (see the document-level listener in
 * `primeOnFirstGesture`). Starts both tracks — one silent — so every later
 * `setTrack` call is only a volume ramp, never a fresh `.play()` outside a
 * gesture (iOS Safari's autoplay unlock is per-element, not global: playing
 * track A during a gesture does not retroactively unlock track B played
 * later on its own). */
function prime(): void {
  if (primed) return
  ensureElements()
  primed = true
  activeLevel = 1
  applyVolumes()
  gameplayAudio?.play().catch(() => {})
  menuAudio?.play().catch(() => {})
}

/** Attaches a one-time, self-removing listener on `document` so priming
 * doesn't need to know which specific UI button is "the" start action —
 * it fires on literally the first tap/click anywhere. */
export function primeOnFirstGesture(): void {
  if (primed || removeGestureListener || typeof document === 'undefined') return
  const handler = () => {
    prime()
    removeGestureListener?.()
    removeGestureListener = null
  }
  document.addEventListener('pointerdown', handler, { once: true })
  document.addEventListener('keydown', handler, { once: true })
  removeGestureListener = () => {
    document.removeEventListener('pointerdown', handler)
    document.removeEventListener('keydown', handler)
  }
}

/** Crossfades to `track` over `CROSSFADE_MS`. Idempotent — calling with the
 * already-current track is a no-op, so React effects can call this on every
 * relevant render without guarding manually. */
export function setTrack(track: MusicTrack): void {
  if (!primed) {
    // No gesture seen yet — just remember the intent so the right track is
    // already active the instant `prime()` finally runs.
    currentTrack = track
    return
  }
  if (track === currentTrack) return

  cancelRamp()
  currentTrack = track
  const el = elementFor(track)
  if (el.paused) el.play().catch(() => {})

  const startLevel = 1 - activeLevel // ramping the NEW track up from where the old one's fade-out left off
  const start = performance.now()
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / CROSSFADE_MS)
    activeLevel = startLevel + (1 - startLevel) * t
    applyVolumes()
    if (t < 1) {
      rampHandle = requestAnimationFrame(step)
    } else {
      rampHandle = null
    }
  }
  rampHandle = requestAnimationFrame(step)
}

/** Mute gate — re-applies immediately at whatever crossfade progress is
 * currently active, without disturbing an in-flight ramp. */
export function setMuted(next: boolean): void {
  muted = next
  applyVolumes()
}

/** Master volume slider, 0–1 — independent of `setMuted` (see `masterVolume`
 * doc comment above) so the On/Off toggle and the level slider don't fight
 * over the same piece of state. */
export function setVolume(level: number): void {
  masterVolume = Math.min(1, Math.max(0, level))
  applyVolumes()
}
