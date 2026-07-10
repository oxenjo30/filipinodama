import { describe, it, expect, afterEach, afterAll } from "vitest";
import { prisma } from "../src/db/client.js";
import { buildTestApp, seedUser, authFor, truncateAll } from "./helpers.js";

// Clean up Campaign + Notification rows THIS file creates, in addition to
// truncateAll()'s users/Report/AuditLog/etc — otherwise a leftover
// Notification/Campaign row here would pollute another test file's counts
// (e.g. prisma.notification.count({ where: { type: "announcement" } })).
afterEach(async () => {
  await prisma.notification.deleteMany({});
  await prisma.campaign.deleteMany({});
  await truncateAll();
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe("admin-campaigns", () => {
  it("preview counts a segment; send creates N notifications + a Campaign row + audit", async () => {
    const app = await buildTestApp();
    const eco = await seedUser({ adminRole: "ECONOMY" });
    await seedUser();
    await seedUser(); // 2 real players (+eco)
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
