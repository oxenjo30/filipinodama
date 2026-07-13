# feat/web-v3-delta — Row-by-Row Implementation Plan (Royal v2→v3, 37 rows)

Source: `tasks/handoffv3-audit/royal-v2-v3-diff.md` (authoritative change inventory).
Production context: apps/web + apps/server already implement the v2 Royal handoff with a REAL
backend (Postgres/Prisma, Socket.IO, server-authoritative matches). Prototype localStorage
persistence fixes are therefore either already-solved (DB) or become real server features.
No-fabrication rule stands: where the prototype generates fake data as a stand-in, production
derives the REAL equivalent or shows an honest empty state. Gold-only economy stands.

Status legend: BUILD (new work) · ADAPT (prototype concept → real backend equivalent) ·
VERIFY (production likely already covers; confirm + close gaps) · BLOCKED-POLICY (awaits owner
monetization decision).

## Cluster W1 — Click-through-to-profile everywhere (rows 7,8,9,13,14,17,18,19,20) — VERIFY+wire
Prototype makes every player surface clickable → profile. Production has /profile/:id
(PublicProfilePage) and PlayerLink. Known-already-clickable: leaderboard podium+rows+climbers
(LeaderboardPage), guild member rows (GuildProfilePage via PlayerLink). To verify & wire if
missing: FriendsPage online/offline AVATAR click (rows 17-18), add-friend suggested players
row click (rows 19-20), guilds page rosters, any bracket player names. Acceptance: every
player avatar/name in leaderboard, guild roster, friends (on+offline), add-friend suggestions
navigates to that player's real /profile/:id.

## Cluster W2 — Global Player Search (rows 1,2,3) — BUILD
Topbar (AppLayout) gains a 🔍 "Search players" pill button BEFORE the notification bell (40px,
gold-lt). Opens a modal: header (🔍 + input "Search players by name or tag…" + ✕), live-filtered
results (avatar, name, tag, tier, rating, "View ›"), empty state "No players found" / "Try a
different name or tag." Results = REAL users from the server (reuse/extend the users search API
already used by add-friend; cap 20; exclude bots). Click result → navigate /profile/:id.

## Cluster W3 — Matchmaking opponent device (rows 4,5,6) — BUILD (server+web)
Server: capture device class per socket at handshake (parse User-Agent → mobile/tablet/web;
Android app will send an explicit hint later) and include `device` in EV.mmFound opponent
payload. Web: on the Match Found reveal, under opponent badge: "{icon} Playing on {label}"
(📱 Mobile / 💻 Web / ▤ Tablet; default web). Honest data only — derived from the real socket.

## Cluster W4 — Public profile enrichment (rows 21,22,23,24) — ADAPT (real data, no fabrication)
Prototype adds to friend profile: Guild + Favorite Move tiles, Match Replays list (▶ Replay),
Badges & Achievements chips, Favorite Openings bars. Production equivalents on PublicProfilePage:
- Guild tile: REAL guild membership (exists in DB) — name + tag, links to guild.
- Match Replays: REAL recent matches (Match rows w/ moves) + ▶ opens existing replay viewer.
- Badges: REAL earned achievements if achievement data exists; else honest empty state
  ("No badges yet") — NO fabricated badge pool.
- Favorite Move / Favorite Openings: derive from REAL move history (most frequent opening move
  pattern across recent matches) if cheaply computable server-side; otherwise omit the tile
  (honest) — NO deterministic fake generation. Decide at implementation; document choice.
Layout/placement/order copied from the v3 modal design (between Recent Form and footer).

## Cluster W5 — Real spectate viewer counts + rooms in Live list (rows 25,26,27,28,29) — BUILD (server+web)
- Server: real viewer counts = size of spectator membership per live match (socket room size
  minus players, or maintained counter on spectateJoin/Leave + room spectators). Expose in
  GET /api/matches/live items (viewers) and broadcast to the match room so the spectate screen
  shows a live count. WatchPage already renders `viewers` when present (currently never sent).
- Rooms in Live list: private rooms with allowSpectators && !locked && (match live OR lobby
  active) surface in /matches/live (or a merged section) with a synthetic entry (host/guest
  names, mode, viewers=spectator count) linking to the room spectate flow. Server endpoint
  addition + WatchPage rendering. (Production already spectates rooms via code link.)

## Cluster W6 — Room resume on entry (rows 30,31,32) — GAP CONFIRMED 2026-07-12 → small BUILD
Verified: PrivateRoomPage has NO resume path without ?code (grep: no matches/active|rooms/mine|
resume hooks — only the ?code auto-join effect). BUILD: GET /api/rooms/mine (REST reads the
in-memory userRoom/rooms maps — same pattern as listOpenRooms) returning {code}|null; on
PrivateRoomPage mount with no ?code and a non-null mine, join(code) + system chat line
"Rejoined your synced room — picking up where you left off." Settings-sync already covered by
roomState broadcasts.

