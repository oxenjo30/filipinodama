import { describe, it, expect, afterEach, afterAll } from "vitest";
import { prisma } from "../src/db/client.js";
import { buildTestApp, seedUser, authFor, truncateAll } from "./helpers.js";

// Clean up the Notification rows THIS file creates (support_reply / support_resolved) —
// truncateAll() deliberately does not touch Notification (same precedent as
// admin-campaigns.test.ts:5-13). Ticket/TicketMessage are cleared by truncateAll().
afterEach(async () => {
  await prisma.notification.deleteMany({ where: { type: { in: ["support_reply", "support_resolved"] } } });
  await truncateAll();
});
afterAll(async () => {
  await prisma.$disconnect();
});

async function seedTicket(userId: string | null, extra: Record<string, unknown> = {}) {
  return prisma.ticket.create({
    data: {
      userId,
      userName: "player#1001",
      userEmail: "player@example.com",
      category: "General",
      subject: "Help me",
      status: "OPEN",
      ...extra,
    },
  });
}

describe("admin tickets queue", () => {
  it("non-admin (role-less user) → 403; SUPPORT → 200", async () => {
    const app = await buildTestApp();
    const plain = await seedUser();
    const forbidden = await app.inject({
      method: "GET",
      url: "/api/admin/tickets",
      headers: { cookie: authFor({ sub: plain.id }) },
    });
    expect(forbidden.statusCode).toBe(403);

    const support = await seedUser({ adminRole: "SUPPORT" });
    const allowed = await app.inject({
      method: "GET",
      url: "/api/admin/tickets",
      headers: { cookie: authFor({ sub: support.id, adminRole: "SUPPORT" }) },
    });
    expect(allowed.statusCode).toBe(200);
    await app.close();
  });

  it("MODERATOR/ECONOMY/SUPERADMIN can also reach the SUPPORT-gated queue", async () => {
    const app = await buildTestApp();
    for (const role of ["MODERATOR", "ECONOMY", "SUPERADMIN"] as const) {
      const staff = await seedUser({ adminRole: role });
      const res = await app.inject({
        method: "GET",
        url: "/api/admin/tickets",
        headers: { cookie: authFor({ sub: staff.id, adminRole: role }) },
      });
      expect(res.statusCode).toBe(200);
    }
    await app.close();
  });

  it("lists filter by status, newest-first (updatedAt desc), and paginate", async () => {
    const app = await buildTestApp();
    const support = await seedUser({ adminRole: "SUPPORT" });
    const cookie = authFor({ sub: support.id, adminRole: "SUPPORT" });
    const player = await seedUser();

    const t1 = await seedTicket(player.id, { subject: "first" });
    await new Promise((r) => setTimeout(r, 5));
    const t2 = await seedTicket(player.id, { subject: "second" });
    await prisma.ticket.update({ where: { id: t1.id }, data: { status: "RESOLVED" } });

    const open = await app.inject({ method: "GET", url: "/api/admin/tickets?status=OPEN", headers: { cookie } });
    expect(open.statusCode).toBe(200);
    const openItems = open.json().data.items;
    expect(openItems.length).toBe(1);
    expect(openItems[0].id).toBe(t2.id);
    expect(openItems[0].userGone).toBe(false);
    expect(openItems[0].userEmail).toBe("player@example.com");

    const resolved = await app.inject({ method: "GET", url: "/api/admin/tickets?status=RESOLVED", headers: { cookie } });
    expect(resolved.statusCode).toBe(200);
    const resolvedItems = resolved.json().data.items;
    expect(resolvedItems.length).toBe(1);
    expect(resolvedItems[0].id).toBe(t1.id);

    const paged = await app.inject({ method: "GET", url: "/api/admin/tickets?status=RESOLVED&limit=1", headers: { cookie } });
    expect(paged.json().data.items.length).toBe(1);
    expect(paged.json().data.nextCursor).toBeNull();
    await app.close();
  });

  it("GET /admin/tickets/:id returns the thread ordered by createdAt asc; 404 for a bogus id", async () => {
    const app = await buildTestApp();
    const support = await seedUser({ adminRole: "SUPPORT" });
    const cookie = authFor({ sub: support.id, adminRole: "SUPPORT" });
    const player = await seedUser();
    const ticket = await seedTicket(player.id);
    await prisma.ticketMessage.create({ data: { ticketId: ticket.id, authorId: player.id, authorName: "player#1001", isStaff: false, body: "first msg" } });
    await new Promise((r) => setTimeout(r, 5));
    await prisma.ticketMessage.create({ data: { ticketId: ticket.id, authorId: player.id, authorName: "player#1001", isStaff: false, body: "second msg" } });

    const res = await app.inject({ method: "GET", url: `/api/admin/tickets/${ticket.id}`, headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const { ticket: t, thread } = res.json().data;
    expect(t.id).toBe(ticket.id);
    expect(t.canResolve).toBe(true);
    expect(t.canReopen).toBe(false);
    expect(thread.length).toBe(2);
    expect(thread[0].body).toBe("first msg");
    expect(thread[1].body).toBe("second msg");

    const missing = await app.inject({ method: "GET", url: "/api/admin/tickets/does-not-exist", headers: { cookie } });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe("NO_TICKET");
    await app.close();
  });

  it("reply creates a staff message + notifies the player + audits", async () => {
    const app = await buildTestApp();
    const support = await seedUser({ adminRole: "SUPPORT" });
    const cookie = authFor({ sub: support.id, adminRole: "SUPPORT" });
    const player = await seedUser();
    const ticket = await seedTicket(player.id);

    const res = await app.inject({
      method: "POST",
      url: `/api/admin/tickets/${ticket.id}/reply`,
      headers: { cookie },
      payload: { body: "We're looking into it." },
    });
    expect(res.statusCode).toBe(200);

    const messages = await prisma.ticketMessage.findMany({ where: { ticketId: ticket.id } });
    expect(messages.length).toBe(1);
    expect(messages[0]!.isStaff).toBe(true);
    expect(messages[0]!.authorId).toBe(support.id);
    expect(messages[0]!.body).toBe("We're looking into it.");

    const notifications = await prisma.notification.findMany({ where: { userId: player.id, type: "support_reply" } });
    expect(notifications.length).toBe(1);
    expect((notifications[0]!.data as { ticketId: string }).ticketId).toBe(ticket.id);

    const audits = await prisma.auditLog.findMany({ where: { action: "ticket.reply", targetId: ticket.id } });
    expect(audits.length).toBe(1);
    expect(audits[0]!.actorId).toBe(support.id);

    const after = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    expect(after!.updatedAt.getTime()).toBeGreaterThanOrEqual(ticket.updatedAt.getTime());
    await app.close();
  });

  it("reply on a resolved ticket → 409 TICKET_RESOLVED, no message/notification written", async () => {
    const app = await buildTestApp();
    const support = await seedUser({ adminRole: "SUPPORT" });
    const cookie = authFor({ sub: support.id, adminRole: "SUPPORT" });
    const player = await seedUser();
    const ticket = await seedTicket(player.id, { status: "RESOLVED" });

    const res = await app.inject({
      method: "POST",
      url: `/api/admin/tickets/${ticket.id}/reply`,
      headers: { cookie },
      payload: { body: "too late" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("TICKET_RESOLVED");
    expect(await prisma.ticketMessage.count({ where: { ticketId: ticket.id } })).toBe(0);
    expect(await prisma.notification.count({ where: { userId: player.id, type: "support_reply" } })).toBe(0);
    await app.close();
  });

  it("reply when the filer is gone (userId null) → succeeds, writes the message + audit, no Notification", async () => {
    const app = await buildTestApp();
    const support = await seedUser({ adminRole: "SUPPORT" });
    const cookie = authFor({ sub: support.id, adminRole: "SUPPORT" });
    const ticket = await seedTicket(null);

    const res = await app.inject({
      method: "POST",
      url: `/api/admin/tickets/${ticket.id}/reply`,
      headers: { cookie },
      payload: { body: "hello?" },
    });
    expect(res.statusCode).toBe(200);
    expect(await prisma.ticketMessage.count({ where: { ticketId: ticket.id, isStaff: true } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "ticket.reply", targetId: ticket.id } })).toBe(1);
    expect(await prisma.notification.count({ where: { type: "support_reply" } })).toBe(0);
    await app.close();
  });

  it("resolve flips status, sets resolvedBy/resolvedAt, notifies the player, and audits", async () => {
    const app = await buildTestApp();
    const support = await seedUser({ adminRole: "SUPPORT" });
    const cookie = authFor({ sub: support.id, adminRole: "SUPPORT" });
    const player = await seedUser();
    const ticket = await seedTicket(player.id);

    const res = await app.inject({
      method: "POST",
      url: `/api/admin/tickets/${ticket.id}/resolve`,
      headers: { cookie },
      payload: { reason: "fixed" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe("RESOLVED");

    const after = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    expect(after!.status).toBe("RESOLVED");
    expect(after!.resolvedById).toBe(support.id);
    expect(after!.resolvedAt).toBeTruthy();

    const audits = await prisma.auditLog.findMany({ where: { action: "ticket.resolve", targetId: ticket.id } });
    expect(audits.length).toBe(1);

    const notifications = await prisma.notification.findMany({ where: { userId: player.id, type: "support_resolved" } });
    expect(notifications.length).toBe(1);
    await app.close();
  });

  it("resolving an already-resolved ticket → 409 TICKET_RESOLVED", async () => {
    const app = await buildTestApp();
    const support = await seedUser({ adminRole: "SUPPORT" });
    const cookie = authFor({ sub: support.id, adminRole: "SUPPORT" });
    const player = await seedUser();
    const ticket = await seedTicket(player.id, { status: "RESOLVED" });

    const res = await app.inject({
      method: "POST",
      url: `/api/admin/tickets/${ticket.id}/resolve`,
      headers: { cookie },
      payload: { reason: "already done" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("TICKET_RESOLVED");
    await app.close();
  });

  it("concurrent resolve on the same OPEN ticket → exactly one 200, the other 409; exactly one audit row", async () => {
    const app = await buildTestApp();
    const support = await seedUser({ adminRole: "SUPPORT" });
    const cookie = authFor({ sub: support.id, adminRole: "SUPPORT" });
    const player = await seedUser();
    const ticket = await seedTicket(player.id);

    const [a, b] = await Promise.all([
      app.inject({ method: "POST", url: `/api/admin/tickets/${ticket.id}/resolve`, headers: { cookie }, payload: { reason: "a" } }),
      app.inject({ method: "POST", url: `/api/admin/tickets/${ticket.id}/resolve`, headers: { cookie }, payload: { reason: "b" } }),
    ]);
    const codes = [a.statusCode, b.statusCode].sort();
    expect(codes).toEqual([200, 409]);

    const audits = await prisma.auditLog.findMany({ where: { action: "ticket.resolve", targetId: ticket.id } });
    expect(audits.length).toBe(1);
    await app.close();
  });
});

describe("ticket priority + reopen", () => {
  it("PATCH priority persists (GET detail shows it) and writes a ticket.priority audit row", async () => {
    const app = await buildTestApp();
    const support = await seedUser({ adminRole: "SUPPORT" });
    const cookie = authFor({ sub: support.id, adminRole: "SUPPORT" });
    const player = await seedUser();
    const ticket = await seedTicket(player.id);

    const res = await app.inject({
      method: "PATCH",
      url: `/api/admin/tickets/${ticket.id}/priority`,
      headers: { cookie },
      payload: { priority: "HIGH" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.priority).toBe("HIGH");

    const detail = await app.inject({ method: "GET", url: `/api/admin/tickets/${ticket.id}`, headers: { cookie } });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().data.ticket.priority).toBe("HIGH");

    const audits = await prisma.auditLog.findMany({ where: { action: "ticket.priority", targetId: ticket.id } });
    expect(audits.length).toBe(1);
    expect(audits[0]!.actorId).toBe(support.id);
    expect((audits[0]!.before as { priority: string }).priority).toBe("MEDIUM");
    expect((audits[0]!.after as { priority: string }).priority).toBe("HIGH");
    await app.close();
  });

  it("new tickets default to MEDIUM priority", async () => {
    const app = await buildTestApp();
    const support = await seedUser({ adminRole: "SUPPORT" });
    const cookie = authFor({ sub: support.id, adminRole: "SUPPORT" });
    const player = await seedUser();
    const ticket = await seedTicket(player.id);

    const row = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    expect(row!.priority).toBe("MEDIUM");

    const detail = await app.inject({ method: "GET", url: `/api/admin/tickets/${ticket.id}`, headers: { cookie } });
    expect(detail.json().data.ticket.priority).toBe("MEDIUM");
    await app.close();
  });

  it("reopen flips a RESOLVED ticket to OPEN, clears resolvedAt, audits ticket.reopen; detail then shows canResolve/canReopen correctly", async () => {
    const app = await buildTestApp();
    const support = await seedUser({ adminRole: "SUPPORT" });
    const cookie = authFor({ sub: support.id, adminRole: "SUPPORT" });
    const player = await seedUser();
    const ticket = await seedTicket(player.id, { status: "RESOLVED", resolvedById: support.id, resolvedAt: new Date() });

    const res = await app.inject({
      method: "POST",
      url: `/api/admin/tickets/${ticket.id}/reopen`,
      headers: { cookie },
      payload: { reason: "player replied" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe("OPEN");

    const after = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    expect(after!.status).toBe("OPEN");
    expect(after!.resolvedAt).toBeNull();
    expect(after!.resolvedById).toBeNull();

    const audits = await prisma.auditLog.findMany({ where: { action: "ticket.reopen", targetId: ticket.id } });
    expect(audits.length).toBe(1);
    expect((audits[0]!.before as { status: string }).status).toBe("RESOLVED");
    expect((audits[0]!.after as { status: string }).status).toBe("OPEN");

    const detail = await app.inject({ method: "GET", url: `/api/admin/tickets/${ticket.id}`, headers: { cookie } });
    expect(detail.json().data.ticket.canResolve).toBe(true);
    expect(detail.json().data.ticket.canReopen).toBe(false);
    await app.close();
  });

  it("reopen on an already-OPEN ticket → 409 TICKET_NOT_RESOLVED", async () => {
    const app = await buildTestApp();
    const support = await seedUser({ adminRole: "SUPPORT" });
    const cookie = authFor({ sub: support.id, adminRole: "SUPPORT" });
    const player = await seedUser();
    const ticket = await seedTicket(player.id);

    const res = await app.inject({
      method: "POST",
      url: `/api/admin/tickets/${ticket.id}/reopen`,
      headers: { cookie },
      payload: {},
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("TICKET_NOT_RESOLVED");
    expect(await prisma.auditLog.count({ where: { action: "ticket.reopen", targetId: ticket.id } })).toBe(0);
    await app.close();
  });

  it("detail on a RESOLVED ticket shows canReopen true / canResolve false and exposes priority", async () => {
    const app = await buildTestApp();
    const support = await seedUser({ adminRole: "SUPPORT" });
    const cookie = authFor({ sub: support.id, adminRole: "SUPPORT" });
    const player = await seedUser();
    const ticket = await seedTicket(player.id, { status: "RESOLVED", resolvedById: support.id, resolvedAt: new Date(), priority: "URGENT" });

    const detail = await app.inject({ method: "GET", url: `/api/admin/tickets/${ticket.id}`, headers: { cookie } });
    expect(detail.statusCode).toBe(200);
    const t = detail.json().data.ticket;
    expect(t.canReopen).toBe(true);
    expect(t.canResolve).toBe(false);
    expect(t.priority).toBe("URGENT");
    await app.close();
  });
});
