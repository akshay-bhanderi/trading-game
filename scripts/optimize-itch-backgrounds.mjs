// One-off: recompress dist-itch's background images for the itch.io upload.
// The hub scene only ever paints these into a 360x620 canvas, so the
// multi-MB source photos (up to 6178KB) are far higher-res than anything
// on screen. Resize to a modest width and re-encode, keeping each file's
// exact original name/extension — cityBackgrounds.ts hardcodes them
// per-city (mixed .jpg/.png), so renaming any of them 404s at runtime.
import sharp from 'sharp'
import { readdirSync, statSync, unlinkSync } from 'node:fs'
import path from 'node:path'

const dir = path.resolve('dist-itch/assets/backgrounds/city')
// Only scenes 1,2,3,4,5,6,8,12 are wired to v1's 8 cities (see cityBackgrounds.ts) —
// 7,9,10,11,13-16 are reserved for future tiers and unused, so drop them from
// the itch build entirely rather than shipping dead weight.
const USED = new Set([1, 2, 3, 4, 5, 6, 8, 12])

for (const f of readdirSync(dir)) {
  const m = f.match(/^(\d+)-(day|night)\.(png|jpe?g)$/i)
  if (!m || !USED.has(Number(m[1]))) {
    unlinkSync(path.join(dir, f))
  }
}

const files = readdirSync(dir).filter((f) => /\.(png|jpe?g)$/i.test(f))

let before = 0
let after = 0

for (const file of files) {
  const full = path.join(dir, file)
  before += statSync(full).size
  const isPng = /\.png$/i.test(file)
  const img = sharp(full).resize({ width: 720, withoutEnlargement: true })
  const buf = isPng ? await img.png({ compressionLevel: 9 }).toBuffer() : await img.jpeg({ quality: 72 }).toBuffer()
  after += buf.length
  const fs = await import('node:fs/promises')
  await fs.writeFile(full + '.tmp', buf)
  await fs.rename(full + '.tmp', full)
}

console.log(`before: ${(before / 1024 / 1024).toFixed(1)}MB  after: ${(after / 1024 / 1024).toFixed(1)}MB`)
