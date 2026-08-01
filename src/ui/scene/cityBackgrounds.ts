/**
 * City → background-scene mapping for HubScene (Phase 14, T070). Replaces
 * HubScene's old flat `CITY_PALETTE` color-field placeholder with the real
 * pixel-art skylines the user supplied, copied into
 * `public/assets/backgrounds/city/`.
 *
 * The 16 supplied scenes are generic pixel-art city blocks (glass towers,
 * brick rowhouses, a pastel/mountain skyline, etc.), not literally themed to
 * each city's produce/character — this mapping was chosen by visual
 * palette/mood fit, not precision (see tasks/phase-14-city-background-scenes.md
 * for the full rationale). File extensions are hardcoded per-city rather
 * than assumed, since the source pack mixes .jpg/.png inconsistently across
 * numbers (e.g. scene 8's night variant is a .jpg, every other night variant
 * here is a .png).
 */

import type { CityId } from '../../engine/types'

interface CityScene {
  day: string
  night: string
}

const BACKGROUND_BASE = 'assets/backgrounds/city'

// Scenes 7, 9, 10, 11, 13, 14, 15, 16 are unused by v1's 8 cities — reserved
// for Tier 3/4 cities (§13, out of v1 scope) if/when they ship.
const CITY_SCENES: Record<CityId, CityScene> = {
  'port-vela': { day: `${BACKGROUND_BASE}/1-day.jpg`, night: `${BACKGROUND_BASE}/1-night.png` },
  millbrook: { day: `${BACKGROUND_BASE}/2-day.jpg`, night: `${BACKGROUND_BASE}/2-night.png` },
  ironvale: { day: `${BACKGROUND_BASE}/3-day.jpg`, night: `${BACKGROUND_BASE}/3-night.png` },
  farrow: { day: `${BACKGROUND_BASE}/4-day.jpg`, night: `${BACKGROUND_BASE}/4-night.png` },
  saltmere: { day: `${BACKGROUND_BASE}/5-day.jpg`, night: `${BACKGROUND_BASE}/5-night.png` },
  copperfell: { day: `${BACKGROUND_BASE}/6-day.jpg`, night: `${BACKGROUND_BASE}/6-night.png` },
  greyharbor: { day: `${BACKGROUND_BASE}/8-day.jpg`, night: `${BACKGROUND_BASE}/8-night.jpg` },
  silkden: { day: `${BACKGROUND_BASE}/12-day.png`, night: `${BACKGROUND_BASE}/12-night.png` },
}

/** Resolves the background image URL for `cityId`/`isNight`, prefixed with
 * `baseUrl` (pass `import.meta.env.BASE_URL`, matching `character.ts`'s own
 * convention). Falls back to Farrow's scene for an unmapped city id (e.g. a
 * future Tier 3/4 city added before its own scene is assigned) rather than
 * throwing — background art is cosmetic, never worth crashing the scene. */
export function backgroundUrl(baseUrl: string, cityId: CityId, isNight: boolean): string {
  const scene = CITY_SCENES[cityId] ?? CITY_SCENES.farrow
  return `${baseUrl}${isNight ? scene.night : scene.day}`
}
