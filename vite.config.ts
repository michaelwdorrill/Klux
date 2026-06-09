import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'child_process'

function gitShortSha(): string {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  base: '/',
  define: {
    // Short commit SHA so every build — including same-day deploys — is uniquely identified.
    __BUILD_SHA__: JSON.stringify(gitShortSha()),
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'icons/*.png',
        'icons/*.svg',
        'audio/*.wav',
        'audio/*.mp3',
        'images/*.png',
      ],
      manifest: {
        name: 'KLUX',
        short_name: 'KLUX',
        description: 'A Klax-inspired tile matching game — installable PWA',
        theme_color: '#1a1a2e',
        background_color: '#1a1a2e',
        display: 'standalone',
        orientation: 'any',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The theme MP3 is ~6 MB — bump Workbox's per-asset precache limit so
        // it gets included instead of skipped.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,png,svg,wav,mp3,webmanifest}'],
        // Take over immediately on activation so deploys are live on next
        // page load without needing to close all tabs or use incognito.
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
})
