import { describe, it, expect, afterEach, afterAll } from "vitest";
import type { Server as IOServer, Socket } from "socket.io";
import { prisma } from "../src/db/client.js";
import { registerPresence } from "../src/realtime/presence.js";
import { buildTestApp, seedUser, authFor, truncateAll } from "./helpers.js";

/**
 * Cluster A4 — Players section: real "Live" presence badge (row 19), real
 * avatar/frame rendering (row 20, admin-side only — no server payload change
 * beyond the existing avatarUrl/frameId fields already returned), and a
 * RECENT PURCHASES block in the player detail drawer (row 21).
 */

// truncateAll() doesn't clear Order/Payment (same precedent as
// admin-guilds-a5.test.ts for Guild rows) — this file creates purchase rows
// that FK-reference test users, so clean those up explicitly first.
afterEach(async () => {
  await prisma.order.deleteMany({ where: { user: { username: { startsWith: "t_user_" } } } });
  await prisma.payment.deleteMany({ where: { user: { username: { startsWith: "t_user_" } } } });
  await truncateAll();
});
afterAll(async () => {
  await prisma.$disconnect();
});

/** Minimal fake socket to drive registerPresence() without a real socket.io server —
 * isOnline() reads an in-process Map that registerPresence() populates synchronously. */
function fakeSocket(userId: string): Socket {
  return {
    id: `fake-${userId}`,
    data: { userId },
    join: () => Promise.resolve(),
    on: () => {},
  } as unknown as Socket;
}
const fakeIo = {} as IOServer; // unused unless the user has friends (broadcastToFriends is try/catch-guarded)

describe("GET /api/admin/users — online flag", () => {
  it("offline user (no sockets) → online:false", async () => {
    const app = await buildTestApp();
    const support = await seedUser({ adminRole: "SUPPORT" });
    const offline = await seedUser();

    const res = await app.inject({
      method: "GET",
      url: `/api/admin/users?q=${offline.username}`,
      headers: { cookie: authFor({ sub: support.id, adminRole: "SUPPORT" }) },
    });
    expect(res.statusCode).toBe(200);
    const { items } = res.json().data;
    expect(items.length).toBe(1);
    expect(items[0]).toMatchObject({ id: offline.id, online: false });
    await app.close();
  });

  it("a user with a registered presence socket → online:true in both list and detail", async () => {
    const app = await buildTestApp();
    const support = await seedUser({ adminRole: "SUPPORT" });
    const live = await seedUser();
    registerPresence(fakeIo, fakeSocket(live.id));

    const listRes = await app.inject({
      method: "GET",
      url: `/api/admin/users?q=${live.username}`,
      headers: { cookie: authFor({ sub: support.id, adminRole: "SUPPORT" }) },
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().data.items[0]).toMatchObject({ id: live.id, online: true });

    const detailRes = await app.inject({
      method: "GET",
      url: `/api/admin/users/${live.id}`,
      headers: { cookie: authFor({ sub: support.id, adminRole: "SUPPORT" }) },
    });
    expect(detailRes.statusCode).toBe(200);
    expect(detailRes.json().data.online).toBe(true);
    await app.close();
  });
});

describe("GET /api/admin/users/:id — unauthenticated/unauthorized", () => {
  it("unauthenticated → 401", async () => {
    const app = await buildTestApp();
    const target = await seedUser();
    const res = await app.inject({ method: "GET", url: `/api/admin/users/${target.id}` });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("non-admin (role-less user) → 403", async () => {
    const app = await buildTestApp();
    const plain = await seedUser();
    const target = await seedUser();
    const res = await app.inject({
      method: "GET",
      url: `/api/admin/users/${target.id}`,
      headers: { cookie: authFor({ sub: plain.id }) },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

describe("GET /api/admin/users/:id — recent purchases", () => {
  it("no purchases → empty array (honest empty state, block still returned)", async () => {
    const app = await buildTestApp();
    const support = await seedUser({ adminRole: "SUPPORT" });
    const target = await seedUser();

    const res = await app.inject({
      method: "GET",
      url: `/api/admin/users/${target.id}`,
      headers: { cookie: authFor({ sub: support.id, adminRole: "SUPPORT" }) },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.purchases).toEqual([]);
    await app.close();
  });

  it("merges Order (item) + Payment (top-up) rows, newest first, capped at 8", async () => {
    const app = await buildTestApp();
    const support = await seedUser({ adminRole: "SUPPORT" });
    const target = await seedUser();

    // 6 in-game orders, oldest to newest (createdAt spread 1 minute apart).
    const base = Date.now() - 60_000 * 20;
    for (let i = 0; i < 6; i++) {
      await prisma.order.create({
        data: {
          userId: target.id,
          currency: "GOLD",
          total: 100 + i,
          items: [{ itemId: `item-${i}`, name: `Item ${i}`, price: 100 + i }],
          createdAt: new Date(base + i * 60_000),
        },
      });
    }
    // 4 settled top-ups, interleaved in time, newer than all orders.
    for (let i = 0; i < 4; i++) {
      await prisma.payment.create({
        data: {
          userId: target.id,
          providerRef: `pay-${target.id}-${i}`,
          amountCents: 9900 + i,
          diamonds: 500 + i,
          status: "settled",
          settledAt: new Date(base + (10 + i) * 60_000),
        },
      });
    }
    // 1 pending (not settled) payment must be excluded.
    await prisma.payment.create({
      data: { userId: target.id, providerRef: `pay-${target.id}-pending`, amountCents: 5000, diamonds: 250, status: "pending" },
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/admin/users/${target.id}`,
      headers: { cookie: authFor({ sub: support.id, adminRole: "SUPPORT" }) },
    });
    expect(res.statusCode).toBe(200);
    const { purchases } = res.json().data;
    expect(purchases.length).toBe(8);
    // newest-first
    const times = purchases.map((p: { createdAt: string }) => new Date(p.createdAt).getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
    // top-ups (settled at minute 13,12,11,10 offsets) sort ahead of the item orders (minutes 5,4,3,2,1,0)
    expect(purchases[0].currency).toBe("TOPUP");
    expect(purchases[0].name).toMatch(/Diamonds — top-up/);
    const currencies = purchases.map((p: { currency: string }) => p.currency);
    expect(currencies.filter((c: string) => c === "TOPUP").length).toBe(4);
    expect(currencies.filter((c: string) => c === "GOLD").length).toBe(4); // capped at 8 total, 4 newest orders kept
    await app.close();
  });

  it("only that player's purchases are returned (no cross-player leakage)", async () => {
    const app = await buildTestApp();
    const support = await seedUser({ adminRole: "SUPPORT" });
    const target = await seedUser();
    const other = await seedUser();
    await prisma.order.create({ data: { userId: other.id, currency: "GOLD", total: 50, items: [{ itemId: "x", name: "Other's item", price: 50 }] } });

    const res = await app.inject({
      method: "GET",
      url: `/api/admin/users/${target.id}`,
      headers: { cookie: authFor({ sub: support.id, adminRole: "SUPPORT" }) },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.purchases).toEqual([]);
    await app.close();
  });
});
