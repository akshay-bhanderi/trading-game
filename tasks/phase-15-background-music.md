# Phase 15 — Background Music

[← Back to index](../TASK.md)

Status: **✅ Complete (T071–T072).**

> The design doc's v1 scope fence (§13) explicitly lists sound/music as OUT of v1 scope. This phase adds it anyway as user-directed post-v1 work — the same "later pass, not in the original build order" category as [Phase 14](phase-14-city-background-scenes.md). Two tracks were chosen and copied into the repo; this phase wired them up as a two-track system that switches based on what the player is looking at, not just a single always-on loop.
>
> **Resolved (2026-08-01):** built as `src/ui/audio/backgroundMusic.ts` (module-scope singleton engine — two `HTMLAudioElement`s, rAF crossfade, gesture-gated priming) + `src/ui/audio/useBackgroundMusic.ts` (thin hook called once at the top of `App.tsx`, above the `!game`/`gameOver` early returns, driving the track off the same `effectivePopup` derivation those returns already compute). Manually verified in-browser: menu track on Title/Continue, crossfade to menu track on popup open, gameplay track on the bare hub, mute toggle silences immediately, and a `musicVolume` slider (0–1, `settingsStore.ts`) was added beyond the original scope per user follow-up request — On/Off and volume are independent multipliers so muting doesn't reset the chosen level. `MenuScreen.tsx`'s stale "audio isn't wired up yet" copy was corrected; the sound-effects toggle still is (no SFX engine exists). Also fixed in passing: `vite.config.ts`'s PWA `workbox.globIgnores` now excludes `assets/backgrounds/**` — Phase 14's background images (unrelated to this task) were breaking `npm run build` by exceeding Workbox's precache size limit.

- [x] **T071 — Loop the chosen background track during gameplay, with a mute/volume control**
  - Doc references: §13 (sound/music called OUT of v1 — this task is the exception), §12 (HUD — the mute control belongs here, alongside the other persistent HUD icons)
  - Dependencies: T037 (persistent hub scene must exist to attach playback to)
  - File path hints:
    - `public/assets/audio/bg-loop.mp3` — the chosen track (originally "8 Bit Arcade - Loop C.mp3", ~470KB, purpose-built as a seamless loop; picked over the other 3 candidates for being the smallest/most loop-appropriate — see conversation history, not restated in doc)
    - New `src/ui/audio/backgroundMusic.ts` (or similar) — a small wrapper around `HTMLAudioElement` (`loop = true`) or the Web Audio API; does not belong in `/src/engine` (§17 Architecture rule #1 — engine is pure TS with zero React/DOM/browser APIs)
    - `src/ui/scene/Hud.tsx` (or wherever the persistent HUD icons live, per T037) — add a mute/volume toggle icon
    - Likely `src/ui/App.tsx` or the top-level shell — start/attach playback once, not per-scene-remount, so it doesn't restart every time `HubScene` re-mounts (e.g. on travel)
  - **Autoplay note (browser constraint, not a design choice):** browsers block audio autoplay before a user gesture. Playback must start on the first user interaction (e.g. the Title screen's "Continue"/"New Game" tap), not on page load.
  - **Persistence:** mute/volume preference should persist across sessions the same way the rest of the save data does (§17 — localStorage), so the player doesn't have to re-mute every visit.
  - Acceptance criteria: track loops seamlessly (no audible gap/click at the loop point) during gameplay; a HUD-accessible mute toggle silences it immediately and the muted state survives a reload; music does not restart/stutter on travel, popup open/close, or other in-scene re-renders.
  - Mobile/desktop note: verify the autoplay-after-gesture behavior specifically on mobile Safari/Chrome (§1's mobile-portrait-first target) — these are the strictest autoplay policies and the easiest to get wrong.

- [x] **T072 — Second track for title/menu/paused contexts, with track-switching between it and T071's gameplay loop**
  - Doc references: §13 (same exception as T071), §12 (screen 1 Title screen; the popup panels — Market/Bank/Newspaper/Travel/Year-end — that overlay the persistent hub scene)
  - Dependencies: T071 (reuses its audio wrapper/mute infrastructure rather than duplicating it — this is a second track + a switcher, not a second independent player)
  - File path hints:
    - `public/assets/audio/menu-loop.mp3` — the chosen track (originally "8 bit Start Game loop.mp3", ~230KB)
    - `src/ui/audio/backgroundMusic.ts` (T071's wrapper) — extend to hold two loaded tracks and crossfade/switch between them by key (`'gameplay' | 'menu'`) rather than hard-cutting, so switches don't pop
    - Wherever popup/panel open-state already lives (T035's popup layer) and the Title-screen mount (screen 1) — these are the trigger points for switching to `'menu'`; closing back to the bare hub scene switches to `'gameplay'`
  - **Trigger mapping (resolved from the user's request):**
    - Game start / Title screen (before a run exists, or difficulty-select) → menu track
    - Any popup/panel open over the hub scene (Market, Bank, Newspaper, Travel map, Year-end statement, Game over) → menu track
    - Bare hub scene, no popup open (i.e. actively trading/traveling/standing in a city) → gameplay track (T071)
    - **"Paused" — open design question:** the game has no formal pause state today (turn-based, session-length target 5–15 min per §1, no real-time element to pause). Treat "paused" as covered by the popup-open case above for now (any popup open already halts active play from the player's perspective); if a dedicated pause button/state gets added later, wire it to the menu track the same way.
  - Acceptance criteria: menu track plays on the Title screen and while any popup is open; gameplay track (T071) resumes when the last popup closes and the bare hub scene is showing; switching between the two has no jarring hard-cut (a short crossfade or fade-to-silence-then-fade-in is acceptable) and doesn't restart either track from position 0 on rapid popup open/close; the single mute toggle from T071 mutes both tracks, not just one.
  - Mobile/desktop note: same autoplay-after-gesture constraint as T071 — the very first sound played (likely the menu track, since Title screen is first) is what needs to be gated on the user's first tap.
