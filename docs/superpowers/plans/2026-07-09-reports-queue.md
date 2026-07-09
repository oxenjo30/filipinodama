# Reports Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let players report other players (from DMs + profiles) and give moderators an audited, transactional queue to triage and act (dismiss/mute/ban).

**Architecture:** A new `Report` model backs a `POST /api/reports` intake (DM evidence via a specific `messageId` verified with the existing `dmRefId` pair-identity; profile evidence via a snapshot) and MODERATOR-gated `/api/admin/reports*` queue routes. Resolution + sanction run in one `$transaction` reusing a new shared `sanctions.ts` (`muteUser`/`banUser`). A pre-existing `requireAdmin` gap (trusts stale JWT role) is hardened in the same deploy. Server integration tests run via a new `buildApp()` factory + `app.inject()` against a dedicated test DB.

**Tech Stack:** Node + Fastify + Prisma + PostgreSQL (server); React 18 + Vite (web + admin); Zod; Vitest.

## Global Constraints

- **Source of truth:** the spec at `docs/superpowers/specs/2026-07-09-reports-queue-design.md`. Every task implicitly inherits it.
- **Every admin mutation** calls `audit(tx-or-db, {...})` with before/after/reason and is gated by `requireAdmin(role)`. No exceptions (compliance).
- **Never fabricate data** — every value shown comes from the DB.
- **Real-money is disabled** — never wire to payments.
- **ESM server:** all server imports use `.js` suffixes. Response envelope: `ok(data)` / `err.*` (`{ ok, data }` / `{ ok:false, error:{code,message} }`).
- **Scope:** DM + profile reporting only (match/room chat is unpersisted — deferred). Guests cannot report.
- **Prisma field names, enum values, and `err.*` helpers are exact** — see the spec + `apps/server/src/lib/errors.ts`.
- **Ship server + web + admin together.** Migration is additive (zero risk to existing columns).

---

## File Structure

**Server:**
- `apps/server/prisma/schema.prisma` — MODIFY: add `Report` model + `ReportReason`/`ReportStatus` enums + 3 `User` back-relations.
- `apps/server/prisma/migrations/<ts>_reports_queue/migration.sql` — CREATE (via `migrate dev --create-only` + hand-appended partial index).
- `apps/server/src/lib/audit.ts` — MODIFY: widen first param to `Prisma.TransactionClient | PrismaClient`.
- `apps/server/src/lib/sanctions.ts` — CREATE: `muteUser(tx,...)` / `banUser(tx,...)`.
- `apps/server/src/auth/guards.ts` — MODIFY: harden `requireAdmin` (live reload + lockout-safe ban policy).
- `apps/server/src/modules/admin.ts` — MODIFY: refactor `/users/:id/mute` + `/ban` onto `sanctions.ts`; self-ban/admin-ban guard; add `openReportsAgainst` to `/users/:id`.
- `apps/server/src/modules/reports.ts` — CREATE: `POST /api/reports` intake.
- `apps/server/src/modules/admin-reports.ts` — CREATE: queue routes.
- `apps/server/src/index.ts` — MODIFY: extract `buildApp()`; register `reportRoutes` + `adminReportsRoutes`.
- `apps/server/vitest.config.ts` — CREATE.
- `apps/server/test/helpers.ts` — CREATE: `authFor`, DB truncate, `buildApp` wiring.
- `apps/server/test/*.test.ts` — CREATE: integration tests.

**Web:**
- `apps/web/src/features/moderation/ReportPlayerModal.tsx` — CREATE.
- `apps/web/src/features/messages/MessagesPage.tsx` — MODIFY: per-message "Report this message".
- `apps/web/src/features/friends/FriendsPage.tsx` — MODIFY: "Report player" in the Player Profile modal.

**Admin:**
- `apps/admin/src/pages/Moderation.tsx` — CREATE.
- `apps/admin/src/pages/Players.tsx` — MODIFY: show `openReportsAgainst`.
- `apps/admin/src/App.tsx` — MODIFY: import + route + drop `/moderation` P2 badge.

Dependency order: **Phase 1** (schema) → **Phase 2** (test harness) → **Phase 3** (audit+sanctions+guards) → **Phase 4** (intake) → **Phase 5** (queue) → **Phase 6** (client). Phases 2 and 3 both depend only on Phase 1 and could interleave, but the plan orders them so tests exist before the code they cover.

---

## Phase 1 — Schema & migration

### Task 1: Report model + enums + migration

**Files:**
- Modify: `apps/server/prisma/schema.prisma`
- Create: `apps/server/prisma/migrations/<ts>_reports_queue/migration.sql`

**Interfaces:**
- Produces: `Report` model, `ReportReason`/`ReportStatus` enums, and the partial unique index `report_open_unique` that later tasks rely on for the `ALREADY_REPORTED` (P2002) path.

- [ ] **Step 1: Add the enums + model to `schema.prisma`** (place near the other social models):

```prisma
enum ReportReason {
  HARASSMENT
  HATE_SPEECH
  CHEATING
  INAPPROPRIATE
  SPAM
  OTHER
}

enum ReportStatus {
  OPEN
  RESOLVED
  DISMISSED
}

model Report {
  id              String       @id @default(cuid())
  reporterId      String?
  reporter        User?        @relation("reportsMade", fields: [reporterId], references: [id], onDelete: SetNull)
  reporterName    String
  accusedId       String?
  accused         User?        @relation("reportsAgainst", fields: [accusedId], references: [id], onDelete: SetNull)
  accusedName     String
  reason          ReportReason
  note            String?      @db.Text
  context         String       // "dm" | "profile"
  channelId       String?
  messageId       String?
  excerpt         String?      @db.Text
  profileSnapshot Json?
  status          ReportStatus @default(OPEN)
  resolvedById    String?
  resolvedBy      User?        @relation("reportsResolved", fields: [resolvedById], references: [id], onDelete: SetNull)
  resolution      String?
  createdAt       DateTime     @default(now())
  resolvedAt      DateTime?

  @@index([status, createdAt])
  @@index([accusedId])
  @@index([reporterId, createdAt])
}
```

- [ ] **Step 2: Add the three back-relations to the `User` model** (in `schema.prisma`, alongside the other `User` relation fields):

```prisma
  reportsMade     Report[] @relation("reportsMade")
  reportsAgainst  Report[] @relation("reportsAgainst")
  reportsResolved Report[] @relation("reportsResolved")
```

- [ ] **Step 3: Scaffold the migration WITHOUT applying (so we can hand-add the partial index)**

Run: `cd apps/server && pnpm exec prisma migrate dev --create-only --name reports_queue`
Expected: creates `prisma/migrations/<ts>_reports_queue/migration.sql` with the `CREATE TABLE "Report"`, the two `CREATE TYPE` enum statements, and the three plain indexes. It does NOT apply yet.

- [ ] **Step 4: Hand-append the partial unique index to the generated `migration.sql`**

Append this exact line at the end of the generated `migration.sql`:

```sql
CREATE UNIQUE INDEX "report_open_unique" ON "Report" ("reporterId", "accusedId") WHERE status = 'OPEN';
```

- [ ] **Step 5: Apply the migration + regenerate the client**

Run: `cd apps/server && pnpm exec prisma migrate dev` (applies the pending migration) then `pnpm exec prisma generate`
Expected: "Your database is now in sync"; the Prisma client now exposes `prisma.report`.

- [ ] **Step 6: Verify the model + partial index round-trip (quick REPL check)**

Run:
```bash
cd apps/server && node -e '
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
p.report.count().then(c => { console.log("report count:", c); return p.$disconnect(); });
'
```
Expected: `report count: 0` (table exists, client is generated).

- [ ] **Step 7: Commit**

```bash
git add apps/server/prisma/schema.prisma apps/server/prisma/migrations
git commit -m "feat(db): add Report model + enums + partial-unique open-report index"
```

---

## Phase 2 — Server test harness

### Task 2: `buildApp()` factory extraction

