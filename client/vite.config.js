import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'theme-init.js'],
      manifest: {
        id: '/',
        name: 'YMT Group',
        short_name: 'YMT',
        description: 'YMT Group – lead research, CRM and client service hub',
        lang: 'he',
        dir: 'auto',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        orientation: 'any', // phones in portrait, tablets and desktops in any orientation
        background_color: '#0F2A4A',
        theme_color: '#0F2A4A',
        categories: ['business', 'productivity'],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // App shortcuts: long-press the icon (Android) or right-click it in the dock/taskbar (desktop).
        shortcuts: [
          { name: 'Inbox · תיבת עבודה', short_name: 'Inbox', url: '/', icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
          { name: 'Approvals · תור אישורים', short_name: 'Approvals', url: '/approvals', icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
          { name: 'Pipeline · צנרת מכירות', short_name: 'Pipeline', url: '/pipeline', icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
          { name: 'New company · חברה חדשה', short_name: 'New company', url: '/leads?tab=new', icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
        ],
        // Richer install dialogs: "narrow" is shown on phones, "wide" on desktop.
        screenshots: [
          { src: 'screenshots/mobile.png', sizes: '780x1688', type: 'image/png', form_factor: 'narrow', label: 'Inbox on a phone' },
          { src: 'screenshots/desktop.png', sizes: '2560x1600', type: 'image/png', form_factor: 'wide', label: 'Pipeline on a desktop' },
        ],
      },
      workbox: {
        // Only the app shell is cached for offline start. API data is confidential and is
        // deliberately NOT cached by the service worker (server also sends Cache-Control: no-store).
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        globIgnores: ['screenshots/**'],
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3001' },
  },
});
