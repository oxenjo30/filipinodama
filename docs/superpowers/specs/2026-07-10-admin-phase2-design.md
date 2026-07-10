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
- `PATCH /admin/admins/:id/role` (SUPERADMIN) — change an existing admin's role. Audited
  (action `admin.role`, before/after `{adminRole}`).

**Guards (lockout-safe):**
- **Cannot change or revoke your own admin role** (`:id === req.userId`, or the resolved grant
  target === self) → 400 `SELF_ADMIN_CHANGE`. A plain equality check against `req.userId` (like
  the reports self-ban guard) — race-safe because "self" is a per-request constant. Prevents a
  SUPERADMIN from demoting themselves and bricking access.
- **Cannot revoke/demote the last remaining SUPERADMIN** → 400 `LAST_SUPERADMIN`. **This guard
  is NOT a naive count-then-decide** (that's a read-then-write TOCTOU: two concurrent revokes
  each read count=2, both pass, both commit → zero superadmins = permanent lockout). Instead it
  is an **atomic conditional write** — the count assertion and the update happen in ONE
  statement whose WHERE requires another surviving superadmin, mirroring the reports-queue atomic
  claim (`admin-reports.ts` `updateMany where status=OPEN`), NOT the equality self-guard:

  ```ts
  // revoke = <newRole is null>; demote = <newRole is a lower tier>
  const n = await prisma.$executeRaw`
    UPDATE "User" SET "adminRole" = ${newRole}
    WHERE id = ${targetId}
      AND ("adminRole" <> 'SUPERADMIN'
           OR (SELECT count(*) FROM "User" WHERE "adminRole" = 'SUPERADMIN' AND "deletedAt" IS NULL) > 1)`;
  if (n === 0) {
    // either the target vanished OR removing this superadmin would leave zero
    const still = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
    throw still ? err.badRequest("LAST_SUPERADMIN", "Cannot remove the last superadmin")
                : err.notFound("NO_USER", "Admin not found");
  }
  ```
  Under Postgres Read Committed, two concurrent revokes of the two remaining superadmins contend;
  the second re-evaluates the correlated subquery against the post-first-commit state and matches
  0 rows → `LAST_SUPERADMIN`. Keep the write + `audit()` in one `$transaction` so the audit row
  reflects the real outcome. This atomic form applies to BOTH `/revoke` and the demote path of
  `PATCH /admin/admins/:id/role`.
- Only SUPERADMIN reaches any of these routes.

**Admin page** `apps/admin/src/pages/Admins.tsx` — stat cards (active by role + total), a
"Grant admin" card (search box for email/username/id + role select + Grant), and a table of
current admins (avatar/name/email, role select for inline change, Revoke button; the current
user's own row shows a "You" badge and its controls are disabled).

---

## Section B — Settings (feature flags) · SUPERADMIN only

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
  (10–30s) so hot paths don't hit the DB each call; falls back to a hard-coded default (and,
  for flags that mirror an env var, the env value) when the key is unset. Cache entry is
  invalidated on any `PATCH /admin/config` (same process).
- **Single-replica assumption (document it):** the cache invalidation is process-local. This is
  correct under the current **single Railway replica** — the same assumption the existing
  in-memory presence/matchmaking layers already rely on. If the API is ever horizontally scaled,
  a PATCH on replica A won't invalidate replica B's cache; changes then converge only within the
  TTL. Before scaling, add a cross-instance invalidation channel (net-new — no Redis client is
  wired today; `@socket.io/redis-adapter` is an unused dep and `REDIS_URL` is env-only). The
  env-var fallback stays a fleet-wide immediate kill switch (env change + redeploy). So "live"
  means: **takes effect on this instance immediately, elsewhere within the TTL** — not instant
  cross-fleet. Soften any "instantly live" phrasing to this.
- The app reads flags through this service where relevant (see "Wired flags" below).

**Server** `apps/server/src/modules/admin-config.ts`:
- `GET /admin/config` (SUPERADMIN) — all Config rows grouped by category, each with
  current value + type + label.
