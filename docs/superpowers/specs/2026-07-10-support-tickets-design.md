# Support Tickets (Phase 3) — Design

**Date:** 2026-07-10
**Status:** Design — implementation-ready pending user sign-off → plan
**Context:** FilipinoDama Royal, admin console Phase 3. Phase 1 (Store/Live-ops/Guilds/Matches),
Phase 1.5 (Reports queue), and Phase 2 (Admins/Settings/Campaigns) are live. This adds a
first-party **support ticket** system: a logged-in player files a ticket from the existing
`/contact` page, and SUPPORT staff triage/reply/resolve it from a new admin `Support` section.
It replaces the current `ContactPage` mailto-only flow (for logged-in players) with a real
persisted thread, mirroring the Reports-queue architecture (queue + notify-the-player +
transactional resolution + full audit).

This spec expands the Phase-3 sketch at the end of `docs/superpowers/specs/2026-07-10-admin-phase2-design.md`
(lines 316-327).

## Goal

Give players a reliable in-app support channel and give SUPPORT staff a queue to read, reply, and
resolve tickets — every staff action audited, and every staff reply pushed to the player as a
bell `Notification`. Match the approved `secTickets` design in
`handoffv2/FilipinoDama Admin.dc.html` (lines 879-950): filter chips, a two-column list + thread
detail with a reply composer and a Resolve/Reopen button, and a "Select a ticket" empty state.

## Scope

**In (Phase 3):**
- Two new models: `Ticket` + `TicketMessage` (the reply thread). One additive migration.
- **Player intake:** wire the EXISTING `apps/web/src/features/contact/ContactPage.tsx` to
  `POST /api/support/tickets` for **logged-in** players → creates a `Ticket` + the first
  (player-authored) `TicketMessage`. Logged-out visitors keep the mailto fallback (decided below).
- **Admin queue** `apps/admin/src/pages/Support.tsx` (SUPPORT-gated):
  `GET /admin/tickets` (list, filter by status), `GET /admin/tickets/:id` (thread),
  `POST /admin/tickets/:id/reply` (staff `TicketMessage` `isStaff=true` + a player `Notification`),
  `POST /admin/tickets/:id/resolve`. All mutations audited.
- Server integration tests via the existing `buildApp()`/`inject()` harness.

**Deferred (not this build):**
- **Priority** and **pending** status. The approved mockup shows a `priority` badge and a
  `pending` filter; this build ships **status = `open | resolved` only** (as the task specifies)
  and **no priority field**. The admin page renders a fixed neutral priority chip ("Normal") so
  the approved markup is satisfied without inventing a data source we don't have (Hard-rule 1:
  never fabricate data). Adding a real `priority` enum + a `pending` (awaiting-player) state is a
  clean additive follow-up.
- **Reopen after resolve.** The mockup has a Reopen affordance behind `canReopen` (default false).
  Out of scope this build — a resolved ticket is terminal here. (Staff can tell the player to file
  a new one; adding reopen later is one endpoint + one status transition.) The page hides the
  Reopen button (its `canReopen` is always false), matching the mockup's default.
- **Staff-initiated tickets / internal notes / attachments / email replies.** Staff reply only
  in-thread; the player is notified via the bell. No file uploads.
- **Player-side thread view.** This build notifies the player of a reply via the bell
  `Notification` (title/body carry the reply); a dedicated in-app "My tickets" thread reader is a
  follow-up. The notification's `data` carries `{ ticketId }` so a future reader can deep-link.
- Auto-assignment, SLA timers, canned responses, CSAT.

## Decision — logged-out intake: keep the mailto fallback (recommended)

**Recommendation: hybrid.** Logged-in players POST a real ticket; logged-out visitors keep the
existing `mailto:` fallback. Rationale:

- A ticket must attach to a real `userId` to be actionable (the whole value of the queue is that
  SUPPORT can see *who* filed it, view their account, and notify them back). An anonymous ticket
  has no account to act on and no bell to notify — it would be a write-only inbox that reproduces
  the mailto's weakness while adding a spam surface (guests, like in the Reports design, are the
  spam vector — see `reports.ts:24` `GUEST_CANNOT_REPORT`).
- `/contact` is a **public route** (it's linked from the marketing/legal footer and reachable
  signed-out). Forcing login there would block a legitimate "I can't log in" support request —
  exactly the person who most needs support. The mailto fallback keeps that path open with zero
  new backend and no honest-delivery regression (the current page already opens the user's mail
  client, which genuinely delivers).
- So: **if `me` (logged in) → POST the ticket; else → the existing mailto flow.** Guests
  (`me.isGuest`) are treated as logged-out for intake (mailto), so a throwaway guest can't spam
  the queue — the endpoint itself also rejects guests server-side (defense in depth).