**Files:**
- Modify: `apps/server/src/index.ts`

**Interfaces:**
- Produces: `export async function buildApp(): Promise<FastifyInstance>` — registers helmet/cors/cookie/rate-limit/error-handler + all REST route plugins, returns WITHOUT `.listen()` and WITHOUT the Socket.IO server. `main()` calls it, then `.listen()`, then wires realtime.

- [ ] **Step 1: Refactor `index.ts` — split the app assembly out of `main()`**

In `apps/server/src/index.ts`, move everything from `const app = Fastify(...)` through the last `await app.register(...REST route...)` into a new exported factory. Keep `unhandledRejection`/`uncaughtException` handlers, all `app.register(...)` REST plugins, the `setErrorHandler`, and `/health` inside `buildApp`. Leave `app.listen(...)`, the Socket.IO server creation (`new IOServer(...)`), and `registerRealtime(...)` in `main()`.

```ts
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });
  process.on("unhandledRejection", (reason) => app.log.error({ reason }, "unhandledRejection (non-fatal)"));
  process.on("uncaughtException", (e) => app.log.error({ err: e }, "uncaughtException (non-fatal)"));
  await app.register(helmet, { /* unchanged */ contentSecurityPolicy: false, hsts: isProd ? { maxAge: 15552000, includeSubDomains: true } : false, crossOriginResourcePolicy: { policy: "cross-origin" } });
  const corsOrigins = env.CORS_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean);
  await app.register(cors, { origin: corsOrigins.length > 1 ? corsOrigins : corsOrigins[0], credentials: true });
  await app.register(cookie);
  await app.register(rateLimit, { global: true, max: 300, timeWindow: "1 minute", allowList: (req) => req.url.startsWith("/api/payments/webhook") });
  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof ApiError) return reply.status(error.status).send(fail(error.code, error.message));
    if (error instanceof ZodError) return reply.status(400).send(fail("VALIDATION", error.issues.map((i) => i.message).join("; ")));
    app.log.error(error);
    return reply.status(500).send(fail("INTERNAL", "Something went wrong"));
  });
  app.get("/health", async () => ({ ok: true, ts: Date.now() }));
  // ... all existing `await app.register(<route>, { prefix: "/api"... })` calls, verbatim ...
  return app;
}

async function main() {
  const app = await buildApp();
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  // existing Socket.IO + registerRealtime wiring, unchanged, moved here
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Verify the server still typechecks + boots**

Run: `cd apps/server && pnpm exec tsc -p tsconfig.build.json --noEmit`
Expected: exit 0, no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/index.ts
git commit -m "refactor(server): extract buildApp() factory for testability"
```

### Task 3: Vitest config + test helpers

**Files:**
- Create: `apps/server/vitest.config.ts`
- Create: `apps/server/test/helpers.ts`

**Interfaces:**
- Produces: `buildTestApp()` (wraps `buildApp`), `authFor(user)` → cookie header string, `truncateAll()`, `seedUser(overrides)` — used by every test file.

- [ ] **Step 1: Create `apps/server/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    // integration tests hit a real DB + run their own transactions — no parallelism across files
    fileParallelism: false,
    hookTimeout: 20000,
    testTimeout: 20000,
  },
});
```

- [ ] **Step 2: Create `apps/server/test/helpers.ts`**

```ts
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/index.js";
import { prisma } from "../src/db/client.js";
import { signAccess, COOKIE } from "../src/auth/tokens.js";
import type { AdminRole } from "@prisma/client";

export async function buildTestApp(): Promise<FastifyInstance> {
  const app = await buildApp();
  await app.ready();
  return app;
}

/** Mint an access cookie header for `inject()`. Pass a partial to forge stale claims. */
export function authFor(claims: { sub: string; isGuest?: boolean; adminRole?: AdminRole | null }): string {
  const token = signAccess({ sub: claims.sub, isGuest: claims.isGuest ?? false, adminRole: claims.adminRole ?? null } as any);
  return `${COOKIE.access}=${token}`;
}

let seq = 0;
export async function seedUser(overrides: Partial<{ username: string; isBot: boolean; isGuest: boolean; adminRole: AdminRole | null; bannedUntil: Date | null; deletedAt: Date | null }> = {}) {
  seq += 1;
  return prisma.user.create({
    data: {
      username: overrides.username ?? `t_user_${seq}_${process.pid}`,
      tag: `#${1000 + seq}`,
      isBot: overrides.isBot ?? false,
      isGuest: overrides.isGuest ?? false,
      adminRole: overrides.adminRole ?? null,
      bannedUntil: overrides.bannedUntil ?? null,
      deletedAt: overrides.deletedAt ?? null,
    },
  });
}

/** Wipe the tables these tests write, leaving durable seed rows (bots/store) intact. */
export async function truncateAll() {
  await prisma.$executeRawUnsafe(
    `TRUNCATE "Report", "AuditLog", "Message", "ChannelMember", "Channel" RESTART IDENTITY CASCADE`,
  );
  // remove only test-created users (prefix-scoped) to keep seed accounts
  await prisma.user.deleteMany({ where: { username: { startsWith: "t_user_" } } });
}
```

> Note: if `signAccess`'s claims type rejects the inline object, import the real `AccessClaims` type from `../src/auth/tokens.js` and construct it explicitly. Confirm the field names (`sub`, `isGuest`, `adminRole`) against `tokens.ts` before running.

- [ ] **Step 3: Add the test-DB env note to `apps/server/.env.test.example`**

Create `apps/server/.env.test.example`:
```
# Point at a THROWAWAY database — the suite truncates data. Never the dev DB.
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/dama_test"
JWT_SECRET="test-secret-do-not-use-in-prod"
CORS_ORIGIN="http://localhost:5173"
```

- [ ] **Step 4: Add the `pretest` migrate step to `apps/server/package.json`**

Modify the `scripts` block:
```json
"pretest": "dotenv -e .env.test -- prisma migrate deploy",
"test": "dotenv -e .env.test -- vitest run"
```
(If `dotenv-cli` isn't a dep, add it: `pnpm add -D dotenv-cli`. If the repo already loads `.env.test` another way, follow that instead.)

- [ ] **Step 5: Smoke-test the harness with a trivial health test**

Create `apps/server/test/health.test.ts`:
```ts
import { describe, it, expect, afterAll } from "vitest";
import { buildTestApp } from "./helpers.js";

describe("health", () => {
  it("responds ok", async () => {
    const app = await buildTestApp();
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
    await app.close();
  });
});
```

- [ ] **Step 6: Run the smoke test**

Run: `cd apps/server && pnpm test -- health`
Expected: 1 passing test. (If it can't connect, the local test DB isn't set up — create `dama_test` and copy `.env.test.example` → `.env.test`.)

- [ ] **Step 7: Commit**

```bash
git add apps/server/vitest.config.ts apps/server/test apps/server/.env.test.example apps/server/package.json
git commit -m "test(server): add vitest harness — buildTestApp, authFor, truncateAll"
```

---

## Phase 3 — audit widening + sanctions + requireAdmin hardening

### Task 4: Widen `audit()` to accept a transaction client

**Files:**
- Modify: `apps/server/src/lib/audit.ts`

**Interfaces:**
- Produces: `audit(db: Prisma.TransactionClient | PrismaClient, entry)` — later tasks call `audit(tx, ...)` inside `$transaction`.

- [ ] **Step 1: Change the import + param type in `audit.ts`**

Replace `import type { PrismaClient } from "@prisma/client";` with `import type { Prisma, PrismaClient } from "@prisma/client";` and change the first parameter type:

```ts
export async function audit(
  db: Prisma.TransactionClient | PrismaClient,
  entry: { actorId: string; action: string; targetType?: string; targetId?: string; before?: unknown; after?: unknown; reason?: string },
) {
  // body unchanged
}
```

- [ ] **Step 2: Verify typecheck (no call sites break — widening only)**

Run: `cd apps/server && pnpm exec tsc -p tsconfig.build.json --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/lib/audit.ts
git commit -m "refactor(audit): accept a Prisma transaction client"
```

### Task 5: `sanctions.ts` — shared `muteUser`/`banUser`

**Files:**
- Create: `apps/server/src/lib/sanctions.ts`
- Test: `apps/server/test/sanctions.test.ts`

**Interfaces:**
- Consumes: `audit(tx, ...)` (Task 4).
- Produces:
  - `type SanctionEmail = { email: string; username: string; until: Date | null } | null`
  - `muteUser(tx, { targetId, actorId, durationHours?, reason }): Promise<{ mutedUntil: Date; email: SanctionEmail }>` — email is always `null` (no mute email today).
  - `banUser(tx, { targetId, actorId, durationHours?, reason }): Promise<{ bannedUntil: Date; email: SanctionEmail }>` — email carries ban data when the target has an email + isn't a guest.
  - `PERMANENT` (the far-future date) and `untilFrom(hours?)`.

- [ ] **Step 1: Write the failing test** `apps/server/test/sanctions.test.ts`

```ts
import { describe, it, expect, afterEach, beforeAll, afterAll } from "vitest";
import { prisma } from "../src/db/client.js";
import { muteUser, banUser } from "../src/lib/sanctions.js";
import { seedUser, truncateAll } from "./helpers.js";