- `PATCH /admin/config/:key` (SUPERADMIN) — `{ value }`. **FIRST** checks a hard-coded
  server-side deny-list `LOCKED_KEYS = ["DIAMOND_TOPUP_ENABLED"]` → 403 `LOCKED_FLAG` before any
  lookup/update (independent of the UI — an admin can't bypass a disabled input by PATCHing the
  key directly). Then validates `{ value }` against the row's `type` (bool → "true"/"false",
  int → integer string) → 400 `BAD_VALUE`. Updates the row, invalidates the cache, audits
  (`config.update`, before/after). Unknown key → 404.

**Wired flags (seeded; genuinely live — no inert values):**
- `MAINTENANCE_BANNER` (bool) + `MAINTENANCE_TEXT` (string) — when on, the web app shows a top
  banner. Exposed via a dedicated **`GET /api/config/public`** (unauthenticated, no guard) that
  returns ONLY a hard-coded **per-key allow-list** `PUBLIC_CONFIG_KEYS = ["MAINTENANCE_BANNER",
  "MAINTENANCE_TEXT"]` — NOT a `category="flag"` filter (that would auto-leak every future flag,
  e.g. DAILY_LOGIN_ENABLED, to anonymous callers) and never the full table. Decoupled from
  `/api/me` so it works for logged-out visitors too.
- `DAILY_LOGIN_ENABLED` (bool) — the daily-login reward endpoint (`rewards.ts`, which reads the
  hard-coded `LOGIN_REWARDS` track at request time) checks this flag via configService before
  granting; off → the feature is disabled without a redeploy.

**Economy constants — DEFERRED (no real consumer yet).** The store's purchase path
(`store.ts:74`, `ledger.ts:84`) reads per-item `priceGold`/`priceDiamonds` columns directly; the
only diamond↔gold factor (`DIAMOND_TO_GOLD=10`) is applied at **seed time** and baked into the
catalog's price columns — nothing reads a live rate at request time. So a `GOLD_PER_DIAMOND`
Config row would be **inert** (editing it wouldn't reprice anything), violating this section's
own "no inert values" rule. Therefore Section B ships with **flags only**; the "Economy
constants" panel and the "economy" category are **not built** this cycle. (If a live constant is
wanted later — e.g. making `LOGIN_REWARDS` amounts admin-tunable — it gets wired to its real
request-time read-site in that cycle, not seeded speculatively.)

**Diamond top-up stays locked (legal compliance):** `DIAMOND_TOPUP_ENABLED` is shown in the
Settings UI as **read-only / disabled** with a note ("disabled for legal compliance"); the
server enforces this via the `LOCKED_KEYS` deny-list above (403 `LOCKED_FLAG`), not just the
disabled input. Critically: **`DIAMOND_TOPUP_ENABLED` is NOT seeded as a Config row, and the
payments gate is NEVER routed through configService** — it remains `features.payments =
env.DIAMOND_TOPUP_ENABLED && ...` (`env.ts:100`). This prevents a writable Config row from ever
*shadowing* the env gate and re-enabling top-ups from the admin table. To render the locked
toggle's state, the Settings GET surfaces the value **from env**, not from a row. (Re-enabling is
a deliberate env change + redeploy, never a flag toggle.) Do NOT add a `locked` boolean column to
Config — the lock is a singular env-governed decision, not table state.

**Admin page** `apps/admin/src/pages/Settings.tsx` — a "Feature flags" panel (toggles/inputs per
flag with its label) + the locked diamond-topup row (disabled, env-sourced). No economy-constants
panel this cycle (deferred, above). The audit log stays reachable via the existing Audit page
(per the approved `secConfig` design). SUPERADMIN-gated.

---

## Section C — Campaigns (broadcast announcements) · ECONOMY+ 

Send an in-app announcement to a segment of players via the existing `Notification` model.
**Real reach; CTR omitted** (no click-tracking infra — shown as "—", never faked).

**Nav role fix (required):** the `/campaigns` nav entry in `App.tsx` is currently
`SUPPORT`-gated (`App.tsx:41`), but these routes are `ECONOMY`-gated — a SUPPORT/MODERATOR admin
would see a visible-but-dead section (every call 403s). Raise the nav min-role to **`ECONOMY`**
(and drop the P2 flag): `["/campaigns","Campaigns","#ff9ec4","Engagement","ECONOMY"]`.

