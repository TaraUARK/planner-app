import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// The app is served from https://<github-user>.github.io/planner-app/
const BASE = '/planner-app/';

export default defineConfig({
  base: BASE,
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  build: {
    // Keep working in Safari 16 (this Mac's Safari) as well as current browsers.
    target: ['es2022', 'safari16', 'chrome111'],
  },
  plugins: [
    react(),
    VitePWA({
      // 'prompt' = never swap versions silently; the app shows a Reload banner.
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Planner',
        short_name: 'Planner',
        description: 'My personal planner',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#e9ebef',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        navigateFallback: `${BASE}index.html`,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