This is strictly additive to the existing page: the mailto code path stays; a new branch handles
the authenticated case.

## Data model — two new tables (one additive migration)

```prisma
enum TicketStatus {
  OPEN
  RESOLVED
}

model Ticket {
  id         String        @id @default(cuid())

  // The player who filed it. SetNull (not Cascade) so the ticket + thread survive a
  // hard account delete for the support record; a snapshot keeps it human-readable.
  userId     String?
  user       User?         @relation("ticketsFiled", fields: [userId], references: [id], onDelete: SetNull)
  userName   String        // snapshot: "username#tag" at file time
  userEmail  String?       // snapshot: the player's email at file time (staff-visible; from account)

  category   String        // "General" | "Account" | "Bug Report" | "Billing" (matches ContactPage CATEGORIES)
  subject    String        @db.Text
  status     TicketStatus  @default(OPEN)

  resolvedById String?     // staff who resolved it (nullable FK, SetNull)
  resolvedBy   User?       @relation("ticketsResolved", fields: [resolvedById], references: [id], onDelete: SetNull)
  resolvedAt   DateTime?

  createdAt  DateTime      @default(now())
  updatedAt  DateTime      @updatedAt   // bumped on every new message so the list can sort by "last activity"

  messages   TicketMessage[]

  @@index([status, updatedAt])   // serves the default queue: open tickets, most-recently-active first
  @@index([userId])
}

model TicketMessage {
  id         String    @id @default(cuid())

  ticketId   String
  ticket     Ticket    @relation(fields: [ticketId], references: [id], onDelete: Cascade)

  // Author SetNull so a message survives the author's account delete; isStaff records
  // which side wrote it (drives the thread bubble alignment + the "notify the player" rule).
  authorId   String?
  author     User?     @relation("ticketMessages", fields: [authorId], references: [id], onDelete: SetNull)
  authorName String    // snapshot: "username#tag" (or staff display) at write time
  isStaff    Boolean   @default(false)
  body       String    @db.Text

  createdAt  DateTime  @default(now())

  @@index([ticketId, createdAt])
}
```

Add these back-relations on `User` (mirrors the `reportsMade/Against/Resolved` block at
`schema.prisma:82-84`):

```prisma
ticketsFiled    Ticket[]        @relation("ticketsFiled")
ticketsResolved Ticket[]        @relation("ticketsResolved")
ticketMessages  TicketMessage[] @relation("ticketMessages")
```

**Design decisions:**
- **`status = open | resolved` only** (task-specified). No `priority`, no `pending` (deferred).
- **Snapshots** (`userName`, `userEmail`, `authorName`) captured **server-side at write time**
  (anti-fabrication + evidence durability) — identical rationale to the Report model's
  `reporterName`/`accusedName` snapshots (`schema.prisma:320,323`). The client never supplies them.
