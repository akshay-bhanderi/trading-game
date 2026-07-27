/**
 * Loads the CraftPix "Free City Trader" sprite sheets (horizontal strips of
 * 128x128px frames, see public/assets/character/LICENSE.txt) and drives an
 * autonomous idle/wander/wave state machine on a single PixiJS AnimatedSprite
 * — there's no walk-cycle sheet in this asset pack (only trader-idle,
 * trader-idle-2, trader-wave), so "walking" is the idle animation translated
 * across the floor rather than a real step cycle. Per trade-winds-design-doc
 * §12 ("walk-cycle wiring can follow later once movement is designed").
 */

import { Assets, Rectangle, Texture, AnimatedSprite, type Ticker } from 'pixi.js'

const FRAME_SIZE = 128

async function loadCharacterFrames(url: string): Promise<Texture[]> {
  const baseTexture = await Assets.load<Texture>(url)
  baseTexture.source.scaleMode = 'nearest'

  const frameCount = Math.round(baseTexture.width / FRAME_SIZE)
  const frames: Texture[] = []
  for (let i = 0; i < frameCount; i++) {
    frames.push(
      new Texture({
        source: baseTexture.source,
        frame: new Rectangle(i * FRAME_SIZE, 0, FRAME_SIZE, FRAME_SIZE),
      }),
    )
  }
  return frames
}

export interface CharacterAnimations {
  idle: Texture[]
  idleAlt: Texture[]
  wave: Texture[]
}

export async function loadCharacterAnimations(basePath: string): Promise<CharacterAnimations> {
  const [idle, idleAlt, wave] = await Promise.all([
    loadCharacterFrames(`${basePath}/trader-idle.png`),
    loadCharacterFrames(`${basePath}/trader-idle-2.png`),
    loadCharacterFrames(`${basePath}/trader-wave.png`),
  ])
  return { idle, idleAlt, wave }
}

export function createCharacterSprite(animations: CharacterAnimations): AnimatedSprite {
  const sprite = new AnimatedSprite(animations.idle)
  sprite.anchor.set(0.5, 1)
  sprite.animationSpeed = 0.12
  sprite.play()
  return sprite
}

type BehaviorState = 'idle' | 'walk' | 'wave'

const WALK_SPEED = 0.6 // px per ms
const IDLE_MIN_MS = 1800
const IDLE_MAX_MS = 4200
const WAVE_CHANCE = 0.35

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

/**
 * Drives the character sprite through an unscripted idle/wander/wave loop so
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

  function enterWave(now: number) {
    state = 'wave'
    stateEndsAt = now + (animations.wave.length / sprite.animationSpeed) * (1000 / 60)
    setAnimation(animations.wave)
  }

  function enterWalk() {
    state = 'walk'
    walkTargetX = randomBetween(bounds.minX, bounds.maxX)
    sprite.scale.x = (walkTargetX >= sprite.position.x ? 1 : -1) * Math.abs(sprite.scale.x)
    setAnimation(animations.idleAlt)
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

    if (state === 'wave') {
      enterIdle(now)
      return
    }

    // state === 'idle' and its timer elapsed: pick the next thing to do.
    if (Math.random() < WAVE_CHANCE) {
      enterWave(now)
    } else {
      enterWalk()
    }
  }

  return {
    update,
    destroy() {
      // Nothing to release beyond what the caller already owns (textures are
      // shared Texture instances, not per-controller resources).
    },
  }
}
