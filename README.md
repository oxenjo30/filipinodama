# FilipinoDama

Filipino Dama (Filipino checkers), reimagined as a premium dark-fantasy web game.
React 19 + TypeScript + Vite 8 + Tailwind CSS v4 + Zustand, with a pure-TypeScript
rules engine and Vitest coverage.

## Run it

```bash
npm install
npm run dev        # dev server
npm test           # rules-engine test suite (26 tests)
npm run lint       # oxlint
npm run build      # typecheck + production build to dist/
npm run preview    # serve the production build
```

Extra scripts:

```bash
npm run prepare-assets      # re-copy/optimize art from the original library
node scripts/verify.mjs     # Playwright end-to-end sweep of the built app
node scripts/shot.mjs /home out.png [w] [h]   # one-off page screenshot
```

## What's implemented

- **Full Filipino Dama rules** in a pure engine (`src/game/`, zero React/DOM):
  mandatory capture, multi-jump chains, the maximum-capture rule with free
  choice between tied routes, backward captures for men, flying kings,
  end-of-turn-only promotion, win by elimination or blockade.
- **Local 2-player** and **vs Bot** (legal-move bot: win > max capture >
  promotion > random), with undo, restart, surrender, move history, result
  stats, and rematch.
- **Pages**: splash, landing, home, mode select, create/join room (honest
  local-only previews — no fake multiplayer), tutorial/rules with diagrams,
  leaderboard (clean empty state), profile (real zero-based stats), settings
  (sound, music, board theme, piece style, hints, animation speed, language
  placeholder) — all persisted to localStorage.
- **Art** reused from the original FilipinoDama library via
  `scripts/prepare-assets.mjs` → `public/assets`, referenced only through
  `src/assets/assetManifest.ts`. The faction portraits are opaque renders on
  near-black backgrounds, so the UI always shows them inside masked circular
  tokens/avatars — never as raw rectangles.

## Architecture

```
src/game/       pure rules engine + tests (types, moveGenerator, applyMove, bot…)
src/store/      zustand stores: settings (persisted), match (selection model)
src/components/ Board, PieceToken, PlayerPanel, Modal, GameButton, icons…
src/pages/      one file per route
src/online/     RoomService contract + local-only implementation (TODO backend)
src/audio/      WebAudio SFX synth + music element ("Balangay of Iron")
```

The move generator returns **complete turn sequences**; the UI narrows them
tap-by-tap, so illegal moves are unrepresentable. Animation is transform-only
and purely cosmetic — the engine resolves moves instantly.

## Online multiplayer

Not connected yet — see [docs/ONLINE_TODO.md](docs/ONLINE_TODO.md) for the
Firebase wiring plan (project `dama-90740` from the previous build is reusable).
