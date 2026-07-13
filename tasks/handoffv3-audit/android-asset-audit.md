# Android Asset-Fidelity Audit — findings from golden-path screenshots (2026-07-13)

Owner directive: "The handoff contains already the assets to be used. Use everything inside
handoff assets. Do not reinvent." Evidence: docs/android-golden-paths/*.png (emulator
screenshots of the real app) compared against handoffv3/handoff/assets/ + ASSETS.md + the
web app's asset usage (apps/web/src/lib/assets.ts ICONS/BOARDS maps).

## VIOLATIONS (must fix — each has real handoff art being substituted)

1. HOME HUB (04-guest-home.png)
   - Currency pills use EMOJI (coin emoji, 💎) → must use real `ic-coin.png` / `ic-gem.png`
     (web ICONS map uses exactly these files).
   - Daily Reward card uses 🎁 emoji → real chest/daily art (`ic-chest.png` per web ICONS).
   - Season Pass card uses 👑 emoji → real art (check handoff assets for season/crown art;
     web SeasonPage usage is the reference).
   - Bottom tab bar uses generic material-style glyphs (house/store/play/shield/person) →
     check the mobile inventory + scraps/mobile-header.png for the approved nav iconography;
     if the approved design uses these simple glyphs, keep; otherwise wire approved icons.

2. AI MODE SELECT (06-ai-mode-select.png)
   - Difficulty cards are text-only → handoff ships `diff-easy.webp`, `diff-normal.webp`,
     `diff-hard.webp` for exactly these cards (web AiSetupPage renders them — verify + mirror
     placement/size).

3. GAME BOARD (07-ai-match-board.png)
   - Board is a flat two-tone checkerboard with a plain 2px gold border → handoff ships
     `board-marble.png` (default texture; also ebony/wood/obsidian for equipped board skins)
     + `board-frame.png` (ornate gold frame). Web renders the real texture via boardTexture().
     Android must draw squares OVER the real texture image and use the frame art (or a
     faithful frame treatment if the frame asset doesn't map to mobile aspect — decide from
     scraps/mobile-board.png which shows the approved mobile board).
   - Pieces are FLAT circles → web's approved discs have gloss/gradient/shine (Piece.tsx skin
     faces). Port the disc styling (radial gradient + highlight + rim) — pieces stay drawn
     (approved design = discs, not sprites) but must LOOK like the approved glossy discs.
     Equipped skins re-tint (crimson/jade/obsidian + premium tints per web SKIN_FACE map).

4. SPLASH/AUTH (02-splash.png)
   - Gold sun emblem renders — VERIFY it is the real handoff logo asset, not a lookalike.
     Canonical candidates: handoff assets (check ASSETS.md logo entry / loading/ folder) and
     the owner-supplied `logo.png` at repo root (untracked, dropped 2026-07-12 — ASK-COMPARE:
     if root logo.png differs from what's bundled, prefer the handoff asset and flag the root
     file to the owner). Loading screen ornate loader per Loading Screen.dc.html — verify the
     splash's loader matches (spinner ring vs the approved ornate loader).

5. LAUNCHER ICON — known placeholder monogram (flagged since Phase 1) → build from the real
   logo art (adaptive icon: foreground = logo, background = royal purple #160B28).

## LIKELY-OK (verify, don't churn)
- Store/avatars/frames/crests: already load the real handoff art remotely from /assets.
- Theme colors/typography: token-verified in Phase 1 (Cinzel/Inter/JetBrains Mono bundled).
- Piece-as-disc rendering: approved design (web does the same) — only the GLOSS is missing.

## Approach for the fix pass
- Bundle offline-critical chrome into apps/android res (drawable-nodpi): ic-coin, ic-gem,
  ic-chest, board textures (marble default + equipped variants), board frame, diff-easy/
  normal/hard, logo, loading art. Source: handoffv3/handoff/assets/ (approved) — same files
  apps/web/public/assets serves.
- Screen-by-screen sweep beyond the screenshots: Store/Inventory/Orders/Daily/Quests/Season/
  Profile/Leaderboard/Friends/Guild/Notifications/Settings/Rooms — replace every remaining
  emoji/placeholder glyph that has real handoff art; keep emoji ONLY where the approved web
  app itself uses emoji (e.g. in-match emotes ARE emoji by design — verify per web).
- Every replacement cites the asset file used; anything without handoff art stays as-is and
  gets listed (no invention in either direction).
