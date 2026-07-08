# Reports Queue (Phase 1.5) — Design

**Date:** 2026-07-09
**Status:** Approved (design) — awaiting spec review → implementation plan
**Context:** FilipinoDama Royal, admin console Phase 1.5. The four Phase-1 admin sections
(Store, Live ops, Guilds, Matches) are live. This adds player reporting + the admin
moderation queue — the last open Phase-1.5 item. No reporting system exists today; this is
a from-scratch feature spanning the player web app and the admin console.

## Goal

Let players report other players for abuse, and give moderators a queue to triage those
reports and act (dismiss / mute / ban) in one audited step. Match the already-approved
`secModeration` design in `handoffv2/FilipinoDama Admin.dc.html` (report cards with type
badge, accused/reporter/channel, an offending-content excerpt, and Dismiss/Mute/Ban
buttons, plus a "Queue clear" empty state).

## Non-goals (explicitly deferred)

- **Auto-grouping / rage-report clustering** — the queue shows individual cards; mods can
  filter by accused. Grouping is a Phase-2 nicety.
- **Warn action** — only Dismiss/Mute/Ban in this build (matches the mockup 1:1).
- Auto-flags / profanity-filter / anti-cheat signals (Phase 2; needs detection subsystems).
- Appeals flow for the accused.

## Data model — one new `Report` table (one migration)

```prisma
enum ReportReason {
  HARASSMENT
  HATE_SPEECH
  CHEATING
  INAPPROPRIATE   // name / avatar / bio
  SPAM
  OTHER
}

enum ReportStatus {
  OPEN
  RESOLVED
  DISMISSED
}

model Report {
  id           String       @id @default(cuid())
  reporterId   String
  reporter     User         @relation("reportsMade", fields: [reporterId], references: [id], onDelete: Cascade)
  accusedId    String
  accused      User         @relation("reportsAgainst", fields: [accusedId], references: [id], onDelete: Cascade)
  reason       ReportReason
  note         String?      @db.Text                 // optional free-text from reporter
  context      String       // "match" | "room" | "dm" | "profile"
  channelId    String?      // chat-based reports: channel for excerpt provenance
  refId        String?      // matchId / roomId / etc.
  excerpt      String?      @db.Text                 // snapshot of offending text at report time
  status       ReportStatus @default(OPEN)
  resolvedById String?      // moderator who closed it
  resolution   String?      // "dismissed" | "muted" | "banned"
  createdAt    DateTime     @default(now())
  resolvedAt   DateTime?

  @@index([status, createdAt])
  @@index([accusedId])
  @@unique([reporterId, accusedId, status])          // dedupe: one OPEN per reporter→accused
}
```

Add the two back-relations on `User`:
`reportsMade Report[] @relation("reportsMade")` and
`reportsAgainst Report[] @relation("reportsAgainst")`.

**Design decisions:**
- `excerpt` is **snapshotted server-side at report time** so the evidence survives if the
  message is later deleted. The client never supplies the excerpt (anti-fabrication).
- `@@unique([reporterId, accusedId, status])` enforces dedupe cheaply: a second OPEN report
  from the same reporter against the same accused hits the constraint → surfaced as a
  friendly "already reported" message, not a 500. (When a report is resolved/dismissed its
  status changes, so the pair can be reported again later — correct behavior.)
- `onDelete: Cascade` on both relations so deleting a user cleans up their reports.

## Player intake — `POST /api/reports`

One endpoint, three entry surfaces:

| Surface | context | Captured | Excerpt |
|---|---|---|---|
| In-match / private room | `match` / `room` | `refId` = match/room id | snapshot of accused's recent chat in that match/room |
| Direct message | `dm` | `channelId` | the offending message text |
| Player profile | `profile` | — | none (name/avatar/behavior report) |

**Flow:** player opens a shared **reason-picker modal** (reused across all three surfaces),
chooses one of the 6 `ReportReason` values + an optional note → `POST /api/reports` →
toast "Report submitted — thanks for helping keep the game fair."

**Request body:** `{ accusedId, reason, note?, context, refId?, channelId? }`.
The server derives/looks up the `excerpt` itself from the real channel/match — it does NOT
trust a client-supplied excerpt.

**Guardrails (server-side):**
- Reject self-report, reporting a bot, or a non-existent/deleted accused → clean 400.
- **Rate-limit:** max 5 reports/hour per reporter, via the existing Fastify `rateLimit`
  per-route config (keyed by userId).
- **Dedupe:** the `@@unique` constraint; on P2002 return a friendly
  "You've already reported this player." (409/400), not an error page.
- Validate `reason` against the enum and `context` against the allowed set (zod).

**Client:** a `ReportPlayerModal` component in the web app using the existing web design
tokens, invoked from a "Report" affordance on: the in-match/room opponent, the DM thread
header, and the player profile/card. Submits via the existing web `api` client.

## Admin queue — `/moderation` section

