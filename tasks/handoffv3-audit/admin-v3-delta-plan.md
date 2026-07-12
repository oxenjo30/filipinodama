# feat/admin-v3-delta — Row-by-Row Implementation Plan (Admin v2→v3, 32 rows)

Source: `tasks/handoffv3-audit/admin-v2-v3-diff.md` (authoritative).
Production context: apps/admin implements the v2 console against real /api/admin/* endpoints
(fidelity pass complete). Standing rules: no fabricated data (honest empty states), gold-only
economy (real-money top-up DISABLED; PayMongo dormant behind DIAMOND_TOPUP_ENABLED=false;
Apple/Google IAP out of scope), ALL role gates enforced server-side, every mutation
confirm → reason → audit log.

## Cluster A1 — Settings → Payment Gateways tab (rows 1-7) — BUILD, policy-constrained
1:1 structure: new "Payment gateways" tab between Config and API keys, SUPERADMIN-only
(server-enforced). "Gateway status & fees" card: per-gateway row (PayPal/Stripe/PayMongo/
Xendit) with enable/disable toggle, fee % input, "Test connection" button; enabled=green /
disabled=muted border. Relocate the v2 credential cards + payment-environment toggle +
diamond-pack product-mapping table from Financials into this tab (per rows 4-7).
Policy adaptations (sanctioned, documented):
- Config (on/off + fee + env) persists to real admin config storage + audit
  (finance.gateway, finance.gateway.test actions); it has NO live-money effect while
  DIAMOND_TOPUP_ENABLED=false.
- "Test connection": REAL check for PayMongo (validate configured test-mode key reachability);
  other gateways show honest "Not configured" result — NO simulated fake success.
- Credential cards: bind to real stored config where it exists (PayMongo); do NOT copy the
  prototype's demo credentials/fabricated values as content.

## Cluster A2 — Financials top-up dashboard + refunds + receipts (rows 8-15) — BUILD
Replace Financials layout per v3: live "💳 Diamond top-ups" card (Total/Today/Orders/Avg/
💎 Sold/Refunds tiles), 7-day bar chart, "Recent top-ups" list (row click → Receipt modal;
Refund button), 5-panel revenue breakdowns — ALL wired to REAL top-up purchase records.
With top-ups disabled the dashboard renders the approved empty state verbatim: "No wallet
top-ups yet. Purchases from the mobile app appear here in real time." (exactly row 11 —
honest AND 1:1). Remove the old Gateways/Refunds sub-tab toggle (row 14): refunds panel
always-on below. Receipt modal fields per row 15 with real order data; "Method" from the
real provider (never hardcode "App Store · Apple Pay").
Refund: POST /api/admin/purchases/:id/refund — SERVER-ENFORCED finance.refund/SUPERADMIN
role (fixes the prototype PERMS gap flagged in the audit), confirm+reason modal, reverses
diamonds via ledger, marks refunded, audit finance.refund. Breakdown "By region": real
region field if present else "Unknown" bucket — NO deterministic-hash fabrication
(documented deviation).

## Cluster A3 — Header: global search + account menu + sign-out (rows 16-18) — BUILD
- Global search input ("Search players, guilds, cups…") with dropdown: ≤6 players, ≤4 guilds,
  ≤4 tournaments from REAL admin search endpoint(s); kind pills Player/Guild/Cup; click
  routes to the section with the record opened; "No matches" empty state.
- Account chip → dropdown: real logged-in admin's name/email/role. "⚙ Manage account"
  (SUPERADMIN → Admins section; others → warn toast), "🕑 My activity log" (→ audit log
  filtered to self — improve on prototype's settings-route with same copy), "⎋ Sign out" →
  REAL admin session end + audit session.signout.
- Full-screen sign-out interstitial 1:1 (logo, check, "You've been signed out", copy, account
  pill, "Sign back in"/"Switch account" → real login screen, "Session ended · HH:MM").

## Cluster A4 — Players section (rows 19-23) — BUILD/ADAPT
- Row 20: render REAL avatar images + frame overlay in player rows + drawer (reuse the
  resolved avatar asset convention from apps/web; initials fallback stays).
- Row 19 "Live" badge: prototype's device-sync concept maps to REAL presence — green "Live"
  pill when the player is currently online (server presence/isOnline).
- Row 21 "RECENT PURCHASES" drawer block: real orders for the player (≤8, name, currency
  icon 💳/💎/🪙, price, relative time).
- Rows 22-23 (_syncRealPlayers/_publishLeaderboard localStorage bridges): COVERED by real
  backend (players and leaderboard are DB-driven). Add lightweight liveness: refresh player
  list on window focus or 60s interval. No-op otherwise; document as covered.

## Cluster A5 — Guilds (rows 24-26) — BUILD
- "Join requests" panel: real pending guild applications (server has guild join requests);
  Approve/Reject with guild.moderate SERVER-enforced role, audit guild.join.approve/reject,
  toasts per spec; panel hidden when none (hasGuildApps).
- "View" button per guild row → Guild Detail drawer: crest, name, tag, members count,
  WEEKLY PTS + MIN TROPHIES tiles, real MEMBERS roster (role-colored Leader/Officer/Member,
  trophies, "New" pill for recent joiners) with ✕ kick on non-Leader rows →
  POST kick endpoint (guild.moderate, audit guild.member.kick).

## Cluster A6 — Daily login rewards editor (rows 27-28) — BUILD (server config + editor)
"Daily login rewards" card above Scheduled events: 7-row ladder editor (Days 1-6:
Gold/Diamonds select + amount; Day 7: Grand chest with gold+gem inputs), "Save ladder"
SUPERADMIN-gated (server-enforced config.edit), persists to real server config, audit
economy.dailyRewards, toast "Daily reward ladder published."
Wiring: the player daily-login endpoint (/api/rewards/daily-login — currently a hardcoded
7-day gold track) reads the configured ladder. Diamonds in the ladder are EARNED diamonds —
allowed under gold-only economy (earn-only diamonds are sanctioned). Seed config with the
current production ladder values, not the prototype's, to avoid a silent economy change —
flag the prototype's default values (200/400/10💎/700/20💎/1200/chest 2000+50💎) to the owner
as the v3-suggested ladder before adopting.

## Cluster A7 — Persistence/lifecycle rows already real (rows 29-32) — VERIFY
- Row 29 report resolution persistence: production reports resolve in DB. VERIFY status +
  resolution + resolvedAt are stored and drive the UI.
- Row 30 mass-grant live apply + idempotency: production grants go through the real ledger.
  VERIFY applied-once semantics.
- Row 31 maintenance persistence: production maintenance flag is server state. VERIFY initial
  load reflects current server value.
- Row 32 storage-event live reactivity: covered by real APIs; the A4 refresh covers liveness.
  window.FDA debug hook: prototype-only, intentionally omitted (documented).

## Execution order
A3 (header, self-contained) → A5 (guilds) → A4 (players) → A6 (daily rewards) →
A2 (financials dashboard) → A1 (payment gateways tab) → A7 (verifications).
Each cluster: implement (apps/admin + apps/server admin modules) → tsc/build both →
server tests for new endpoints (role-gate + audit assertions) → commit.
Owner checkpoints embedded: A6 ladder default values; A1/A2 remain money-inert until the
standing monetization decision.
