import { describe, it, expect, afterEach, afterAll } from "vitest";
import { prisma } from "../src/db/client.js";
import { getBool, invalidateConfig } from "../src/lib/config-service.js";
import { buildTestApp, seedUser, authFor, truncateAll } from "./helpers.js";

// Clean up both the Config rows AND the users seedUser() creates here — a
// leftover t_user_ row (tag "#1001") would collide with the next test file's
// first seedUser() call (every file's seq counter restarts at 1).
afterEach(async () => { await prisma.config.deleteMany({}); await truncateAll(); invalidateConfig(); });
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
      { key: "DAILY_LOGIN_ENABLED", value: "false", type: "bool", category: "flag", label: "d" }, // allow-listed
      { key: "SOME_OTHER_FLAG", value: "true", type: "bool", category: "flag", label: "o" }, // NOT allow-listed
    ]});
    const res = await app.inject({ method: "GET", url: "/api/config/public" });
    expect(res.statusCode).toBe(200);
    const keys = Object.keys(res.json().data);
    expect(keys.sort()).toEqual(["DAILY_LOGIN_ENABLED", "MAINTENANCE_BANNER", "MAINTENANCE_TEXT"]);
    expect(keys).not.toContain("SOME_OTHER_FLAG");
    await app.close();
  });

  it("GET /api/config/public includes DAILY_LOGIN_ENABLED's value when a Config row exists for it", async () => {
    const app = await buildTestApp();
    await prisma.config.create({ data: { key: "DAILY_LOGIN_ENABLED", value: "false", type: "bool", category: "flag", label: "d" } });
    const res = await app.inject({ method: "GET", url: "/api/config/public" });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.DAILY_LOGIN_ENABLED).toBe("false");
    await app.close();
  });

  it("GET /api/config/public omits DAILY_LOGIN_ENABLED entirely when no Config row exists for it", async () => {
    const app = await buildTestApp();
    await prisma.config.create({ data: { key: "MAINTENANCE_BANNER", value: "false", type: "bool", category: "flag", label: "m" } });
    const res = await app.inject({ method: "GET", url: "/api/config/public" });
    expect(res.statusCode).toBe(200);
    expect(Object.keys(res.json().data)).not.toContain("DAILY_LOGIN_ENABLED");
    await app.close();
  });
});
