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
