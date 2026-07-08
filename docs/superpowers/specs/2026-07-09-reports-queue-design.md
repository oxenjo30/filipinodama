# Reports Queue (Phase 1.5) — Design

**Date:** 2026-07-09
**Status:** Approved (design) — revised after code review — awaiting spec re-review → plan
**Context:** FilipinoDama Royal, admin console Phase 1.5. The four Phase-1 admin sections
(Store, Live ops, Guilds, Matches) are live. This adds player reporting + the admin
moderation queue. No reporting system exists today; this is a from-scratch feature spanning
the player web app and the admin console.

> **Revision note (post-review):** A code review found 10 issues (2 critical). All were
> verified against the codebase and are addressed here. Key changes vs the first draft:
> Phase 1.5 evidence is **DM + profile only** (match/room chat is ephemeral/unpersisted —
> see C2); DM reports carry a **messageId**; dedupe uses a **partial unique index**;
> resolution + sanction run in **one transaction**; `requireAdmin` is **hardened to reload
> live role/ban/delete**; report FKs use **SetNull + snapshotted display fields** so evidence
> survives user deletion; the rate limit uses a **userId key generator**; and **server
> integration tests** are required.

## Goal

Let players report other players for abuse, and give moderators a queue to triage reports
and act (dismiss / mute / ban) in one audited, transactional step. Match the approved
`secModeration` design in `handoffv2/FilipinoDama Admin.dc.html` (report cards with type
badge, accused/reporter/channel, an offending-content excerpt, Dismiss/Mute/Ban buttons,
and a "Queue clear" empty state).

## Scope

**In (Phase 1.5):**
- Report intake from **Direct Messages** (with a specific `messageId` + excerpt) and
  **player profiles** (no excerpt — name/avatar/behavior).
- Admin moderation queue: list/filter, Dismiss/Mute/Ban, all audited + transactional.
- Harden `requireAdmin` to reload live status (fixes a pre-existing gap on ALL admin routes).

**Deferred (not this build):**
- **Match / private-room reporting with a chat excerpt.** Match and room chat are ephemeral
  socket relays and are NOT persisted (confirmed: `apps/server/src/realtime/match.ts:571`
  "ephemeral match chat"; `rooms.ts:325` "ephemeral; not persisted"). There is nothing to
  snapshot. Reporting a match opponent is still possible via their **profile**. True
  in-match evidence requires persisting chat first — a separate Phase-2 item.
- Auto-grouping / rage-report clustering (queue shows individual cards; filter by accused).
- Warn action (only Dismiss/Mute/Ban this build).
- Auto-flags / profanity filter / anti-cheat signals. Appeals flow.

## Data model — one new `Report` table (one additive migration)

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
  id            String       @id @default(cuid())

  // Reporter/accused are SetNull (not Cascade) so moderation evidence survives a
  // hard user delete. Display fields are snapshotted at report time so the queue
  // still reads sensibly even after the account is gone/anonymized.
  reporterId    String?
  reporter      User?        @relation("reportsMade", fields: [reporterId], references: [id], onDelete: SetNull)
  reporterName  String       // snapshot: "username#tag" at report time
  accusedId     String?
  accused       User?        @relation("reportsAgainst", fields: [accusedId], references: [id], onDelete: SetNull)
  accusedName   String       // snapshot: "username#tag" at report time

  reason        ReportReason
  note          String?      @db.Text        // optional free-text from reporter

  context       String       // "dm" | "profile"   (match/room deferred)
  channelId     String?      // dm: the Channel
  messageId     String?      // dm: the specific offending Message (stable id)
  excerpt       String?      @db.Text        // snapshot of that message body at report time

  status        ReportStatus @default(OPEN)
  resolvedById  String?      // moderator who closed it (nullable FK, SetNull)
  resolvedBy    User?        @relation("reportsResolved", fields: [resolvedById], references: [id], onDelete: SetNull)
  resolution    String?      // "dismissed" | "muted" | "banned"
  createdAt     DateTime     @default(now())
  resolvedAt    DateTime?

  @@index([status, createdAt])
  @@index([accusedId])
}
```

Add back-relations on `User`: `reportsMade Report[] @relation("reportsMade")`,
`reportsAgainst Report[] @relation("reportsAgainst")`,
`reportsResolved Report[] @relation("reportsResolved")`.

**Dedupe — partial unique index (not a plain `@@unique`).** A plain
`@@unique([reporterId, accusedId, status])` is WRONG: it lets a reporter file a *second*
OPEN report only after the first is resolved, and then breaks when that second report
reaches the same terminal status (two rows with the same reporter/accused/RESOLVED). We want
"at most one OPEN report per reporter→accused, any number of closed ones." Postgres partial
unique index, added in the migration via raw SQL:

```sql
CREATE UNIQUE INDEX report_open_unique
  ON "Report" ("reporterId", "accusedId")
  WHERE status = 'OPEN';
