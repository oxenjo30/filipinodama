import { describe, it, expect, afterEach, afterAll } from "vitest";
import { prisma } from "../src/db/client.js";
import { buildTestApp, seedUser, authFor, truncateAll } from "./helpers.js";

afterEach(truncateAll);
afterAll(async () => { await prisma.$disconnect(); });

const validPayload = { category: "General", subject: "Can't log in", message: "I've tried resetting my password three times and it still fails." };

describe("POST /api/support/tickets", () => {
  it("401 when unauthenticated", async () => {
    const app = await buildTestApp();
    const res = await app.inject({ method: "POST", url: "/api/support/tickets", payload: validPayload });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("403 GUEST_CANNOT_FILE for a guest filer; creates no Ticket row", async () => {
    const app = await buildTestApp();
    const guest = await seedUser({ isGuest: true });
    const res = await app.inject({ method: "POST", url: "/api/support/tickets", headers: { cookie: authFor({ sub: guest.id, isGuest: true }) }, payload: validPayload });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("GUEST_CANNOT_FILE");
    const count = await prisma.ticket.count();
    expect(count).toBe(0);
    await app.close();
  });

  it("happy path: creates a Ticket + first TicketMessage with a snapshotted non-null email", async () => {
    const app = await buildTestApp();
    const player = await seedUser({ email: "player@example.com" });
    const res = await app.inject({ method: "POST", url: "/api/support/tickets", headers: { cookie: authFor({ sub: player.id }) }, payload: validPayload });
    expect(res.statusCode).toBe(200);
    const id = res.json().data.id;
    const ticket = await prisma.ticket.findUnique({ where: { id } });
    expect(ticket).not.toBeNull();
    expect(ticket!.status).toBe("OPEN");
    expect(ticket!.userEmail).toBe("player@example.com");
    expect(ticket!.userName).toBe(`${player.username}${player.tag}`);
    expect(ticket!.category).toBe(validPayload.category);
    expect(ticket!.subject).toBe(validPayload.subject);
    const messages = await prisma.ticketMessage.findMany({ where: { ticketId: id } });
    expect(messages).toHaveLength(1);
    expect(messages[0].isStaff).toBe(false);
    expect(messages[0].authorId).toBe(player.id);
    expect(messages[0].body).toBe(validPayload.message);
    await app.close();
  });

  it("null-email path: a real player with no account email files successfully with Ticket.userEmail === null", async () => {
    const app = await buildTestApp();
    const player = await seedUser({ email: null });
    const res = await app.inject({ method: "POST", url: "/api/support/tickets", headers: { cookie: authFor({ sub: player.id }) }, payload: validPayload });
    expect(res.statusCode).toBe(200);
    const id = res.json().data.id;
    const ticket = await prisma.ticket.findUnique({ where: { id } });
    expect(ticket!.userEmail).toBeNull();
    await app.close();
  });

  it("400 for bad category / empty subject / too-short message / too-long message", async () => {
    const app = await buildTestApp();
    const player = await seedUser();
    const cookie = authFor({ sub: player.id });
    const badCategory = await app.inject({ method: "POST", url: "/api/support/tickets", headers: { cookie }, payload: { ...validPayload, category: "NotACategory" } });
    expect(badCategory.statusCode).toBe(400);
    const emptySubject = await app.inject({ method: "POST", url: "/api/support/tickets", headers: { cookie }, payload: { ...validPayload, subject: "" } });
    expect(emptySubject.statusCode).toBe(400);
    const shortMessage = await app.inject({ method: "POST", url: "/api/support/tickets", headers: { cookie }, payload: { ...validPayload, message: "short" } });
    expect(shortMessage.statusCode).toBe(400);
    const longMessage = await app.inject({ method: "POST", url: "/api/support/tickets", headers: { cookie }, payload: { ...validPayload, message: "x".repeat(4001) } });
    expect(longMessage.statusCode).toBe(400);
    await app.close();
  });

  it("rate-limit: 6th ticket within the hour from one user → 429 RATE_LIMITED; only 5 rows created", async () => {
    const app = await buildTestApp();
    const player = await seedUser();
    const cookie = authFor({ sub: player.id });
    for (let i = 0; i < 5; i++) {
      const res = await app.inject({ method: "POST", url: "/api/support/tickets", headers: { cookie }, payload: validPayload });
      expect(res.statusCode).toBe(200);
    }
    const sixth = await app.inject({ method: "POST", url: "/api/support/tickets", headers: { cookie }, payload: validPayload });
    expect(sixth.statusCode).toBe(429);
    expect(sixth.json().error.code).toBe("RATE_LIMITED");
    const count = await prisma.ticket.count({ where: { userId: player.id } });
    expect(count).toBe(5);
    await app.close();
  });

  it("rate-limit concurrency: N simultaneous files from one user create at most 5 rows", async () => {
    const app = await buildTestApp();
    const player = await seedUser();
    const cookie = authFor({ sub: player.id });
    await Promise.all(Array.from({ length: 8 }, () =>
      app.inject({ method: "POST", url: "/api/support/tickets", headers: { cookie }, payload: validPayload }),
    ));
    const count = await prisma.ticket.count({ where: { userId: player.id } });
    expect(count).toBeLessThanOrEqual(5);
    await app.close();
  });

  it("per-user independence: user B's 1st file is not blocked by user A's 5", async () => {
    const app = await buildTestApp();
    const userA = await seedUser();
    const userB = await seedUser();
    const cookieA = authFor({ sub: userA.id });
    for (let i = 0; i < 5; i++) {
      const res = await app.inject({ method: "POST", url: "/api/support/tickets", headers: { cookie: cookieA }, payload: validPayload });
      expect(res.statusCode).toBe(200);
    }
    const resB = await app.inject({ method: "POST", url: "/api/support/tickets", headers: { cookie: authFor({ sub: userB.id }) }, payload: validPayload });
    expect(resB.statusCode).toBe(200);
    await app.close();
  });
});