**Model (new, one migration):**
```prisma
model Campaign {
  id         String   @id @default(cuid())
  title      String
  body       String   @db.Text
  segment    String                  // "all" | "active7d" | "rank:<tierKey>"
  status     String   @default("sent")
  reach      Int      @default(0)     // real count of Notifications created
  sentById   String?
  sentBy     User?    @relation(fields: [sentById], references: [id], onDelete: SetNull)
  sentByName String                  // snapshot ("username#tag" at send time)
  createdAt  DateTime @default(now())
  @@index([createdAt])
}
```
**Add the opposite relation field to `User`** (required or `prisma validate` fails):
`campaignsSent Campaign[]` (unambiguous → no named `@relation` needed). `status` stays a plain
default `"sent"` — no draft state this cycle (YAGNI; drafts deferred).

**Segments** (resolved server-side to a `where` over `User`, always excluding bots, guests,
deleted — the client NEVER supplies user ids):
- `all` — every real player.
- `active7d` — `lastSeenAt >= now-7d`.
- `rank:<tierKey>` — `rankTier === <key>`. **`<tierKey>` must be a valid RANK_TIERS key**,
  validated by reusing the exported `rankTierSchema` (`packages/shared/src/ranks.ts:25`). Do NOT
  char-class-validate or split on `-`: the key `star-guardian` contains a hyphen. Parse the whole
  `segment` with a strict schema, e.g.
  `z.union([z.literal("all"), z.literal("active7d"), z.string().startsWith("rank:").transform(s => s.slice(5)).pipe(rankTierSchema)])`.
  An unknown tier → 400 `BAD_SEGMENT` (distinct from `EMPTY_SEGMENT`), never a silent empty send.

**Server** `apps/server/src/modules/admin-campaigns.ts`:
- `GET /admin/campaigns` (ECONOMY) — history newest-first (title, segment label, status,
  `reach`, `sentByName`, createdAt). CTR not returned (UI shows "—").
- `POST /admin/campaigns/preview` (ECONOMY) — `{ segment }` → `{ count }` (dry-run count of the
  segment; NO writes). Lets the admin see reach before sending.
- `POST /admin/campaigns/send` (ECONOMY) — `{ title, body, segment }`. Validate lengths
  (title ≤ 120, body ≤ 1000) and the segment (schema above). Resolve the segment → target user
  ids. Snapshot `sentById = req.userId` and `sentByName` ("username#tag") from the acting admin
  at insert time (same as reports' `reporterName`). Create one `Notification` per user via
  `createMany` (type `"announcement"`, title, body) in **chunks** (e.g. 1000/insert) so a large
  segment doesn't blow the statement size. Record a `Campaign` row with `reach = number created`.
  Audit (`campaign.send`, after = {segment, reach}, reason = the title). Empty segment (0 users)
  → 400 `EMPTY_SEGMENT`. Return `{ id, reach }`.

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
- `apps/server/prisma/schema.prisma` — add `Config` + `Campaign` models + the `campaignsSent
  Campaign[]` back-relation on User. One migration (additive).
- `apps/server/src/lib/config-service.ts` — NEW: cached runtime config reader (process-local).
- `apps/server/src/modules/admin-admins.ts` — NEW (grant/revoke/role, atomic last-superadmin guard).
- `apps/server/src/modules/admin-config.ts` — NEW (GET/PATCH + `LOCKED_KEYS` deny-list + the
  unauthenticated `GET /api/config/public` with the `PUBLIC_CONFIG_KEYS` allow-list).
- `apps/server/src/modules/admin-campaigns.ts` — NEW.
- `apps/server/src/modules/rewards.ts` — daily-login reads `DAILY_LOGIN_ENABLED` via configService.
- `apps/server/src/index.ts` — register the 3 new admin plugins + the public config route.
- `apps/server/prisma/seed.ts` — seed the wired Config rows with an upsert that puts `value` ONLY
  in `create` (never `update`), so re-seeding never clobbers an admin's PATCH edit (mirrors the
  Season seed comment). Seeds: MAINTENANCE_BANNER (bool, default "false"), MAINTENANCE_TEXT
  (string, default ""), DAILY_LOGIN_ENABLED (bool, default "true"). Does NOT seed
  DIAMOND_TOPUP_ENABLED (env-governed) or any economy constant (deferred).
