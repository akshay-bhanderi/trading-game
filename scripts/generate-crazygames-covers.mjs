// Generate CrazyGames cover images (landscape 1920x1080, portrait 800x1200, square 800x800)
// from the same visual language as the existing og-banner.
// Run with: node scripts/generate-crazygames-covers.mjs
import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const outDir = path.join(root, 'assets-src', 'crazygames-covers')
await mkdir(outDir, { recursive: true })

const bgDefs = `
  <radialGradient id="bg" cx="30%" cy="40%" r="85%">
    <stop offset="0%" stop-color="#2a2438"/>
    <stop offset="70%" stop-color="#14101c"/>
  </radialGradient>
  <radialGradient id="coin" cx="38%" cy="32%" r="70%">
    <stop offset="0%" stop-color="#f6c265"/>
    <stop offset="55%" stop-color="#e8a33d"/>
    <stop offset="100%" stop-color="#a5641a"/>
  </radialGradient>
`

function coinGroup(cx, cy, r) {
  const scale = r / 170
  return `
  <g transform="translate(${cx} ${cy}) scale(${scale})">
    <circle r="170" fill="url(#coin)" stroke="#4e2f16" stroke-width="10"/>
    <circle r="140" fill="none" stroke="#a5641a" stroke-width="6" opacity="0.55"/>
    <g fill="#201327" transform="translate(0 6)">
      <rect x="-6" y="-136" width="12" height="130" rx="3"/>
      <path d="M6 -128 L84 -28 L6 -28 Z"/>
      <path d="M-6 -110 L-64 -36 L-6 -36 Z"/>
      <path d="M-70 -4 Q0 34 70 -4 L46 30 Q0 50 -46 30 Z"/>
    </g>
    <g stroke="#f4ecd8" stroke-width="10" stroke-linecap="round" opacity="0.85">
      <path d="M-146 64 h70" />
      <path d="M-160 90 h100" />
      <path d="M76 64 h70" />
      <path d="M60 90 h100" />
    </g>
  </g>`
}

// Landscape 1920x1080 - coin left, title + tagline right, mirroring og-banner layout
const landscape = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080">
  <defs>${bgDefs}</defs>
  <rect width="1920" height="1080" fill="url(#bg)"/>
  ${coinGroup(430, 540, 300)}
  <text x="800" y="470" font-family="Georgia, 'Times New Roman', serif" font-size="126" font-weight="bold" fill="#f4ecd8">Trade Winds</text>
  <text x="800" y="606" font-family="Georgia, 'Times New Roman', serif" font-size="126" font-weight="bold" fill="#e8a33d">of Selvara</text>
  <text x="804" y="690" font-family="Georgia, 'Times New Roman', serif" font-size="46" fill="#c9bfa8">Buy low, sail the winds, sell high.</text>
  <text x="804" y="748" font-family="Georgia, 'Times New Roman', serif" font-size="46" fill="#c9bfa8">A pixel-art trading tycoon.</text>
</svg>`

// Portrait 800x1200 - coin top-center, title + tagline stacked below
const portrait = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1200">
  <defs>${bgDefs}</defs>
  <rect width="800" height="1200" fill="url(#bg)"/>
  ${coinGroup(400, 340, 250)}
  <text x="400" y="710" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="82" font-weight="bold" fill="#f4ecd8">Trade Winds</text>
  <text x="400" y="806" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="82" font-weight="bold" fill="#e8a33d">of Selvara</text>
  <text x="400" y="880" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="34" fill="#c9bfa8">Buy low, sail the winds, sell high.</text>
  <text x="400" y="924" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="34" fill="#c9bfa8">A pixel-art trading tycoon.</text>
</svg>`

// Square 800x800 - coin top-center, compact title below
const square = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800">
  <defs>${bgDefs}</defs>
  <rect width="800" height="800" fill="url(#bg)"/>
  ${coinGroup(400, 260, 190)}
  <text x="400" y="536" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="66" font-weight="bold" fill="#f4ecd8">Trade Winds</text>
  <text x="400" y="612" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="66" font-weight="bold" fill="#e8a33d">of Selvara</text>
  <text x="400" y="668" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="28" fill="#c9bfa8">A pixel-art trading tycoon</text>
</svg>`

async function render(svg, dest, w, h) {
  await sharp(Buffer.from(svg), { density: 384 }).resize(w, h).png().toFile(path.join(outDir, dest))
  console.log('wrote', dest)
}

await render(landscape, 'cover-landscape-1920x1080.png', 1920, 1080)
await render(portrait, 'cover-portrait-800x1200.png', 800, 1200)
await render(square, 'cover-square-800x800.png', 800, 800)

console.log('Done.')
