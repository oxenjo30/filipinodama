# ADMIN_DASHBOARD.md — Admin & Moderation Console Spec

An internal, access-controlled console for operating FilipinoDama Royal: moderating players, managing the economy/store, running seasons & events, watching health, and handling support. **Not** part of the player app — a separate route tree (`/admin`) or a separate small app, gated by role.

Build this **after** the core player app is stable (post-M6). It reuses the same server modules and DB — no parallel data store.

---

## 1. Access control

- Add an `AdminRole` to identity: `SUPPORT | MODERATOR | ECONOMY | SUPERADMIN` (a nullable `adminRole` on `User`, or a separate `AdminUser` table linked to `User`). Default players have none.
- All `/api/admin/*` routes require a valid session **and** a sufficient `adminRole`; enforce per-action (least privilege). Reject with 403 otherwise.
- **Every admin action writes an `AuditLog` row** (who, what, target, before/after, timestamp, reason). Audit log is append-only and visible to `SUPERADMIN`.
- Require re-auth (or step-up) for destructive/economy actions (ban, grant currency, refund).

```prisma
enum AdminRole { SUPPORT MODERATOR ECONOMY SUPERADMIN }
model AuditLog {
  id        String   @id @default(cuid())
  actorId   String
  action    String            // e.g. "user.ban", "currency.grant", "store.item.update"
  targetType String?          // user | guild | match | item | payment
  targetId  String?
  before    Json?
  after     Json?
  reason    String?
  createdAt DateTime @default(now())
  @@index([actorId, createdAt])
  @@index([targetType, targetId])
}
```

---

## 2. Sections

### 2.1 Overview (home)
KPI tiles + charts (server-rendered aggregates, cached):
- DAU/MAU, new signups, guests→registered conversion.
- Concurrent players, live matches, matchmaking queue depth + avg wait.
- Matches/day by mode; average game length; abandon/timeout rate.
- Revenue (diamond top-ups) today/7d/30d; ARPPU; refunds.
- Gold sink/faucet balance (granted vs spent) — economy health.
- System status row (API, DB, Redis, Stripe webhook last-received).

### 2.2 Players (`SUPPORT`+)
- Search by username / tag / email / id. Row → player detail.
- **Player detail:** profile, stats, rank tier, balances, equipped cosmetics, inventory, recent matches (link to replay), sessions/devices, guild, friends, reports against them, full **ledger history**.
- Actions (role-gated):
  - `SUPPORT`: send system notification/message, reset avatar/name (ToS), unlock account, resend verification.
  - `MODERATOR`: mute (chat), temp-suspend, ban/unban, wipe offensive bio/name, force-leave guild.
  - `ECONOMY`: adjust balances (via ledger, reason required), grant/revoke cosmetics, issue refund.
  - `SUPERADMIN`: change `adminRole`, hard-delete (GDPR), merge/relink OAuth.

### 2.3 Moderation queue (`MODERATOR`+)
- Inbound **reports** (player-reported chat/name/behavior) with context (the offending message + surrounding thread, reporter, accused).
- Chat log viewer per channel (DM/room/guild) with search + date range.
- One-click actions: dismiss, warn, mute (duration), suspend, ban — each logged with reason. Bulk actions for spam waves.
- Auto-flags: profanity filter hits, rapid-message spam, rage-report clusters, suspicious win/rating anomalies (anti-cheat signals from the server).

### 2.4 Economy & Store (`ECONOMY`+)
- **Store catalog CRUD:** create/edit `StoreItem`s (name, type, asset key, gold/diamond price, premium flag, active, sort order, bundle contents). Preview against the asset. Changes are versioned + audited; no destructive delete of owned items (deactivate instead).
- **Diamond packs:** manage the top-up packs (price in real currency, diamonds granted, promo bonuses).
- **Daily deals / featured:** schedule which items are featured or discounted and when.
- **Grants/compensation:** grant gold/diamonds/cosmetics to a player, a segment, or all (mass-grant with dry-run count first). Always via the ledger with a reason.
- **Ledger explorer + refunds:** search ledger entries; issue a refund that reverses a purchase (re-credit currency or reverse a Stripe charge, revoke the item) — idempotent, audited.

