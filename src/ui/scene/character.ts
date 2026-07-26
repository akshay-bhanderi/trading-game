/**
 * Loads a CraftPix "Free City Trader" sprite sheet (a horizontal strip of
 * 128x128px frames, see public/assets/character/LICENSE.txt) and slices it
 * into a playable PixiJS AnimatedSprite. Idle-only for now — no walk cycle
 * ships in this asset pack, per trade-winds-design-doc.md §12
 * ("walk-cycle wiring can follow later once movement is designed").
 */

import { Assets, Rectangle, Texture, AnimatedSprite } from 'pixi.js'

const FRAME_SIZE = 128

export async function loadCharacterAnimation(url: string): Promise<AnimatedSprite> {
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

  const sprite = new AnimatedSprite(frames)
  sprite.anchor.set(0.5, 1)
  sprite.animationSpeed = 0.12
  sprite.play()
  return sprite
}
