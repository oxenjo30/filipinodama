# Admin Phase 2 (Admins · Settings · Campaigns) + Phase 3 (Support) — Design

**Date:** 2026-07-10
**Status:** Approved (design) — awaiting spec review → implementation plan
**Context:** The FilipinoDama admin console (app.filipinodama.com) has 8 Phase-2 stub sections.
Reports queue (Phase 1.5) just shipped. This cycle builds **3** of the stubs — Admins,
Settings, Campaigns — each over existing or one small new model, no player-facing intake
needed. Support (a full ticketing subsystem) is documented here as **Phase 3** with its own
spec/plan when Phase 2 ships.

**Explicitly NOT built (and why):** Analytics (needs an event pipeline), Tournaments (needs a
Tournament subsystem), **Financials + Fraud** (real-money top-up is DISABLED for legal
compliance — `DIAMOND_TOPUP_ENABLED=false`; building payment ops would contradict that
decision). These remain honest Phase-2 stubs.

## Conventions (all sections inherit)

- Server module per section: `apps/server/src/modules/admin-<section>.ts`, a Fastify plugin
  registered in `index.ts` at `/api`. Routes prefixed `/admin/...` → client calls `/api/admin/...`.
- Every route `requireAdmin(<role>)`-gated; **every mutation** calls `audit(tx-or-db, {...})`
  with before/after/reason. Uses `ok()`/`err.*` envelope. ESM (`.js` imports).
- Admin page per section: `apps/admin/src/pages/<Section>.tsx`, consuming via `api.get` +
  mutating via `useAdminMutation`. Only approved admin CSS tokens/classes (match `Economy.tsx`).
- Nav wiring in `apps/admin/src/App.tsx`: swap the Phase2 stub route → real page, drop the P2 flag.
- Role hierarchy (guards.ts): SUPPORT(1) < MODERATOR(2) < ECONOMY(3) < SUPERADMIN(4).
  `requireAdmin` is DB-role-authoritative + lockout-safe (hardened in Phase 1.5).

---

## Section A — Admins (role management) · SUPERADMIN only

Manage which **existing** users hold an admin role. **No email-invite flow** (decided): the
mockup's "invite by email" becomes "grant admin to an existing user." Granting admin to a
non-user is out of scope (they must have an account first).

**Server** `apps/server/src/modules/admin-admins.ts`:
- `GET /admin/admins` (SUPERADMIN) — list all users with `adminRole != null`
  (`{id, username, tag, email, displayName, avatarUrl, adminRole, lastSeenAt}`), plus stats
  `{ byRole: {SUPPORT,MODERATOR,ECONOMY,SUPERADMIN}, total }`.
- `POST /admin/admins/grant` (SUPERADMIN) — `{ query, role }`. `query` = an email OR
  `username#tag` OR user id. Resolve to exactly one existing user (else 404 `NO_USER` /
  400 `AMBIGUOUS`). Set their `adminRole = role`. Audited (`admin.grant`).
- `POST /admin/admins/:id/revoke` (SUPERADMIN) — set `adminRole = null`. Audited (`admin.revoke`).
- `PATCH /admin/admins/:id/role` (SUPERADMIN) — change an existing admin's role. Audited.

**Guards (lockout-safe, mirrors the reports self-ban guard):**
- **Cannot change or revoke your own admin role** (`:id === req.userId` or the resolved grant
  target === self) → 400 `SELF_ADMIN_CHANGE`. Prevents a SUPERADMIN from demoting themselves
  and bricking access.
- Cannot revoke/demote the **last remaining SUPERADMIN** → 400 `LAST_SUPERADMIN` (count
  SUPERADMINs; if this action would leave zero, reject). Prevents locking everyone out.
- Only SUPERADMIN reaches any of these routes.

**Admin page** `apps/admin/src/pages/Admins.tsx` — stat cards (active by role + total), a
"Grant admin" card (search box for email/username/id + role select + Grant), and a table of
current admins (avatar/name/email, role select for inline change, Revoke button; the current
user's own row shows a "You" badge and its controls are disabled).

---

## Section B — Settings (feature flags + economy constants) · SUPERADMIN only

Runtime configuration the app actually reads, so flipping a flag changes behavior live —
**no inert values**. Backed by a new `Config` table + a small cached `configService`.

**Model (new, one migration):**
```prisma
model Config {
  key       String   @id            // e.g. "MAINTENANCE_BANNER", "DAILY_LOGIN_ENABLED"
  value     String                  // stored as string; typed by `type`
  type      String                  // "bool" | "int" | "string"
  category  String                  // "flag" | "economy"
  label     String                  // human label for the admin UI
  updatedAt DateTime @updatedAt
}
```

**Runtime service** `apps/server/src/lib/config-service.ts`:
- `getConfig(key): Promise<string|null>` + typed helpers `getBool(key, fallback)`,
  `getInt(key, fallback)`. Reads the `Config` row; **caches in-process with a short TTL**
  (e.g. 30s) so hot paths don't hit the DB each call; falls back to a hard-coded default (and,
  for flags that mirror an env var, the env value) when the key is unset. Cache is invalidated
  on any `PATCH /admin/config`.
