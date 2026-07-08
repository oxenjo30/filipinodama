import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Admin console — a small, separate Vite app served at app.filipinodama.com.
// In dev, proxy /api to the local server so the session cookie flows same-origin.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: { "/api": { target: "http://localhost:4000", changeOrigin: true } },
  },
});
