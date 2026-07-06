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
        icons: [{ src: "/assets/logo-sun.png", sizes: "512x512", type: "image/png" }],
      },
    }),
  ],
  server: { port: 5173 },
});
