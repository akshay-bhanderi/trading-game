# Phase 14 — Per-City Day/Night Background Scenes

[← Back to index](../TASK.md)

Status: **✅ Complete (T070).**

> Not part of the original design doc's numbered build order (§17) — this phase is the "Background/room art: not yet sourced... later pass" placeholder flagged in §12 finally getting sourced. 16 numbered pixel-art city-skyline scenes (day + night pair each) were supplied by the user and copied into `public/assets/backgrounds/city/` (`{n}-day.{jpg,png}` / `{n}-night.{png,jpg}`, n = 1–16). This phase wires them into `HubScene`, replacing its flat `CITY_PALETTE` color-field placeholder (see that file's header comment, T037/T069).
>
> **Resolved (2026-08-01):** built as `src/ui/scene/cityBackgrounds.ts` (the city→scene URL mapping below) + a `Sprite`/`Assets.load` layer added to `HubScene.tsx`, cover-fit scaled into the wall region, layered above the existing flat `CITY_PALETTE` fill (kept as the loading-state fallback, not deleted) with a request-id guard against out-of-order resolution on rapid travel. The day/night roll itself lives in the engine — new `src/engine/cityBackground.ts` (`nightProbabilityForTravelDays` + a seeded `createCityNightRng`/`rollIsNight`, unit-tested in `cityBackground.test.ts`, 6 tests) — called from `newGame.ts` (flat 50/50 for the starting city) and `actions/travel.ts`'s `advanceTravelDay` arrival branch (weighted by the completed trip's `totalDays`), writing the new optional `GameState.currentCityIsNight` field. `App.tsx` reads it as `game.currentCityIsNight ?? false` when passing it to `HubScene`. Manually verified in-browser across day/night and a real Travel arrival (Farrow → Saltmere); `npx tsc --noEmit`, the engine test suite, and `npx vite build` all pass. Fixed in passing (unrelated to this task but discovered while building it): `vite.config.ts`'s PWA `workbox.globIgnores` now excludes `assets/backgrounds/**` — these multi-MB images were breaking `npm run build` by exceeding Workbox's precache size limit.

- [x] **T070 — Real per-city day/night background art in HubScene, randomized on arrival**
  - Doc references: §12 (screen 2, hub scene background-art placeholder note), §4 (travel days — used for the night-weighting below), §6 ("Deterministic seeded RNG per run... so bugs are reproducible" — the day/night pick must honor this same rule)
  - Dependencies: T037, T069
  - File path hints:
    - `public/assets/backgrounds/city/*-day.*` / `*-night.*` — the 16 scene pairs (already in the repo; not sourced by this task)
    - New `src/ui/scene/cityBackgrounds.ts` — city → image-number map + the day/night picker function
    - `src/ui/scene/HubScene.tsx` — replace the `CITY_PALETTE` wall/floor `Graphics` fill with a `Sprite`/`Texture` loaded from the mapped file; keep the existing flat-color rects as a loading-state fallback rather than deleting them outright
    - Wherever travel arrival is resolved in `/src/engine` (e.g. the travel-action reducer/`applyTravel`-equivalent) — the day/night roll needs to be stored on `GameState` per arrival, not re-rolled on every React render/remount/popup toggle

  - **City → scene-number mapping (first pass — see note below):**

    | # | City |
    |---|---|
    | 1 | Port Vela |
    | 2 | Millbrook |
    | 3 | Ironvale |
    | 4 | Farrow |
    | 5 | Saltmere |
    | 6 | Copperfell |
    | 8 | Greyharbor |
    | 12 | Silkden |

    Chosen by visually skimming the 16 supplied skylines — they're generic pixel-art city blocks (glass towers, brick rowhouses, a pastel/mountain skyline, etc.), not literally themed to each city's produce/character (no farm silos, fishing docks, mine shafts in the set), so this is a reasonable palette/mood fit, not a precise one. Freely reassign at implementation time if a better visual match is obvious once all 16 are viewed side by side. Scenes 7, 9, 10, 11, 13, 14, 15, 16 are unused by v1's 8 cities — reserved for Tier 3/4 cities (§13, out of v1 scope) if/when they ship; one number spare beyond the 7 needed there.

  - **Day/night selection — resolved design decision:** random, not tied to any in-game clock (the game has no time-of-day system, only a day counter). Weight the night probability by the travel duration just completed (§4's 1–3 day trips), so longer journeys read as more likely to arrive after dark: 1-day trip ≈ 25% night, 2-day ≈ 50%, 3-day ≈ 75%. The player's very first city (game start, no travel yet) rolls a flat 50/50. Must draw from the run's existing seeded RNG (§6), not `Math.random()` — this pick has to be as reproducible as every other random draw the seed already governs. Roll once per arrival and persist the result on `GameState` (e.g. a `currentCityIsNight: boolean` field) so it's stable across re-renders, popup open/close, and reload — not re-rolled on every mount.

  - Acceptance criteria: every v1 city shows its mapped real background image (not the flat `CITY_PALETTE` fill) behind the character in `HubScene`; arriving via Travel rolls day or night per the weighting above and the result stays stable until the next travel; a fresh run's first city also gets a stable (seeded) day/night pick, not a re-roll per render. Manual/visual check across all 8 cities × both variants is sufficient — this is presentation, not game logic — except the weighting function itself (e.g. `pickDayOrNight(travelDays, rng)`), which gets a small unit test since it's a pure, seeded, testable function, per the engine's existing testing convention.

  - Mobile/desktop note: several source day images are multi-MB JPGs — at minimum this needs a `<Sprite>` texture load per city (Pixi caches by URL so repeat visits are free), and ideally a compressed/resized export pass before shipping to mobile. Flag but don't block this task on it unless load time is visibly bad in manual testing.
