/**
 * Persistent hub scene (T037) — full-screen pixel-cutaway room the player's
 * character stands in, rendered on a PixiJS <canvas> (T069). This is the
 * single starting room only; room-growth-as-the-building-grows (§12) is an
 * explicit open design question there, not implemented here.
 *
 * Background/room art is a placeholder pass (flat per-city color fields,
 * §12 "Background/room art: not yet sourced") — only the character sprite
 * is real licensed art (public/assets/character/, T069).
 */

import { useEffect, useRef } from 'react'
import { Container, Graphics, Text, type AnimatedSprite } from 'pixi.js'
import PixiStage from './PixiStage'
import { loadCharacterAnimation } from './character'
import type { CityId } from '../../engine/types'

const STAGE_WIDTH = 360
const STAGE_HEIGHT = 740
const FLOOR_Y = 620

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
}

export default function HubScene({ cityId }: HubSceneProps) {
  const wallRef = useRef<Graphics | null>(null)
  const floorRef = useRef<Graphics | null>(null)

  useEffect(() => {
    const palette = CITY_PALETTE[cityId]
    if (!palette) return
    wallRef.current?.clear().rect(0, 0, STAGE_WIDTH, FLOOR_Y).fill(palette.wall)
    floorRef.current
      ?.clear()
      .rect(0, FLOOR_Y, STAGE_WIDTH, STAGE_HEIGHT - FLOOR_Y)
      .fill(palette.floor)
  }, [cityId])

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

        // Room 1 brand signage (§12: "Room 1 displays the game's own
        // business name as in-scene signage/decor").
        const signBoard = new Graphics()
        signBoard.roundRect(60, 60, 240, 44, 4).fill(0x2b1c10).stroke({ width: 3, color: 0x1a0f08 })
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
        signText.position.set(60 + 120, 60 + 22)
        root.addChild(signText)

        let sprite: AnimatedSprite | null = null
        loadCharacterAnimation('/assets/character/trader-idle.png').then((s) => {
          if (disposed) {
            s.destroy()
            return
          }
          sprite = s
          sprite.scale.set(1.1)
          sprite.position.set(STAGE_WIDTH / 2, FLOOR_Y + 6)
          root.addChild(sprite)
        })

        return () => {
          disposed = true
          sprite?.destroy()
          root.destroy({ children: true })
          wallRef.current = null
          floorRef.current = null
        }
      }}
    />
  )
}
