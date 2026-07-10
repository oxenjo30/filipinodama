# Admin Phase 2 (Admins · Settings · Campaigns) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn 3 admin console Phase-2 stubs into real, audited, role-gated sections — Admins (role mgmt), Settings (live feature flags), Campaigns (segmented broadcasts) — plus a player-facing maintenance banner.

**Architecture:** Each section is an independent Fastify plugin (`admin-<section>.ts`) registered at `/api`, MODERATOR/ECONOMY/SUPERADMIN-gated, every mutation audited. Settings adds a `Config` table + a process-local cached `configService` the app reads at runtime (genuinely-wired flags; economy constants deferred as inert). Campaigns adds a `Campaign` table and fans a segment out to per-user `Notification` rows. The last-superadmin guard is an **atomic conditional write** (not count-then-decide). Server tests run via the Phase-1.5 `buildApp()` + `inject()` harness against `dama_test`.

**Tech Stack:** Node + Fastify + Prisma + PostgreSQL (server); React 18 + Vite (web + admin); Zod; Vitest.

## Global Constraints

- **Source of truth:** the spec at `docs/superpowers/specs/2026-07-10-admin-phase2-design.md`. Every task inherits it.
- **Every admin mutation** calls `audit(tx-or-db, {...})` (before/after/reason) and is `requireAdmin(role)`-gated. No exceptions.
- **Never fabricate/inert data** — economy-constants panel is NOT built (no runtime consumer). Diamond top-up stays locked (env-governed, never a Config row, never via configService).
- **ESM server** (`.js` import suffixes). Envelope: `ok(data)` / `err.*`. No new `errors.ts` helpers needed.
- **Roles:** Admins + Settings = SUPERADMIN; Campaigns = ECONOMY. `requireAdmin` is DB-role-authoritative + lockout-safe (Phase 1.5).
- **Config public exposure** = a hard-coded per-key allow-list (`PUBLIC_CONFIG_KEYS`), NEVER a category filter.
- **Migrations additive only.** Ship server + web + admin together.

---

## File Structure

**Server:**
- `apps/server/prisma/schema.prisma` — MODIFY: add `Config` + `Campaign` models + `campaignsSent Campaign[]` on User.
- `apps/server/prisma/migrations/<ts>_admin_phase2/` — CREATE (additive).
- `apps/server/prisma/seed.ts` — MODIFY: upsert the 3 wired Config rows (`value` only on create).
- `apps/server/src/lib/config-service.ts` — CREATE: cached runtime config reader.
- `apps/server/src/modules/admin-admins.ts` — CREATE.
- `apps/server/src/modules/admin-config.ts` — CREATE (admin CRUD + the public route).
- `apps/server/src/modules/admin-campaigns.ts` — CREATE.
- `apps/server/src/modules/rewards.ts` — MODIFY: daily-login reads `DAILY_LOGIN_ENABLED`.
- `apps/server/src/index.ts` — MODIFY: register the 3 admin plugins + the public config route.
- `apps/server/test/*.test.ts` — CREATE per section.

**Web:**
- `apps/web/src/lib/` — a tiny public-config fetch (or inline in AppLayout).
- `apps/web/src/features/layout/AppLayout.tsx` — MODIFY: maintenance banner.

**Admin:**
- `apps/admin/src/pages/Admins.tsx`, `Settings.tsx`, `Campaigns.tsx` — CREATE.
- `apps/admin/src/App.tsx` — MODIFY: 3 routes off Phase2 + drop P2 + raise /campaigns to ECONOMY.

Dependency order: **P1** schema+seed → **P2** configService → **P3** Admins → **P4** Settings (+public route) → **P5** Campaigns → **P6** client (web banner + 3 admin pages + nav).

---

## Phase 1 — Schema, migration, seed

### Task 1: Config + Campaign models + migration + seed

**Files:**
- Modify: `apps/server/prisma/schema.prisma`, `apps/server/prisma/seed.ts`
- Create: `apps/server/prisma/migrations/<ts>_admin_phase2/migration.sql`

**Interfaces:**
- Produces: `Config` model, `Campaign` model, `User.campaignsSent`, and 3 seeded Config rows that Tasks 2/4 read.

- [ ] **Step 1: Add both models to `schema.prisma`**

```prisma
model Config {
  key       String   @id
  value     String
  type      String   // "bool" | "int" | "string"
  category  String   // "flag"
  label     String
  updatedAt DateTime @updatedAt
}

model Campaign {
  id         String   @id @default(cuid())
  title      String
  body       String   @db.Text
  segment    String
  status     String   @default("sent")
  reach      Int      @default(0)
  sentById   String?
  sentBy     User?    @relation(fields: [sentById], references: [id], onDelete: SetNull)
  sentByName String
  createdAt  DateTime @default(now())

  @@index([createdAt])
}
```

- [ ] **Step 2: Add the back-relation to `User`** (alongside its other relation fields):

```prisma
  campaignsSent Campaign[]
```

- [ ] **Step 3: Scaffold + apply the migration against a LOCAL db (never prod)**

Run (from `apps/server`, using the local compose DB — the test-DB setup mirrors the Reports build):
```
DATABASE_URL="postgresql://dama:dama@localhost:5432/dama" pnpm exec prisma migrate dev --name admin_phase2
DATABASE_URL="postgresql://dama:dama@localhost:5432/dama_test" pnpm exec prisma migrate deploy
pnpm exec prisma generate
```
Expected: `Config`/`Campaign` tables created on both local DBs; client regenerated. If `migrate dev` is non-interactive-hostile, use `migrate diff --script` + `db execute` (as the Reports Task 1 did) — NEVER `migrate reset` on anything but the local `dama` DB, NEVER touch Railway.

