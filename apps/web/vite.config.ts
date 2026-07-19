import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      // Activate a new service worker IMMEDIATELY and take control of open pages,
      // so a fresh deploy lands on the very next load instead of being stuck
      // behind the old cached bundle for a reload or two (which was making new
      // routes like /reset 404 on already-cached clients). Also drop stale caches.
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        navigateFallback: "/index.html",
        // Let the network/static host serve the PRERENDERED per-route HTML for the
        // content routes instead of the SW shadowing them with the cached home
        // shell. Without this, a returning (SW-installed) visitor — and any crawler
        // that respects the SW — would get the generic index.html for /blog/<slug>,
        // defeating the prerender. Matches "/", "/blog", and "/blog/<anything>".
        // /learn is exact-only: the bare route is prerendered, but /learn/<id>
        // lesson pages are auth-gated SPA screens that still want the shell.
        navigateFallbackDenylist: [/^\/blog(\/.*)?$/, /^\/learn$/, /^\/strategy$/, /^\/$/],
        // The app bundle grew past workbox's default 2 MiB precache limit (the
        // Damath variants + room pages pushed it over), which failed the PWA
        // step. Raise the cap so the main bundle is still precached.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      manifest: {
        name: "FilipinoDama Royal",
        short_name: "Dama Royal",
        theme_color: "#160b28",
        background_color: "#160b28",
        display: "standalone",
        icons: [
          { src: "/assets/brand/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/assets/brand/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/assets/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      },
    }),
  ],
  server: { port: 5173 },
});