### 2.5 Seasons, Quests & Events (`ECONOMY`/`SUPERADMIN`)
- Create/edit **Seasons** (dates, tier table, rewards, pass price). Start/end a season (with confirmation — this rolls the ladder).
- Manage **Quests** (daily/seasonal definitions, goals, gold rewards, active windows).
- Schedule **events/announcements** (the event banners: Fiesta, 2× Coins, etc.) with start/end and target audience — these also emit `notif:new` system notifications.

### 2.6 Guilds (`MODERATOR`+)
- Search guilds; detail with roster, roles, weekly points, chat log.
- Actions: rename/clear offensive name/description/crest, transfer leadership, disband, adjust min-trophy gate, remove members.

### 2.7 Matches & anti-cheat (`MODERATOR`+)
- Match search by player/mode/date; open **replay** (reuses the player replay viewer + engine).
- Anti-cheat panel: flagged matches (impossible timing, engine-perfect play, rating manipulation between colluding accounts), with the ability to void a match (reverse trophy/gold deltas via ledger) and sanction the accounts.

### 2.8 Broadcast & support (`SUPPORT`+)
- Compose a system notification / maintenance notice to all or a segment (emits `notif:new`, shows in the player Notifications center).
- Optional in-app maintenance banner + read-only "maintenance mode" toggle (`SUPERADMIN`) that pauses matchmaking and shows a notice.

### 2.9 Feature flags & config (`SUPERADMIN`)
- Toggle features (new store section, event, matchmaking modes) without redeploy.
- Tune economy constants (per-win gold, trophy deltas, daily reward) — writes to a config table read by the server, audited. Mirrors `packages/shared/constants.ts` defaults.

---

## 3. API surface (`/api/admin/*`, all role-gated + audited)

```
GET    /api/admin/overview                      → KPI aggregates
GET    /api/admin/users?query=&filter=
GET    /api/admin/users/:id                     → full detail
POST   /api/admin/users/:id/sanction            { type: mute|suspend|ban, durationH?, reason }
DELETE /api/admin/users/:id/sanction/:sid       → lift
POST   /api/admin/users/:id/grant               { currency|itemId, amount, reason }
POST   /api/admin/users/:id/notify              { title, body }
GET    /api/admin/reports?status=
POST   /api/admin/reports/:id/resolve           { action, reason }
GET    /api/admin/chat?channelId=&from=&to=
CRUD   /api/admin/store/items
GET    /api/admin/ledger?userId=&currency=&from=&to=
POST   /api/admin/payments/:id/refund
CRUD   /api/admin/seasons  /api/admin/quests  /api/admin/events
GET    /api/admin/guilds  /api/admin/guilds/:id  + moderation actions
GET    /api/admin/matches  /api/admin/matches/:id/replay
POST   /api/admin/matches/:id/void              { reason }
POST   /api/admin/broadcast                     { audience, title, body }
GET/PUT /api/admin/flags   /api/admin/config
GET    /api/admin/audit?actorId=&targetId=
```

---

## 4. UI & tech notes

- Same monorepo. Either `apps/web` under a lazy-loaded `/admin` route tree (guarded) **or** a dedicated `apps/admin` Vite app sharing `packages/shared`. Prefer a **separate app** for isolation and a smaller player bundle.
- Visual language: a **muted, utilitarian** version of the brand (dark panel, gold accents, dense tables, mono numbers) — do NOT reuse the ornate player frames everywhere; readability + density win. Data tables with server-side pagination, sort, filter, CSV export.
- Every mutating call: confirm dialog → require `reason` → optimistic row update → toast → audit entry.
- Charts: a lightweight lib (e.g. Recharts) over cached aggregate endpoints; don't run heavy queries on every page load — precompute daily rollups.
- Security: separate rate limits, IP allowlist option for `SUPERADMIN`, all actions behind CSRF-safe POST, session shorter TTL than player sessions.

---

## 5. Definition of done

- Role matrix enforced server-side (a `SUPPORT` token cannot hit an `ECONOMY` route).
- Every mutation appears in the audit log with actor + reason + before/after.
- A moderator can go report → context → sanction in the queue; a player sees the resulting suspension/notice.
- An economy admin can edit a store item, run a mass-grant (with dry-run), and issue a refund that reverses both currency and ownership idempotently.
- Voiding a match reverses its ledger deltas exactly once.
- No admin capability is reachable from the player app or an unprivileged token.