- The app reads flags through this service where relevant (see "Wired flags" below).

**Server** `apps/server/src/modules/admin-config.ts`:
- `GET /admin/config` (SUPERADMIN) — all Config rows grouped by category, each with
  current value + type + label.
- `PATCH /admin/config/:key` (SUPERADMIN) — `{ value }`, validated against the row's `type`
  (bool → "true"/"false", int → integer string). Updates the row, invalidates the cache,
  audits (`config.update`, before/after). Unknown key → 404.

**Wired flags (seeded; genuinely live):**
- `MAINTENANCE_BANNER` (bool) + `MAINTENANCE_TEXT` (string) — when on, the web app shows a top
  banner. Exposed via a dedicated **`GET /api/config/public`** (unauthenticated, no guard) that
  returns ONLY the player-safe flags (the maintenance banner + text) — never the full Config
  table. Decoupled from `/api/me` so it works for logged-out visitors too.
- `DAILY_LOGIN_ENABLED` (bool) — the daily-login reward endpoint checks this flag (via
  configService) before granting; off → the feature is disabled without a redeploy.
- **Economy constants** (int, category "economy"): e.g. `GOLD_PER_DIAMOND` (display/exchange
  rate) — read by the store where the constant is used. Start with 1–2 real ones actually read
  by code; do NOT seed constants nothing reads (avoids inert values).

