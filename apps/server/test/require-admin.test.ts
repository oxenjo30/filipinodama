import { describe, it, expect, afterEach, afterAll } from "vitest";
import { prisma } from "../src/db/client.js";
import { buildTestApp, seedUser, authFor, truncateAll } from "./helpers.js";

afterEach(truncateAll);
afterAll(async () => {
  await prisma.$disconnect();
});

// NOTE: the brief's test targets /api/admin/reports, which does not exist yet
// (it lands in Task 9). This task hardens requireAdmin itself, so we exercise
// it against REAL existing admin routes instead:
//   - /api/admin/audit  -> requireAdmin("SUPERADMIN")
//   - /api/admin/users  -> requireAdmin("SUPPORT")

describe("requireAdmin hardening", () => {
  it("rejects a stale token claiming SUPERADMIN whose DB role is null (DB is authoritative)", async () => {
    const app = await buildTestApp();
    const u = await seedUser({ adminRole: null }); // DB says NOT admin
    const staleCookie = authFor({ sub: u.id, adminRole: "SUPERADMIN" }); // token LIES
    const res = await app.inject({ method: "GET", url: "/api/admin/audit", headers: { cookie: staleCookie } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("rejects a demoted admin (token SUPERADMIN, DB SUPPORT) on a SUPERADMIN route", async () => {
    const app = await buildTestApp();
    const u = await seedUser({ adminRole: "SUPPORT" });
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/audit",
      headers: { cookie: authFor({ sub: u.id, adminRole: "SUPERADMIN" }) },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("rejects a deleted account even with a valid-looking token (ACCOUNT_GONE)", async () => {
    const app = await buildTestApp();
    const u = await seedUser({ adminRole: "SUPERADMIN", deletedAt: new Date() });
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/audit",
      headers: { cookie: authFor({ sub: u.id, adminRole: "SUPERADMIN" }) },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("rejects a banned non-superadmin (SUPPORT) on a SUPPORT-gated route via the ban gate", async () => {
    const app = await buildTestApp();
    const future = new Date(Date.now() + 86_400_000);
    const supportBanned = await seedUser({ adminRole: "SUPPORT", bannedUntil: future });
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/users",
      headers: { cookie: authFor({ sub: supportBanned.id, adminRole: "SUPPORT" }) },
    });
    // Would otherwise pass the SUPPORT role gate — rejected specifically by the ban gate.
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("allows a banned SUPERADMIN through the ban gate (no self-brick)", async () => {
    const app = await buildTestApp();
    const future = new Date(Date.now() + 86_400_000);
    const superBanned = await seedUser({ adminRole: "SUPERADMIN", bannedUntil: future });
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/audit",
      headers: { cookie: authFor({ sub: superBanned.id, adminRole: "SUPERADMIN" }) },
    });
    expect(res.statusCode).not.toBe(403);
    await app.close();
  });

  it("allows a non-banned SUPPORT user through the role gate on a SUPPORT route", async () => {
    const app = await buildTestApp();
    const u = await seedUser({ adminRole: "SUPPORT" });
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/users",
      headers: { cookie: authFor({ sub: u.id, adminRole: "SUPPORT" }) },
    });
    expect(res.statusCode).not.toBe(403);
    await app.close();
  });
});
