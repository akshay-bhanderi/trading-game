/**
 * Loads the suit-and-tie character sprite from a single sheet
 * (public/assets/character/character-sheet.png) and drives an autonomous
 * idle/wander state machine on a single PixiJS AnimatedSprite.
 *
 * The sheet is a uniform grid, not hand-packed like the two-file version
 * this replaced: 2000x500px, 16 columns x 3 rows, each cell exactly
 * 125px wide x (sheetHeight/3) tall. Row 0 is the idle/standing loop, row 1
 * is the walk cycle. Row 2 exists in the source file but is a near-duplicate
 * of row 1 (same leftward-facing walk, not a distinct walk-right sequence)
 * so it's unused — rightward movement is produced by mirroring row 1 via
 * `scale.x` instead (see createCharacterController's enterWalk).
 *
 * Content fills a consistent ~80-82% of each row's cell height (verified
 * across all three rows when this sheet was authored), unlike the earlier
 * two-file version where idle and walk were separate exports at visibly
 * different character scales (~86% vs ~79%) — keep future re-exports in one
 * pass like this one to avoid reintroducing that mismatch.
 */

import { Assets, Rectangle, Texture, AnimatedSprite, type Ticker } from 'pixi.js'

const SHEET_COLS = 16
const SHEET_ROWS = 3
const CELL_WIDTH = 125
const IDLE_ROW = 0
const WALK_ROW = 1

function sliceRow(baseTexture: Texture, row: number): Texture[] {
  const rowHeight = baseTexture.height / SHEET_ROWS
  const y0 = Math.round(row * rowHeight)
  const y1 = Math.round((row + 1) * rowHeight)
  const frames: Texture[] = []
  for (let i = 0; i < SHEET_COLS; i++) {
    frames.push(
      new Texture({
        source: baseTexture.source,
        frame: new Rectangle(i * CELL_WIDTH, y0, CELL_WIDTH, y1 - y0),
      }),
    )
  }
  return frames
}

export interface CharacterAnimations {
  idle: Texture[]
  walk: Texture[]
}

export async function loadCharacterAnimations(basePath: string): Promise<CharacterAnimations> {
  const baseTexture = await Assets.load<Texture>(`${basePath}/character-sheet.png`)
  baseTexture.source.scaleMode = 'nearest'
  return {
    idle: sliceRow(baseTexture, IDLE_ROW),
    walk: sliceRow(baseTexture, WALK_ROW),
  }
}

export function createCharacterSprite(animations: CharacterAnimations): AnimatedSprite {
  const sprite = new AnimatedSprite(animations.idle)
  sprite.anchor.set(0.5, 1)
  sprite.animationSpeed = 0.12
  sprite.play()
  return sprite
}

type BehaviorState = 'idle' | 'walk'

// Deliberately slow: the room is only ~280px of walkable floor
// (CHARACTER_MIN_X/MAX_X in HubScene.tsx), and each walk-cycle frame holds
// for ~139ms (15 frames at animationSpeed 0.12, ~60fps). At the old 0.6px/ms
// a typical walk crossed its distance in well under 139ms — the walk texture
// was live but never got past its first frame before snapping back to idle,
// which reads as "still idle, just relocated" rather than actual walking.
// 0.1px/ms makes an average walk last ~1.4s (~10 of the 15 frames), long
// enough to see the step cycle play out.
const WALK_SPEED = 0.1 // px per ms
const IDLE_MIN_MS = 1800
const IDLE_MAX_MS = 4200

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

/**
 * Drives the character sprite through an unscripted idle/wander loop so
 * it isn't a static prop. `minX`/`maxX` are the sprite's anchor-x travel
 * bounds (floor extent minus a small wall margin so it doesn't clip into the
 * support posts).
 */
export function createCharacterController(
  sprite: AnimatedSprite,
  animations: CharacterAnimations,
  bounds: { minX: number; maxX: number },
): { update: (ticker: Ticker) => void; destroy: () => void } {
  let state: BehaviorState = 'idle'
  let stateEndsAt = performance.now() + randomBetween(IDLE_MIN_MS, IDLE_MAX_MS)
  let walkTargetX = sprite.position.x

  function setAnimation(frames: Texture[]) {
    sprite.textures = frames
    sprite.gotoAndPlay(0)
  }

  function enterIdle(now: number) {
    state = 'idle'
    stateEndsAt = now + randomBetween(IDLE_MIN_MS, IDLE_MAX_MS)
    setAnimation(animations.idle)
  }

  function enterWalk() {
    state = 'walk'
    walkTargetX = randomBetween(bounds.minX, bounds.maxX)
    // The sheet's walk row (row 1) faces left unflipped — confirmed by
    // direct inspection, not assumed — so a rightward walk needs the flip,
    // and a leftward walk needs the sprite left as-is. (Inverted from the
    // usual "unflipped = faces right" sprite convention.)
    sprite.scale.x = (walkTargetX >= sprite.position.x ? -1 : 1) * Math.abs(sprite.scale.x)
    setAnimation(animations.walk)
  }

  function update(ticker: Ticker) {
    const now = performance.now()

    if (state === 'walk') {
      const dx = walkTargetX - sprite.position.x
      const step = WALK_SPEED * ticker.deltaMS
      if (Math.abs(dx) <= step) {
        sprite.position.x = walkTargetX
        enterIdle(now)
      } else {
        sprite.position.x += Math.sign(dx) * step
      }
      return
    }

    if (now < stateEndsAt) return

    // state === 'idle' and its timer elapsed: go for a walk.
    enterWalk()
  }

  return {
    update,
    destroy() {
      // Nothing to release beyond what the caller already owns (textures are
      // shared Texture instances, not per-controller resources).
    },
  }
}
