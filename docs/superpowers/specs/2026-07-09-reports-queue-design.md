# Reports Queue (Phase 1.5) — Design

**Date:** 2026-07-09
**Status:** Approved (design) — revised after 3 review rounds (2 manual + 1 multi-agent
adversarial) — implementation-ready pending final user sign-off → plan
**Context:** FilipinoDama Royal, admin console Phase 1.5. The four Phase-1 admin sections
(Store, Live ops, Guilds, Matches) are live. This adds player reporting + the admin
moderation queue. No reporting system exists today; this is a from-scratch feature spanning
the player web app and the admin console.

> **Revision note (post-review):** Three review rounds — two manual code reviews (10 + 15
> findings) and a multi-agent adversarial review (5 lenses × verify × synthesize; 24 findings
> survived verification, verdict "no correctness/security blockers, 5 mediums to decide"). All
> findings were verified against the real codebase and are addressed here. Cumulative changes vs
> the first draft: evidence is **DM + profile only** (match/room chat is ephemeral/unpersisted);
> DM reports carry a **messageId** validated via **`dmRefId` pair-identity**; dedupe uses a
> **partial unique index** (authoring procedure documented); resolution + sanction run in **one
> transaction** (concrete atomic OPEN-claim; `audit()` widened to accept a tx client);
> `requireAdmin` is **hardened with a lockout-safe ban policy** (SUPERADMIN exempt + self-ban
> guard + break-glass); report FKs use **SetNull + snapshotted display/profile fields**; the
> rate limit is an **atomic guarded insert** (closes the check-then-insert TOCTOU); **guests
> can't report**; the profile-report host is the **FriendsPage Player Profile modal** (no public
> profile route exists); a **`buildApp()` test factory + truncate-based isolation + auth helper**
> back the required **server integration tests**; and an explicit **reason→badge map** makes the
> queue design satisfiable.

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

  context         String       // "dm" | "profile"   (match/room deferred)
  channelId       String?      // dm: the Channel
  messageId       String?      // dm: the specific offending Message (stable id)
  excerpt         String?      @db.Text      // dm: snapshot of that message body at report time
  // profile reports have no chat excerpt, so the evidence IS the accused's profile
  // at report time — snapshot it so a later rename/avatar-swap can't erase what was
  // reported. Stored as JSON: { displayName, username, tag, avatarUrl, bio }.
  profileSnapshot Json?        // profile: accused's profile fields at report time

  status        ReportStatus @default(OPEN)
  resolvedById  String?      // moderator who closed it (nullable FK, SetNull)
  resolvedBy    User?        @relation("reportsResolved", fields: [resolvedById], references: [id], onDelete: SetNull)
  resolution    String?      // "dismissed" | "muted" | "banned"
  createdAt     DateTime     @default(now())
  resolvedAt    DateTime?

  @@index([status, createdAt])
  @@index([accusedId])
  @@index([reporterId, createdAt])   // serves the DB-backed per-user rate-limit count (M7)
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

| Surface | context | Body carries | Evidence snapshotted |
|---|---|---|---|
| Direct message | `dm` | `accusedId, messageId, note?` | `excerpt` = that message's body |
| Player profile | `profile` | `accusedId, note (required)` | `profileSnapshot` = accused's profile fields |

**Request body:** `{ accusedId, reason, note?, context: "dm"|"profile", messageId? }`.

**Server logic:**
1. `requireAuth` (live-status checked). Reporter = `req.userId`.
   **Guest block (decided):** reject `req.isGuest === true` → 403 `GUEST_CANNOT_REPORT`.
   Both the OPEN-dedupe and the rate limit are keyed on `reporterId`; without this, a farm of
   throwaway guests could spam the queue + inflate the SUPPORT-visible `openReportsAgainst`
   count. `isGuest` is available on the request (`guards.ts:34`).
