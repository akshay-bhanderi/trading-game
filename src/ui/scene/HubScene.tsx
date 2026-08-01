/**
 * Persistent hub scene (T037) — full-screen pixel-cutaway room the player's
 * character stands in, rendered on a PixiJS <canvas> (T069). This is the
 * single starting room only; room-growth-as-the-building-grows (§12) is an
 * explicit open design question there, not implemented here.
 *
 * Background art (T070, Phase 14): real per-city day/night pixel skylines,
 * replacing the old flat per-city color placeholder (§12 "Background/room
 * art: not yet sourced" — that placeholder is now this task). The flat
 * `CITY_PALETTE` wall/floor fill is KEPT, not deleted — it's the
 * loading-state fallback shown until the mapped image resolves, per T070's
 * acceptance criteria. See `cityBackgrounds.ts` for the city→scene mapping.
 */

import { useEffect, useRef } from 'react'
import { Assets, Container, Graphics, Sprite, Text, Texture, type AnimatedSprite, type Ticker } from 'pixi.js'
import PixiStage from './PixiStage'
import { loadCharacterAnimations, createCharacterSprite, createCharacterController } from './character'
import { backgroundUrl } from './cityBackgrounds'
import type { CityId } from '../../engine/types'

const STAGE_WIDTH = 360
const STAGE_HEIGHT = 740
const FLOOR_Y = 620
/** Support posts sit ~10-24px from each wall (see `structure` below) — keep
 * the character's wander range inside them so it never clips into a post. */
const CHARACTER_MIN_X = 40
const CHARACTER_MAX_X = STAGE_WIDTH - 40

/** Placeholder per-city palette (wall, floor) — real per-city background
 * art is a later pass per §12. Keyed by city id so the room re-tints
 * without needing to rebuild the whole scene on travel. */
const CITY_PALETTE: Record<CityId, { wall: number; floor: number }> = {
  farrow: { wall: 0x6b8f4e, floor: 0x8a5a34 },
  saltmere: { wall: 0x3f6b7a, floor: 0x7a6a4f },
  copperfell: { wall: 0x7a5236, floor: 0x5c4632 },
  millbrook: { wall: 0x8a7a4e, floor: 0x6e5a3a },
  'port-vela': { wall: 0x2e5c76, floor: 0x4a4a5a },
  ironvale: { wall: 0x5a5a5e, floor: 0x3a3a3e },
  silkden: { wall: 0x6a3f6b, floor: 0x4a2c4a },
  greyharbor: { wall: 0x4a5560, floor: 0x3a4048 },
}

interface HubSceneProps {
  cityId: CityId
  /** Display name of the current city — rendered below the "TRADE WINDS OF
   * SELVARA" signage (see the `cityNameText` block in `onReady` below). Kept
   * as a prop rather than derived from `cityId` here so this file doesn't
   * need its own `CITIES` lookup — App.tsx already has the resolved name. */
  cityName: string
  /** T070 — which of the mapped city's two scene images to show. Rolled once
   * per arrival by the engine (see `GameState.currentCityIsNight`'s doc
   * comment) and passed straight through; App.tsx defaults an old save's
   * missing field to `false` (day) before it ever reaches here. */
  isNight: boolean
}

/** Scales `sprite` (already holding `tex`) to "cover" a `width`×`height`
 * region anchored at (0,0) — fills the region with no letterboxing,
 * center-cropping whichever axis overflows. Used for the background image,
 * which is a wide landscape skyline being fit into the scene's much taller
 * portrait wall area. */
function applyCoverFit(sprite: Sprite, tex: Texture, width: number, height: number): void {
  const scale = Math.max(width / tex.width, height / tex.height)
  sprite.width = tex.width * scale
  sprite.height = tex.height * scale
  sprite.position.set((width - sprite.width) / 2, (height - sprite.height) / 2)
}

