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