- [ ] **Step 4: Seed the 3 wired Config rows in `seed.ts`** — add near the other upserts. **`value` ONLY in `create`** so re-seeding never clobbers an admin's edit:

```ts
const CONFIG_SEED = [
  { key: "MAINTENANCE_BANNER", value: "false", type: "bool", category: "flag", label: "Maintenance banner" },
  { key: "MAINTENANCE_TEXT", value: "", type: "string", category: "flag", label: "Maintenance banner text" },
  { key: "DAILY_LOGIN_ENABLED", value: "true", type: "bool", category: "flag", label: "Daily login bonus enabled" },
];
for (const c of CONFIG_SEED) {
  await prisma.config.upsert({
    where: { key: c.key },
    update: { type: c.type, category: c.category, label: c.label }, // NB: no `value` — don't clobber admin edits
    create: c,
  });
}
```

- [ ] **Step 5: Run the seed against the test DB + verify the rows**

Run: `DATABASE_URL="postgresql://dama:dama@localhost:5432/dama_test" pnpm exec tsx prisma/seed.ts` (or the repo's seed script), then:
```
DATABASE_URL="postgresql://dama:dama@localhost:5432/dama_test" node -e 'const{PrismaClient}=require("@prisma/client");const p=new PrismaClient();p.config.count().then(c=>{console.log("config rows:",c);return p.$disconnect()})'
```
Expected: `config rows: 3` (or ≥3).

- [ ] **Step 6: Typecheck**

Run: `cd apps/server && pnpm exec tsc -p tsconfig.build.json --noEmit`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add apps/server/prisma/schema.prisma apps/server/prisma/migrations apps/server/prisma/seed.ts
git commit -m "feat(db): Config + Campaign models + wired-flag seed"
```

---

## Phase 2 — configService

### Task 2: `config-service.ts` (cached runtime reader)

**Files:**
- Create: `apps/server/src/lib/config-service.ts`
- Test: `apps/server/test/config-service.test.ts`

**Interfaces:**
- Produces:
  - `getConfig(key: string): Promise<string | null>`
  - `getBool(key: string, fallback: boolean): Promise<boolean>`
  - `getInt(key: string, fallback: number): Promise<number>`
  - `invalidateConfig(key?: string): void` — drop one key (or all) from the cache; called by the config PATCH route.

- [ ] **Step 1: Write the failing test** `apps/server/test/config-service.test.ts`

```ts
import { describe, it, expect, afterEach, afterAll } from "vitest";
import { prisma } from "../src/db/client.js";
import { getBool, getConfig, invalidateConfig } from "../src/lib/config-service.js";
import { truncateAll } from "./helpers.js";

afterEach(async () => { await prisma.config.deleteMany({ where: { key: { startsWith: "T_" } } }); invalidateConfig(); });
afterAll(async () => { await prisma.$disconnect(); });

describe("config-service", () => {
  it("reads a bool row, falls back when unset, and reflects updates after invalidate", async () => {
    expect(await getBool("T_FLAG", false)).toBe(false); // unset → fallback
    await prisma.config.create({ data: { key: "T_FLAG", value: "true", type: "bool", category: "flag", label: "t" } });
    invalidateConfig("T_FLAG");
    expect(await getBool("T_FLAG", false)).toBe(true);
    await prisma.config.update({ where: { key: "T_FLAG" }, data: { value: "false" } });
    invalidateConfig("T_FLAG");
    expect(await getBool("T_FLAG", true)).toBe(false);
    expect(await getConfig("T_MISSING")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd apps/server && pnpm test -- config-service`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `apps/server/src/lib/config-service.ts`**

```ts
import { prisma } from "../db/client.js";

type Entry = { value: string | null; at: number };
const TTL_MS = 15_000;
const cache = new Map<string, Entry>();

export function invalidateConfig(key?: string): void {
  if (key) cache.delete(key);
  else cache.clear();
}

export async function getConfig(key: string): Promise<string | null> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const row = await prisma.config.findUnique({ where: { key }, select: { value: true } });
  const value = row ? row.value : null;
  cache.set(key, { value, at: Date.now() });
  return value;
}

export async function getBool(key: string, fallback: boolean): Promise<boolean> {
  const v = await getConfig(key);
  if (v == null) return fallback;
  return v === "true";
}

export async function getInt(key: string, fallback: number): Promise<number> {
  const v = await getConfig(key);
  if (v == null) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `cd apps/server && pnpm test -- config-service`
Expected: 1 passing.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/lib/config-service.ts apps/server/test/config-service.test.ts
git commit -m "feat(config): process-local cached configService (get/bool/int + invalidate)"
```

---

## Phase 3 — Admins (role management)

### Task 3: `admin-admins.ts` + atomic last-superadmin guard

**Files:**
- Create: `apps/server/src/modules/admin-admins.ts`
- Modify: `apps/server/src/index.ts` (register)
- Test: `apps/server/test/admin-admins.test.ts`

**Interfaces:**
- Consumes: `requireAdmin`, `prisma`, `ok`/`err`, `audit`.
- Produces: `export async function adminAdminsRoutes(app: FastifyInstance)`.

- [ ] **Step 1: Write the failing tests** `apps/server/test/admin-admins.test.ts`

```ts
import { describe, it, expect, afterEach, afterAll } from "vitest";
import { prisma } from "../src/db/client.js";
import { buildTestApp, seedUser, authFor, truncateAll } from "./helpers.js";

afterEach(truncateAll);
afterAll(async () => { await prisma.$disconnect(); });

describe("admin-admins", () => {
  it("SUPERADMIN grants + revokes an existing user; audited", async () => {
    const app = await buildTestApp();
    const su = await seedUser({ adminRole: "SUPERADMIN" });
    const target = await prisma.user.update({ where: { id: (await seedUser()).id }, data: { email: "t@x.com" } });
    const cookie = authFor({ sub: su.id, adminRole: "SUPERADMIN" });
    const g = await app.inject({ method: "POST", url: "/api/admin/admins/grant", headers: { cookie }, payload: { query: "t@x.com", role: "MODERATOR" } });
    expect(g.statusCode).toBe(200);
    expect((await prisma.user.findUnique({ where: { id: target.id } }))!.adminRole).toBe("MODERATOR");
    const r = await app.inject({ method: "POST", url: `/api/admin/admins/${target.id}/revoke`, headers: { cookie }, payload: { reason: "x" } });
    expect(r.statusCode).toBe(200);
    expect((await prisma.user.findUnique({ where: { id: target.id } }))!.adminRole).toBeNull();
    await app.close();
  });

  it("rejects changing your own admin role", async () => {
    const app = await buildTestApp();
    const su = await seedUser({ adminRole: "SUPERADMIN" });
    const res = await app.inject({ method: "POST", url: `/api/admin/admins/${su.id}/revoke`, headers: { cookie: authFor({ sub: su.id, adminRole: "SUPERADMIN" }) }, payload: { reason: "x" } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("SELF_ADMIN_CHANGE");
    await app.close();
  });

  it("single-actor: refuses to revoke the last superadmin", async () => {
    const app = await buildTestApp();
    const only = await seedUser({ adminRole: "SUPERADMIN" });
    const other = await seedUser({ adminRole: "SUPERADMIN" }); // actor, so `only` is the target
    const res = await app.inject({ method: "POST", url: `/api/admin/admins/${only.id}/revoke`, headers: { cookie: authFor({ sub: other.id, adminRole: "SUPERADMIN" }) }, payload: { reason: "x" } });
    // two superadmins exist → this one is allowed; now only `other` remains, revoking it must fail
    expect(res.statusCode).toBe(200);
    const last = await app.inject({ method: "POST", url: `/api/admin/admins/${other.id}/revoke`, headers: { cookie: authFor({ sub: other.id, adminRole: "SUPERADMIN" }) }, payload: { reason: "x" } });
    // revoking self is blocked first — use a fresh non-self actor:
    expect([400]).toContain(last.statusCode); // SELF_ADMIN_CHANGE (self) — see note
    await app.close();
  });

  it("concurrency: two revokes of the two remaining superadmins → exactly one succeeds, ≥1 remains", async () => {
    const app = await buildTestApp();
    const a = await seedUser({ adminRole: "SUPERADMIN" });
    const b = await seedUser({ adminRole: "SUPERADMIN" });
    const actor = await seedUser({ adminRole: "SUPERADMIN" }); // 3 total; actor revokes a and b concurrently
    const cookie = authFor({ sub: actor.id, adminRole: "SUPERADMIN" });
    const [r1, r2] = await Promise.all([
      app.inject({ method: "POST", url: `/api/admin/admins/${a.id}/revoke`, headers: { cookie }, payload: { reason: "x" } }),
      app.inject({ method: "POST", url: `/api/admin/admins/${b.id}/revoke`, headers: { cookie }, payload: { reason: "x" } }),
    ]);
    // both a and b can be revoked (actor remains) — so both 200 and actor is the last superadmin
    const remaining = await prisma.user.count({ where: { adminRole: "SUPERADMIN" } });
    expect(remaining).toBeGreaterThanOrEqual(1);
    // now revoking the actor (self) is blocked, and if a non-self last-superadmin revoke is attempted it 400s LAST_SUPERADMIN
    await app.close();
  });

  it("non-SUPERADMIN cannot reach the routes", async () => {
    const app = await buildTestApp();
    const mod = await seedUser({ adminRole: "MODERATOR" });
    const res = await app.inject({ method: "GET", url: "/api/admin/admins", headers: { cookie: authFor({ sub: mod.id, adminRole: "MODERATOR" }) } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});
```
> Implementer note: the last-superadmin *single-actor* rejection is best tested by having a NON-self actor revoke the one-and-only OTHER superadmin. Construct the scenario so the target is the sole remaining superadmin and the actor is someone else (e.g. actor is MODERATOR being temporarily SUPERADMIN, or use 2 superadmins where actor≠target and target is made the last by first revoking others). Adjust the two last-superadmin tests to unambiguously assert: a revoke that would leave zero superadmins → 400 `LAST_SUPERADMIN`; concurrent double-revoke of the final two → not both succeed. Keep the concurrency test (Promise.all) — it's the point.

- [ ] **Step 2: Run, verify fail**

Run: `cd apps/server && pnpm test -- admin-admins`
Expected: FAIL (routes unregistered).

- [ ] **Step 3: Implement `apps/server/src/modules/admin-admins.ts`**

```ts
import type { FastifyInstance } from "fastify";
import type { AdminRole, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { ok, err } from "../lib/errors.js";
import { requireAdmin } from "../auth/guards.js";
import { audit } from "../lib/audit.js";

const ROLES = ["SUPPORT", "MODERATOR", "ECONOMY", "SUPERADMIN"] as const;

/** Atomic set-or-reject that never leaves zero superadmins. Returns rows affected. */
async function setRoleGuarded(targetId: string, newRole: AdminRole | null): Promise<number> {
  // Prisma can't express the correlated "another superadmin exists" subquery, so use $executeRaw.
  return prisma.$executeRaw`
    UPDATE "User" SET "adminRole" = ${newRole}::"AdminRole"
    WHERE id = ${targetId}
      AND ("adminRole" <> 'SUPERADMIN'
           OR (SELECT count(*) FROM "User" WHERE "adminRole" = 'SUPERADMIN' AND "deletedAt" IS NULL) > 1)`;
}

export async function adminAdminsRoutes(app: FastifyInstance) {
  app.get("/admin/admins", { preHandler: requireAdmin("SUPERADMIN") }, async () => {
    const rows = await prisma.user.findMany({
      where: { adminRole: { not: null } },
      select: { id: true, username: true, tag: true, email: true, displayName: true, avatarUrl: true, adminRole: true, lastSeenAt: true },
      orderBy: { adminRole: "asc" },
    });
    const byRole: Record<string, number> = { SUPPORT: 0, MODERATOR: 0, ECONOMY: 0, SUPERADMIN: 0 };
    for (const r of rows) if (r.adminRole) byRole[r.adminRole] += 1;
    return ok({ items: rows, stats: { byRole, total: rows.length } });
  });

  app.post("/admin/admins/grant", { preHandler: requireAdmin("SUPERADMIN") }, async (req) => {
    const { query, role } = z.object({ query: z.string().trim().min(1), role: z.enum(ROLES) }).parse(req.body);
    const matches = await prisma.user.findMany({
      where: { deletedAt: null, OR: [{ email: { equals: query, mode: "insensitive" } }, { id: query }, ...(query.includes("#") ? [{ AND: [{ username: { equals: query.split("#")[0], mode: "insensitive" as const } }, { tag: `#${query.split("#")[1]}` }] }] : [{ username: { equals: query, mode: "insensitive" as const } }]) ] },
      select: { id: true, adminRole: true },
      take: 2,
    });
    if (matches.length === 0) throw err.notFound("NO_USER", "No matching user");
    if (matches.length > 1) throw err.badRequest("AMBIGUOUS", "Multiple users match — use an email or id");
    const target = matches[0]!;
    if (target.id === req.userId) throw err.badRequest("SELF_ADMIN_CHANGE", "You can't change your own admin role");
    const before = target.adminRole;
    const n = await setRoleGuarded(target.id, role);
    if (n === 0) throw err.badRequest("LAST_SUPERADMIN", "Cannot remove the last superadmin");
    await audit(prisma, { actorId: req.userId!, action: "admin.grant", targetType: "user", targetId: target.id, before: { adminRole: before }, after: { adminRole: role } });
    return ok({ id: target.id, role });
  });

  app.post<{ Params: { id: string } }>("/admin/admins/:id/revoke", { preHandler: requireAdmin("SUPERADMIN") }, async (req) => {
    const { reason } = z.object({ reason: z.string().trim().min(1).max(500) }).parse(req.body);
    if (req.params.id === req.userId) throw err.badRequest("SELF_ADMIN_CHANGE", "You can't change your own admin role");
    const before = await prisma.user.findUnique({ where: { id: req.params.id }, select: { adminRole: true } });
    if (!before) throw err.notFound("NO_USER", "Admin not found");
    const n = await setRoleGuarded(req.params.id, null);
    if (n === 0) throw err.badRequest("LAST_SUPERADMIN", "Cannot remove the last superadmin");
    await audit(prisma, { actorId: req.userId!, action: "admin.revoke", targetType: "user", targetId: req.params.id, before, after: { adminRole: null }, reason });
    return ok({ id: req.params.id, role: null });
  });

  app.patch<{ Params: { id: string } }>("/admin/admins/:id/role", { preHandler: requireAdmin("SUPERADMIN") }, async (req) => {
    const { role } = z.object({ role: z.enum(ROLES) }).parse(req.body);
    if (req.params.id === req.userId) throw err.badRequest("SELF_ADMIN_CHANGE", "You can't change your own admin role");
    const before = await prisma.user.findUnique({ where: { id: req.params.id }, select: { adminRole: true } });
    if (!before) throw err.notFound("NO_USER", "Admin not found");
    const n = await setRoleGuarded(req.params.id, role);
    if (n === 0) throw err.badRequest("LAST_SUPERADMIN", "Cannot remove the last superadmin");
    await audit(prisma, { actorId: req.userId!, action: "admin.role", targetType: "user", targetId: req.params.id, before, after: { adminRole: role } });
    return ok({ id: req.params.id, role });
  });
}
```
> Implementer notes: confirm the Postgres enum type name is `"AdminRole"` (check the migration) for the `::"AdminRole"` cast; if the cast errors, inspect the generated type name and fix. Confirm `$executeRaw` returns the affected-row count as a number here. The `setRoleGuarded` WHERE only blocks removing the last superadmin when the TARGET is a superadmin being changed to non-superadmin — for grant-to-higher or non-superadmin targets it always affects 1 row (correct).

- [ ] **Step 4: Register in `index.ts`** (inside `buildApp`, near the other admin plugins):

```ts
import { adminAdminsRoutes } from "./modules/admin-admins.js";
await app.register(adminAdminsRoutes, { prefix: "/api" });
```

- [ ] **Step 5: Run tests, verify pass** (fix the two last-superadmin test scenarios per the note so they unambiguously assert LAST_SUPERADMIN + the concurrency invariant).

Run: `cd apps/server && pnpm test -- admin-admins`
Expected: all pass, including the concurrency test (run it 2-3× for flakiness — the atomic write must hold).

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/modules/admin-admins.ts apps/server/src/index.ts apps/server/test/admin-admins.test.ts
git commit -m "feat(admin): admins section — grant/revoke/role with atomic last-superadmin guard"
```

---

## Phase 4 — Settings (config) + public route

### Task 4: `admin-config.ts` + `/api/config/public` + wire DAILY_LOGIN_ENABLED

**Files:**
- Create: `apps/server/src/modules/admin-config.ts`
- Modify: `apps/server/src/modules/rewards.ts` (daily-login flag check), `apps/server/src/index.ts` (register)
- Test: `apps/server/test/admin-config.test.ts`

**Interfaces:**
- Consumes: `requireAdmin`, `prisma`, `ok`/`err`, `audit`, `invalidateConfig` (Task 2), `getBool` (Task 2), `env` (for the locked diamond-topup value).
- Produces: `export async function adminConfigRoutes(app: FastifyInstance)` (mounts `/admin/config*` + `/config/public`).

- [ ] **Step 1: Write the failing tests** `apps/server/test/admin-config.test.ts`

```ts
import { describe, it, expect, afterEach, afterAll } from "vitest";
import { prisma } from "../src/db/client.js";
import { getBool, invalidateConfig } from "../src/lib/config-service.js";
import { buildTestApp, seedUser, authFor } from "./helpers.js";

afterEach(async () => { await prisma.config.deleteMany({}); invalidateConfig(); });
afterAll(async () => { await prisma.$disconnect(); });

describe("admin-config", () => {
  it("SUPERADMIN PATCH updates + audits + invalidates cache", async () => {
    const app = await buildTestApp();
    const su = await seedUser({ adminRole: "SUPERADMIN" });
    await prisma.config.create({ data: { key: "MAINTENANCE_BANNER", value: "false", type: "bool", category: "flag", label: "m" } });
    invalidateConfig();
    expect(await getBool("MAINTENANCE_BANNER", false)).toBe(false);
    const res = await app.inject({ method: "PATCH", url: "/api/admin/config/MAINTENANCE_BANNER", headers: { cookie: authFor({ sub: su.id, adminRole: "SUPERADMIN" }) }, payload: { value: "true", reason: "on" } });
    expect(res.statusCode).toBe(200);
    expect(await getBool("MAINTENANCE_BANNER", false)).toBe(true); // cache invalidated
    await app.close();
  });

  it("locked key flip → 403 LOCKED_FLAG", async () => {
    const app = await buildTestApp();
    const su = await seedUser({ adminRole: "SUPERADMIN" });
    const res = await app.inject({ method: "PATCH", url: "/api/admin/config/DIAMOND_TOPUP_ENABLED", headers: { cookie: authFor({ sub: su.id, adminRole: "SUPERADMIN" }) }, payload: { value: "true", reason: "x" } });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("LOCKED_FLAG");
    await app.close();
  });

  it("bad value type → 400 BAD_VALUE; unknown key → 404", async () => {
    const app = await buildTestApp();
    const su = await seedUser({ adminRole: "SUPERADMIN" });
    const cookie = authFor({ sub: su.id, adminRole: "SUPERADMIN" });
    await prisma.config.create({ data: { key: "T_INT", value: "5", type: "int", category: "flag", label: "i" } });
    const bad = await app.inject({ method: "PATCH", url: "/api/admin/config/T_INT", headers: { cookie }, payload: { value: "notanint", reason: "x" } });
    expect(bad.statusCode).toBe(400);
    const missing = await app.inject({ method: "PATCH", url: "/api/admin/config/NOPE", headers: { cookie }, payload: { value: "x", reason: "x" } });
    expect(missing.statusCode).toBe(404);
    await app.close();
  });

  it("GET /api/config/public returns ONLY the allow-list keys", async () => {
    const app = await buildTestApp();
    await prisma.config.createMany({ data: [
      { key: "MAINTENANCE_BANNER", value: "true", type: "bool", category: "flag", label: "m" },
      { key: "MAINTENANCE_TEXT", value: "brb", type: "string", category: "flag", label: "t" },
      { key: "DAILY_LOGIN_ENABLED", value: "true", type: "bool", category: "flag", label: "d" }, // NOT public
    ]});
    const res = await app.inject({ method: "GET", url: "/api/config/public" });
    expect(res.statusCode).toBe(200);
    const keys = Object.keys(res.json().data);
    expect(keys.sort()).toEqual(["MAINTENANCE_BANNER", "MAINTENANCE_TEXT"]);
    expect(keys).not.toContain("DAILY_LOGIN_ENABLED");
    await app.close();
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `cd apps/server && pnpm test -- admin-config`
Expected: FAIL.

- [ ] **Step 3: Implement `apps/server/src/modules/admin-config.ts`**

```ts
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { ok, err } from "../lib/errors.js";
import { requireAdmin } from "../auth/guards.js";
import { audit } from "../lib/audit.js";
import { invalidateConfig } from "../lib/config-service.js";
import { env } from "../config/env.js";

const LOCKED_KEYS = new Set(["DIAMOND_TOPUP_ENABLED"]);          // env-governed, never a writable row
const PUBLIC_CONFIG_KEYS = ["MAINTENANCE_BANNER", "MAINTENANCE_TEXT"] as const;

function validate(type: string, value: string): boolean {
  if (type === "bool") return value === "true" || value === "false";
  if (type === "int") return /^-?\d+$/.test(value);
  return true; // string
}

export async function adminConfigRoutes(app: FastifyInstance) {
  app.get("/admin/config", { preHandler: requireAdmin("SUPERADMIN") }, async () => {
    const rows = await prisma.config.findMany({ orderBy: [{ category: "asc" }, { key: "asc" }] });
    // surface the locked diamond-topup value from ENV (never a row), for display only
    const locked = { key: "DIAMOND_TOPUP_ENABLED", value: String(env.DIAMOND_TOPUP_ENABLED), type: "bool", category: "flag", label: "Diamond top-up (locked)", locked: true };
    return ok({ items: rows.map((r) => ({ ...r, locked: LOCKED_KEYS.has(r.key) })), locked: [locked] });
  });

  app.patch<{ Params: { key: string } }>("/admin/config/:key", { preHandler: requireAdmin("SUPERADMIN") }, async (req) => {
    if (LOCKED_KEYS.has(req.params.key)) throw err.forbidden("LOCKED_FLAG", "This flag is locked");
    const { value, reason } = z.object({ value: z.string(), reason: z.string().trim().min(1).max(500) }).parse(req.body);
    const row = await prisma.config.findUnique({ where: { key: req.params.key } });
    if (!row) throw err.notFound("NO_CONFIG", "Unknown config key");
    if (!validate(row.type, value)) throw err.badRequest("BAD_VALUE", `Invalid ${row.type} value`);
    await prisma.config.update({ where: { key: req.params.key }, data: { value } });
    invalidateConfig(req.params.key);
    await audit(prisma, { actorId: req.userId!, action: "config.update", targetType: "config", targetId: req.params.key, before: { value: row.value }, after: { value }, reason });
    return ok({ key: req.params.key, value });
  });

  // Player-safe subset — UNAUTHENTICATED, per-key allow-list (NEVER a category filter).
  app.get("/config/public", async () => {
    const rows = await prisma.config.findMany({ where: { key: { in: [...PUBLIC_CONFIG_KEYS] } }, select: { key: true, value: true } });
    const out: Record<string, string> = {};
    for (const r of rows) out[r.key] = r.value;
    return ok(out);
  });
}
```

- [ ] **Step 4: Wire `DAILY_LOGIN_ENABLED` in `rewards.ts`** — in the daily-login CLAIM path (the POST that grants gold; NOT the GET status), gate on the flag:

```ts
import { getBool } from "../lib/config-service.js";
// inside the claim handler, before granting:
if (!(await getBool("DAILY_LOGIN_ENABLED", true))) throw err.forbidden("DAILY_LOGIN_OFF", "Daily login bonus is disabled");
```
(Read the current rewards.ts to find the claim handler + its error import; default `true` so it stays on if the row is unset.)

- [ ] **Step 5: Register in `index.ts`**

```ts
import { adminConfigRoutes } from "./modules/admin-config.js";
await app.register(adminConfigRoutes, { prefix: "/api" });
```

- [ ] **Step 6: Run tests + full suite**

Run: `cd apps/server && pnpm test -- admin-config` then `pnpm test`
Expected: config tests pass; full suite green.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/modules/admin-config.ts apps/server/src/modules/rewards.ts apps/server/src/index.ts apps/server/test/admin-config.test.ts
git commit -m "feat(admin): config section — CRUD + LOCKED_KEYS + public allow-list + wire daily-login flag"
```

---

## Phase 5 — Campaigns

### Task 5: `admin-campaigns.ts` (preview + segmented send)

**Files:**
- Create: `apps/server/src/modules/admin-campaigns.ts`
- Modify: `apps/server/src/index.ts` (register)
- Test: `apps/server/test/admin-campaigns.test.ts`

**Interfaces:**
- Consumes: `requireAdmin("ECONOMY")`, `prisma`, `ok`/`err`, `audit`, `rankTierSchema` (`@dama/shared`).
- Produces: `export async function adminCampaignsRoutes(app: FastifyInstance)`.

- [ ] **Step 1: Write the failing tests** `apps/server/test/admin-campaigns.test.ts`

```ts
import { describe, it, expect, afterEach, afterAll } from "vitest";
import { prisma } from "../src/db/client.js";
import { buildTestApp, seedUser, authFor, truncateAll } from "./helpers.js";

afterEach(truncateAll);
afterAll(async () => { await prisma.$disconnect(); });

describe("admin-campaigns", () => {
  it("preview counts a segment; send creates N notifications + a Campaign row + audit", async () => {
    const app = await buildTestApp();
    const eco = await seedUser({ adminRole: "ECONOMY" });
    await seedUser(); await seedUser(); // 2 real players (+eco)
    const cookie = authFor({ sub: eco.id, adminRole: "ECONOMY" });
    const prev = await app.inject({ method: "POST", url: "/api/admin/campaigns/preview", headers: { cookie }, payload: { segment: "all" } });
    expect(prev.statusCode).toBe(200);
    expect(prev.json().data.count).toBeGreaterThanOrEqual(2);
    const send = await app.inject({ method: "POST", url: "/api/admin/campaigns/send", headers: { cookie }, payload: { title: "Hi", body: "2x gold!", segment: "all", reason: "promo" } });
    expect(send.statusCode).toBe(200);
    const reach = send.json().data.reach;
    expect(await prisma.notification.count({ where: { type: "announcement" } })).toBe(reach);
    const camp = await prisma.campaign.findFirst();
    expect(camp!.reach).toBe(reach);
    expect(camp!.sentByName).toBeTruthy();
    await app.close();
  });

  it("unknown tier → 400 BAD_SEGMENT; empty segment → 400 EMPTY_SEGMENT; hyphenated tier resolves", async () => {
    const app = await buildTestApp();
    const eco = await seedUser({ adminRole: "ECONOMY" });
    const cookie = authFor({ sub: eco.id, adminRole: "ECONOMY" });
    const bad = await app.inject({ method: "POST", url: "/api/admin/campaigns/send", headers: { cookie }, payload: { title: "t", body: "b", segment: "rank:notatier", reason: "x" } });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe("BAD_SEGMENT");
    // star-guardian is a valid (hyphenated) tier but nobody is in it → EMPTY_SEGMENT
    const empty = await app.inject({ method: "POST", url: "/api/admin/campaigns/send", headers: { cookie }, payload: { title: "t", body: "b", segment: "rank:star-guardian", reason: "x" } });
    expect(empty.statusCode).toBe(400);
    expect(empty.json().error.code).toBe("EMPTY_SEGMENT");
    await app.close();
  });

  it("non-ECONOMY (SUPPORT) → 403", async () => {
    const app = await buildTestApp();
    const s = await seedUser({ adminRole: "SUPPORT" });
    const res = await app.inject({ method: "GET", url: "/api/admin/campaigns", headers: { cookie: authFor({ sub: s.id, adminRole: "SUPPORT" }) } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `cd apps/server && pnpm test -- admin-campaigns`
Expected: FAIL.

- [ ] **Step 3: Implement `apps/server/src/modules/admin-campaigns.ts`**

```ts
import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { rankTierSchema } from "@dama/shared";
import { prisma } from "../db/client.js";
import { ok, err } from "../lib/errors.js";
import { requireAdmin } from "../auth/guards.js";
import { audit } from "../lib/audit.js";

const segmentSchema = z.union([
  z.literal("all"),
  z.literal("active7d"),
  z.string().startsWith("rank:").transform((s) => s.slice(5)).pipe(rankTierSchema).transform((k) => `rank:${k}` as const),
]);

function segmentWhere(segment: string): Prisma.UserWhereInput {
  const base: Prisma.UserWhereInput = { isBot: false, isGuest: false, deletedAt: null };
  if (segment === "all") return base;
  if (segment === "active7d") return { ...base, lastSeenAt: { gte: new Date(Date.now() - 7 * 86_400_000) } };
  return { ...base, rankTier: segment.slice(5) };
}

const CHUNK = 1000;

export async function adminCampaignsRoutes(app: FastifyInstance) {
  app.get("/admin/campaigns", { preHandler: requireAdmin("ECONOMY") }, async () => {
    const items = await prisma.campaign.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
    return ok({ items });
  });

  app.post("/admin/campaigns/preview", { preHandler: requireAdmin("ECONOMY") }, async (req) => {
    const seg = parseSegment(req.body);
    const count = await prisma.user.count({ where: segmentWhere(seg) });
    return ok({ count });
  });

  app.post("/admin/campaigns/send", { preHandler: requireAdmin("ECONOMY") }, async (req) => {
    const body = z.object({ title: z.string().trim().min(1).max(120), body: z.string().trim().min(1).max(1000), reason: z.string().trim().min(1).max(500) }).parse(req.body);
    const seg = parseSegment(req.body);
    const targets = await prisma.user.findMany({ where: segmentWhere(seg), select: { id: true } });
    if (targets.length === 0) throw err.badRequest("EMPTY_SEGMENT", "No players match this segment");
    const actor = await prisma.user.findUnique({ where: { id: req.userId! }, select: { username: true, tag: true } });
    const sentByName = `${actor!.username}${actor!.tag}`;
    let reach = 0;
    for (let i = 0; i < targets.length; i += CHUNK) {
      const slice = targets.slice(i, i + CHUNK);
      const res = await prisma.notification.createMany({ data: slice.map((u) => ({ userId: u.id, type: "announcement", title: body.title, body: body.body })) });
      reach += res.count;
    }
    const camp = await prisma.campaign.create({ data: { title: body.title, body: body.body, segment: seg, status: "sent", reach, sentById: req.userId!, sentByName } });
    await audit(prisma, { actorId: req.userId!, action: "campaign.send", targetType: "campaign", targetId: camp.id, after: { segment: seg, reach }, reason: body.title });
    return ok({ id: camp.id, reach });
  });
}

function parseSegment(reqBody: unknown): string {
  const raw = (reqBody as { segment?: unknown })?.segment;
  const parsed = segmentSchema.safeParse(raw);
  if (!parsed.success) throw err.badRequest("BAD_SEGMENT", "Invalid audience segment");
  return parsed.data;
}
```
> Implementer note: confirm `rankTierSchema` is exported from `@dama/shared` (ranks.ts:25) and accepts the tier key strings. Confirm the `Notification` model fields (`userId`, `type`, `title`, `body`) match. `createMany` returns `{ count }`.

- [ ] **Step 4: Register in `index.ts`**

```ts
import { adminCampaignsRoutes } from "./modules/admin-campaigns.js";
await app.register(adminCampaignsRoutes, { prefix: "/api" });
```

- [ ] **Step 5: Run tests + full suite + typecheck**

Run: `cd apps/server && pnpm test && pnpm exec tsc -p tsconfig.build.json --noEmit`
Expected: all pass, tsc clean.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/modules/admin-campaigns.ts apps/server/src/index.ts apps/server/test/admin-campaigns.test.ts
git commit -m "feat(admin): campaigns section — preview + segmented send (schema-validated, chunked)"
```

---

## Phase 6 — Client (web banner + 3 admin pages + nav)

### Task 6: Web maintenance banner

**Files:**
- Modify: `apps/web/src/features/layout/AppLayout.tsx`

**Interfaces:**
- Consumes: `GET /api/config/public` (Task 4).

- [ ] **Step 1: Fetch public config in AppLayout + render a banner when on**

Read the current `AppLayout.tsx`. Add on mount: fetch `/api/config/public` via the web `api` client; if `MAINTENANCE_BANNER === "true"`, render a top banner strip showing `MAINTENANCE_TEXT` (fallback text if empty), using existing web tokens/classes. Non-blocking (a failed fetch → no banner). Confirm the real `api` client + a sensible place for a top strip above the routed content.

- [ ] **Step 2: Typecheck + build web**

Run: `cd apps/web && pnpm exec tsc --noEmit && pnpm build`
Expected: exit 0, build ok.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/layout/AppLayout.tsx
git commit -m "feat(web): maintenance banner from /api/config/public"
```

### Task 7: Admin pages (Admins, Settings, Campaigns) + nav wiring

**Files:**
- Create: `apps/admin/src/pages/Admins.tsx`, `Settings.tsx`, `Campaigns.tsx`
- Modify: `apps/admin/src/App.tsx`

**Interfaces:**
- Consumes: admin `api.get`/`useAdminMutation`; the routes from Tasks 3/4/5. Match `Economy.tsx` + approved tokens.

- [ ] **Step 1: `Admins.tsx`** — read `Economy.tsx` + `ui.tsx` first. Stat cards (byRole + total from `GET /api/admin/admins`), a "Grant admin" card (query input + role select → `POST /admin/admins/grant` via `useAdminMutation`), and a table of admins (role select → `PATCH /admin/admins/:id/role`; Revoke → `POST /admin/admins/:id/revoke`). The current user's own row shows a "You" badge and disabled controls (client-side mirror of the server `SELF_ADMIN_CHANGE` guard). `LAST_SUPERADMIN`/`SELF_ADMIN_CHANGE` errors surface as toasts.

- [ ] **Step 2: `Settings.tsx`** — read `GET /api/admin/config`. A "Feature flags" panel: one control per row (bool → toggle, string → input, int → number), Save → `PATCH /admin/config/:key` via `useAdminMutation` (reason required). The locked diamond-topup row renders **disabled** with the "disabled for legal compliance" note (value from the `locked` payload). No economy-constants panel.

- [ ] **Step 3: `Campaigns.tsx`** — compose card (title, message, segment select: All / Active 7d / each rank tier). "Preview reach" → `POST /admin/campaigns/preview` → show the count. "Send now" → `useAdminMutation` with a confirm that displays the previewed reach + requires a reason, → `POST /admin/campaigns/send`. History table from `GET /admin/campaigns` (title, segment, reach, sentByName, when; CTR column shows "—"). Approved `secCampaigns` fidelity, approved tokens only.

- [ ] **Step 4: Wire `App.tsx`** — import the 3 pages; swap `/admins`, `/settings`, `/campaigns` routes from `Phase2` stubs to the real pages; drop the `true` P2 flag on all 3 nav entries; **change the `/campaigns` nav min-role from `SUPPORT` to `ECONOMY`** (the 5th tuple element).

- [ ] **Step 5: Typecheck + build admin**

Run: `cd apps/admin && pnpm run typecheck && pnpm run build`
Expected: exit 0, build ok.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/src/pages/Admins.tsx apps/admin/src/pages/Settings.tsx apps/admin/src/pages/Campaigns.tsx apps/admin/src/App.tsx
git commit -m "feat(admin): Admins + Settings + Campaigns pages + nav wiring"
```

### Task 8: Deploy + verify

- [ ] **Step 1: Merge the feature branch → main, push** (Railway auto-deploys; the additive migration runs via `migrate deploy`; the seed is a manual one-off per DEPLOY_CHECKLIST — run the Config seed against prod once via the documented seed step).

- [ ] **Step 2: Poll API + admin + web deploys** for the commit until SUCCESS (as in the Reports build).

- [ ] **Step 3: Verify routes + migration on prod**

Run:
```bash
for p in /api/admin/admins /api/admin/config /api/admin/campaigns; do
  curl -s --ssl-no-revoke -o /dev/null -w "$p -> %{http_code}\n" "https://api.filipinodama.com$p"
done
curl -s --ssl-no-revoke "https://api.filipinodama.com/api/config/public" -w " [config/public: %{http_code}]\n"
```
Expected: the 3 admin routes → 401 (exist + guarded); `/api/config/public` → 200 with only the allow-list keys. Also verify (via the prod DB, DATABASE_PUBLIC_URL) that `Config` + `Campaign` tables exist and the 3 seed rows are present.

- [ ] **Step 4: Manual E2E** — grant a teammate admin + confirm they gain access without re-login; flip the maintenance banner on + see it on filipinodama.com, then off; send a small campaign to `active7d` + confirm the bell notification + real reach in history.

---

## Self-Review

**Spec coverage:** Config+Campaign models + seed (T1) ✓; configService with invalidate (T2) ✓; Admins grant/revoke/role + atomic last-superadmin + self-guard + stats (T3) ✓; config CRUD + LOCKED_KEYS 403 + BAD_VALUE + public allow-list + daily-login wire (T4) ✓; campaigns preview + segmented chunked send + rankTierSchema segment + BAD_SEGMENT/EMPTY_SEGMENT + sentByName (T5) ✓; web maintenance banner (T6) ✓; 3 admin pages + nav role fix (T7) ✓; deploy+verify (T8) ✓. Economy-constants correctly ABSENT (deferred). Diamond-topup lock enforced server-side + never a row (T4).

**Placeholder scan:** every code step has real code. The "confirm the exact enum type name / api client / rewards claim handler" notes are genuine integration-lookup points (named precisely), not placeholders.

**Type consistency:** `setRoleGuarded` used identically across grant/revoke/role (T3). `invalidateConfig`/`getBool` signatures match between T2 (def) and T4 (use). `segmentSchema`/`segmentWhere` consistent within T5. Error codes (`SELF_ADMIN_CHANGE`, `LAST_SUPERADMIN`, `LOCKED_FLAG`, `BAD_VALUE`, `BAD_SEGMENT`, `EMPTY_SEGMENT`) consistent between routes + tests. `PUBLIC_CONFIG_KEYS` allow-list matches the test's expected keys.

**Known implementer lookups (not gaps):** (a) Postgres enum type name for the `::"AdminRole"` cast; (b) `$executeRaw` returns a number row-count; (c) the exact rewards.ts claim handler + its `err` import; (d) `rankTierSchema` export shape; (e) web `api` client + AppLayout banner placement. Each is named with where to look.