- **`updatedAt @updatedAt`** is Prisma-maintained; we additionally bump it explicitly on a staff
  reply so the queue's "most recent activity" order is correct even when only a child message
  changes (a child `TicketMessage.create` does NOT touch the parent's `@updatedAt` on its own).
- `TicketMessage` is `onDelete: Cascade` from `Ticket` (deleting a ticket takes its thread), but
  we never hard-delete tickets in this build — cascade is just correct hygiene.
- No partial-unique index or dedupe needed (unlike Reports): a player may legitimately open many
  tickets. Spam is bounded by the rate limit below, not by uniqueness.

## Player intake — `POST /api/support/tickets`

New module `apps/server/src/modules/support.ts`, registered under `/api` (so the route is
`/api/support/tickets`), following the `reports.ts` intake shape exactly.

**Request body:** `{ category, subject, message }`.

**Zod schema** (matches `ContactPage` field constraints):
```ts
const bodySchema = z.object({
  category: z.enum(["General", "Account", "Bug Report", "Billing"]),  // === ContactPage CATEGORIES
  subject: z.string().trim().min(1).max(160),
  message: z.string().trim().min(10).max(4000),   // min 10 mirrors ContactPage MIN_MESSAGE_LENGTH
});
```

**Server logic:**
1. `requireAuth` (live-status checked — a banned/deleted account is already rejected there,
   `guards.ts:46-57`). Filer = `req.userId`.
2. **Guest block (decided):** reject `req.isGuest === true` → 403 `GUEST_CANNOT_FILE`
   ("Guests can't file support tickets") — same anti-spam stance as `GUEST_CANNOT_REPORT`
   (`reports.ts:24`). `req.isGuest` is populated by `attachUser` (`guards.ts:34`).
3. Parse the body (over-length / too-short / bad category → 400 via zod).
4. Load the filer for the snapshot: `prisma.user.findUnique({ where:{id:userId},
   select:{ username:true, tag:true, email:true } })`. `userName = ${username}${tag}`,
   `userEmail = email ?? null`.
5. **Rate-limit — atomic advisory-locked insert (reuse the Reports pattern exactly).** Cap: **5
   new tickets per user per hour**. Same TOCTOU concern and the same fix as `reports.ts:60-77`:
   `prisma.$transaction` → `SELECT pg_advisory_xact_lock(hashtext(${userId}))` → an
   `INSERT ... SELECT ... WHERE (SELECT count(*) FROM "Ticket" WHERE "userId"=$1 AND "createdAt"
   >= now() - interval '1 hour') < 5`. **0 rows → 429 `RATE_LIMITED`**. (The advisory lock
   serializes same-user requests so N concurrent files can't all pass the count guard — the
   Reports spec proved a bare `INSERT..SELECT..WHERE count<N` is NOT atomic at READ COMMITTED.)
   The first `TicketMessage` is created **in the same transaction** after the ticket row is
   confirmed inserted, so a rate-limited attempt writes neither row.
6. Create the ticket + first message atomically. The first message is the player's:
   `isStaff:false, authorId:userId, authorName:userName, body:message`.
7. Structured log `req.log.info({ evt:"ticket.create", userId, ticketId, category })`.
   Return `ok({ id })`.

**No audit on intake** — like report creation (`reports.ts` writes no AuditLog on create), a
player action isn't an admin mutation. Only staff mutations (reply/resolve) are audited.

**Concrete insert (mirrors `reports.ts:61-77`):**
```ts
const id = cuid();
const inserted: number = await prisma.$transaction(async (tx) => {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
  const n = await tx.$executeRaw`
    INSERT INTO "Ticket" ("id","userId","userName","userEmail","category","subject","status","createdAt","updatedAt")
    SELECT ${id}, ${userId}, ${userName}, ${userEmail}, ${b.category}, ${b.subject}, 'OPEN'::"TicketStatus", now(), now()
    WHERE (SELECT count(*) FROM "Ticket" WHERE "userId" = ${userId} AND "createdAt" >= now() - interval '1 hour') < 5
  `;
  if (n === 1) {
    await tx.ticketMessage.create({ data: { ticketId: id, authorId: userId, authorName: userName, isStaff: false, body: b.message } });
  }
  return n;
});
if (inserted === 0) throw err.tooMany("RATE_LIMITED", "You're filing tickets too fast — try again later");
```
`cuid()` here is the same `` `tk_${randomUUID()}` `` helper style as `reports.ts:20`.

### Client wiring — `apps/web/src/features/contact/ContactPage.tsx`

Minimal, additive change to the existing page (read in full: it already has `name/email/category/
subject/message` state, `CATEGORIES`, `MIN_MESSAGE_LENGTH`, `me` from `useAuthStore`, and a
`handleSend`). The page keeps its mailto path; `handleSend` must be **restructured**, not just
appended to.

**Why a restructure, not an append:** `handleSend` currently opens with a single guard —
`if (!name.trim() || !email.trim() || !subject.trim()) { showToast(...); return; }`
(`ContactPage.tsx:86-89`) — that runs unconditionally, before any branching. For a logged-in
non-guest, `email` state is initialized as `me?.email ?? ""`; if the account's email is `null`
(the exact case the intake endpoint tolerates — see the Null-email test above), `email` is `""`,
and since the email input is hidden for logged-in users (see below) the user has no way to fill
it. That guard fires every time and the authenticated user can **never submit**, even though the
server has no such requirement. Fix: put the auth check first and give each branch its own,
independent validation — do not let the name/email guard run ahead of the branch check.

- **Logged-in, non-guest** (`me && !me.isGuest`) — checked **first**, before the
  name/email/subject guard: validate **only** `subject` non-empty and `message` length
  (`>= MIN_MESSAGE_LENGTH` and `<= 4000`, matching the server's zod bounds) — do **not** gate this
  branch on `name`/`email` at all. On passing that check, call
  `api.post("/api/support/tickets", { category, subject, message })` (the web `api` client at
  `apps/web/src/lib/api.ts:60`, which unwraps the envelope and sends the session cookie; note the
  POST body is `{ category, subject, message }` only — no `name`/`email`, matching the server's
  zod schema).
  - Success → set the success panel exactly as today, but the ticket reference is the **real
    server `id`** (not the client-generated `makeTicket()` stub), and the copy changes from
    "on its way to support@…" to "Our support team has your ticket and will reply in your
    notifications." (honest: it's persisted, and the reply arrives via the bell). `name`/`email`
    inputs are hidden/read-only for logged-in users (we already know them; the schema doesn't
    take them — they're snapshotted server-side from the account).
  - Error handling via the `ApiError` the client throws: `RATE_LIMITED` (429) → toast "You're
    filing tickets too fast — please wait a bit."; `GUEST_CANNOT_FILE` shouldn't happen (guests
    take the mailto branch) but if it does, fall back to mailto; any other error → toast the
    message + leave the form filled so nothing is lost.
- **Logged-out / guest** (the `else` branch): the EXISTING
  `if (!name.trim() || !email.trim() || !subject.trim())` guard (`ContactPage.tsx:86-89`) is
  **kept, but scoped to only this branch** — here `name`/`email` inputs remain visible and
  required, so the guard is meaningful. Below the guard, the rest of the existing `mailto:` path
  is unchanged (opens the mail client, shows the client-side `FDR-…` reference). Keep
  `makeTicket()` for this branch only.

`CATEGORIES` already equals the server enum, so no mapping is needed. No new web design tokens —
reuse the page's existing styles.

## Admin queue — `/support` section

**Server module** `apps/server/src/modules/admin-support.ts`, registered like the other `admin-*`
plugins under `/api` (routes `/admin/tickets…`; client calls `/api/admin/tickets…`). **All routes
`requireAdmin("SUPPORT")`** (matches `SECROLE.tickets='SUPPORT'` in the mockup, HTML line 1371,
and `ticket.handle:['SUPPORT',…]` line 1367). All mutations audited.

### `GET /admin/tickets?status=&cursor=&limit=`
List, cursor-paginated, following the `admin-reports.ts:22-44` list pattern verbatim.
- **Query:** `status` ∈ `{OPEN, RESOLVED}` default `OPEN`; `cursor?`; `limit` 1-100 default 50.
- **Order:** `orderBy: [{ updatedAt: "desc" }, { id: "desc" }]` (most-recently-active first;
  secondary `id desc` disambiguates equal timestamps so the bare-`id` cursor is stable — same
  reasoning as the Reports queue, spec lines 216-223). Cursor is the bare last-row `id` with
  `cursor:{id}, skip:1`.
- **Row shape:** `{ id, category, subject, status, createdAt, updatedAt, msgCount,
  user: (live { id, username, tag, avatarUrl } when the account still exists, else the snapshot
  { username: userName, tag:"", avatarUrl:null, id:null }), userName, userEmail,
  userGone: userId === null }`. `msgCount` via `_count: { select: { messages: true } }`.
  (No `note`/thread body in the list — the thread comes from the detail endpoint.)
- **Privacy note:** the list and detail both expose `userEmail` (the snapshot column) to
  SUPPORT-role staff. That's PII. This is an intended privacy decision, not an oversight — SUPPORT
  staff need the player's email to help them (e.g. correlating a "can't log in" ticket with the
  account, or replying off-platform in edge cases) — but it's worth naming explicitly since it's a
  new PII surface for the admin console. No behavior change: `userEmail` stays in both responses.
- Return `ok({ items, nextCursor })`.

### `GET /admin/tickets/:id` — the thread
- Load the ticket + its messages ordered `createdAt asc`, with each author's live
  `{ id, username, tag, avatarUrl }` (fallback to `authorName` snapshot when the author is gone).
- 404 `NO_TICKET` if not found.
- Return `ok({ ticket: { id, category, subject, status, createdAt, updatedAt, userGone,
  user, userName, userEmail, resolvedAt, canResolve: status === "OPEN", canReopen: false },
  thread: messages.map(m => ({ id, isStaff, authorName, author (live-or-null), body, createdAt })) })`.
  `canResolve`/`canReopen` drive the mockup's `sc-if` buttons (HTML lines 934-935).

### `POST /admin/tickets/:id/reply` — staff reply + notify the player
`{ body }` (zod: `z.string().trim().min(1).max(4000)`). One transaction (mirrors the Reports
transactional-resolution shape, `admin-reports.ts:54-79`, and reuses `audit(tx, …)` — the
tx-widened audit at `audit.ts:9-10`):

1. `tx.ticket.findUnique({ where:{id}, select:{ id:true, status:true, userId:true } })`.
   Not found → 404 `NO_TICKET`. **Resolved ticket → 409 `TICKET_RESOLVED`** ("Reopen isn't
   supported; this ticket is resolved" — no reply on a closed ticket this build).
2. Snapshot the staff author name: load `req.userId`'s `username`/`tag`
   (`staffName = ${username}${tag}`).
3. Create the staff message: `tx.ticketMessage.create({ data: { ticketId:id, authorId:req.userId,
   authorName:staffName, isStaff:true, body } })`.
4. **Bump activity:** `tx.ticket.update({ where:{id}, data:{ updatedAt: new Date() } })` (so the
   queue re-sorts this ticket to the top; a child insert alone wouldn't move the parent).
5. **Notify the player** (only if `ticket.userId !== null` — the account may be gone). Create a
   `Notification` (reuse the exact model + the Campaigns precedent `admin-campaigns.ts:57`):
   `tx.notification.create({ data: { userId: ticket.userId, type: "support_reply",
   title: "Support replied to your ticket", body: body.slice(0, 140),
   data: { ticketId: id } } })`. The bell feed already renders arbitrary `type`s
   (`notifications.ts` only *hides* `HIDDEN_TYPES`; `support_reply` is NOT hidden → it shows +
   counts as unread). Creating the Notification **inside the transaction** guarantees "reply
   written ⇔ player notified" atomically (no half-state).
6. `audit(tx, { actorId: req.userId, action: "ticket.reply", targetType: "ticket", targetId: id,
   after: { messageId: <new msg id>, notified: ticket.userId !== null }, reason: <first 120 chars
   of body> })`.
7. Return `ok({ id })`. Structured log `{ evt:"ticket.reply", ticketId, staffId, notified }`.

**Why notify inside the tx (not after-commit like the ban email):** a `Notification` is a plain
DB row on the same Postgres, not a side-effecting external call — so it belongs in the
transaction (unlike the ban email, which the Reports design deliberately sends *after* commit,
`admin-reports.ts:77`). This is the "notify the player" reuse the task calls for, done
transactionally.

### `POST /admin/tickets/:id/resolve`
`{ reason }` (zod `reasonBody`, same as `admin-reports.ts:18`: `min(1).max(500)`). Atomic
OPEN-claim, identical shape to the report dismiss/resolve claim (`admin-reports.ts:47-60`):

1. `const claimed = await tx.ticket.updateMany({ where:{ id, status:"OPEN" }, data:{
   status:"RESOLVED", resolvedById:req.userId, resolvedAt:new Date(), updatedAt:new Date() } })`.
2. `if (claimed.count === 0)` → 409 `TICKET_RESOLVED` ("Ticket already resolved"). The atomic
   `WHERE status='OPEN'` update means exactly one of two concurrent staff wins; the loser's count
   is 0 (same guarantee as the Reports queue's concurrent-mod test).
3. `audit(tx, { actorId:req.userId, action:"ticket.resolve", targetType:"ticket", targetId:id,
   before:{status:"OPEN"}, after:{status:"RESOLVED"}, reason })`.
4. **Optionally notify the player** that their ticket was resolved: create a
   `Notification` (`type:"support_resolved", title:"Your support ticket was resolved",
   body:<subject>, data:{ ticketId:id }`) inside the same tx. (Decided: yes — closing the loop for
   the player is the point of the system.)
5. Return `ok({ status:"RESOLVED" })`.

### Admin page — `apps/admin/src/pages/Support.tsx`

Matches the approved `secTickets` markup (HTML lines 879-950), approved admin CSS tokens/classes
only, consuming via `api.get` and mutating via `useAdminMutation` (`apps/admin/src/lib/ui.tsx:105`),
exactly like `Moderation.tsx`.

- **Filter chips** (`ticketFilters`): `Open` / `Resolved` (the mockup's `open/pending/resolved` →
  `pending` dropped this build). Chip styling per the mockup (HTML line 1821); selected chip =
  gold. Default `Open`.
- **Two-column layout** (`grid-template-columns:1fr 1.3fr`, HTML line 887): the ticket **list**
  left, the **detail thread** right (`position:sticky`, HTML line 909).
- **List rows** (HTML lines 890-905): per-ticket card with the user's initials avatar, the
  monospace ticket `id`, a **fixed neutral priority chip labeled "Normal"** (no data source →
  no fabricated priority; the mockup's `prioStyle` slot is filled with one neutral token), the
  `subject` (ellipsized), a `status` badge (Open = amber/gold token, Resolved = green token per
  the mockup's `statusStyle`), and the `user #tag · category · relative-time` metaline.
  Clicking a row loads the detail (`GET /admin/tickets/:id`).
- **Detail** (HTML lines 909-947): header (`id`, status badge, neutral priority chip, `subject`
  in Cinzel, `user #tag · email · category`), a scrollable **thread** (`thread.map`) with
  player bubbles left / staff bubbles right keyed off `m.isStaff` (bubble/meta alignment per
  HTML lines 923-928), a **reply `<textarea>`** + **Send reply** (gold) and **Resolve** (green,
  shown when `canResolve`) buttons (HTML lines 930-936). **Reopen is hidden** (`canReopen` always
  false). A `✕` closes the detail back to the list.
- **Empty states:** "No tickets in this view." for an empty filtered list (HTML line 906); the
  "📨 Select a ticket" placeholder when nothing is selected (HTML lines 940-946).
- **Mutations:** Send reply → `POST /admin/tickets/:id/reply` via `useAdminMutation`, then refetch
  the thread + list. Resolve → confirm→reason modal (the shared `useAdminMutation` flow, same as
  Moderation's Dismiss/Mute) → `POST /admin/tickets/:id/resolve`, then refetch. On a
  `TICKET_RESOLVED` 409 (another staffer beat you), surface it and refetch so the UI re-syncs.

### Nav / routing — `apps/admin/src/App.tsx`
The `/support` nav entry already exists (line 35, `["/support","Support","#5fd08a",
"Players & safety","SUPPORT", true]`) and currently routes to the Phase-2 stub (line 186). Swap it
to the real page:
- `import { Support } from "./pages/Support";`
- Replace the `/support` stub `<Route>` (line 186) with `<Route path="/support" element={<Support />} />`.
- **Drop the P2 flag** on the `/support` NAV entry (remove the trailing `true` at line 35) so the
  "P2" badge disappears and the count badge can show open-ticket count later. Min-role stays
  `SUPPORT` (no change; matches the server gate). The `TITLES["/support"]` entry
  (`["Player Support","Support tickets"]`, line 57) already exists — no change.

**Open-ticket count badge (optional, matches the mockup):** the mockup shows a live count on the
Support nav item (`tickets:s.tickets.filter(t=>t.status==='open').length`, HTML line 1746). If the
admin shell already fetches per-section counts for the Moderation badge, add `GET /admin/tickets?
status=OPEN&limit=1` isn't count-shaped — instead expose the open count wherever the Moderation
open-report count is sourced. If no such shared count fetch exists yet, omit the badge this build
(don't fabricate) — it's a pure additive follow-up.

## Files touched

**Server:**
- `apps/server/prisma/schema.prisma` — add `TicketStatus` enum + `Ticket` + `TicketMessage`
  models + the 3 User back-relations. One additive migration (zero changes to existing columns).
- `apps/server/src/modules/support.ts` — NEW: `POST /api/support/tickets` intake (advisory-locked
  rate limit; ticket + first message in one tx).
- `apps/server/src/modules/admin-support.ts` — NEW: `GET /admin/tickets`, `GET /admin/tickets/:id`,
  `POST /admin/tickets/:id/reply` (staff msg + notification, transactional), `POST /admin/tickets/
  :id/resolve` (atomic OPEN-claim). All `requireAdmin("SUPPORT")`, all mutations `audit(tx, …)`.
- `apps/server/src/index.ts` — `import { supportRoutes }` + `import { adminSupportRoutes }`;
  `await app.register(supportRoutes, { prefix: "/api" })` and `adminSupportRoutes` next to the
  other `admin-*` registrations (near `index.ts:106`). No new plugins/deps.
- `apps/server/test/support-intake.test.ts` + `apps/server/test/admin-support.test.ts` — NEW
  (see Testing).
- **`apps/server/test/helpers.ts` — MODIFIED (shared file).** Two edits, both additive:
  - **`truncateAll()` TRUNCATE list.** Today `truncateAll()` (`helpers.ts:53-59`) runs
    `TRUNCATE "Report", "AuditLog", "Message", "ChannelMember", "Channel" RESTART IDENTITY CASCADE`
    — a **fixed list that does NOT include `Ticket` or `TicketMessage`**. This task **must edit
    that TRUNCATE list to add `"Ticket"`** (the FK from `TicketMessage` means
    `RESTART IDENTITY CASCADE` on `Ticket` clears `TicketMessage` too — no need to list
    `TicketMessage` separately). **`truncateAll()` does NOT truncate `Notification`** either — that
    table has never been in the shared list; the Reports/Campaigns tests instead `deleteMany` their
    own Notification rows in their own `afterEach` (`admin-campaigns.test.ts:5-7`). This build
    follows that exact precedent: it does **not** add `Notification` to `truncateAll()`, and each
    ticket test file `deleteMany`s its own `support_reply`/`support_resolved` Notification rows in
    `afterEach` instead. Since `truncateAll()` is a shared helper, this edit affects every other
    test file that calls it — the change is additive (one more table name in the list) and safe.
  - **`seedUser()` email override.** Today `seedUser` (`helpers.ts:25-49`) has **no `email` field
    in its overrides type and never sets `email` on the created row** — every seeded user gets
    Prisma's column default (`null`), and there is no way to seed a non-null email. This task
    **must extend `seedUser`'s overrides type to add `email?: string | null`** and pass
    `email: overrides.email ?? null` into the `prisma.user.create({ data: { … } })` call. Without
    this edit, `seedUser({ email: "player@example.com" })` won't compile, and every seeded user's
    email is `null` — so the intake test can never exercise the non-null `userEmail` snapshot
    branch. This is a shared-helper edit (same category as the TRUNCATE-list change above) and is
    purely additive — existing callers that don't pass `email` are unaffected (they still get
    `null`).

**Web (player app):**
- `apps/web/src/features/contact/ContactPage.tsx` — add the authenticated branch in `handleSend`
  (POST the ticket; real server id in the success panel; keep the mailto branch for logged-out/
  guest). Import the web `api` client. No new routes/tokens.

**Admin:**
- `apps/admin/src/pages/Support.tsx` — NEW queue page (approved `secTickets` fidelity).
- `apps/admin/src/App.tsx` — import + real `/support` route; drop the `/support` P2 flag (line 35)
  and stub (line 186).

## Error handling

- **Intake:** guest → 403 `GUEST_CANNOT_FILE`; bad category / over-length subject or message /
  too-short message → 400 (zod); over quota → 429 `RATE_LIMITED`. (Banned/deleted account already
  → 401/403 in `requireAuth`.)
- **Admin reply:** ticket not found → 404 `NO_TICKET`; reply on a resolved ticket → 409
  `TICKET_RESOLVED`; empty/over-length body → 400.
- **Admin resolve:** not found → 404 `NO_TICKET`; already resolved (atomic claim lost) → 409
  `TICKET_RESOLVED`.
- **RBAC:** non-SUPPORT (i.e. no admin role) → 403 `ADMIN_FORBIDDEN` from `requireAdmin("SUPPORT")`
  (`guards.ts:84`); unauthenticated → 401.
- All via the standard envelope + existing `err.*` helpers — **no new `errors.ts` helpers
  needed** (`GUEST_CANNOT_FILE` via `err.forbidden`; `TICKET_RESOLVED` via `err.conflict`;
  `NO_TICKET` via `err.notFound`; `RATE_LIMITED` via `err.tooMany`, its default code —
  `errors.ts:16-22`).
- Sanction/notify failures inside a reply/resolve roll back the whole transaction (message +
  notification are all-or-nothing) — no half-applied state, exactly like the Reports queue's
  transactional resolution.

## Testing / verification

Server integration tests via the existing harness (`buildTestApp()` = `buildApp()` + `ready()`;
`seedUser`; `authFor`; `truncateAll`; `apps/server/test/helpers.ts`). **Precondition:**
`helpers.ts`'s `truncateAll()` must be edited first to add `"Ticket"` to its `TRUNCATE` list (see
Files touched) — without that edit, `Ticket`/`TicketMessage` rows leak across test files and
later tests (e.g. rate-limit counts, list ordering) will see stale rows from earlier runs. Because
`truncateAll()` does not (and, per the Reports/Campaigns precedent, should not) touch
`Notification`, each ticket test file explicitly `deleteMany`s its own
`support_reply`/`support_resolved` Notification rows in its own `afterEach` (exactly like
`admin-campaigns.test.ts:5-13` does for its Notification rows) — do not rely on `truncateAll()` to
clear Notifications. `Ticket`/`TicketMessage` rows need no manual per-test cleanup — the edited
`truncateAll()` handles both. Order per test: file-scoped `afterEach` cleanup (this file's
`support_reply`/`support_resolved` Notification rows) → `truncateAll()`.

**`support-intake.test.ts`:**
- **Auth:** unauthenticated `POST /api/support/tickets` → 401.
- **Guest block:** a `seedUser({ isGuest:true })` token → 403 `GUEST_CANNOT_FILE`; asserts **no
  Ticket row** was created.
- **Happy path:** a real player seeded via `seedUser({ email: "player@example.com" })` files a
  ticket → 200; a `Ticket` row exists with `status="OPEN"`, `userName`/`userEmail` snapshotted from
  the account (not the request) — assert `Ticket.userEmail === "player@example.com"` (covers the
  non-null snapshot branch, which requires the `seedUser` email-override edit above) —
  `category`/`subject` match; **exactly one `TicketMessage`** exists with `isStaff=false`,
  `authorId = filer`, `body = message`.
- **Null email:** `User.email` is nullable (`schema.prisma:13`, `email String? @unique`). A real
  (non-guest) `seedUser({ email: null })` files a ticket → 200; the created `Ticket.userEmail` is
  `null` (the `userEmail = email ?? null` snapshot in step 4 of Server logic handles a null account
  email without throwing) — assert the row's `userEmail` field is exactly `null`, not the string
  `"null"` or `undefined`. (Requires the `seedUser` email-override edit above — without it,
  `seedUser({ email: null })` doesn't compile.)
- **Validation:** category not in the enum → 400; `subject:""` → 400; message < 10 chars → 400;
  message > 4000 → 400.
- **Rate-limit:** 6th ticket within the hour from one user → 429 `RATE_LIMITED` (asserts only 5
  rows). **Concurrency:** N simultaneous files from one user via `Promise.all` of `inject()`
  create **at most 5** Ticket rows (proves the advisory-lock closes the TOCTOU — the same test
  the Reports quota has). **Per-user independence:** user B's 1st file is NOT blocked by user A's
  5 (the lock/count is keyed on `userId`).

**`admin-support.test.ts`:**
- **RBAC:** a non-admin player hitting `GET /admin/tickets` → 403; a `SUPPORT` admin → 200.
  (Since SUPPORT is the lowest gate, every admin role can access — assert MODERATOR/ECONOMY/
  SUPERADMIN all reach it too, and a role-less user is 403.)
- **List + filter:** seed OPEN and RESOLVED tickets; `?status=OPEN` returns only open, `?status=
  RESOLVED` only resolved; ordered by `updatedAt desc`; `msgCount` correct; `userGone=false` for a
  live filer.
- **Thread:** `GET /admin/tickets/:id` returns the messages in `createdAt asc`, `canResolve=true`
  for OPEN / `false` after resolve, `canReopen=false`; 404 `NO_TICKET` for a bogus id.
- **Reply notifies the player (the key test):** `POST /admin/tickets/:id/reply` → 200; a staff
  `TicketMessage` (`isStaff=true`, `authorId=staff`) is appended; the ticket's `updatedAt` moved;
  **exactly one `Notification` of `type="support_reply"` exists for the ticket's `userId`** with
  `data.ticketId === id`; an `AuditLog` row `action="ticket.reply"` exists. Reply on a **resolved**
  ticket → 409 `TICKET_RESOLVED` (and no message/notification written — assert counts unchanged).
- **Reply when the filer is gone:** set `userId=null` (simulate a SetNull delete) → reply succeeds,
  writes the staff message + audit, and creates **no** Notification (assert count 0) — no crash.
- **Resolve:** `POST /admin/tickets/:id/resolve` → 200; ticket `status="RESOLVED"`, `resolvedById`
  = staff, `resolvedAt` set; `AuditLog` `action="ticket.resolve"` with `before/after`; a
  `support_resolved` Notification for the filer.
- **Concurrent resolve (atomic claim):** two `Promise.all` resolves on the same OPEN ticket →
  exactly one 200, the other 409 `TICKET_RESOLVED`; the ticket has exactly one
  `ticket.resolve` audit row (proves the `updateMany WHERE status='OPEN'` claim, mirroring the
  Reports concurrent-mod test).

Web/admin have no test harness (no `"test"` script) → the ContactPage branch and the `Support.tsx`
page are verified manually.

**Manual E2E (prod-like):**
- Logged-in: file a ticket from `/contact` → success panel shows the real server id → it appears
  in the admin `Support` queue under Open. Staff Send reply → the player sees a **bell
  notification** ("Support replied…"). Staff Resolve → ticket moves to Resolved; the player gets a
  "resolved" notification; the thread's Resolve button is gone (`canResolve=false`).
- Logged-out (or guest): `/contact` still opens the mail client (mailto fallback unchanged).
- RBAC: a MODERATOR/ECONOMY/SUPERADMIN can open Support; a role-less account can't
  (403 → the console's "Not authorized" gate).

**Deploy verification:** `POST /api/support/tickets` → 401 unauthenticated; `/api/admin/tickets…`
→ 401 unauthenticated (exist + guarded); admin `/support` renders the real page (no "P2" badge).

## Migration & rollout

- **One Prisma migration** — `TicketStatus` enum + `Ticket` + `TicketMessage` + the 3 User
  back-relations. **Purely additive** (new enum/tables/relations; zero changes to existing table
  columns → no risk to live data). No raw-SQL partial index needed (unlike Reports), so a plain
  `prisma migrate dev --name support_tickets` is sufficient; applied to prod via the established
  path (`prisma migrate deploy` on Railway — `railway.server.json`; CI migrates at `ci.yml`).
  Regenerate the Prisma client (the CI `prisma generate` rule).
- **No seed change** — tickets are player-generated; nothing to seed.
- **Ship server + web (ContactPage) + admin together.** The `/support` route was already a stub;
  swapping it in is safe. Pre-migration, the intake endpoint doesn't exist, so the ContactPage
  authenticated branch would 404 — hence server + web deploy together.
- **Backward-compatible:** the ContactPage mailto path is preserved for logged-out/guest users, so
  the public contact flow never regresses even for accounts that predate this feature.
