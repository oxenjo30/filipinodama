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

describe("campaign channel/schedule/status", () => {
  it("draft: creates a draft Campaign with no notifications + campaign.draft audit", async () => {
    const app = await buildTestApp();
    const eco = await seedUser({ adminRole: "ECONOMY" });
    await seedUser();
    const cookie = authFor({ sub: eco.id, adminRole: "ECONOMY" });
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/campaigns",
      headers: { cookie },
      payload: { title: "Draft one", body: "wip", segment: "all", reason: "planning", action: "draft", channel: "email" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe("draft");
    const camp = await prisma.campaign.findFirst({ where: { title: "Draft one" } });
    expect(camp!.status).toBe("draft");
    expect(camp!.channel).toBe("email");
    expect(camp!.reach).toBe(0);
    expect(camp!.scheduledFor).toBeNull();
    expect(await prisma.notification.count({ where: { title: "Draft one" } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: "campaign.draft" } })).toBe(1);
    await app.close();
  });

  it("schedule: requires scheduledFor (400 SCHEDULE_REQUIRED) then persists scheduled Campaign + campaign.schedule audit", async () => {
    const app = await buildTestApp();
    const eco = await seedUser({ adminRole: "ECONOMY" });
    await seedUser();
    const cookie = authFor({ sub: eco.id, adminRole: "ECONOMY" });
    const missing = await app.inject({
      method: "POST",
      url: "/api/admin/campaigns",
      headers: { cookie },
      payload: { title: "Sched", body: "later", segment: "all", reason: "promo", action: "schedule", channel: "push" },
    });
    expect(missing.statusCode).toBe(400);
    expect(missing.json().error.code).toBe("SCHEDULE_REQUIRED");
    const when = new Date(Date.now() + 3_600_000).toISOString();
    const okRes = await app.inject({
      method: "POST",
      url: "/api/admin/campaigns",
      headers: { cookie },
      payload: { title: "Sched", body: "later", segment: "all", reason: "promo", action: "schedule", channel: "push", scheduledFor: when },
    });
    expect(okRes.statusCode).toBe(200);
    expect(okRes.json().data.status).toBe("scheduled");
    const camp = await prisma.campaign.findFirst({ where: { title: "Sched" } });
    expect(camp!.status).toBe("scheduled");
    expect(camp!.channel).toBe("push");
    expect(camp!.scheduledFor!.toISOString()).toBe(when);
    expect(camp!.reach).toBe(0);
    expect(await prisma.notification.count({ where: { title: "Sched" } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: "campaign.schedule" } })).toBe(1);
    await app.close();
  });

  it("send via new endpoint: computes reach, status sent, channel persisted, notifications + campaign.send audit", async () => {
    const app = await buildTestApp();
    const eco = await seedUser({ adminRole: "ECONOMY" });
    await seedUser();
    await seedUser();
    const cookie = authFor({ sub: eco.id, adminRole: "ECONOMY" });
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/campaigns",
      headers: { cookie },
      payload: { title: "Live", body: "now!", segment: "all", reason: "promo", action: "send", channel: "in-app" },
    });
    expect(res.statusCode).toBe(200);
    const reach = res.json().data.reach;
    expect(reach).toBeGreaterThan(0);
    expect(res.json().data.status).toBe("sent");
    const camp = await prisma.campaign.findFirst({ where: { title: "Live" } });
    expect(camp!.status).toBe("sent");
    expect(camp!.channel).toBe("in-app");
    expect(camp!.reach).toBe(reach);
    expect(await prisma.notification.count({ where: { type: "announcement", title: "Live" } })).toBe(reach);
    expect(await prisma.auditLog.count({ where: { action: "campaign.send" } })).toBe(1);
    await app.close();
  });

  it("GET /admin/campaigns returns channel + status + scheduledFor fields", async () => {
    const app = await buildTestApp();
    const eco = await seedUser({ adminRole: "ECONOMY" });
    await seedUser();
    const cookie = authFor({ sub: eco.id, adminRole: "ECONOMY" });
    const when = new Date(Date.now() + 3_600_000).toISOString();
    await app.inject({
      method: "POST",
      url: "/api/admin/campaigns",
      headers: { cookie },
      payload: { title: "GetMe", body: "x", segment: "all", reason: "r", action: "schedule", channel: "email", scheduledFor: when },
    });
    const list = await app.inject({ method: "GET", url: "/api/admin/campaigns", headers: { cookie } });
    expect(list.statusCode).toBe(200);
    const item = list.json().data.items.find((c: { title: string }) => c.title === "GetMe");
    expect(item.channel).toBe("email");
    expect(item.status).toBe("scheduled");
    expect(item.scheduledFor).toBe(when);
    await app.close();
  });

  it("old /admin/campaigns/send still works (back-compat): sent + reach", async () => {
    const app = await buildTestApp();
    const eco = await seedUser({ adminRole: "ECONOMY" });
    await seedUser();
    const cookie = authFor({ sub: eco.id, adminRole: "ECONOMY" });
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/campaigns/send",
      headers: { cookie },
      payload: { title: "Legacy", body: "b", segment: "all", reason: "promo" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.reach).toBeGreaterThan(0);
    const camp = await prisma.campaign.findFirst({ where: { title: "Legacy" } });
    expect(camp!.status).toBe("sent");
    expect(await prisma.notification.count({ where: { type: "announcement", title: "Legacy" } })).toBe(res.json().data.reach);
    await app.close();
  });
});
