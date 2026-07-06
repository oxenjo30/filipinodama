import type { Config } from "tailwindcss";

/** Theme mirrors handoff/DESIGN_SYSTEM.md — the exact prototype tokens. */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        gold: { DEFAULT: "#E8B84B", lt: "#F5D783", dp: "#C99A2E", hi: "#F7E2A0", lo: "#D5A63A" },
        red: "#A0303A",
        blue: "#2E6BC6",
        green: "#2f8f5b",
        purple: "#4a2d7a",
        ink: { DEFAULT: "#c9b8e0", 2: "#9a86bd" },
        bg: { DEFAULT: "#160b28", deep: "#120922" },
        panel: { DEFAULT: "#1e1134", 2: "#231239" },
      },
      fontFamily: {
        display: ["Cinzel", "serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
