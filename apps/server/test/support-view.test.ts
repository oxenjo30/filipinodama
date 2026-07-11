import { describe, it, expect, afterEach, afterAll } from "vitest";
import { prisma } from "../src/db/client.js";
import { buildTestApp, seedUser, authFor, truncateAll } from "./helpers.js";

afterEach(truncateAll);
afterAll(async () => { await prisma.$disconnect(); });

/** Directly seed a Ticket + first message, bypassing the POST route (that flow is covered elsewhere). */
async function seedTicket(userId: string, overrides: Partial<{ subject: string; category: string; status: "OPEN" | "RESOLVED"; priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT" }> = {}) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { username: true, tag: true, email: true } });
  const userName = `${user!.username}${user!.tag}`;
  const ticket = await prisma.ticket.create({
    data: {
      userId,
      userName,
      userEmail: user!.email,
      category: overrides.category ?? "General",
      subject: overrides.subject ?? "Can't log in",
      status: overrides.status ?? "OPEN",
      priority: overrides.priority ?? "MEDIUM",
    },
  });
  await prisma.ticketMessage.create({
    data: { ticketId: ticket.id, authorId: userId, authorName: userName, isStaff: false, body: "Initial message body from player." },
  });
  return ticket;
}

describe("GET /api/support/tickets", () => {
  it("401 when unauthenticated", async () => {
    const app = await buildTestApp();
    const res = await app.inject({ method: "GET", url: "/api/support/tickets" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("403 GUEST_CANNOT_FILE for guests (mirrors POST gating)", async () => {
    const app = await buildTestApp();
    const guest = await seedUser({ isGuest: true });
    const res = await app.inject({ method: "GET", url: "/api/support/tickets", headers: { cookie: authFor({ sub: guest.id, isGuest: true }) } });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("GUEST_CANNOT_FILE");
    await app.close();
  });

  it("returns only the authed user's tickets, ordered by updatedAt desc", async () => {
    const app = await buildTestApp();
    const userA = await seedUser();
    const userB = await seedUser();
    const t1 = await seedTicket(userA.id, { subject: "First ticket" });
    // bump t1 to be older than t2 by forcing updatedAt back, then create t2
    await prisma.ticket.update({ where: { id: t1.id }, data: { updatedAt: new Date(Date.now() - 60_000) } });
    const t2 = await seedTicket(userA.id, { subject: "Second ticket" });
    await seedTicket(userB.id, { subject: "Someone else's ticket" });

    const res = await app.inject({ method: "GET", url: "/api/support/tickets", headers: { cookie: authFor({ sub: userA.id }) } });
    expect(res.statusCode).toBe(200);
    const items = res.json().data.items;
    expect(items).toHaveLength(2);
    expect(items.map((i: any) => i.id)).toEqual([t2.id, t1.id]);
    for (const item of items) {
      expect(item).toHaveProperty("subject");
      expect(item).toHaveProperty("category");
      expect(item).toHaveProperty("status");
      expect(item).toHaveProperty("priority");
      expect(item).toHaveProperty("createdAt");
      expect(item).toHaveProperty("updatedAt");
      expect(item).toHaveProperty("msgCount");
    }
    expect(items[0].msgCount).toBe(1);
    await app.close();
  });

  it("empty list for a user with no tickets", async () => {
    const app = await buildTestApp();
    const user = await seedUser();
    const res = await app.inject({ method: "GET", url: "/api/support/tickets", headers: { cookie: authFor({ sub: user.id }) } });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.items).toEqual([]);
    await app.close();
  });
});

describe("GET /api/support/tickets/:id", () => {
  it("401 when unauthenticated", async () => {
    const app = await buildTestApp();
    const user = await seedUser();
    const ticket = await seedTicket(user.id);
    const res = await app.inject({ method: "GET", url: `/api/support/tickets/${ticket.id}` });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("returns the ticket + thread including a staff reply", async () => {
    const app = await buildTestApp();
    const player = await seedUser();
    const staff = await seedUser();
    const ticket = await seedTicket(player.id, { subject: "Billing issue", category: "Billing", priority: "HIGH" });
    await prisma.ticketMessage.create({
      data: { ticketId: ticket.id, authorId: staff.id, authorName: `${staff.username}${staff.tag}`, isStaff: true, body: "We're looking into it." },
    });

    const res = await app.inject({ method: "GET", url: `/api/support/tickets/${ticket.id}`, headers: { cookie: authFor({ sub: player.id }) } });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.ticket).toMatchObject({
      id: ticket.id,
      subject: "Billing issue",
      category: "Billing",
      status: "OPEN",
      priority: "HIGH",
    });
    expect(body.ticket).toHaveProperty("createdAt");
    expect(body.ticket).toHaveProperty("updatedAt");
    expect(body.thread).toHaveLength(2);
    expect(body.thread[0]).toMatchObject({ isStaff: false, body: "Initial message body from player." });
    expect(body.thread[1]).toMatchObject({ isStaff: true, body: "We're looking into it." });
    expect(body.thread[1]).toHaveProperty("authorName");
    expect(body.thread[1]).toHaveProperty("createdAt");
    await app.close();
  });

  it("404 when another user requests someone else's ticket (does not leak existence)", async () => {
    const app = await buildTestApp();
    const owner = await seedUser();
    const intruder = await seedUser();
    const ticket = await seedTicket(owner.id);

    const res = await app.inject({ method: "GET", url: `/api/support/tickets/${ticket.id}`, headers: { cookie: authFor({ sub: intruder.id }) } });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("404 for a nonexistent ticket id", async () => {
    const app = await buildTestApp();
    const user = await seedUser();
    const res = await app.inject({ method: "GET", url: "/api/support/tickets/tk_doesnotexist", headers: { cookie: authFor({ sub: user.id }) } });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
