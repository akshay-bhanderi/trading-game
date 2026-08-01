/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/game/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'favicon-32x32.png', 'favicon-16x16.png'],
      manifest: {
        name: 'Trade Winds of Selvara',
        short_name: 'Trade Winds',
        description: 'A pixel-art trading tycoon: buy low, sail the winds, sell high.',
        theme_color: '#201327',
        background_color: '#14101c',
        display: 'standalone',
        start_url: '/game/',
        scope: '/game/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Per-city background scenes (Phase 14, T070 — not yet wired into
        // any screen) are multi-MB each; precaching all of them at install
        // time would bloat the PWA install and one (15-day.png) already
        // exceeds Workbox's default 2MB single-file precache limit. Load
        // them on demand instead — excluded here, not raising the limit.
        globIgnores: ['**/assets/backgrounds/**'],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