- No `store`/economy-constant change this cycle (economy panel deferred).
- Tests: server integration tests per section (see Testing).

**Web (player app):**
- Maintenance banner: fetch `GET /api/config/public` on load (a new small fetch — the web app
  has no existing bootstrap-config fetch to piggyback), show a top banner in the app shell/layout
  when on. (Small.)

**Admin:**
- `apps/admin/src/pages/Admins.tsx`, `Settings.tsx`, `Campaigns.tsx` — NEW (Settings has NO
  economy-constants panel).
- `apps/admin/src/App.tsx` — 3 routes swapped off Phase2 stubs; drop the P2 flag on
  `/admins`, `/settings`, `/campaigns`; AND **raise `/campaigns` min-role SUPPORT → ECONOMY** so
  the sidebar filter matches the ECONOMY route guards.

## Error handling

- Admins: self-change → 400 `SELF_ADMIN_CHANGE`; last-superadmin (atomic) → 400 `LAST_SUPERADMIN`;
  no/ambiguous user → 404 `NO_USER` / 400 `AMBIGUOUS`.
- Settings: locked-key PATCH → 403 `LOCKED_FLAG` (checked first, deny-list); unknown key → 404;
  type-invalid value → 400 `BAD_VALUE`.
- Campaigns: bad/unknown-tier segment → 400 `BAD_SEGMENT`; empty segment → 400 `EMPTY_SEGMENT`;
  over-length → 400.
- All via the standard envelope + existing `err.*` helpers (badRequest/forbidden/notFound —
  no new helpers needed).

## Testing / verification

Server integration tests (via the Phase-1.5 `buildApp()` + `inject()` harness + `dama_test`):
- **Admins:** grant/revoke changes adminRole + audits; **self-change rejected** (`SELF_ADMIN_CHANGE`);
  single-actor last-superadmin revoke rejected (`LAST_SUPERADMIN`); **concurrency: two `Promise.all`
  revoke/demote requests against the two remaining superadmins → exactly one succeeds and ≥1
  superadmin remains** (proves the atomic guard; a naive count-then-decide would pass this test's
  single-actor case but FAIL the concurrent one); non-SUPERADMIN → 403.
- **Settings:** PATCH updates + audits + invalidates cache (a `getBool` after PATCH returns the new
  value); type validation → `BAD_VALUE`; **diamond-topup flip → 403 `LOCKED_FLAG`** (and
  `features.payments` still equals the env value afterward — no shadow row); configService fallback
  when unset. **`GET /api/config/public` allow-list: seed a non-public flag-category row and assert
  it is ABSENT from the response** (proves the per-key allow-list, not a category filter).
- **Campaigns:** preview count matches a seeded segment; send creates N Notifications + a Campaign
  row with reach=N + `sentByName` populated + audit; empty segment → 400 `EMPTY_SEGMENT`;
  **unknown tier `rank:notatier` → 400 `BAD_SEGMENT`** (not a silent empty send); `rank:star-guardian`
  (hyphenated key) resolves correctly; chunking works for > chunk-size users.
Manual E2E (prod-like): grant an admin + verify they gain access (see Rollout note on re-login);
flip the maintenance banner + see it on the web app; send a campaign to `active7d` + confirm the
bell notification arrives + history shows real reach.
Deploy verification: the new admin routes 401 unauthenticated; admin pages render;
`GET /api/config/public` returns exactly `{ MAINTENANCE_BANNER, MAINTENANCE_TEXT }` and nothing else.

## Migration & rollout

One additive migration (`Config` + `Campaign` + the User back-relation; zero changes to existing
columns). Seed upserts the wired Config rows (idempotent; `value` only on create, so re-seed never
clobbers admin edits). Ship server + web (banner) + admin together. Unset flags fall back to code
defaults so nothing breaks pre-seed.

**Granted-admin access is immediate (no re-login):** `requireAdmin` is DB-role-authoritative
(hardened in Phase 1.5 — it reloads `adminRole` from the DB every request), so a newly-granted
admin gains access on their next request without logging out/in. (Their client-side nav is gated
by `/admin/me`, which also reads the live role — a refresh surfaces the new sections.)

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