## Cluster W7 — Already-real persistence (rows 15,16,33,34,35) — ✅ VERIFIED 2026-07-12
- Row 16 guild create: real POST /api/guilds create flow with ApiError handling; payload
  includes crestKey (GuildsPage.tsx:350,365). Guilds are DB rows. COVERED.
- Row 15 emblem picker: production ALWAYS used real crest art — Emblem component "renders the
  real crest art … matching the handoff — never an emoji" via guildCrest(crestKey, seed)
  (GuildsPage.tsx:97-113); create modal binds crestKey (line 350). Production already exceeds
  the v3 prototype change (gradients→images). COVERED.
- Rows 33-34 frame persistence: frameId is a User DB column rendered everywhere (shipped in
  fidelity pass; frame rendering hardened 2026-07-12). COVERED.
- Row 35 wallet persistence: gold/diamonds/inventory are server-authoritative DB + ledger.
  COVERED.

## Cluster W8 — Payment-adjacent (rows 36,37) — row 36 IMPLEMENTED-DARK / row 37 minor
- Row 36 (fdr.topupReceipts → order history, "App Store · Apple Pay"): OWNER DECISION
  (2026-07-12) — build the full diamond top-up feature but ship it DARK (hidden) behind the
  existing `DIAMOND_TOPUP_ENABLED` env master switch, pending legal clearance. Status: fully
  built (feat/monetization-dark branch), not a fabricated "App Store · Apple Pay" — the real
  PayMongo methods ("GCash / Maya / Card") are used throughout:
    - Server gate: `features.payments = DIAMOND_TOPUP_ENABLED && PayMongo keys present`
      (config/env.ts). `/payments/checkout` throws notConfigured and `/payments/packs`
      reports `enabled:false` when off (modules/payments.ts). `/auth/providers` exposes
      `diamondTopUp: features.payments`; `/config/public` additionally exposes
      `DIAMOND_TOPUP_ENABLED` (modules/admin-config.ts) for unauthenticated callers.
    - Web gate: `providers.diamondTopUp` (from GET /api/auth/providers) hides the Store's
      "Currency" category button + TopUpModal trigger (StorePage.tsx), and the AppLayout
      diamond balance pill + top-up "+" button in both desktop and mobile nav
      (AppLayout.tsx). While dark, none of this renders — today's player experience is
      unchanged.
    - TopUpModal.tsx: full v3 "Get Diamonds" modal — live packs from GET
      /api/payments/packs, checkout → POST /api/payments/checkout → redirect to the
      PayMongo URL, live balance display.
    - Purchase History: OrdersPage.tsx + GET /api/orders (modules/store.ts) merge Order +
      settled Payment rows into one receipt list, honest method label "GCash / Maya /
      Card" (never a fabricated storefront). Renders from real data unconditionally, so a
      past purchaser always sees their history even while the feature is dark for everyone
      else — this is intentional (real receipts are never hidden).
  To go live: flip `DIAMOND_TOPUP_ENABLED=true` in Railway + swap `PAYMONGO_WEBHOOK_SECRET`
  to the LIVE secret. No other switch exists (env is the sole master by design). See
  modules/payments.ts header comment for the full runbook.
- Row 37 (cross-tab profile sync): production refetches /me on route changes + socket keeps
  session live; add a lightweight storage/broadcast sync only if a real gap shows in testing.

## Execution order
1. W1 (wiring sweep, low risk) → 2. W2 (search) → 3. W4 (profile enrichment) →
4. W5 (viewers + rooms-in-live, server work) → 5. W3 (device badge, tiny) →
6. W6 + W7 verifications → W8 documented-blocked.
Each cluster: implement → typecheck/build → tests where server logic changed → commit.

## OWNER DIRECTIVE (2026-07-12) — Watch Live page HIDDEN behind WATCH_LIVE_ENABLED
The Watch/Live-Matches PAGE (web /watch nav+route, Android Live Match Browser) is hidden on both clients behind the `WATCH_LIVE_ENABLED` Config flag (missing/false = hidden, seeded "false"); spectate links (/play/online?spectate=, /rooms?code=X&spectate=1, Android room spectate) and GET /api/matches/live stay live; re-enable without a deploy in Admin → Settings → Config & feature flags → WATCH_LIVE_ENABLED.

## OWNER DIRECTIVE (2026-07-12) — Damath is WEB-ONLY
The Damath game mode (damath-* realtime modules, DamathRoomPage/damath matchmaking, DAMATH
match mode) stays exactly as it is in the web app and goes NO further:
- Do NOT include Damath in the native Android app (no screens, no nav entries, no API surface).
- Do NOT touch/refactor Damath code in the v3 web/admin delta work.
- If any handoff row or future task appears to pull Damath into mobile/admin scope, it is
  overridden by this directive — leave it web-only and flag it instead of building.
