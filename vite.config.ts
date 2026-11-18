import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        manifestFilename: 'manifest.json',
        includeAssets: [
          'favicon.ico',
          'apple-touch-icon.png',
          'icon-192.png',
          'icon-512.png',
          'icon-maskable-192.png',
          'icon-maskable-512.png',
          'pwa-192x192.png',
          'pwa-512x512.png',
          'pwa-maskable-512x512.png',
          'icon.svg',
          'icon-maskable.svg',
          'screenshots/desktop-wide.jpg',
          'screenshots/mobile-narrow.jpg',
          'screenshots/mobile-tools-narrow.jpg',
        ],
        manifest: {
          id: '/',
          name: 'Vector Creator',
          short_name: 'Vector Creator',
          description:
            'Unbegrenzte Vektor-Illustrations- und Design-App mit Bézier-Pfaden, Echtzeit-Symmetrie, Perspektiv-Hilfslinien, Ebenen und SVG/PNG-Export.',
          theme_color: '#111215',
          background_color: '#111215',
          display: 'standalone',
          orientation: 'any',
          start_url: '/',
          scope: '/',
          lang: 'de',
          categories: ['design', 'graphics', 'productivity'],
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/icon-maskable-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'maskable',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
          screenshots: [
            {
              src: '/screenshots/desktop-wide.jpg',
              sizes: '1920x1080',
              type: 'image/jpeg',
              form_factor: 'wide',
              label: 'Vector Creator Studio Arbeitsbereich auf dem Desktop',
            },
            {
              src: '/screenshots/mobile-narrow.jpg',
              sizes: '1080x2340',
              type: 'image/jpeg',
              form_factor: 'narrow',
              label: 'Vektor-Zeichenwerkzeuge und Bézier-Pfade auf dem Smartphone',
            },
            {
              src: '/screenshots/mobile-tools-narrow.jpg',
              sizes: '1080x2098',
              type: 'image/jpeg',
              form_factor: 'narrow',
              label: 'Ebenen, Symmetrie und Werkzeugeinstellungen in der mobilen Ansicht',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