2. Validate with zod: `reason` ∈ enum, `context` ∈ {dm, profile}, `note` ≤ 500 (over-length
   → 400); `messageId` required iff `context==="dm"`; **`note` required + non-empty iff
   `context==="profile"`** (a profile report has no chat evidence, so the reporter must say
   what's wrong — offensive name? avatar? bio?).
3. Reject: self-report (`accusedId===reporter`), accused is a bot or deleted/nonexistent,
   → 400 with a clear message.
4. **DM evidence validation (H3 + tightening).** `findUnique` the Message by `messageId`
   **including its channel**, then assert strictly on that single loaded object:
   (a) it exists, (b) **`message.channel.type === "DM"`** (not a room/guild channel),
   (c) `message.authorId === accusedId` (you can only cite the *accused's* own message —
   no putting words in their mouth), and (d) **`message.channel.refId === dmRefId(reporterId,
   accusedId)`** — a single, order-independent comparison that verifies the DM is exactly the
   {reporter, accused} pair. `dmRefId(a,b)` is the existing canonical DM-pair identity
   (`apps/server/src/modules/chat-service.ts:24`, used at `dm.ts:88`); this is simpler and
   strictly stronger than any `ChannelMember` membership query, so use it (do NOT re-derive
   or `ensureChannel` — validate only the channel the cited message already lives in).
   Otherwise → 400. Snapshot `excerpt = message.body`, `channelId = message.channelId`.
5. **Profile evidence:** snapshot `profileSnapshot = { displayName, username, tag, avatarUrl,
   bio }` from the accused at report time.
6. Snapshot `reporterName` / `accusedName` ("username#tag") from the two users.
7. **Rate-limit (M7 — atomic guarded insert, decided).** The `@fastify/rate-limit` plugin hooks
   `onRequest`, which runs BEFORE `requireAuth`'s `preHandler` populates `req.userId`
   (`guards.ts:46`; plugin `@fastify/rate-limit@^9`), so a userId `keyGenerator` would see
   `undefined`. A naive "count then create" in the handler is a **TOCTOU race** — N concurrent
   requests from one reporter all read count<5 and all insert, blowing past the cap. So make the
   cap-check and the insert **one atomic statement** via `prisma.$executeRaw`:
   `INSERT INTO "Report" (…) SELECT … WHERE (SELECT count(*) FROM "Report" WHERE "reporterId"=$1
   AND "createdAt" >= now() - interval '1 hour') < 5`. **0 rows affected → 429 `RATE_LIMITED`**;
   1 row → created. This reuses `@@index([reporterId, createdAt])`, is per-user (two users behind
   one IP are independent), and closes the concurrency gap the way the queue's atomic OPEN-claim
   does. (Note: the partial-unique index does NOT cover this — it only stops a duplicate *open*
   report against the *same* accused; a reporter spamming *different* accused is bounded only by
   this quota.) The insert still surfaces the partial-unique violation as P2002.
8. On P2002 (partial-unique) → 409 `ALREADY_REPORTED` "You've already reported this player."

Add an index `@@index([reporterId, createdAt])` to the model for the rate-limit count. Add a
**concurrency test** firing N simultaneous reports from one reporter, asserting ≤5 rows created.

**Client:** `apps/web/src/features/moderation/ReportPlayerModal.tsx` — shared reason-picker
modal (6 reasons + note; note required for profile; the note field sets `maxLength={500}` — do
NOT copy the DM composer's 1000). Existing web design tokens + the web `api` client. Invoked from:
- **DM thread** — a per-message **"Report this message"** affordance on the *other person's*
  bubbles (`m.author.id !== myId`) in `apps/web/src/features/messages/MessagesPage.tsx`
  (each message already renders with a stable `key={m.id}`). Passes that exact `messageId`
  (NO "most-recent message" fallback — reports a *specific* line), and the modal shows the
  **locked quoted message** so the reporter confirms exactly what they're citing.
- **Player Profile modal** — the app has **no standalone public-profile route** (`apps/web/src/
  App.tsx:112` maps `/profile` to the user's OWN `ProfilePage`). The only surface that shows
  *another* player's profile is the **Player Profile modal in
  `apps/web/src/features/friends/FriendsPage.tsx`** (opened via `setProfileId(id)` → GET
  `/api/users/:id`, ~lines 933-1154, from friend rows / search results / requests). Add the
  "Report player" affordance (context=profile, note required) **there**. Do NOT add it to
  `ProfilePage.tsx` (that's the user's own profile — you can't report yourself).
Success → toast; dedupe 409 → inline "already reported" message.

## Admin queue — `/moderation` section

**Server module** `apps/server/src/modules/admin-reports.ts`, registered like the other
`admin-*` plugins under the `/api` prefix (so routes are `/admin/reports…` → client calls
`/api/admin/reports…`, per L10). All routes `requireAdmin("MODERATOR")`; all mutations audited.

- `GET /admin/reports?status=&reason=&accusedId=&cursor=&limit=` — queue, cursor-paginated.
  **Stable ordering:** `orderBy: [{ createdAt: "desc" }, { id: "desc" }]`. The cursor stays a
  **bare `id` string** (`nextCursor = lastRow.id`) with `cursor: { id: q.cursor }, skip: 1` —
  Prisma anchors on that id row and the secondary `id desc` orderBy disambiguates equal
  timestamps, so rows sharing a `createdAt` are neither dropped nor duplicated. This matches the
  existing `/admin/audit` + `/admin/ledger` pattern exactly (do NOT invent an encoded
  `createdAt|id` cursor). Default `status=OPEN`. Each row returns reporter/accused (live
  `{id,username,tag,avatarUrl}` when the user still exists, else the snapshot `*Name`), reason,
  note, context, channelId, messageId, excerpt, profileSnapshot, status, `accusedGone`
  (= `accusedId === null`), createdAt.
- `POST /admin/reports/:id/dismiss` — `{ reason }`. Set DISMISSED + resolvedBy/At +
  `resolution="dismissed"`. Audited `report.dismiss`. No sanction. **Allowed even when the
  accused is deleted.**
- `POST /admin/reports/:id/mute` — `{ durationHours?, reason }`. Mute the **accused** +
  resolve the report. Audited. **If `accusedId === null` → 409 `ACCUSED_GONE`** (nothing to
  sanction; the mod should Dismiss instead).
- `POST /admin/reports/:id/ban` — `{ durationHours?, reason }`. Ban the accused + resolve.
  Audited. **Same `ACCUSED_GONE` guard.**

**Deleted-accused handling (decided).** When the accused account has been deleted
(`accusedId === null`), the queue allows **Dismiss/Resolve only** — Mute/Ban are disabled in
the UI (keyed off the row's `accusedGone` flag) and the server returns 409 `ACCUSED_GONE` if
attempted. The report row + evidence is retained regardless.

**Transactional resolution (H4).** Today admin mute/ban update the user and write the audit
row as separate awaits (`admin.ts:236`); a naive extraction could leave "sanction applied,
report still open" (or vice-versa) on a mid-way failure, and two mods could act on the same
report concurrently.

- **Widen `audit()` (concrete refactor).** `audit()` currently takes `db: PrismaClient`
  (confirmed `audit.ts:9`), so it cannot be called with a transaction client. Change its first
  param type to `Prisma.TransactionClient | PrismaClient` (both expose `.auditLog.create`) so it
  works inside a `$transaction`. `apps/server/src/lib/audit.ts` is added to files-touched. No
  call-site changes needed (widening only).
- New `apps/server/src/lib/sanctions.ts` exports
  `muteUser(tx, { targetId, actorId, durationHours, reason })` /
  `banUser(tx, {...})` typed to take `Prisma.TransactionClient`. Each does the user `update` +
  the `audit(tx, …)` write inside the caller's transaction, and **returns the data needed to
  send the email after commit** `{ email, username, isGuest, until }` (email is side-effecting
  and must never run inside the transaction). admin.ts's existing `/users/:id/mute` and `/ban`
  are refactored to wrap these in their own `$transaction`, so the Players page and the queue
  share one path.
- **Mute email (clarification).** Today only **bans** send an email (`banEmailHtml`; no mute
  email exists — confirmed `admin.ts:245`). To keep behavior identical after the refactor,
  `banUser` returns email data and `muteUser` returns `null` for email (no mute email). Adding
  a mute email is out of scope for this build; if wanted later, add `muteEmailHtml` and have
  `muteUser` return its data — the post-commit send site already handles "email or null".
- **Concrete atomic-claim algorithm.** Each queue mutation runs one `prisma.$transaction(async (tx) => …)`:
  1. **Claim:** `const claimed = await tx.report.updateMany({ where: { id, status: "OPEN" },
     data: { status: targetStatus, resolvedById: actorId, resolvedAt: new Date(), resolution } })`
     where `targetStatus` is `DISMISSED` for dismiss else `RESOLVED`, and `resolution` is
     `"dismissed" | "muted" | "banned"`. This sets the resolution fields **as part of the same
     conditional update** — no separate later write.
  2. **`if (claimed.count === 0)`** → the report was already resolved (or never OPEN) → throw
     409 `REPORT_RESOLVED`. Because the `WHERE status = 'OPEN'` update is atomic, exactly one of
     two concurrent mods wins; the loser's `count` is 0.
  3. For mute/ban only: **guard `accusedId !== null`** (else throw 409 `ACCUSED_GONE`), then
     `await muteUser(tx, …)` / `banUser(tx, …)` (applies sanction + writes its own audit row,
     returns email data).
  4. Write the resolution `audit(tx, { action: "report.dismiss|report.resolve.mute|
     report.resolve.ban", targetType: "report", targetId: id, before:{status:"OPEN"},
     after:{status:targetStatus,resolution}, reason })`.
  5. Return the email data (or null) out of the transaction.
  **After commit:** if email data was returned, send it (best-effort, non-fatal) — same as the
  existing sanction path.

**Reason → badge mapping.** The approved `secModeration` mockup shows a colored type badge +
matching left-accent per card, but only illustrates a few types; the 6-value `ReportReason`
enum needs an explicit label + accent hex so "match the design / approved tokens only" is
satisfiable. Pin this map in `Moderation.tsx` (humanized label; the same hex drives both the
badge and the card's left-accent border, matching the mockup's `typeStyle`/accent pattern):

| Enum | Badge label | Accent hex |
|---|---|---|
| `HARASSMENT` | Harassment | `#c2495a` (red family) |
| `HATE_SPEECH` | Hate speech | `#a8324a` (deep red) |
| `CHEATING` | Cheating | `#d98a3a` (amber, matches the Matches dot) |
| `INAPPROPRIATE` | Inappropriate | `#8b78ad` (muted violet) |
| `SPAM` | Spam | `#d9911f` (gold-amber) |
| `OTHER` | Other | `var(--dim)` |

**Admin page** `apps/admin/src/pages/Moderation.tsx` — matches the approved `secModeration`
markup: report cards (colored left-accent by reason per the map above, type badge + relative time,
"Reported: **Accused** · by Reporter · in {DM / profile}", italic excerpt box for DM reports /
a compact profile-snapshot preview for profile reports; the reporter note shown when present),
Dismiss / Mute / Ban buttons (Mute/Ban → confirm→duration→reason modal via the shared
`useAdminMutation`; **Mute/Ban disabled when `accusedGone`**), status + reason filter chips.
Two distinct empty states:
- **"Queue clear"** — the approved empty state, shown when there are genuinely no OPEN reports
  and no filters are applied.
- **"No reports match these filters"** — shown when a status/reason/accused filter returns
  nothing but the queue isn't actually empty (so a mod doesn't misread a filtered view as
  "all clear"). Includes a "Clear filters" action.

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
user from the DB (like `requireAuth`) and gate on the **DB** `adminRole`, ignoring the token's.

**Lockout-safe ban policy (decided).** A naive "reject any active ban" would let a SUPERADMIN
who bans themselves (or is banned) brick the entire admin console with no way back in. So:
- Reject `deletedAt` (account gone) → 401.
- Reject `RANK[dbAdminRole] < RANK[min]` (demoted / non-admin) → 403. **The DB role is
  authoritative; the JWT `adminRole` is ignored** (mirrors how `requireAuth` refreshes
  `req.adminRole` from the DB at `guards.ts:57`).
- Reject an **active ban ONLY for non-SUPERADMIN** admins → 403. A DB-role `SUPERADMIN` is
  **exempt from the ban gate** (still must have the SUPERADMIN role), so the top account can
  never self-brick.
- **Self-ban guard on `/admin/users/:id/ban`:** reject `targetId === req.userId` (an admin
  can't ban themselves), and reject banning another admin (target with a non-null `adminRole`)
  unless the actor is SUPERADMIN. Neither guard exists today.
- **Break-glass (documented for ops):** if an admin is ever locked out by a ban, clear it with
  `UPDATE "User" SET "bannedUntil" = NULL WHERE id = '<id>';` against the prod DB
  (via DATABASE_PUBLIC_URL). Documented here so it isn't rediscovered under pressure.

This hardens every existing admin route, not just the new ones. **This is a behavior change**
(the first-draft claim of "same external behavior" was wrong): a banned/demoted/deleted admin
now loses access on the next request instead of at token expiry. Ships with the same server
deploy; one focused change in `guards.ts` + the `/ban` guard in `admin.ts` + a test.

## Files touched

**Server:**
- `apps/server/prisma/schema.prisma` — `Report` model + 2 enums + 3 User back-relations.
  Migration also runs the partial-unique-index raw SQL.
- `apps/server/src/auth/guards.ts` — harden `requireAdmin` (live reload). [H5]
- `apps/server/src/lib/audit.ts` — widen first param to `Prisma.TransactionClient | PrismaClient`
  so `audit()` can run inside a `$transaction`. [H4]
- `apps/server/src/lib/sanctions.ts` — NEW: `muteUser`/`banUser` (tx-typed, email-after-commit). [H4]
- `apps/server/src/modules/admin.ts` — refactor `/users/:id/mute` + `/ban` onto `sanctions.ts`;
  add `openReportsAgainst` to `/users/:id`. [H4, M9]
- `apps/server/src/modules/reports.ts` — NEW: `POST /api/reports` intake (+ DB-backed per-user
  rate limit). [M7]
- `apps/server/src/modules/admin-reports.ts` — NEW: admin queue routes (transactional). [H4]
- `apps/server/src/index.ts` — extract a `buildApp()` factory (see Test harness) + register
  `reportRoutes` + `adminReportsRoutes`.
- `apps/server/test/…` — NEW integration tests (see below). [M8]

**Web (player app):**
- `apps/web/src/features/moderation/ReportPlayerModal.tsx` — NEW shared modal.
- `apps/web/src/features/messages/MessagesPage.tsx` — per-message "Report this message" on the
  other person's bubbles.
- `apps/web/src/features/friends/FriendsPage.tsx` — "Report player" in the Player Profile modal
  (`setProfileId` view). (NOT `ProfilePage.tsx` — that's the user's own profile.)

**Admin:**
- `apps/admin/src/pages/Moderation.tsx` — NEW queue page.
- `apps/admin/src/pages/Players.tsx` — show `openReportsAgainst`. [M9]
- `apps/admin/src/App.tsx` — import + route + nav (drop `/moderation` P2 badge).

## Error handling

- Intake: self/bot/deleted-accused → 400; missing note on a profile report → 400; DM evidence
  failures (non-DM channel / not the accused's message / not the DM pair) → 400; over quota →
  429 `RATE_LIMITED`; dedupe P2002 → 409 `ALREADY_REPORTED`.
- Queue: already-resolved report → 409 `REPORT_RESOLVED` (the atomic OPEN-claim guarantees this
  even under concurrent mods); mute/ban on a deleted accused → 409 `ACCUSED_GONE`; not-found →
  `err.notFound`.
- Guest reporter → 403 `GUEST_CANNOT_REPORT`.
- Sanction failures roll back the whole transaction (report stays OPEN) — no half-applied state.
- **No new `errors.ts` helpers needed** — the invented codes ship as overrides on existing
  helpers (confirmed `errors.ts:20-21`): `ALREADY_REPORTED` / `ACCUSED_GONE` / `REPORT_RESOLVED`
  via `err.conflict(code, msg)` (409); `RATE_LIMITED` via `err.tooMany()` (429, its default
  code); `GUEST_CANNOT_REPORT` via `err.forbidden(code, msg)` (403). All go through the app's
  standard envelope (`{ error: { code, message } }`). The 429 is thrown from the handler (the
  atomic guarded insert returned 0 rows), not the rate-limit plugin, so it uses that envelope.

## Testing / verification (M8)

**Test harness (prerequisite).** The server currently runs `vitest run --passWithNoTests`
(confirmed `package.json:16`) and `index.ts` builds the app and `listen()`s inline at module
load (`index.ts:34,108,119`) — nothing to exercise without opening a socket. Concretely:

- **Factory split (HTTP-only).** Extract **`buildApp(): Promise<FastifyInstance>`** that registers
  plugins + error-handler + routes and returns **without** `.listen()` and **without** creating
  the Socket.IO server. `main()` becomes `buildApp().then(app => { app.listen(...); /* then */
  new IOServer(app.server,…) + registerRealtime })`. Realtime stays in `main()` after listen —
  `inject()` tests are HTTP-only and never touch sockets, so realtime is out of test scope. Note:
  importing `buildApp` eagerly parses env (`config/env.ts` runs `schema.parse` at import), so the
  test process must supply a reachable `DATABASE_URL`.
- **Isolation = truncate against a dedicated test DB (one strategy, decided).** Drop any
  "per-test transaction rollback" idea — it's **unworkable here**: handlers open their own
  `prisma.$transaction` on the shared singleton (`db/client.ts`), so an outer test transaction
  can't wrap/roll back their writes, and the required transaction-race test needs *committed*
  transactions. Instead, an `afterEach` runs `TRUNCATE "Report","AuditLog","Message",
  "ChannelMember","Channel" RESTART IDENTITY CASCADE` (+ any `User` rows the test created),
  leaving durable seed rows (bots, store catalog) intact.
- **Test DB bootstrap.** Point tests at a throwaway DB via `TEST_DATABASE_URL` / `.env.test`
  (NEVER the dev `DATABASE_URL` in `apps/server/.env` — the suite mutates data). Add a local
  pre-test migrate step (`pretest` script or documented `prisma migrate deploy`). CI already
  migrates at `ci.yml:49`, so no CI change is needed.
- **Auth helper.** Tests authenticate by seeding a `User` and minting a token via
  `signAccess({ sub, isGuest, adminRole })` (`src/auth/tokens.ts`), passed to `inject()` as
  `cookies: { [COOKIE.access]: token }` (`COOKIE.access === "fd_access"`) or a Bearer header.
  Add a shared `authFor(user)` helper. **For the H5 test, deliberately sign a STALE token**
  (adminRole present) against a banned/demoted/deleted DB row, to prove the DB reload overrides
  the token — do NOT obtain it via a normal login.
- The concurrency race test issues two `inject()` calls with `Promise.all`. This harness is
  reusable by future server tests, so it's worth doing once here.

**Structured logging / audit payloads.** Each intake + resolution path emits a structured log
(`app.log.info({...})`) and, for mutations, an `AuditLog` row. Documented shapes so tests can
assert them and ops can grep:
- create → log `{ evt:"report.create", reporterId, accusedId, context, reason }`
- dedupe reject → log `{ evt:"report.dedupe_blocked", reporterId, accusedId }` (no audit — no mutation)
- rate-limit reject → log `{ evt:"report.rate_limited", reporterId, recentCount }`
- resolve/dismiss → audit `{ action:"report.dismiss"|"report.resolve.mute"|"report.resolve.ban",
  targetType:"report", targetId, before:{status:"OPEN"}, after:{status,resolution}, reason }`
  (+ the sanction's own `user.mute`/`user.ban` audit row for mute/ban)
- stale/conflict → log `{ evt:"report.conflict", id, kind:"resolved"|"accused_gone" }` (no audit)

**Required server integration tests (via `inject()`):**
- **Intake auth:** unauthenticated → 401; authenticated happy path creates a Report (DM + profile).
- **Dedupe:** second OPEN report same reporter→accused → 409 `ALREADY_REPORTED`; allowed again
  after the first is resolved (proves the partial index is OPEN-scoped, not all-status).
- **DM evidence validation:** rejects (a) non-DM channel, (b) `messageId` not authored by the
  accused, (c) reporter/accused not the DM pair → 400; valid case snapshots `excerpt`.
- **Profile report:** requires a non-empty `note` (400 without); snapshots `profileSnapshot`.
- **Self/bot/guest guards:** self-report and bot-report → 400; **guest reporter → 403
  `GUEST_CANNOT_REPORT`**.
- **Rate-limit (M7 tests):** 6th report within the hour → 429 `RATE_LIMITED`; **two different
  users behind the same IP** each get their own quota (user B's 1st is NOT blocked by user A's
  5); the 429 body uses the app's standard error envelope (`{ error: { code, message } }`);
  **concurrency:** N simultaneous reports from one reporter (via `Promise.all` of `inject()`)
  create **at most 5 rows** — proves the atomic guarded insert closes the TOCTOU.
- **Admin RBAC:** SUPPORT hitting the queue → 403; the hardened `requireAdmin` rejects a
  now-banned / now-demoted / now-deleted admin whose token still claims admin (H5).
- **Pagination stability:** with several reports sharing an identical `createdAt`, the
  `(createdAt desc, id desc)` cursor walks all rows with no dupes and no gaps.
- **Stale 409:** resolving an already-resolved report → 409 `REPORT_RESOLVED`; not double-sanctioned.
- **Deleted-accused:** mute/ban on a report whose `accusedId` is null → 409 `ACCUSED_GONE`;
  dismiss on the same report → succeeds.
- **Transaction race:** two concurrent mute/ban on the same OPEN report → exactly one sanction
  applied, the other 409s; the accused's `mutedUntil`/`bannedUntil` reflects one action; audit
  rows consistent with the winner.

Web/admin have no test harness (no `"test"` script) → those paths are verified manually.

Manual E2E (prod-like): file a DM report (per-message) and a profile report → both appear in the
queue → Dismiss removes from OPEN; Mute applies the mute + resolves + writes AuditLog (no email,
per current behavior); Ban applies + resolves + emails the accused; dedupe + rate-limit behave;
"Queue clear" vs filtered-empty states render correctly; deleted-accused disables Mute/Ban;
SUPPORT sees the count on player detail but not the queue.

Deploy verification: `/api/reports` returns 401 unauthenticated; `/api/admin/reports…` return
401 unauthenticated (exist + guarded); admin `/moderation` renders.

## Migration & rollout

- One Prisma migration: `Report` + 2 enums (additive; zero changes to existing table columns →
  no risk to live data) + the partial-unique-index raw SQL. Applied to prod via the established
  deploy path (`prisma migrate deploy` on Railway — `railway.server.json`; also `ci.yml:49`).
- **Authoring procedure (partial index).** Prisma's schema DSL can't express a `WHERE`-partial
  index, so author with **`prisma migrate dev --create-only --name reports_queue`** to scaffold
  the additive table + enums + FK indexes, then **hand-append**
  `CREATE UNIQUE INDEX report_open_unique ON "Report" ("reporterId","accusedId") WHERE status='OPEN';`
  to the generated `migration.sql` before running. Do NOT run a plain `migrate dev` (it would
  omit the partial index → the P2002 dedupe path silently breaks; the dedupe integration test
  catches this in CI, but avoid the churn). Maintainer note: because the index isn't in
  `schema.prisma`, a later `migrate dev` for an unrelated change will emit a spurious
  `DROP INDEX report_open_unique` in its diff — delete that line before committing. This is
  local-authoring friction only; `migrate deploy` (prod + CI) replays committed SQL verbatim and
  never drifts. (Precedent: the existing `LedgerEntry` raw-SQL index round-trips cleanly because
  its name matches Prisma's `_key` default; this partial index has no schema equivalent, hence
  the note.)
- The **sanctions refactor** is backward-compatible (same external behavior). The
  **`requireAdmin` hardening is an intentional behavior change** (see H5): banned/demoted/
  deleted admins lose access on the next request. Both ship in the same server deploy. No admin
  currently relies on stale-token access, so no rollout coordination is needed beyond deploying.
- Ship server + web + admin together.