afterEach(truncateAll);
afterAll(async () => { await prisma.$disconnect(); });

describe("sanctions", () => {
  it("muteUser sets mutedUntil, writes an audit row, returns null email", async () => {
    const actor = await seedUser({ adminRole: "MODERATOR" });
    const target = await seedUser();
    const res = await prisma.$transaction((tx) =>
      muteUser(tx, { targetId: target.id, actorId: actor.id, durationHours: 24, reason: "test" }),
    );
    expect(res.email).toBeNull();
    const after = await prisma.user.findUnique({ where: { id: target.id } });
    expect(after!.mutedUntil!.getTime()).toBeGreaterThan(Date.now());
    const audits = await prisma.auditLog.findMany({ where: { targetId: target.id, action: "user.mute" } });
    expect(audits).toHaveLength(1);
  });

  it("banUser sets bannedUntil + returns email data for a non-guest with an email", async () => {
    const actor = await seedUser({ adminRole: "MODERATOR" });
    const target = await prisma.user.update({ where: { id: (await seedUser()).id }, data: { email: "x@example.com" } });
    const res = await prisma.$transaction((tx) =>
      banUser(tx, { targetId: target.id, actorId: actor.id, reason: "test" }),
    );
    expect(res.email).not.toBeNull();
    expect(res.email!.email).toBe("x@example.com");
    const after = await prisma.user.findUnique({ where: { id: target.id } });
    expect(after!.bannedUntil!.getTime()).toBeGreaterThan(Date.now());
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd apps/server && pnpm test -- sanctions`
Expected: FAIL — `muteUser`/`banUser` not found.

- [ ] **Step 3: Implement `apps/server/src/lib/sanctions.ts`**

```ts
import type { Prisma } from "@prisma/client";
import { audit } from "./audit.js";

export const PERMANENT = new Date("2999-01-01T00:00:00Z");
export function untilFrom(durationHours?: number): Date {
  if (!durationHours || durationHours <= 0) return PERMANENT;
  return new Date(Date.now() + durationHours * 3_600_000);
}

export type SanctionEmail = { email: string; username: string; until: Date | null } | null;
type Args = { targetId: string; actorId: string; durationHours?: number; reason: string };

export async function muteUser(tx: Prisma.TransactionClient, a: Args): Promise<{ mutedUntil: Date; email: SanctionEmail }> {
  const before = await tx.user.findUnique({ where: { id: a.targetId }, select: { mutedUntil: true } });
  const mutedUntil = untilFrom(a.durationHours);
  await tx.user.update({ where: { id: a.targetId }, data: { mutedUntil } });
  await audit(tx, { actorId: a.actorId, action: "user.mute", targetType: "user", targetId: a.targetId, before, after: { mutedUntil }, reason: a.reason });
  return { mutedUntil, email: null }; // no mute email today (bans-only)
}

export async function banUser(tx: Prisma.TransactionClient, a: Args): Promise<{ bannedUntil: Date; email: SanctionEmail }> {
  const before = await tx.user.findUnique({ where: { id: a.targetId }, select: { bannedUntil: true, email: true, username: true, isGuest: true } });
  const bannedUntil = untilFrom(a.durationHours);
  await tx.user.update({ where: { id: a.targetId }, data: { bannedUntil } });
  await audit(tx, { actorId: a.actorId, action: "user.ban", targetType: "user", targetId: a.targetId, before: { bannedUntil: before?.bannedUntil ?? null }, after: { bannedUntil }, reason: a.reason });
  const email: SanctionEmail = before?.email && !before.isGuest
    ? { email: before.email, username: before.username, until: bannedUntil.getTime() === PERMANENT.getTime() ? null : bannedUntil }
    : null;
  return { bannedUntil, email };
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `cd apps/server && pnpm test -- sanctions`
Expected: 2 passing.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/lib/sanctions.ts apps/server/test/sanctions.test.ts
git commit -m "feat(sanctions): shared tx-aware muteUser/banUser (email after commit)"
```

### Task 6: Refactor admin mute/ban onto `sanctions.ts` + self-ban guard

**Files:**
- Modify: `apps/server/src/modules/admin.ts:236-273` (the `/ban` + `/mute` routes)

**Interfaces:**
- Consumes: `muteUser`/`banUser`/`PERMANENT` (Task 5), `sendEmail`/`banEmailHtml` (existing).

- [ ] **Step 1: Rewrite `/users/:id/ban`** — wrap in a `$transaction`, add the self-ban + admin-ban guard, send email after commit:

```ts
app.post<{ Params: { id: string } }>("/admin/users/:id/ban", { preHandler: requireAdmin("MODERATOR") }, async (req) => {
  const { durationHours, reason } = durationSchema.parse(req.body);
  if (req.params.id === req.userId) throw err.badRequest("SELF_BAN", "You can't ban yourself");
  const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { adminRole: true } });
  if (!target) throw err.notFound("NO_USER", "Player not found");
  if (target.adminRole && req.adminRole !== "SUPERADMIN") throw err.forbidden("BAN_ADMIN", "Only a superadmin can ban another admin");
  const { bannedUntil, email } = await prisma.$transaction((tx) =>
    banUser(tx, { targetId: req.params.id, actorId: req.userId!, durationHours, reason }),
  );
  if (email) void sendEmail(email.email, "Your FilipinoDama Royal account has been suspended", banEmailHtml({ username: email.username, reason, until: email.until })).catch(() => {});
  return ok({ bannedUntil });
});
```

- [ ] **Step 2: Rewrite `/users/:id/mute`** onto `muteUser`:

```ts
app.post<{ Params: { id: string } }>("/admin/users/:id/mute", { preHandler: requireAdmin("MODERATOR") }, async (req) => {
  const { durationHours, reason } = durationSchema.parse(req.body);
  const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!target) throw err.notFound("NO_USER", "Player not found");
  const { mutedUntil } = await prisma.$transaction((tx) =>
    muteUser(tx, { targetId: req.params.id, actorId: req.userId!, durationHours, reason }),
  );
  return ok({ mutedUntil });
});
```

- [ ] **Step 3: Remove the now-unused local `PERMANENT`/`untilFrom` from `admin.ts` if they're only used by the old mute/ban bodies** (import from `sanctions.js` if still referenced elsewhere, e.g. the `/unban` PERMANENT compare). Verify by grep.

Run: `cd apps/server && grep -n "PERMANENT\|untilFrom" src/modules/admin.ts`
Then import from sanctions if still needed: `import { PERMANENT } from "../lib/sanctions.js";` and delete the local defs.

- [ ] **Step 4: Typecheck**

Run: `cd apps/server && pnpm exec tsc -p tsconfig.build.json --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/modules/admin.ts
git commit -m "refactor(admin): mute/ban via sanctions.ts + self-ban/admin-ban guard"
```

### Task 7: Harden `requireAdmin` (lockout-safe)

**Files:**
- Modify: `apps/server/src/auth/guards.ts` (the `requireAdmin` factory)
- Test: `apps/server/test/require-admin.test.ts`

**Interfaces:**
- Consumes: `prisma`, `RANK`, `err` (all present in `guards.ts`).

- [ ] **Step 1: Write the failing test** `apps/server/test/require-admin.test.ts`

```ts
import { describe, it, expect, afterEach, afterAll } from "vitest";
import { prisma } from "../src/db/client.js";
import { buildTestApp, seedUser, authFor, truncateAll } from "./helpers.js";

afterEach(truncateAll);
afterAll(async () => { await prisma.$disconnect(); });

describe("requireAdmin hardening", () => {
  it("rejects a stale MODERATOR token whose DB role was revoked", async () => {
    const app = await buildTestApp();
    const u = await seedUser({ adminRole: null }); // DB says NOT admin
    const staleCookie = authFor({ sub: u.id, adminRole: "MODERATOR" }); // token LIES
    const res = await app.inject({ method: "GET", url: "/api/admin/reports", headers: { cookie: staleCookie } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("rejects a demoted admin (token SUPERADMIN, DB SUPPORT) on a MODERATOR route", async () => {
    const app = await buildTestApp();
    const u = await seedUser({ adminRole: "SUPPORT" });
    const res = await app.inject({ method: "GET", url: "/api/admin/reports", headers: { cookie: authFor({ sub: u.id, adminRole: "SUPERADMIN" }) } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("rejects a banned non-superadmin but ALLOWS a banned superadmin (no self-brick)", async () => {
    const app = await buildTestApp();
    const future = new Date(Date.now() + 86_400_000);
    const modBanned = await seedUser({ adminRole: "MODERATOR", bannedUntil: future });
    const superBanned = await seedUser({ adminRole: "SUPERADMIN", bannedUntil: future });
    const r1 = await app.inject({ method: "GET", url: "/api/admin/reports", headers: { cookie: authFor({ sub: modBanned.id, adminRole: "MODERATOR" }) } });
    const r2 = await app.inject({ method: "GET", url: "/api/admin/reports", headers: { cookie: authFor({ sub: superBanned.id, adminRole: "SUPERADMIN" }) } });
    expect(r1.statusCode).toBe(403);
    expect(r2.statusCode).not.toBe(403); // superadmin exempt from ban gate
    await app.close();
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd apps/server && pnpm test -- require-admin`
Expected: FAIL (the first two 403 checks fail because the current guard trusts the token; the ban checks fail because the route doesn't exist yet — that's fine, this task focuses the guard; the route lands in Task 9. To keep this test green-able now, temporarily point the URL at an existing MODERATOR route like `/api/admin/reports` will 404 → adjust: use `/api/admin/audit` which requires SUPERADMIN, OR land this test alongside Task 9). **Decision:** move this test's assertions to run after Task 9; for THIS task, assert via a tiny inline route. Simplest: keep the test but target `/api/admin/audit` (SUPERADMIN) for the role checks and skip the ban-route case until Task 9.)

> Implementer note: `requireAdmin` can't be unit-tested without a mounted route. Target an existing admin route (`/api/admin/audit`, SUPERADMIN-gated) for the role-revocation + demotion assertions here; add the ban-exemption assertion in Task 9 against `/api/admin/reports`. Rewrite the URLs accordingly before running.

- [ ] **Step 3: Harden `requireAdmin` in `guards.ts`**

```ts
export function requireAdmin(min: AdminRole) {
  return async (req: FastifyRequest, _reply: FastifyReply) => {
    await attachUser(req);
    if (!req.userId) throw err.unauthorized();
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { deletedAt: true, bannedUntil: true, adminRole: true },
    });
    if (!user || user.deletedAt) throw err.unauthorized("ACCOUNT_GONE", "This account no longer exists");
    // DB role is authoritative — ignore the token's adminRole.
    req.adminRole = user.adminRole;
    if (!user.adminRole || RANK[user.adminRole] < RANK[min]) throw err.forbidden("ADMIN_FORBIDDEN", `requires ${min} admin role`);
    // Active ban locks out everyone EXCEPT a superadmin (so the top account can't self-brick).
    const banned = user.bannedUntil && user.bannedUntil > new Date();
    if (banned && user.adminRole !== "SUPERADMIN") throw err.forbidden("ADMIN_BANNED", "This admin account is suspended");
  };
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `cd apps/server && pnpm test -- require-admin`
Expected: role-revocation + demotion cases pass.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/auth/guards.ts apps/server/test/require-admin.test.ts
git commit -m "fix(auth): harden requireAdmin — DB-role authoritative, lockout-safe ban gate"
```

---

## Phase 4 — Report intake (`POST /api/reports`)

### Task 8: Intake route + all guards + atomic rate-limit

**Files:**
- Create: `apps/server/src/modules/reports.ts`
- Modify: `apps/server/src/index.ts` (register `reportRoutes`)
- Test: `apps/server/test/reports-intake.test.ts`

**Interfaces:**
- Consumes: `requireAuth`, `dmRefId` (`../modules/chat-service.js`), `prisma`, `ok`/`err`, `audit`.
- Produces: `export async function reportRoutes(app: FastifyInstance)` with `POST /reports`.

- [ ] **Step 1: Write the failing tests** `apps/server/test/reports-intake.test.ts`

```ts
import { describe, it, expect, afterEach, afterAll } from "vitest";
import { prisma } from "../src/db/client.js";
import { dmRefId } from "../src/modules/chat-service.js";
import { buildTestApp, seedUser, authFor, truncateAll } from "./helpers.js";

afterEach(truncateAll);
afterAll(async () => { await prisma.$disconnect(); });

async function makeDM(a: string, b: string) {
  const ch = await prisma.channel.create({ data: { type: "DM", refId: dmRefId(a, b) } });
  await prisma.channelMember.createMany({ data: [{ channelId: ch.id, userId: a }, { channelId: ch.id, userId: b }] });
  return ch;
}

describe("POST /api/reports", () => {
  it("401 when unauthenticated", async () => {
    const app = await buildTestApp();
    const res = await app.inject({ method: "POST", url: "/api/reports", payload: { accusedId: "x", reason: "SPAM", context: "profile", note: "n" } });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("403 GUEST_CANNOT_REPORT for a guest reporter", async () => {
    const app = await buildTestApp();
    const guest = await seedUser({ isGuest: true });
    const accused = await seedUser();
    const res = await app.inject({ method: "POST", url: "/api/reports", headers: { cookie: authFor({ sub: guest.id, isGuest: true }) }, payload: { accusedId: accused.id, reason: "SPAM", context: "profile", note: "bad name" } });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("GUEST_CANNOT_REPORT");
    await app.close();
  });

  it("creates a profile report with a snapshot; note required", async () => {
    const app = await buildTestApp();
    const reporter = await seedUser();
    const accused = await seedUser({ username: "t_user_badname" });
    const noNote = await app.inject({ method: "POST", url: "/api/reports", headers: { cookie: authFor({ sub: reporter.id }) }, payload: { accusedId: accused.id, reason: "INAPPROPRIATE", context: "profile" } });
    expect(noNote.statusCode).toBe(400);
    const ok = await app.inject({ method: "POST", url: "/api/reports", headers: { cookie: authFor({ sub: reporter.id }) }, payload: { accusedId: accused.id, reason: "INAPPROPRIATE", context: "profile", note: "offensive name" } });
    expect(ok.statusCode).toBe(200);
    const row = await prisma.report.findFirst({ where: { accusedId: accused.id } });
    expect(row!.profileSnapshot).toMatchObject({ username: "t_user_badname" });
  });

  it("self-report and bot-report → 400", async () => {
    const app = await buildTestApp();
    const reporter = await seedUser();
    const bot = await seedUser({ isBot: true });
    const self = await app.inject({ method: "POST", url: "/api/reports", headers: { cookie: authFor({ sub: reporter.id }) }, payload: { accusedId: reporter.id, reason: "SPAM", context: "profile", note: "n" } });
    const botR = await app.inject({ method: "POST", url: "/api/reports", headers: { cookie: authFor({ sub: reporter.id }) }, payload: { accusedId: bot.id, reason: "SPAM", context: "profile", note: "n" } });
    expect(self.statusCode).toBe(400);
    expect(botR.statusCode).toBe(400);
    await app.close();
  });

  it("DM report validates pair + author, snapshots excerpt", async () => {
    const app = await buildTestApp();
    const reporter = await seedUser();
    const accused = await seedUser();
    const ch = await makeDM(reporter.id, accused.id);
    const msg = await prisma.message.create({ data: { channelId: ch.id, authorId: accused.id, body: "bad words" } });
    const good = await app.inject({ method: "POST", url: "/api/reports", headers: { cookie: authFor({ sub: reporter.id }) }, payload: { accusedId: accused.id, reason: "HARASSMENT", context: "dm", messageId: msg.id } });
    expect(good.statusCode).toBe(200);
    const row = await prisma.report.findFirst({ where: { messageId: msg.id } });
    expect(row!.excerpt).toBe("bad words");
    // a message the reporter authored can't be cited as the accused's evidence
    const mine = await prisma.message.create({ data: { channelId: ch.id, authorId: reporter.id, body: "mine" } });
    const bad = await app.inject({ method: "POST", url: "/api/reports", headers: { cookie: authFor({ sub: reporter.id }) }, payload: { accusedId: accused.id, reason: "HARASSMENT", context: "dm", messageId: mine.id } });
    expect(bad.statusCode).toBe(400);
    await app.close();
  });

  it("dedupe: second OPEN report same pair → 409; rate-limit concurrency ≤5", async () => {
    const app = await buildTestApp();
    const reporter = await seedUser();
    const accused = await seedUser();
    const p = () => app.inject({ method: "POST", url: "/api/reports", headers: { cookie: authFor({ sub: reporter.id }) }, payload: { accusedId: accused.id, reason: "SPAM", context: "profile", note: "n" } });
    const first = await p();
    expect(first.statusCode).toBe(200);
    const dup = await p();
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe("ALREADY_REPORTED");
    // rate-limit: fire many at DIFFERENT accused concurrently, expect ≤5 created total this hour
    const others = await Promise.all(Array.from({ length: 8 }, () => seedUser()));
    await Promise.all(others.map((o) => app.inject({ method: "POST", url: "/api/reports", headers: { cookie: authFor({ sub: reporter.id }) }, payload: { accusedId: o.id, reason: "SPAM", context: "profile", note: "n" } })));
    const count = await prisma.report.count({ where: { reporterId: reporter.id } });
    expect(count).toBeLessThanOrEqual(5);
    await app.close();
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd apps/server && pnpm test -- reports-intake`
Expected: FAIL — route not registered (404s / connection).

- [ ] **Step 3: Implement `apps/server/src/modules/reports.ts`**

```ts
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { ok, err } from "../lib/errors.js";
import { requireAuth } from "../auth/guards.js";
import { dmRefId } from "./chat-service.js";

const bodySchema = z.object({
  accusedId: z.string().min(1),
  reason: z.enum(["HARASSMENT", "HATE_SPEECH", "CHEATING", "INAPPROPRIATE", "SPAM", "OTHER"]),
  note: z.string().trim().max(500).optional(),
  context: z.enum(["dm", "profile"]),
  messageId: z.string().optional(),
}).refine((b) => b.context !== "dm" || !!b.messageId, { message: "messageId required for a DM report", path: ["messageId"] })
  .refine((b) => b.context !== "profile" || (b.note && b.note.length > 0), { message: "note required for a profile report", path: ["note"] });

const RATE = 5;

export async function reportRoutes(app: FastifyInstance) {
  app.post("/reports", { preHandler: requireAuth }, async (req) => {
    if (req.isGuest) throw err.forbidden("GUEST_CANNOT_REPORT", "Guests can't file reports");
    const b = bodySchema.parse(req.body);
    const reporterId = req.userId!;
    if (b.accusedId === reporterId) throw err.badRequest("SELF_REPORT", "You can't report yourself");

    const accused = await prisma.user.findUnique({ where: { id: b.accusedId }, select: { id: true, isBot: true, deletedAt: true, username: true, tag: true, displayName: true, avatarUrl: true, bio: true } });
    if (!accused || accused.deletedAt || accused.isBot) throw err.badRequest("BAD_ACCUSED", "That player can't be reported");

    let excerpt: string | null = null, channelId: string | null = null, profileSnapshot: any = null;
    if (b.context === "dm") {
      const msg = await prisma.message.findUnique({ where: { id: b.messageId! }, include: { channel: true } });
      if (!msg) throw err.badRequest("NO_MESSAGE", "Message not found");
      if (msg.channel.type !== "DM") throw err.badRequest("NOT_DM", "That message isn't from a DM");
      if (msg.authorId !== b.accusedId) throw err.badRequest("NOT_ACCUSED_MESSAGE", "You can only cite the reported player's own message");
      if (msg.channel.refId !== dmRefId(reporterId, b.accusedId)) throw err.badRequest("NOT_DM_PAIR", "That DM isn't between you and this player");
      excerpt = msg.body; channelId = msg.channelId;
    } else {
      profileSnapshot = { displayName: accused.displayName, username: accused.username, tag: accused.tag, avatarUrl: accused.avatarUrl, bio: accused.bio };
    }

    const reporter = await prisma.user.findUnique({ where: { id: reporterId }, select: { username: true, tag: true } });
    const reporterName = `${reporter!.username}${reporter!.tag}`;
    const accusedName = `${accused.username}${accused.tag}`;

    // Atomic rate-limited insert: create the row only if the reporter is under quota this hour.
    // $executeRaw returns affected row count; 0 => over quota.
    const id = cuid();
    const inserted: number = await prisma.$executeRaw`
      INSERT INTO "Report" ("id","reporterId","reporterName","accusedId","accusedName","reason","note","context","channelId","messageId","excerpt","profileSnapshot","status","createdAt")
      SELECT ${id}, ${reporterId}, ${reporterName}, ${b.accusedId}, ${accusedName}, ${b.reason}::"ReportReason", ${b.note ?? null}, ${b.context}, ${channelId}, ${b.messageId ?? null}, ${excerpt}, ${profileSnapshot ? JSON.stringify(profileSnapshot) : null}::jsonb, 'OPEN'::"ReportStatus", now()
      WHERE (SELECT count(*) FROM "Report" WHERE "reporterId" = ${reporterId} AND "createdAt" >= now() - interval '1 hour') < ${RATE}
    `.catch((e: any) => {
      if (e?.code === "P2002") throw err.conflict("ALREADY_REPORTED", "You've already reported this player");
      throw e;
    });
    if (inserted === 0) throw err.tooMany("RATE_LIMITED", "You're reporting too fast — try again later");
    req.log.info({ evt: "report.create", reporterId, accusedId: b.accusedId, context: b.context, reason: b.reason });
    return ok({ id });
  });
}

// cuid: reuse the same generator Prisma uses. Simplest: import from a tiny helper or use crypto.
import { randomUUID } from "node:crypto";
function cuid() { return `rep_${randomUUID()}`; }
```

> Implementer notes: (1) Confirm `@prisma/client`'s error code for the partial-unique violation surfaces as `P2002` through `$executeRaw`; if it surfaces as a raw Postgres `23505` instead, match on `e?.code === "23505"` as well. (2) The `id` is generated app-side because `$executeRaw` bypasses Prisma's `@default(cuid())`. Using a `rep_`-prefixed UUID is fine (the column is just a String id); if you prefer real cuids, import the `cuid` used elsewhere in the repo. (3) Verify the enum cast syntax `::"ReportReason"` matches the generated Postgres enum type name (Prisma names it after the enum).

- [ ] **Step 4: Register the route in `index.ts`** — inside `buildApp`, near the other `/api` registrations:

```ts
import { reportRoutes } from "./modules/reports.js";
// ...
await app.register(reportRoutes, { prefix: "/api" });
```

- [ ] **Step 5: Run the tests, verify they pass**

Run: `cd apps/server && pnpm test -- reports-intake`
Expected: all intake tests pass. (If the concurrency test is flaky at ≤5, the atomic insert isn't atomic — recheck the `$executeRaw` WHERE-count guard.)

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/modules/reports.ts apps/server/src/index.ts apps/server/test/reports-intake.test.ts
git commit -m "feat(reports): POST /api/reports intake — DM+profile, guards, atomic rate limit"
```

---

## Phase 5 — Admin queue

### Task 9: Queue routes (list + dismiss/mute/ban, transactional) + player-detail count

**Files:**
- Create: `apps/server/src/modules/admin-reports.ts`
- Modify: `apps/server/src/index.ts` (register `adminReportsRoutes`)
- Modify: `apps/server/src/modules/admin.ts` (`openReportsAgainst` on `/users/:id`)
- Test: `apps/server/test/admin-reports.test.ts`

**Interfaces:**
- Consumes: `requireAdmin`, `muteUser`/`banUser` (Task 5), `audit`, `ok`/`err`, `sendEmail`/`banEmailHtml`.
- Produces: `export async function adminReportsRoutes(app: FastifyInstance)`.

- [ ] **Step 1: Write the failing tests** `apps/server/test/admin-reports.test.ts`

```ts
import { describe, it, expect, afterEach, afterAll } from "vitest";
import { prisma } from "../src/db/client.js";
import { buildTestApp, seedUser, authFor, truncateAll } from "./helpers.js";

afterEach(truncateAll);
afterAll(async () => { await prisma.$disconnect(); });

async function seedReport(accusedId: string, extra = {}) {
  const reporter = await seedUser();
  return prisma.report.create({ data: { reporterId: reporter.id, reporterName: "r#1", accusedId, accusedName: "a#1", reason: "SPAM", context: "profile", note: "n", status: "OPEN", ...extra } });
}

describe("admin reports queue", () => {
  it("SUPPORT cannot access the queue (403)", async () => {
    const app = await buildTestApp();
    const support = await seedUser({ adminRole: "SUPPORT" });
    const res = await app.inject({ method: "GET", url: "/api/admin/reports", headers: { cookie: authFor({ sub: support.id, adminRole: "SUPPORT" }) } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("MODERATOR lists open reports", async () => {
    const app = await buildTestApp();
    const mod = await seedUser({ adminRole: "MODERATOR" });
    const accused = await seedUser();
    await seedReport(accused.id);
    const res = await app.inject({ method: "GET", url: "/api/admin/reports", headers: { cookie: authFor({ sub: mod.id, adminRole: "MODERATOR" }) } });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.items.length).toBe(1);
    await app.close();
  });

  it("mute resolves the report + sanctions the accused + audits", async () => {
    const app = await buildTestApp();
    const mod = await seedUser({ adminRole: "MODERATOR" });
    const accused = await seedUser();
    const rep = await seedReport(accused.id);
    const res = await app.inject({ method: "POST", url: `/api/admin/reports/${rep.id}/mute`, headers: { cookie: authFor({ sub: mod.id, adminRole: "MODERATOR" }) }, payload: { durationHours: 24, reason: "toxic" } });
    expect(res.statusCode).toBe(200);
    const after = await prisma.report.findUnique({ where: { id: rep.id } });
    expect(after!.status).toBe("RESOLVED");
    expect(after!.resolution).toBe("muted");
    const u = await prisma.user.findUnique({ where: { id: accused.id } });
    expect(u!.mutedUntil!.getTime()).toBeGreaterThan(Date.now());
  });

  it("resolving an already-resolved report → 409 REPORT_RESOLVED", async () => {
    const app = await buildTestApp();
    const mod = await seedUser({ adminRole: "MODERATOR" });
    const accused = await seedUser();
    const rep = await seedReport(accused.id, { status: "DISMISSED" });
    const res = await app.inject({ method: "POST", url: `/api/admin/reports/${rep.id}/ban`, headers: { cookie: authFor({ sub: mod.id, adminRole: "MODERATOR" }) }, payload: { reason: "x" } });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("REPORT_RESOLVED");
  });

  it("mute/ban on a deleted accused → 409 ACCUSED_GONE; dismiss still works", async () => {
    const app = await buildTestApp();
    const mod = await seedUser({ adminRole: "MODERATOR" });
    const rep = await prisma.report.create({ data: { reporterName: "r#1", accusedName: "gone#1", accusedId: null, reason: "SPAM", context: "profile", note: "n", status: "OPEN" } });
    const ban = await app.inject({ method: "POST", url: `/api/admin/reports/${rep.id}/ban`, headers: { cookie: authFor({ sub: mod.id, adminRole: "MODERATOR" }) }, payload: { reason: "x" } });
    expect(ban.statusCode).toBe(409);
    expect(ban.json().error.code).toBe("ACCUSED_GONE");
    const dismiss = await app.inject({ method: "POST", url: `/api/admin/reports/${rep.id}/dismiss`, headers: { cookie: authFor({ sub: mod.id, adminRole: "MODERATOR" }) }, payload: { reason: "moot" } });
    expect(dismiss.statusCode).toBe(200);
  });

  it("concurrent mute+ban on one OPEN report → exactly one wins", async () => {
    const app = await buildTestApp();
    const mod = await seedUser({ adminRole: "MODERATOR" });
    const accused = await seedUser();
    const rep = await seedReport(accused.id);
    const cookie = authFor({ sub: mod.id, adminRole: "MODERATOR" });
    const [a, b] = await Promise.all([
      app.inject({ method: "POST", url: `/api/admin/reports/${rep.id}/mute`, headers: { cookie }, payload: { reason: "a" } }),
      app.inject({ method: "POST", url: `/api/admin/reports/${rep.id}/ban`, headers: { cookie }, payload: { reason: "b" } }),
    ]);
    const codes = [a.statusCode, b.statusCode].sort();
    expect(codes).toEqual([200, 409]);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd apps/server && pnpm test -- admin-reports`
Expected: FAIL — routes not registered.

- [ ] **Step 3: Implement `apps/server/src/modules/admin-reports.ts`**

```ts
import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { ok, err } from "../lib/errors.js";
import { requireAdmin } from "../auth/guards.js";
import { audit } from "../lib/audit.js";
import { muteUser, banUser } from "../lib/sanctions.js";
import { sendEmail, banEmailHtml } from "../lib/email.js";

const listQ = z.object({
  status: z.enum(["OPEN", "RESOLVED", "DISMISSED"]).default("OPEN"),
  reason: z.enum(["HARASSMENT", "HATE_SPEECH", "CHEATING", "INAPPROPRIATE", "SPAM", "OTHER"]).optional(),
  accusedId: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
const reasonBody = z.object({ reason: z.string().trim().min(1).max(500) });
const sanctionBody = z.object({ durationHours: z.number().int().min(0).max(24 * 365).optional(), reason: z.string().trim().min(1).max(500) });

export async function adminReportsRoutes(app: FastifyInstance) {
  app.get("/admin/reports", { preHandler: requireAdmin("MODERATOR") }, async (req) => {
    const q = listQ.parse(req.query);
    const where: Prisma.ReportWhereInput = { status: q.status, ...(q.reason ? { reason: q.reason } : {}), ...(q.accusedId ? { accusedId: q.accusedId } : {}) };
    const rows = await prisma.report.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      include: {
        reporter: { select: { id: true, username: true, tag: true, avatarUrl: true } },
        accused: { select: { id: true, username: true, tag: true, avatarUrl: true } },
      },
    });
    const hasMore = rows.length > q.limit;
    const items = (hasMore ? rows.slice(0, q.limit) : rows).map((r) => ({
      id: r.id, reason: r.reason, note: r.note, context: r.context, channelId: r.channelId, messageId: r.messageId,
      excerpt: r.excerpt, profileSnapshot: r.profileSnapshot, status: r.status, createdAt: r.createdAt,
      accusedGone: r.accusedId === null,
      reporter: r.reporter ?? { username: r.reporterName, tag: "", avatarUrl: null, id: null },
      accused: r.accused ?? { username: r.accusedName, tag: "", avatarUrl: null, id: null },
    }));
    return ok({ items, nextCursor: hasMore ? items[items.length - 1]!.id : null });
  });

  // Shared claim: atomically flip OPEN→target and set resolution fields. Returns whether we won.
  async function claim(tx: Prisma.TransactionClient, id: string, targetStatus: "RESOLVED" | "DISMISSED", resolution: string, actorId: string) {
    const res = await tx.report.updateMany({ where: { id, status: "OPEN" }, data: { status: targetStatus, resolvedById: actorId, resolvedAt: new Date(), resolution } });
    return res.count > 0;
  }

  app.post<{ Params: { id: string } }>("/admin/reports/:id/dismiss", { preHandler: requireAdmin("MODERATOR") }, async (req) => {
    const { reason } = reasonBody.parse(req.body);
    await prisma.$transaction(async (tx) => {
      const won = await claim(tx, req.params.id, "DISMISSED", "dismissed", req.userId!);
      if (!won) throw err.conflict("REPORT_RESOLVED", "Report already resolved");
      await audit(tx, { actorId: req.userId!, action: "report.dismiss", targetType: "report", targetId: req.params.id, before: { status: "OPEN" }, after: { status: "DISMISSED", resolution: "dismissed" }, reason });
    });
    return ok({ status: "DISMISSED" });
  });

  for (const kind of ["mute", "ban"] as const) {
    app.post<{ Params: { id: string } }>(`/admin/reports/:id/${kind}`, { preHandler: requireAdmin("MODERATOR") }, async (req) => {
      const { durationHours, reason } = sanctionBody.parse(req.body);
      const rep = await prisma.report.findUnique({ where: { id: req.params.id }, select: { accusedId: true } });
      if (!rep) throw err.notFound("NO_REPORT", "Report not found");
      if (rep.accusedId === null) throw err.conflict("ACCUSED_GONE", "The reported account no longer exists");
      const email = await prisma.$transaction(async (tx) => {
        const won = await claim(tx, req.params.id, "RESOLVED", kind === "mute" ? "muted" : "banned", req.userId!);
        if (!won) throw err.conflict("REPORT_RESOLVED", "Report already resolved");
        const sanction = kind === "mute"
          ? await muteUser(tx, { targetId: rep.accusedId!, actorId: req.userId!, durationHours, reason })
          : await banUser(tx, { targetId: rep.accusedId!, actorId: req.userId!, durationHours, reason });
        await audit(tx, { actorId: req.userId!, action: `report.resolve.${kind}`, targetType: "report", targetId: req.params.id, before: { status: "OPEN" }, after: { status: "RESOLVED", resolution: kind === "mute" ? "muted" : "banned" }, reason });
        return sanction.email;
      });
      if (email) void sendEmail(email.email, "Your FilipinoDama Royal account has been suspended", banEmailHtml({ username: email.username, reason, until: email.until })).catch(() => {});
      return ok({ status: "RESOLVED" });
    });
  }
}
```

- [ ] **Step 4: Register in `index.ts`** (inside `buildApp`):

```ts
import { adminReportsRoutes } from "./modules/admin-reports.js";
await app.register(adminReportsRoutes, { prefix: "/api" });
```

- [ ] **Step 5: Add `openReportsAgainst` to `/admin/users/:id`** in `admin.ts` — in the player-detail handler, after loading the user, add a count and include it in the response:

```ts
const openReportsAgainst = await prisma.report.count({ where: { accusedId: u.id, status: "OPEN" } });
return ok({ ...u, status: statusOf(u), ledger, openReportsAgainst });
```

- [ ] **Step 6: Run the tests, verify they pass**

Run: `cd apps/server && pnpm test -- admin-reports`
Expected: all pass, including the concurrent `[200, 409]` race.

- [ ] **Step 7: Run the FULL server suite + typecheck**

Run: `cd apps/server && pnpm test && pnpm exec tsc -p tsconfig.build.json --noEmit`
Expected: all tests pass, typecheck clean.

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/modules/admin-reports.ts apps/server/src/index.ts apps/server/src/modules/admin.ts apps/server/test/admin-reports.test.ts
git commit -m "feat(admin): reports queue — list + transactional dismiss/mute/ban + detail count"
```

---

## Phase 6 — Client (web intake + admin queue page)

### Task 10: `ReportPlayerModal` + web entry points

**Files:**
- Create: `apps/web/src/features/moderation/ReportPlayerModal.tsx`
- Modify: `apps/web/src/features/messages/MessagesPage.tsx`
- Modify: `apps/web/src/features/friends/FriendsPage.tsx`

**Interfaces:**
- Consumes: the web `api` client (`post`) + existing toast; `POST /api/reports` from Task 8.
- Produces: `<ReportPlayerModal open accusedId context messageId? quotedText? onClose />` (default export or named — match the web component convention).

- [ ] **Step 1: Create `ReportPlayerModal.tsx`** — reason picker + note (required for profile), locked quote for DM. Match existing web modal styling (read a nearby modal, e.g. the DM or a store modal, for the token/class conventions before writing). Core behavior:

```tsx
import { useState } from "react";
import { api } from "../../lib/api"; // confirm path
import { useToast } from "../../lib/toast"; // confirm the web toast hook

const REASONS = [
  ["HARASSMENT", "Harassment / abuse"], ["HATE_SPEECH", "Hate speech"], ["CHEATING", "Cheating"],
  ["INAPPROPRIATE", "Inappropriate name / avatar"], ["SPAM", "Spam"], ["OTHER", "Other"],
] as const;

export function ReportPlayerModal({ open, accusedId, context, messageId, quotedText, onClose }: {
  open: boolean; accusedId: string; context: "dm" | "profile"; messageId?: string; quotedText?: string; onClose: () => void;
}) {
  const toast = useToast();
  const [reason, setReason] = useState<string>("HARASSMENT");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  if (!open) return null;
  const submit = async () => {
    if (context === "profile" && !note.trim()) { toast("Please describe the problem."); return; }
    setBusy(true);
    try {
      await api.post("/api/reports", { accusedId, reason, note: note.trim() || undefined, context, messageId });
      toast("Report submitted — thanks for helping keep the game fair.");
      onClose();
    } catch (e: any) {
      toast(e?.code === "ALREADY_REPORTED" ? "You've already reported this player." : e?.message ?? "Couldn't submit report.");
    } finally { setBusy(false); }
  };
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Report player</h3>
        {quotedText && <blockquote className="quoted">"{quotedText}"</blockquote>}
        <select value={reason} onChange={(e) => setReason(e.target.value)}>
          {REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <textarea maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder={context === "profile" ? "What's wrong? (required)" : "Add context (optional)"} />
        <div className="row">
          <button onClick={onClose}>Cancel</button>
          <button disabled={busy} onClick={submit}>Submit report</button>
        </div>
      </div>
    </div>
  );
}
```

> Implementer notes: confirm the real import paths for the web `api` client and toast hook (grep `apps/web/src/lib`), and reuse the existing overlay/modal CSS classes (grep an existing modal). Do NOT invent new global styles.

- [ ] **Step 2: Wire the DM entry point in `MessagesPage.tsx`** — on the *other person's* message bubbles (`m.author.id !== myId`), add a small "Report" affordance that opens the modal with `context="dm"`, `messageId={m.id}`, `quotedText={m.body}`. Add local state `const [reportMsg, setReportMsg] = useState<{id:string;body:string}|null>(null)` and render `<ReportPlayerModal open={!!reportMsg} accusedId={otherUserId} context="dm" messageId={reportMsg?.id} quotedText={reportMsg?.body} onClose={()=>setReportMsg(null)} />`. (Find `otherUserId` — the DM's counterpart — already available in the page's props/state.)

- [ ] **Step 3: Wire the profile entry point in `FriendsPage.tsx`** — inside the Player Profile modal block (the `profileId` view, ~lines 933-1154), add a "Report player" button that opens `<ReportPlayerModal open accusedId={profileId} context="profile" onClose={...} />`. Guard: don't show it when `profileId === myId`.

- [ ] **Step 4: Typecheck + build the web app**

Run: `cd apps/web && pnpm exec tsc --noEmit && pnpm build`
Expected: exit 0, build succeeds.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/moderation apps/web/src/features/messages/MessagesPage.tsx apps/web/src/features/friends/FriendsPage.tsx
git commit -m "feat(web): ReportPlayerModal + DM per-message + profile report entry points"
```

### Task 11: Admin `Moderation.tsx` queue page + nav wiring

**Files:**
- Create: `apps/admin/src/pages/Moderation.tsx`
- Modify: `apps/admin/src/pages/Players.tsx` (show `openReportsAgainst`)
- Modify: `apps/admin/src/App.tsx` (import + route + drop `/moderation` P2)

**Interfaces:**
- Consumes: admin `api.get`/`useAdminMutation`; `GET/POST /api/admin/reports*` from Task 9; the reason→badge map from the spec.

- [ ] **Step 1: Create `Moderation.tsx`** — fetch `/api/admin/reports?status=OPEN`, render report cards with the reason→badge map (label + accent hex from the spec table), an excerpt box (DM) / profile-snapshot preview (profile), the reporter note, and Dismiss/Mute/Ban buttons (Mute/Ban via `useAdminMutation` with a duration `extra`; disabled when `accusedGone`). Status + reason filter chips. Two empty states: "Queue clear" (no filters, empty) vs "No reports match these filters". Match the existing admin page pattern (read `Economy.tsx` + `index.css` classes). Reason→badge map:

```tsx
const BADGE: Record<string, { label: string; accent: string }> = {
  HARASSMENT: { label: "Harassment", accent: "#c2495a" },
  HATE_SPEECH: { label: "Hate speech", accent: "#a8324a" },
  CHEATING: { label: "Cheating", accent: "#d98a3a" },
  INAPPROPRIATE: { label: "Inappropriate", accent: "#8b78ad" },
  SPAM: { label: "Spam", accent: "#d9911f" },
  OTHER: { label: "Other", accent: "var(--dim)" },
};
```

Mute/Ban mutation call shape (via `useAdminMutation`):
```tsx
mutate({ title: `Mute the reported player`, requireReason: true, confirmLabel: "Mute", method: "POST",
  path: `/api/admin/reports/${r.id}/mute`, successMsg: "Muted + report resolved.", onDone: reload,
  extra: (set, vals) => (<div className="field"><label>Duration (hours, 0 = permanent)</label><input className="input" type="number" onChange={(e)=>set("durationHours", Number(e.target.value))} /></div>) });
```

> Implementer note: `useAdminMutation` merges `extra` field values into the payload (see `apps/admin/src/lib/ui.tsx`), so `durationHours` from the `extra` input flows to the server. Confirm the `extra` render-prop signature there before writing.

- [ ] **Step 2: Add `openReportsAgainst` to `Players.tsx`** — in the player detail drawer, render `{d.openReportsAgainst > 0 && <div className="dim">⚠ Reports against: {d.openReportsAgainst}</div>}` (confirm the detail object variable name in the file).

- [ ] **Step 3: Wire `App.tsx`** — add `import { Moderation } from "./pages/Moderation";`, swap the `/moderation` route from `Phase2` to `<Route path="/moderation" element={<Moderation />} />`, and remove the `true` (P2) flag from the `/moderation` NAV entry so its badge drops.

- [ ] **Step 4: Typecheck + build the admin app**

Run: `cd apps/admin && pnpm run typecheck && pnpm run build`
Expected: exit 0, build succeeds.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/pages/Moderation.tsx apps/admin/src/pages/Players.tsx apps/admin/src/App.tsx
git commit -m "feat(admin): Moderation queue page + reports-against count + nav wiring"
```

### Task 12: Deploy + verify

- [ ] **Step 1: Push** — `git push origin main` (Railway auto-deploys API + admin; the migration runs via `migrate deploy` on the API deploy).

- [ ] **Step 2: Poll both deploys** for the new commit (API `filipinodama` + `admin`) via `railway deployment list --service <svc> --json` until `SUCCESS <sha>`.

- [ ] **Step 3: Verify the routes exist + are guarded (prod)**

Run:
```bash
for p in /api/reports /api/admin/reports; do
  curl -s --ssl-no-revoke -o /dev/null -w "$p -> %{http_code}\n" "https://api.filipinodama.com$p"
done
```
Expected: `/api/reports -> 401` (POST-only but 401 unauthenticated on GET too via requireAuth-less 404 — confirm it's 404 for GET since only POST is defined; the real check is that POST unauthenticated returns 401), `/api/admin/reports -> 401`.

- [ ] **Step 4: Manual E2E** — log into the web app, open a DM, "Report this message" on the other player's line; open a player's profile in Friends, "Report player"; then in the admin console `/moderation`, confirm both appear, Dismiss one, Mute/Ban another (verify the accused's status + an AuditLog row + the report flips to RESOLVED), confirm a deleted-accused report disables Mute/Ban, and confirm SUPPORT sees the count on player detail but not the queue.

---

## Self-Review

**Spec coverage:** Report model + partial index (T1) ✓; DM+profile intake with all guards + atomic rate-limit + dedupe (T8) ✓; DM `dmRefId` validation (T8) ✓; profile snapshot + required note (T8) ✓; guest block (T8) ✓; queue list with stable cursor (T9) ✓; transactional dismiss/mute/ban + ACCUSED_GONE + REPORT_RESOLVED (T9) ✓; shared sanctions (T5) + admin refactor + self-ban guard (T6) ✓; audit tx-widen (T4) ✓; requireAdmin hardening (T7) ✓; openReportsAgainst SUPPORT count (T9) ✓; web modal + DM per-message + profile-in-FriendsPage (T10) ✓; admin queue page + reason→badge + empty states + Players count + nav (T11) ✓; test harness buildApp + truncate + authFor (T2,T3) ✓; all required integration tests (T5,T7,T8,T9) ✓; migration authoring procedure (T1) ✓; deploy+verify (T12) ✓.

**Placeholder scan:** each code step carries real code. The two "confirm the exact path/name" notes (web api/toast import; `signAccess` claims type) are genuine integration-lookup points, not placeholders — they name exactly what to grep and why.

**Type consistency:** `muteUser`/`banUser` signatures + `SanctionEmail` return type match between T5 (def), T6 (admin call), and T9 (queue call). `claim()` in T9 sets resolution fields in the same `updateMany`. `authFor`/`seedUser`/`truncateAll`/`buildTestApp` defined in T3, used identically in T5/T7/T8/T9. Error codes (`GUEST_CANNOT_REPORT`, `ALREADY_REPORTED`, `RATE_LIMITED`, `REPORT_RESOLVED`, `ACCUSED_GONE`) consistent between routes + tests. `openReportsAgainst` named identically in T9 server + T11 client.

**Known follow-ups flagged for the implementer (not gaps):** (a) confirm P2002 vs raw `23505` surfacing through `$executeRaw`; (b) confirm `signAccess` claims shape against `tokens.ts`; (c) confirm web `api`/toast import paths.
