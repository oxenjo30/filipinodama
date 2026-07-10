import { describe, it, expect, afterEach, afterAll } from "vitest";
import { prisma } from "../src/db/client.js";
import { buildTestApp, seedUser, authFor, truncateAll } from "./helpers.js";

// truncateAll() now includes LiveEvent, so no manual cleanup needed beyond it.
afterEach(async () => {
  await truncateAll();
});
afterAll(async () => {
  await prisma.$disconnect();
});

async function seedEvent(extra: Record<string, unknown> = {}) {
  return prisma.liveEvent.create({
    data: {
      name: "Weekend Double Gold",
      type: "double_gold",
      status: "scheduled",
      scope: "all_players",
      reward: "2x gold on wins",
      createdByName: "seed#0000",
      ...extra,
    },
  });
}

describe("admin scheduled events", () => {
  it("non-admin (role-less user) → 403; ECONOMY → 200 on GET /admin/events", async () => {
    const app = await buildTestApp();
    const plain = await seedUser();
    const forbidden = await app.inject({
      method: "GET",
      url: "/api/admin/events",
      headers: { cookie: authFor({ sub: plain.id }) },
    });
    expect(forbidden.statusCode).toBe(403);

    const econ = await seedUser({ adminRole: "ECONOMY" });
    const allowed = await app.inject({
      method: "GET",
      url: "/api/admin/events",
      headers: { cookie: authFor({ sub: econ.id, adminRole: "ECONOMY" }) },
    });
    expect(allowed.statusCode).toBe(200);
    await app.close();
  });

  it("SUPPORT is below the ECONOMY min-role → 403", async () => {
    const app = await buildTestApp();
    const support = await seedUser({ adminRole: "SUPPORT" });
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/events",
      headers: { cookie: authFor({ sub: support.id, adminRole: "SUPPORT" }) },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("POST creates a LiveEvent with all fields + createdByName + audit event.create; GET returns it", async () => {
    const app = await buildTestApp();
    const econ = await seedUser({ adminRole: "ECONOMY", username: "t_user_econ1" });
    const cookie = authFor({ sub: econ.id, adminRole: "ECONOMY" });

    const res = await app.inject({
      method: "POST",
      url: "/api/admin/events",
      headers: { cookie },
      payload: {
        name: "Fiesta Weekend",
        type: "fiesta",
        scope: "all_players",
        reward: "Bonus gold drops",
        startsLabel: "Jul 12",
        endsLabel: "Jul 14",
        color: "#22c55e",
        reason: "seasonal fiesta",
      },
    });
    expect(res.statusCode).toBe(200);
    const { id } = res.json().data;
    expect(id).toBeTruthy();

    const row = await prisma.liveEvent.findUnique({ where: { id } });
    expect(row).toBeTruthy();
    expect(row!.name).toBe("Fiesta Weekend");
    expect(row!.type).toBe("fiesta");
    expect(row!.status).toBe("scheduled");
    expect(row!.scope).toBe("all_players");
    expect(row!.reward).toBe("Bonus gold drops");
    expect(row!.startsLabel).toBe("Jul 12");
    expect(row!.endsLabel).toBe("Jul 14");
    expect(row!.color).toBe("#22c55e");
    expect(row!.createdById).toBe(econ.id);
    expect(row!.createdByName).toBe(`${econ.username}${econ.tag}`);

    const audits = await prisma.auditLog.findMany({ where: { action: "event.create", targetId: id } });
    expect(audits.length).toBe(1);
    expect(audits[0]!.actorId).toBe(econ.id);
    expect(audits[0]!.reason).toBe("seasonal fiesta");

    const list = await app.inject({ method: "GET", url: "/api/admin/events", headers: { cookie } });
    expect(list.statusCode).toBe(200);
    const items = list.json().data.items;
    expect(items.length).toBe(1);
    expect(items[0].id).toBe(id);
    expect(items[0].name).toBe("Fiesta Weekend");
    expect(items[0].createdByName).toBe(`${econ.username}${econ.tag}`);
    await app.close();
  });

  it("POST defaults status to scheduled when omitted", async () => {
    const app = await buildTestApp();
    const econ = await seedUser({ adminRole: "ECONOMY" });
    const cookie = authFor({ sub: econ.id, adminRole: "ECONOMY" });

    const res = await app.inject({
      method: "POST",
      url: "/api/admin/events",
      headers: { cookie },
      payload: { name: "Tourney", type: "tournament", scope: "top_100", reward: "Trophy gold", reason: "kickoff" },
    });
    expect(res.statusCode).toBe(200);
    const row = await prisma.liveEvent.findUnique({ where: { id: res.json().data.id } });
    expect(row!.status).toBe("scheduled");
    await app.close();
  });

  it("PATCH updates fields + audit event.update", async () => {
    const app = await buildTestApp();
    const econ = await seedUser({ adminRole: "ECONOMY" });
    const cookie = authFor({ sub: econ.id, adminRole: "ECONOMY" });
    const event = await seedEvent();

    const res = await app.inject({
      method: "PATCH",
      url: `/api/admin/events/${event.id}`,
      headers: { cookie },
      payload: { name: "Weekend Double Gold (extended)", endsLabel: "Jul 15", reason: "extend by a day" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.id).toBe(event.id);

    const after = await prisma.liveEvent.findUnique({ where: { id: event.id } });
    expect(after!.name).toBe("Weekend Double Gold (extended)");
    expect(after!.endsLabel).toBe("Jul 15");
    // untouched fields persist
    expect(after!.type).toBe("double_gold");
    expect(after!.reward).toBe("2x gold on wins");

    const audits = await prisma.auditLog.findMany({ where: { action: "event.update", targetId: event.id } });
    expect(audits.length).toBe(1);
    expect((audits[0]!.before as { name: string }).name).toBe("Weekend Double Gold");
    expect((audits[0]!.after as { name: string }).name).toBe("Weekend Double Gold (extended)");
    expect(audits[0]!.reason).toBe("extend by a day");
    await app.close();
  });

  it("POST /:id/cancel sets status ended + audit event.cancel", async () => {
    const app = await buildTestApp();
    const econ = await seedUser({ adminRole: "ECONOMY" });
    const cookie = authFor({ sub: econ.id, adminRole: "ECONOMY" });
    const event = await seedEvent({ status: "live" });

    const res = await app.inject({
      method: "POST",
      url: `/api/admin/events/${event.id}/cancel`,
      headers: { cookie },
      payload: { reason: "cutting it short" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe("ended");

    const after = await prisma.liveEvent.findUnique({ where: { id: event.id } });
    expect(after!.status).toBe("ended");

    const audits = await prisma.auditLog.findMany({ where: { action: "event.cancel", targetId: event.id } });
    expect(audits.length).toBe(1);
    expect((audits[0]!.before as { status: string }).status).toBe("live");
    expect((audits[0]!.after as { status: string }).status).toBe("ended");
    expect(audits[0]!.reason).toBe("cutting it short");
    await app.close();
  });

  it("PATCH on a missing id → 404 NO_EVENT", async () => {
    const app = await buildTestApp();
    const econ = await seedUser({ adminRole: "ECONOMY" });
    const cookie = authFor({ sub: econ.id, adminRole: "ECONOMY" });

    const res = await app.inject({
      method: "PATCH",
      url: "/api/admin/events/does-not-exist",
      headers: { cookie },
      payload: { name: "won't apply", reason: "n/a" },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("NO_EVENT");
    await app.close();
  });

  it("cancel on a missing id → 404 NO_EVENT", async () => {
    const app = await buildTestApp();
    const econ = await seedUser({ adminRole: "ECONOMY" });
    const cookie = authFor({ sub: econ.id, adminRole: "ECONOMY" });

    const res = await app.inject({
      method: "POST",
      url: "/api/admin/events/does-not-exist/cancel",
      headers: { cookie },
      payload: { reason: "n/a" },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("NO_EVENT");
    await app.close();
  });
});