**Diamond top-up stays locked (legal compliance):** `DIAMOND_TOPUP_ENABLED` is shown in the
Settings UI as **read-only / disabled** with a note ("disabled for legal compliance") and
CANNOT be flipped on from here. It remains governed by the env var + the memory-flagged
decision. (If it ever needs re-enabling, that's a deliberate separate change, not a flag toggle.)

**Admin page** `apps/admin/src/pages/Settings.tsx` — a "Feature flags" panel (toggles/inputs
per flag with its label), an "Economy constants" panel (numeric inputs + Save), the locked
diamond-topup row, and (per the approved `secConfig` design) the audit log is reachable from
here / the existing Audit page. SUPERADMIN-gated.

---

## Section C — Campaigns (broadcast announcements) · ECONOMY+ 

Send an in-app announcement to a segment of players via the existing `Notification` model.
**Real reach; CTR omitted** (no click-tracking infra — shown as "—", never faked).

**Model (new, one migration):**
```prisma
model Campaign {
  id        String   @id @default(cuid())
  title     String
  body      String   @db.Text
  segment   String                  // "all" | "rank:<tierKey>" | "active7d"
  status    String   @default("sent") // "sent" (draft support optional/deferred)
  reach     Int      @default(0)     // real count of Notifications created
  sentById  String?
  sentBy    User?    @relation(fields: [sentById], references: [id], onDelete: SetNull)
  sentByName String                  // snapshot
  createdAt DateTime @default(now())
  @@index([createdAt])
}
```

**Segments** (resolved server-side to a `where` over `User`, always excluding bots, guests,
deleted):
- `all` — every real player.
- `rank:<tierKey>` — `rankTier === <key>` (keys from `packages/shared/src/ranks.ts` RANK_TIERS).
- `active7d` — `lastSeenAt >= now-7d`.

**Server** `apps/server/src/modules/admin-campaigns.ts`:
- `GET /admin/campaigns` (ECONOMY) — history newest-first (title, segment label, status,
  `reach`, `sentByName`, createdAt). CTR not returned (UI shows "—").
- `POST /admin/campaigns/preview` (ECONOMY) — `{ segment }` → `{ count }` (dry-run count of the
  segment; NO writes). Lets the admin see reach before sending.
- `POST /admin/campaigns/send` (ECONOMY) — `{ title, body, segment }`. Validate lengths
  (title ≤ 120, body ≤ 1000). Resolve the segment → the target user ids. Create one
  `Notification` per user via `createMany` (type `"announcement"`, title, body) in **chunks**
  (e.g. 1000/insert) so a large segment doesn't blow the statement size. Record a `Campaign`
  row with `reach = number created`. Audit (`campaign.send`, after = {segment, reach}). Return
  `{ id, reach }`.

**Guardrails:** the client shows the previewed reach and requires a confirm before send (can't
accidentally blast everyone); title/body length-limited; segment validated against the allowed
set. If the segment resolves to 0 users → 400 `EMPTY_SEGMENT` (nothing to send).

**Admin page** `apps/admin/src/pages/Campaigns.tsx` — compose card (title, message, segment
select, "Preview reach" → shows count → "Send now" via `useAdminMutation` with a confirm that
displays the reach) + history table (reach real, CTR column shows "—"). Approved `secCampaigns`
fidelity, approved tokens only.

---

## Files touched (Phase 2)

**Server:**
- `apps/server/prisma/schema.prisma` — add `Config` + `Campaign` models (+ `Campaign` back-rel
  on User). One migration (additive).
- `apps/server/src/lib/config-service.ts` — NEW: cached runtime config reader.
- `apps/server/src/modules/admin-admins.ts` — NEW.
- `apps/server/src/modules/admin-config.ts` — NEW.
- `apps/server/src/modules/admin-campaigns.ts` — NEW.
- `apps/server/src/modules/rewards.ts` (or wherever daily-login lives) — read `DAILY_LOGIN_ENABLED`
  via configService.
- store module — read the economy constant(s) via configService where used.
- a small `GET /api/config/public` (or fold into existing bootstrap) — player-safe flags only
  (maintenance banner).
- `apps/server/src/index.ts` — register the 3 new admin plugins (+ the public config route).
- `apps/server/prisma/seed.ts` — seed the wired Config rows (idempotent upsert).
- Tests: server integration tests per section (see Testing).

**Web (player app):**
- Maintenance banner: read `GET /api/config/public`, show a top banner when on. (Small.)

**Admin:**
- `apps/admin/src/pages/Admins.tsx`, `Settings.tsx`, `Campaigns.tsx` — NEW.
- `apps/admin/src/App.tsx` — 3 routes swapped off Phase2 stubs + P2 flags dropped.

## Error handling

- Admins: self-change → 400 `SELF_ADMIN_CHANGE`; last-superadmin → 400 `LAST_SUPERADMIN`;
  no/ambiguous user → 404/400.
- Settings: unknown key → 404; type-invalid value → 400 `BAD_VALUE`; diamond-topup flip → 403
  `LOCKED_FLAG`.
- Campaigns: bad segment → 400; empty segment → 400 `EMPTY_SEGMENT`; over-length → 400.
- All via the standard envelope + existing `err.*` helpers (conflict/badRequest/forbidden/notFound).

## Testing / verification

Server integration tests (via the Phase-1.5 `buildApp()` + `inject()` harness + `dama_test`):
- **Admins:** grant/revoke changes adminRole + audits; **self-change rejected**;
  **last-superadmin revoke rejected**; non-SUPERADMIN → 403.
- **Settings:** PATCH updates + audits + invalidates cache (a getBool after PATCH returns the
  new value); type validation; **diamond-topup flip → 403**; configService fallback when unset.
- **Campaigns:** preview count matches a seeded segment; send creates N Notifications +
  a Campaign row with reach=N + audit; empty segment → 400; chunking works for >chunk-size users.
Manual E2E (prod-like): grant an admin + verify they gain access; flip the maintenance banner +
see it on the web app; send a campaign to `active7d` + confirm the bell notification arrives +
history shows real reach.
Deploy verification: the new routes 401 unauthenticated; admin pages render; `/api/config/public`
returns only player-safe flags.

## Migration & rollout

One additive migration (`Config` + `Campaign`; zero changes to existing columns). Seed upserts
the wired Config rows (safe to re-run). Ship server + web (banner) + admin together. The wired
flags take effect immediately; unset flags fall back to code defaults so nothing breaks pre-seed.

---

## Phase 3 (next cycle) — Support tickets

Documented for continuity; gets its own spec + plan when Phase 2 ships.
- **Models:** `Ticket` (id, userId, category, subject, status open/resolved, createdAt) +
  `TicketMessage` (ticketId, authorId, body, isStaff, createdAt) for the reply thread.
- **Intake:** wire the EXISTING `apps/web/src/features/contact/ContactPage.tsx` (currently a
  local-only mailto form) to `POST /api/support/tickets` for logged-in players → creates a Ticket
  + first TicketMessage.
- **Admin queue** `apps/admin/src/pages/Support.tsx` (SUPPORT+): list open tickets, open one to
  see the thread, reply (→ `TicketMessage` isStaff + a `Notification` to the player), resolve.
  All audited.
- Reuses the Reports-queue patterns (queue + transactional resolution + notify).