```

A duplicate open report hits this index → P2002 → surfaced as a friendly "already reported."
Prisma can't express partial indexes in the schema DSL, so this lives in the migration's SQL
and is documented here so it isn't lost on a schema regenerate.

**Design decisions:**
- `excerpt` and `*Name` snapshots are captured **server-side at report time** (anti-fabrication
  + evidence durability). The client never supplies excerpt or names.
- `SetNull` FKs + snapshot fields (H6): deleting a user nulls the ids but keeps the report row
  and its human-readable names/excerpt for the moderation record.

## Player intake — `POST /api/reports`

One endpoint, two surfaces this build:

| Surface | context | Body carries | Excerpt source |
|---|---|---|---|
| Direct message | `dm` | `accusedId, messageId` | server looks up the Message by id |
| Player profile | `profile` | `accusedId` | none |

**Request body:** `{ accusedId, reason, note?, context: "dm"|"profile", messageId? }`.

**Server logic:**
1. `requireAuth` (live-status checked). Reporter = `req.userId`.
2. Validate with zod: `reason` ∈ enum, `context` ∈ {dm, profile}, `note` ≤ 500,
   `messageId` required iff `context==="dm"`.
3. Reject: self-report (`accusedId===reporter`), accused is a bot or deleted/nonexistent,
   → 400 with a clear message.
4. **DM evidence ownership (H3):** load the Message by `messageId`; require that
   (a) it exists, (b) `message.authorId === accusedId` (you can only cite the *accused's*
   own message as evidence, not put words in their mouth), and (c) the reporter is a member
   of that message's channel (`ChannelMember`). Otherwise 400. Snapshot `excerpt = message.body`
   and `channelId = message.channelId`.
5. Snapshot `reporterName` / `accusedName` from the two users.
6. `create` the Report. On P2002 (partial-unique) → 409 "You've already reported this player."

**Guardrails:**
- **Rate-limit (M7):** the global limiter is IP-keyed with no `keyGenerator` (confirmed
  `index.ts:66`). Add a **per-route** rate-limit config on `POST /api/reports` with a
  `keyGenerator` that returns `req.userId` (falls back to IP if somehow absent), e.g.
  `max: 5, timeWindow: "1 hour"`. This is the first user-keyed limit in the app; the
  keyGenerator is local to this route's config.
- **Dedupe:** the partial unique index (above).

**Client:** `apps/web/src/features/moderation/ReportPlayerModal.tsx` — shared reason-picker
modal (6 reasons + optional note), using existing web design tokens + the web `api` client.
Invoked from: the **DM thread** (passes the selected/most-recent accused message's id) and the
**player profile / card** (context=profile). Success → toast; dedupe 409 → inline "already
reported" message.

## Admin queue — `/moderation` section

**Server module** `apps/server/src/modules/admin-reports.ts`, registered like the other
`admin-*` plugins under the `/api` prefix (so routes are `/admin/reports…` → client calls
`/api/admin/reports…`, per L10). All routes `requireAdmin("MODERATOR")`; all mutations audited.

- `GET /admin/reports?status=&reason=&accusedId=&cursor=&limit=` — queue, newest first,
  cursor-paginated (`take: limit+1` / `nextCursor`). Default `status=OPEN`. Each row returns
  reporter/accused (live `{id,username,tag,avatarUrl}` when the user still exists, else the
  snapshot name), reason, note, context, channelId, messageId, excerpt, status, createdAt.
- `POST /admin/reports/:id/dismiss` — `{ reason }`. Set DISMISSED + resolvedBy/At +
  `resolution="dismissed"`. Audited `report.dismiss`. No sanction.
- `POST /admin/reports/:id/mute` — `{ durationHours?, reason }`. Mute the **accused** +
  resolve the report. Audited.
- `POST /admin/reports/:id/ban` — `{ durationHours?, reason }`. Ban the accused + resolve.
  Audited.

**Transactional resolution (H4).** Today admin mute/ban update the user and write the audit
row as separate awaits (`admin.ts:236`); a naive extraction could leave "sanction applied,
report still open" (or vice-versa) on a mid-way failure, and two mods could act on the same
report concurrently. So:

- New `apps/server/src/lib/sanctions.ts` exports `muteUser(tx, {...})` / `banUser(tx, {...})`
  that take a Prisma transaction client and do the user update + audit write, returning what's
  needed to send the notification email **after** commit (email is side-effecting and must not
  be inside the transaction). admin.ts's existing `/users/:id/mute` and `/ban` are refactored
  to call these (wrapped in their own `$transaction`), so the Players page and the queue share
  one path with identical audit/notify behavior.
- Each queue mutation runs one `prisma.$transaction`:
  1. `updateMany` the report **only where `status = 'OPEN'`** (atomic claim). If count === 0 →
     throw a 409 "Report already resolved" (someone else got there first / stale UI).
  2. Apply the sanction via `muteUser`/`banUser(tx, …)` (skip for dismiss).
  3. Set the report's `resolvedById`, `resolvedAt`, `resolution`.
  4. Write the `audit()` row(s).
  After commit, send the accused's notification email (best-effort, non-fatal), same as the
  existing sanction path.

**Admin page** `apps/admin/src/pages/Moderation.tsx` — matches the approved `secModeration`
markup: report cards (colored left-accent by reason, type badge + relative time,
"Reported: **Accused** · by Reporter · in {DM / profile}", italic excerpt box when present),
Dismiss / Mute / Ban buttons (Mute/Ban → confirm→duration→reason modal via the shared
`useAdminMutation`), status + reason filter chips, and the **"Queue clear"** empty state.
Only approved admin CSS tokens/classes.

**Player-detail count (M9).** Add `openReportsAgainst` (count of OPEN reports where
`accusedId = :id`) to the existing `GET /admin/users/:id` (SUPPORT-gated). **Decision:**
SUPPORT sees the *number only* as a triage signal; report **contents + actions** stay
MODERATOR-gated (the queue). Surface it in `apps/admin/src/pages/Players.tsx` as a small
"⚠ Reports against: N" line in the player detail drawer.

## Security fix — harden `requireAdmin` (H5)

Pre-existing gap (confirmed `guards.ts:73`): `requireAdmin` only calls `attachUser` and trusts
the **JWT-populated `adminRole`**, while `requireAuth` reloads live status. So a demoted, banned,
or deleted admin keeps admin access until their token expires. Fix `requireAdmin` to reload the
user like `requireAuth` does — reject `deletedAt`/active-ban, and gate on the **DB** `adminRole`,
not the token's. This hardens every existing admin route, not just the new ones. One focused
change + a test.

## Files touched

**Server:**
- `prisma/schema.prisma` — `Report` model + 2 enums + 3 User back-relations. Migration also
  runs the partial-unique-index raw SQL.
- `apps/server/src/auth/guards.ts` — harden `requireAdmin` (live reload). [H5]
- `apps/server/src/lib/sanctions.ts` — NEW: `muteUser`/`banUser` (tx-aware, email-after-commit). [H4]
- `apps/server/src/modules/admin.ts` — refactor `/users/:id/mute` + `/ban` onto `sanctions.ts`;
  add `openReportsAgainst` to `/users/:id`. [H4, M9]
- `apps/server/src/modules/reports.ts` — NEW: `POST /api/reports` intake (+ per-route user-keyed
  rate limit). [M7]
- `apps/server/src/modules/admin-reports.ts` — NEW: admin queue routes (transactional). [H4]
- `apps/server/src/index.ts` — register `reportRoutes` + `adminReportsRoutes`.
- `apps/server/test/…` — NEW integration tests (see below). [M8]

**Web (player app):**
- `apps/web/src/features/moderation/ReportPlayerModal.tsx` — NEW shared modal.
- DM thread + profile/card entry-point wiring.

**Admin:**
- `apps/admin/src/pages/Moderation.tsx` — NEW queue page.
- `apps/admin/src/pages/Players.tsx` — show `openReportsAgainst`. [M9]
- `apps/admin/src/App.tsx` — import + route + nav (drop `/moderation` P2 badge).

## Error handling

- Intake: self/bot/deleted-accused → 400; bad `messageId` / not the accused's message / not a
  channel member → 400; dedupe P2002 → 409 "already reported"; over rate limit → 429.
- Queue: acting on an already-resolved report → 409 "Report already resolved" (the atomic
  claim in step 1 guarantees this even under concurrent mods). Not-found → `err.notFound`.
- Sanction failures roll back the whole transaction (report stays OPEN) — no half-applied state.

## Testing / verification (M8)

Server integration tests are **required** (server already runs `vitest`; web/admin have no test
harness, so those stay manual). Cover:
- **Intake auth:** unauthenticated → 401; authenticated happy path creates a Report.
- **Dedupe:** second OPEN report same reporter→accused → 409; allowed again after the first is resolved.
- **Evidence ownership:** DM report with a `messageId` that isn't the accused's message, or where
  the reporter isn't a channel member → 400; valid case snapshots the excerpt.
- **Self/bot guards:** self-report and bot-report → 400.
- **Admin RBAC:** SUPPORT hitting the queue → 403; the hardened `requireAdmin` rejects a
  now-banned/demoted admin whose token still says admin.
- **Pagination:** `nextCursor` walks the queue without dupes/gaps.
- **Stale 409:** resolving an already-resolved report → 409; the report isn't double-sanctioned.
- **Transaction race:** two concurrent mute/ban on the same OPEN report → exactly one sanction
  applied, the other 409s; audit rows consistent with the winner.

Manual E2E (prod-like): file a DM report and a profile report → both appear in the queue →
Dismiss removes from OPEN; Mute/Ban applies the sanction + resolves + writes AuditLog + emails
the accused; dedupe + rate-limit behave; "Queue clear" shows when empty; SUPPORT sees the
count on player detail but not the queue.

Deploy verification: `/api/reports` returns 401 unauthenticated; `/api/admin/reports…` return
401 unauthenticated (exist + guarded); admin `/moderation` renders.

## Migration & rollout

- One Prisma migration: `Report` + 2 enums (additive; zero changes to existing table columns →
  no risk to live data) + the partial-unique-index raw SQL. Applied to prod via the established
  deploy path (Railway migrate on deploy; DB via DATABASE_PUBLIC_URL).
- The `requireAdmin` hardening + sanctions refactor are backward-compatible (same external
  behavior, stricter liveness) and ship in the same server deploy.
- Ship server + web + admin together.
