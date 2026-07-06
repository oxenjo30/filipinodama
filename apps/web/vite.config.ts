import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
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
