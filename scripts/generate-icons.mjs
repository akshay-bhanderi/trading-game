// Regenerate PWA / favicon / OG assets from the SVG sources in assets-src/icon.
// Run with: node scripts/generate-icons.mjs
import sharp from 'sharp'
import { mkdir, copyFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const srcDir = path.join(root, 'assets-src', 'icon')
const outDir = path.join(root, 'public')

await mkdir(outDir, { recursive: true })

const icon = path.join(srcDir, 'icon-source.svg')
const maskable = path.join(srcDir, 'icon-maskable.svg')
const ogBanner = path.join(srcDir, 'og-banner.svg')

async function render(src, dest, size) {
  await sharp(src, { density: 384 }).resize(size, size).png().toFile(path.join(outDir, dest))
  console.log('wrote', dest)
}

await render(icon, 'pwa-192x192.png', 192)
await render(icon, 'pwa-512x512.png', 512)
await render(maskable, 'maskable-icon-512x512.png', 512)
await render(icon, 'apple-touch-icon.png', 180)
await render(icon, 'favicon-32x32.png', 32)
await render(icon, 'favicon-16x16.png', 16)

await sharp(ogBanner, { density: 384 }).resize(1200, 630).png().toFile(path.join(outDir, 'og-banner.png'))

await copyFile(icon, path.join(outDir, 'favicon.svg'))

console.log('Done.')
