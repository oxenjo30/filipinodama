import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "../src/db/client.js";
import { authFor, buildTestApp, seedUser, truncateAll } from "./helpers.js";

describe("admin workspace read models", () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildTestApp(); });
  afterEach(truncateAll);
  afterAll(async () => { await app.close(); });

  it("keeps moderation notifications out of SUPPORT responses", async () => {
    const support = await seedUser({ adminRole: "SUPPORT" });
    const moderator = await seedUser({ adminRole: "MODERATOR" });
    const player = await seedUser();
    await prisma.ticket.create({ data: { userId: player.id, userName: `${player.username}${player.tag}`, category: "Account", subject: "Cannot sign in" } });
    await prisma.report.create({ data: { reporterId: support.id, reporterName: support.username, accusedId: player.id, accusedName: player.username, reason: "CHEATING", context: "profile" } });

    const supportRes = await app.inject({ method: "GET", url: "/api/admin/notifications", headers: { cookie: authFor({ sub: support.id, adminRole: "SUPPORT" }) } });
    expect(supportRes.statusCode).toBe(200);
    expect(supportRes.json().data.items.map((x: { kind: string }) => x.kind)).toEqual(["ticket"]);

    const moderatorRes = await app.inject({ method: "GET", url: "/api/admin/notifications", headers: { cookie: authFor({ sub: moderator.id, adminRole: "MODERATOR" }) } });
    expect(moderatorRes.statusCode).toBe(200);
    expect(new Set(moderatorRes.json().data.items.map((x: { kind: string }) => x.kind))).toEqual(new Set(["ticket", "report"]));
  });

  it("role-filters player timeline evidence and rejects invalid limits", async () => {
    const support = await seedUser({ adminRole: "SUPPORT" });
    const superadmin = await seedUser({ adminRole: "SUPERADMIN" });
    const player = await seedUser();
    await prisma.report.create({ data: { reporterId: support.id, reporterName: support.username, accusedId: player.id, accusedName: player.username, reason: "SPAM", context: "profile" } });
    await prisma.report.create({ data: { reporterId: support.id, reporterName: support.username, accusedId: player.id, accusedName: player.username, reason: "OTHER", context: "profile", status: "RESOLVED" } });
    await prisma.report.create({ data: { reporterId: support.id, reporterName: support.username, accusedId: player.id, accusedName: player.username, reason: "HARASSMENT", context: "profile", status: "DISMISSED" } });
    await prisma.auditLog.create({ data: { actorId: superadmin.id, action: "user.note", targetType: "user", targetId: player.id, reason: "review" } });

    const supportRes = await app.inject({ method: "GET", url: `/api/admin/users/${player.id}/timeline?limit=20`, headers: { cookie: authFor({ sub: support.id, adminRole: "SUPPORT" }) } });
    expect(supportRes.statusCode).toBe(200);
    expect(supportRes.json().data.items.some((x: { kind: string }) => x.kind === "report" || x.kind === "audit")).toBe(false);

    const superRes = await app.inject({ method: "GET", url: `/api/admin/users/${player.id}/timeline?limit=20`, headers: { cookie: authFor({ sub: superadmin.id, adminRole: "SUPERADMIN" }) } });
    expect(superRes.statusCode).toBe(200);
    expect(new Set(superRes.json().data.items.map((x: { kind: string }) => x.kind))).toEqual(new Set(["report", "audit"]));
    const reportItems = superRes.json().data.items.filter((x: { kind: string }) => x.kind === "report");
    expect(reportItems).toHaveLength(3);
    expect(reportItems.every((item: { id: string; href: string }) => item.href.includes(`open=${item.id.slice("report:".length)}`))).toBe(true);
    expect(new Set(reportItems.map((item: { href: string }) => new URL(`http://local${item.href}`).searchParams.get("status")))).toEqual(new Set(["OPEN", "RESOLVED", "DISMISSED"]));

    const invalid = await app.inject({ method: "GET", url: "/api/admin/notifications?limit=1000", headers: { cookie: authFor({ sub: support.id, adminRole: "SUPPORT" }) } });
    expect(invalid.statusCode).toBe(400);
  });

  it("requires a live database-backed admin role on both routes", async () => {
    const plain = await seedUser();
    const player = await seedUser();
    const anonNotifications = await app.inject({ method: "GET", url: "/api/admin/notifications" });
    const anonTimeline = await app.inject({ method: "GET", url: `/api/admin/users/${player.id}/timeline` });
    expect(anonNotifications.statusCode).toBe(401);
    expect(anonTimeline.statusCode).toBe(401);
    const forged = authFor({ sub: plain.id, adminRole: "SUPERADMIN" });
    expect((await app.inject({ method: "GET", url: "/api/admin/notifications", headers: { cookie: forged } })).statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url: `/api/admin/users/${player.id}/timeline`, headers: { cookie: forged } })).statusCode).toBe(403);
  });

  it("caps and orders real alerts with stable deep links", async () => {
    const support = await seedUser({ adminRole: "SUPPORT" });
    const player = await seedUser();
    for (let i = 0; i < 21; i++) {
      await prisma.ticket.create({ data: { userId: player.id, userName: player.username, category: "Account", subject: `Ticket ${i}`, updatedAt: new Date(Date.UTC(2026, 0, 1, 0, i)) } });
    }
    const res = await app.inject({ method: "GET", url: "/api/admin/notifications?limit=20", headers: { cookie: authFor({ sub: support.id, adminRole: "SUPPORT" }) } });
    expect(res.statusCode).toBe(200);
    const items = res.json().data.items as { id: string; title: string; href: string; createdAt: string }[];
    expect(items).toHaveLength(20);
    expect(items[0]!.title).toBe("Ticket 20");
    expect(items[0]!.id).toMatch(/^ticket:/);
    expect(items[0]!.href).toBe(`/support?open=${items[0]!.id.slice("ticket:".length)}`);
    expect(items.every((item, i) => i === 0 || new Date(items[i - 1]!.createdAt) >= new Date(item.createdAt))).toBe(true);
  });

  it("validates timeline bounds and unknown players", async () => {
    const support = await seedUser({ adminRole: "SUPPORT" });
    const cookie = authFor({ sub: support.id, adminRole: "SUPPORT" });
    expect((await app.inject({ method: "GET", url: `/api/admin/users/${support.id}/timeline?limit=0`, headers: { cookie } })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: "/api/admin/users/does-not-exist/timeline", headers: { cookie } })).statusCode).toBe(404);
  });
});