**Server routes** (new module `apps/server/src/modules/admin-reports.ts`, registered like
the other admin-\* plugins; all `requireAdmin("MODERATOR")`; all mutations call `audit()`):

- `GET /admin/reports?status=&reason=&accusedId=&cursor=&limit=` — queue, newest first,
  cursor-paginated (`take: limit+1` / `nextCursor` pattern). Each row joins reporter +
  accused (`{id, username, tag, avatarUrl}`) and returns reason, note, context, channelId,
  refId, excerpt, status, createdAt. Default `status=OPEN`.
- `POST /admin/reports/:id/dismiss` — set `status=DISMISSED`, `resolvedById`, `resolvedAt`,
  `resolution="dismissed"`. Audited (`report.dismiss`). No sanction.
- `POST /admin/reports/:id/mute` — mute the **accused** (reuse the existing mute path:
  duration + reason → sets `mutedUntil`, notifies, its own audit), then resolve the report
  (`status=RESOLVED`, `resolution="muted"`). Audited (`report.resolve.mute`).
- `POST /admin/reports/:id/ban` — same as mute but a ban. Audited (`report.resolve.ban`).

The mute/ban reuse the **existing sanction logic** (extract the shared bits from admin.ts's
`/users/:id/mute` and `/ban` so both the Players page and the queue call one function),
keeping notify + audit behavior identical. Resolving a report is one atomic, audited action.

**Admin page** — new `apps/admin/src/pages/Moderation.tsx`, matching the approved
`secModeration` markup:
- Report **cards** with a colored left-accent by reason type, a type badge + relative
  timestamp, "Reported: **Accused** · by Reporter · in {channel/context}", an italic
  **excerpt** box, and **Dismiss / Mute / Ban** buttons. Mute/Ban open the
  confirm→duration→reason modal via the shared `useAdminMutation`.
- **Status + reason filter** chips at the top; **"Queue clear"** empty state.
- Uses only the approved admin CSS tokens/classes — no new CSS.

**Wiring:**
- Flip the `/moderation` nav item from its Phase-2 stub to the live `ModerationPage`; drop
  its `P2` badge. Eyebrow/title already `["Trust & Safety", "Moderation queue"]`.
- Add a **"Reports against: N"** count to the existing player-detail view
  (`GET /admin/users/:id`) — a small `count` of OPEN reports where `accusedId = :id`.

## Files touched

**Server (new + edits):**
- `prisma/schema.prisma` — add `Report` model, two enums, two User back-relations. + migration.
- `apps/server/src/modules/reports.ts` — NEW: player intake `POST /api/reports` plugin.
- `apps/server/src/modules/admin-reports.ts` — NEW: admin queue routes plugin.
- `apps/server/src/lib/sanctions.ts` — NEW: shared `muteUser()` / `banUser()` functions
  (extracted from admin.ts's current inline mute/ban) so the queue and the Players page call
  one code path. admin.ts's `/users/:id/mute` + `/ban` are refactored to call these.
- `apps/server/src/index.ts` — register `reportRoutes` + `adminReportsRoutes`.
- `apps/server/src/modules/admin.ts` — add OPEN-reports-against count to `/users/:id`.

**Web (player app):**
- `apps/web/src/features/moderation/ReportPlayerModal.tsx` — NEW shared modal.
- Entry-point wiring in the in-match/room opponent UI, DM thread header, profile/card.

**Admin:**
- `apps/admin/src/pages/Moderation.tsx` — NEW queue page.
- `apps/admin/src/App.tsx` — import + route + nav (drop P2).

## Error handling

- Intake: self/bot/deleted-accused → 400 with a clear message; dedupe P2002 → friendly
  "already reported"; rate-limit exceeded → the standard 429 from Fastify rateLimit.
- Queue: acting on an already-resolved report → 409 "Report already resolved"
  (re-check status inside the mutation before sanctioning). Not-found → `err.notFound`.
- Sanction failures (e.g. accused vanished) surface as the existing sanction errors.

## Testing / verification

- Engine/unit: none (no game-rule change).
- Server: the shared sanction function gets a focused test (mute sets `mutedUntil`, audits).
- Manual E2E (prod-like): file a report from each of the 3 surfaces → appears in the queue →
  Dismiss removes it from OPEN; Mute/Ban applies the sanction + resolves + writes AuditLog;
  dedupe blocks a second open report; rate-limit blocks the 6th in an hour; "Queue clear"
  shows when empty. Verify player-detail shows the OPEN-reports-against count.
- Deploy verification: the two new API route groups return 401 unauthenticated (exist +
  guarded), `/api/reports` returns 401 without a session; admin `/moderation` renders.

## Migration & rollout

- One Prisma migration adding `Report` + two enums. Applied to prod via the established
  deploy path (Railway runs migrations on deploy; DB reachable via DATABASE_PUBLIC_URL).
- Additive only — no changes to existing tables' columns → zero risk to live data.
- Ship server + web + admin together; the intake and queue are useful the moment both land.