export default function HubScene({ cityId, cityName, isNight }: HubSceneProps) {
  const wallRef = useRef<Graphics | null>(null)
  const floorRef = useRef<Graphics | null>(null)
  const cityNameTextRef = useRef<Text | null>(null)
  const backgroundSpriteRef = useRef<Sprite | null>(null)
  // Guards against a slow-resolving load from an earlier city/isNight
  // overwriting a faster-resolving later one (e.g. rapid travel) — only the
  // most recently STARTED load is allowed to apply its texture.
  const loadRequestIdRef = useRef(0)

  // Shared by the initial paint (inside `onReady`, below) and every later
  // city/isNight change (the effect right after this) — a single load path
  // so the requestId race-guard actually protects against BOTH sources
  // racing each other, not just effect-vs-effect.
  function startBackgroundLoad(forCityId: CityId, forIsNight: boolean): void {
    const requestId = ++loadRequestIdRef.current
    const url = backgroundUrl(import.meta.env.BASE_URL, forCityId, forIsNight)
    Assets.load<Texture>(url).then((tex) => {
      if (requestId !== loadRequestIdRef.current) return // superseded — discard
      const sprite = backgroundSpriteRef.current
      if (!sprite) return // scene torn down before this resolved
      tex.source.scaleMode = 'nearest'
      sprite.texture = tex
      applyCoverFit(sprite, tex, STAGE_WIDTH, FLOOR_Y)
    })
  }

  useEffect(() => {
    const palette = CITY_PALETTE[cityId]
    if (!palette) return
    wallRef.current?.clear().rect(0, 0, STAGE_WIDTH, FLOOR_Y).fill(palette.wall)
    floorRef.current
      ?.clear()
      .rect(0, FLOOR_Y, STAGE_WIDTH, STAGE_HEIGHT - FLOOR_Y)
      .fill(palette.floor)
    if (cityNameTextRef.current) {
      cityNameTextRef.current.text = cityName
    }
    // No-op on the very first render (before `onReady` has created the
    // sprite — see `startBackgroundLoad`'s own null-sprite guard); the
    // initial paint is instead kicked off from inside `onReady` itself,
    // same pattern this file already uses for wall/floor/cityNameText.
    startBackgroundLoad(cityId, isNight)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityId, cityName, isNight])

  return (
    <PixiStage
      width={STAGE_WIDTH}
      height={STAGE_HEIGHT}
      onReady={(app) => {
        let disposed = false
        const root = new Container()
        app.stage.addChild(root)

        const wall = new Graphics()
        const floor = new Graphics()
        const palette = CITY_PALETTE[cityId] ?? { wall: 0x444444, floor: 0x333333 }
        wall.rect(0, 0, STAGE_WIDTH, FLOOR_Y).fill(palette.wall)
        floor.rect(0, FLOOR_Y, STAGE_WIDTH, STAGE_HEIGHT - FLOOR_Y).fill(palette.floor)
        root.addChild(wall)
        root.addChild(floor)
        wallRef.current = wall
        floorRef.current = floor

        // T070: real background art, layered above the flat palette fill
        // above (which stays visible underneath until this resolves — the
        // loading-state fallback). Starts as an empty texture (invisible)
        // until `startBackgroundLoad` below fills it in.
        const background = new Sprite(Texture.EMPTY)
        root.addChild(background)
        backgroundSpriteRef.current = background
        startBackgroundLoad(cityId, isNight)

        // Single-floor building cutaway dressing (T037 follow-up — the flat
        // wall/floor fills above read as an empty color field with nothing
        // to mark it as "inside a one-floor building"; this layer adds a
        // roofline/ceiling beam, a window, corner support posts, and floor
        // planking so the room reads as an actual cutaway room, not a color
        // swatch). Deliberately city-palette-INDEPENDENT (fixed wood/timber
        // tones) so it never needs to be touched by the city re-tint effect
        // above — only `wall`/`floor`'s own fill colors change on travel.
        const structure = new Graphics()

        // Ceiling beam / roofline strip along the very top of the wall.
        structure.rect(0, 0, STAGE_WIDTH, 14).fill(0x2b1c10)

        // Corner support posts (simple half-timber framing cue).
        const postWidth = 14
        structure.rect(10, 14, postWidth, FLOOR_Y - 14).fill(0x3f2a17)
        structure.rect(STAGE_WIDTH - 10 - postWidth, 14, postWidth, FLOOR_Y - 14).fill(0x3f2a17)

        // A single window, right of the sign (decorative — lets daylight
        // read against the wall so the room doesn't feel like a flat void).
        const windowX = STAGE_WIDTH - 90
        const windowY = 260
        const windowSize = 64
        structure.rect(windowX - 4, windowY - 4, windowSize + 8, windowSize + 8).fill(0x2b1c10)
        structure.rect(windowX, windowY, windowSize, windowSize).fill(0xbcd8e8)
        structure.rect(windowX + windowSize / 2 - 2, windowY, 4, windowSize).fill(0x2b1c10)
        structure.rect(windowX, windowY + windowSize / 2 - 2, windowSize, 4).fill(0x2b1c10)

        // Baseboard trim marking the wall/floor seam.
        structure.rect(0, FLOOR_Y - 6, STAGE_WIDTH, 6).fill(0x1a0f08)

        // Floor plank lines.
        for (let plankY = FLOOR_Y + 22; plankY < STAGE_HEIGHT; plankY += 22) {
          structure.rect(0, plankY, STAGE_WIDTH, 2).fill(0x6e4526)
        }

        root.addChild(structure)

        // Room 1 brand signage (§12: "Room 1 displays the game's own
        // business name as in-scene signage/decor"). Sits BELOW the HUD's
        // top-left/top-right chips (city/day, cash/cargo — Hud.tsx, absolute
        // positioned in front of this canvas) so it never overlaps them; the
        // chips run roughly 12-54px from the top, so the sign starts at 96px
        // for a comfortable margin.
        // Pushed down from an earlier 96 — the HUD's top chips + the
        // conditional "buy hotel here" chip are real (unscaled) DOM pixels,
        // while this stage position scales with the canvas's rendered
        // height; a short viewport shrinks the canvas-side gap faster than
        // the DOM content above it, so extra stage-space clearance here
        // keeps them from colliding even when the frame renders shorter
        // than the 360x740 design height.
        const SIGN_TOP = 170
        const signBoard = new Graphics()
        signBoard.roundRect(60, SIGN_TOP, 240, 44, 4).fill(0x2b1c10).stroke({ width: 3, color: 0x1a0f08 })
        root.addChild(signBoard)

        const signText = new Text({
          text: 'TRADE WINDS\nOF SELVARA',
          style: {
            fontFamily: 'Georgia, serif',
            fontSize: 15,
            fontWeight: 'bold',
            fill: 0xe8d5a8,
            align: 'center',
            lineHeight: 17,
          },
        })
        signText.anchor.set(0.5)
        signText.position.set(60 + 120, SIGN_TOP + 22)
        root.addChild(signText)

        // City name — moved here (below the brand sign) from the HUD's
        // top-left chip, per design direction: the persistent scene reads
        // "brand, then location" top-to-bottom rather than splitting that
        // info between the canvas and the DOM overlay. Kept updated on
        // travel via the `[cityId, cityName]` effect above (`cityNameTextRef`).
        const CITY_NAME_TOP = SIGN_TOP + 44 + 14
        const cityNameText = new Text({
          text: cityName,
          style: {
            fontFamily: 'Georgia, serif',
            fontSize: 14,
            fontWeight: 'bold',
            fill: 0xf4ecd8,
            align: 'center',
          },
        })
        cityNameText.anchor.set(0.5)
        cityNameText.position.set(STAGE_WIDTH / 2, CITY_NAME_TOP)
        root.addChild(cityNameText)
        cityNameTextRef.current = cityNameText

        let sprite: AnimatedSprite | null = null
        let tickerHandler: ((ticker: Ticker) => void) | null = null
        loadCharacterAnimations(`${import.meta.env.BASE_URL}assets/character`).then((animations) => {
          if (disposed) return
          sprite = createCharacterSprite(animations)
          // New character art (T073) is a 170px-tall portrait sheet, not the
          // old 128x128 CraftPix square frame — 0.65 keeps the on-screen
          // character proportioned against the room's other fixed-size
          // props (e.g. the 64px wall window) rather than towering over them.
          sprite.scale.set(0.65)
          sprite.position.set(STAGE_WIDTH / 2, FLOOR_Y + 6)
          root.addChild(sprite)

          const controller = createCharacterController(sprite, animations, {
            minX: CHARACTER_MIN_X,
            maxX: CHARACTER_MAX_X,
          })
          tickerHandler = controller.update
          app.ticker.add(tickerHandler)
        })

        return () => {
          disposed = true
          if (tickerHandler) app.ticker.remove(tickerHandler)
          sprite?.destroy()
          root.destroy({ children: true })
          wallRef.current = null
          floorRef.current = null
          backgroundSpriteRef.current = null
          cityNameTextRef.current = null
        }
      }}
    />
  )
}
