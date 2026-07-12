import { describe, it, expect, afterEach, afterAll } from "vitest";
import { prisma } from "../src/db/client.js";
import { buildTestApp, seedUser, authFor, truncateAll } from "./helpers.js";

/**
 * Cluster A2 — Financials: live top-up dashboard reads + role-enforced
 * refunds (handoffv3 rows 8-15). Refund role tier is ECONOMY (same tier as
 * admin.ts's currency-grant endpoint — reversing real money is an economy
 * action); SUPERADMIN implicitly passes via the rank hierarchy in guards.ts.
 */

// truncateAll() doesn't clear Order/Payment (same precedent as
// admin-guilds-a5.test.ts / admin-players-a4.test.ts) — clean those up first.
afterEach(async () => {
  await prisma.payment.deleteMany({ where: { user: { username: { startsWith: "t_user_" } } } });
  await prisma.order.deleteMany({ where: { user: { username: { startsWith: "t_user_" } } } });
  await truncateAll();
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe("GET /api/admin/payments — dashboard reads", () => {
  it("empty case: no settled/refunded payments → honest empty shape", async () => {
    const app = await buildTestApp();
    const support = await seedUser({ adminRole: "SUPPORT" });

    const res = await app.inject({
      method: "GET",
      url: "/api/admin/payments",
      headers: { cookie: authFor({ sub: support.id, adminRole: "SUPPORT" }) },
    });
    expect(res.statusCode).toBe(200);
    const d = res.json().data;
    expect(d.hasTopups).toBe(false);
    expect(d.stats).toMatchObject({ totalCents: 0, todayCents: 0, orders: 0, avgOrderCents: 0, diamondsSold: 0, refundedCents: 0, refundedCount: 0 });
    expect(d.recent).toEqual([]);
    expect(d.chart).toEqual([]);
    expect(d.breakdowns).toBeNull();
    await app.close();
  });

  it("pending/failed payments are excluded from stats + list", async () => {
    const app = await buildTestApp();
    const support = await seedUser({ adminRole: "SUPPORT" });
    const player = await seedUser({ trophies: 500 });
    await prisma.payment.create({ data: { userId: player.id, providerRef: `p-${player.id}-pending`, amountCents: 4900, diamonds: 80, status: "pending" } });
    await prisma.payment.create({ data: { userId: player.id, providerRef: `p-${player.id}-failed`, amountCents: 4900, diamonds: 80, status: "failed" } });

    const res = await app.inject({
      method: "GET",
      url: "/api/admin/payments",
      headers: { cookie: authFor({ sub: support.id, adminRole: "SUPPORT" }) },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.hasTopups).toBe(false);
    await app.close();
  });

  it("settled payments populate stats, chart, recent list, and breakdowns", async () => {
    const app = await buildTestApp();
    const support = await seedUser({ adminRole: "SUPPORT" });
    const p1 = await seedUser({ trophies: 2700 }); // Grandmaster tier
    const p2 = await seedUser({ trophies: 300 }); // Gold tier

    await prisma.payment.create({
      data: { userId: p1.id, providerRef: `pay-${p1.id}-1`, amountCents: 29900, diamonds: 550, status: "settled", settledAt: new Date() },
    });
    await prisma.payment.create({
      data: { userId: p2.id, providerRef: `pay-${p2.id}-1`, amountCents: 4900, diamonds: 80, status: "settled", settledAt: new Date() },
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/admin/payments",
      headers: { cookie: authFor({ sub: support.id, adminRole: "SUPPORT" }) },
    });
    expect(res.statusCode).toBe(200);
    const d = res.json().data;
    expect(d.hasTopups).toBe(true);
    expect(d.stats.orders).toBe(2);
    expect(d.stats.totalCents).toBe(29900 + 4900);
    expect(d.stats.diamondsSold).toBe(550 + 80);
    expect(d.stats.refundedCents).toBe(0);
    expect(d.recent.length).toBe(2);
    expect(d.chart.length).toBe(7);
    // 550 diamonds -> Medium (>=500), 80 diamonds -> Starter (<200).
    expect(d.breakdowns.byPackSize.map((b: any) => b.label)).toEqual(expect.arrayContaining(["Medium", "Starter"]));
    expect(d.breakdowns.byPlayerTier.map((b: any) => b.label)).toEqual(expect.arrayContaining(["Grandmaster", "Gold"]));
    await app.close();
  });

  it("unauthenticated → 401", async () => {
    const app = await buildTestApp();
    const res = await app.inject({ method: "GET", url: "/api/admin/payments" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe("POST /api/admin/payments/:id/refund", () => {
  it("refunds a settled top-up: marks refunded, writes a negative diamonds ledger row, and an audit row", async () => {
    const app = await buildTestApp();
    const econ = await seedUser({ adminRole: "ECONOMY" });
    const player = await seedUser({});
    await prisma.user.update({ where: { id: player.id }, data: { diamonds: 550 } });
    const payment = await prisma.payment.create({
      data: { userId: player.id, providerRef: `pay-${player.id}-1`, amountCents: 29900, diamonds: 550, status: "settled", settledAt: new Date() },
    });

    const res = await app.inject({
      method: "POST",
      url: `/api/admin/payments/${payment.id}/refund`,
      headers: { cookie: authFor({ sub: econ.id, adminRole: "ECONOMY" }) },
      payload: { reason: "player disputed charge" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe("refunded");

    const updated = await prisma.payment.findUnique({ where: { id: payment.id } });
    expect(updated!.status).toBe("refunded");

    const ledgerRow = await prisma.ledgerEntry.findFirst({ where: { userId: player.id, reason: "refund" } });
    expect(ledgerRow).toBeTruthy();
    expect(ledgerRow!.amount).toBe(-550);
    expect(ledgerRow!.currency).toBe("DIAMONDS");

    const updatedUser = await prisma.user.findUnique({ where: { id: player.id } });
    expect(updatedUser!.diamonds).toBe(0);

    const auditRow = await prisma.auditLog.findFirst({ where: { action: "finance.refund", actorId: econ.id } });
    expect(auditRow).toBeTruthy();
    expect(auditRow!.targetId).toBe(payment.id);
    expect(auditRow!.reason).toBe("player disputed charge");

    await app.close();
  });

  it("double-refund → 4xx 'Already refunded' semantics", async () => {
    const app = await buildTestApp();
    const econ = await seedUser({ adminRole: "ECONOMY" });
    const player = await seedUser({});
    await prisma.user.update({ where: { id: player.id }, data: { diamonds: 80 } });
    const payment = await prisma.payment.create({
      data: { userId: player.id, providerRef: `pay-${player.id}-1`, amountCents: 4900, diamonds: 80, status: "settled", settledAt: new Date() },
    });
    const cookie = authFor({ sub: econ.id, adminRole: "ECONOMY" });

    const first = await app.inject({ method: "POST", url: `/api/admin/payments/${payment.id}/refund`, headers: { cookie }, payload: { reason: "x" } });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({ method: "POST", url: `/api/admin/payments/${payment.id}/refund`, headers: { cookie }, payload: { reason: "x again" } });
    expect(second.statusCode).toBe(400);
    expect(second.json().error.message).toMatch(/Already refunded/i);

    await app.close();
  });

  it("role below ECONOMY → 403; unauthenticated → 401", async () => {
    const app = await buildTestApp();
    const support = await seedUser({ adminRole: "SUPPORT" });
    const moderator = await seedUser({ adminRole: "MODERATOR" });
    const player = await seedUser({});
    const payment = await prisma.payment.create({
      data: { userId: player.id, providerRef: `pay-${player.id}-1`, amountCents: 4900, diamonds: 80, status: "settled", settledAt: new Date() },
    });

    const supportRes = await app.inject({
      method: "POST",
      url: `/api/admin/payments/${payment.id}/refund`,
      headers: { cookie: authFor({ sub: support.id, adminRole: "SUPPORT" }) },
      payload: { reason: "x" },
    });
    expect(supportRes.statusCode).toBe(403);

    const modRes = await app.inject({
      method: "POST",
      url: `/api/admin/payments/${payment.id}/refund`,
      headers: { cookie: authFor({ sub: moderator.id, adminRole: "MODERATOR" }) },
      payload: { reason: "x" },
    });
    expect(modRes.statusCode).toBe(403);

    const unauth = await app.inject({ method: "POST", url: `/api/admin/payments/${payment.id}/refund`, payload: { reason: "x" } });
    expect(unauth.statusCode).toBe(401);

    // Payment untouched by the rejected attempts.
    const stillSettled = await prisma.payment.findUnique({ where: { id: payment.id } });
    expect(stillSettled!.status).toBe("settled");

    await app.close();
  });

  it("SUPERADMIN can also refund (rank hierarchy satisfies ECONOMY minimum)", async () => {
    const app = await buildTestApp();
    const su = await seedUser({ adminRole: "SUPERADMIN" });
    const player = await seedUser({});
    await prisma.user.update({ where: { id: player.id }, data: { diamonds: 80 } });
    const payment = await prisma.payment.create({
      data: { userId: player.id, providerRef: `pay-${player.id}-1`, amountCents: 4900, diamonds: 80, status: "settled", settledAt: new Date() },
    });

    const res = await app.inject({
      method: "POST",
      url: `/api/admin/payments/${payment.id}/refund`,
      headers: { cookie: authFor({ sub: su.id, adminRole: "SUPERADMIN" }) },
      payload: { reason: "superadmin override" },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it("pending (unsettled) payment → 4xx", async () => {
    const app = await buildTestApp();
    const econ = await seedUser({ adminRole: "ECONOMY" });
    const player = await seedUser({});
    const payment = await prisma.payment.create({
      data: { userId: player.id, providerRef: `pay-${player.id}-pending`, amountCents: 4900, diamonds: 80, status: "pending" },
    });

    const res = await app.inject({
      method: "POST",
      url: `/api/admin/payments/${payment.id}/refund`,
      headers: { cookie: authFor({ sub: econ.id, adminRole: "ECONOMY" }) },
      payload: { reason: "x" },
    });
    expect(res.statusCode).toBe(400);

    const stillPending = await prisma.payment.findUnique({ where: { id: payment.id } });
    expect(stillPending!.status).toBe("pending");

    await app.close();
  });

  it("missing/empty reason → 400 (validation, no partial mutation)", async () => {
    const app = await buildTestApp();
    const econ = await seedUser({ adminRole: "ECONOMY" });
    const player = await seedUser({});
    const payment = await prisma.payment.create({
      data: { userId: player.id, providerRef: `pay-${player.id}-1`, amountCents: 4900, diamonds: 80, status: "settled", settledAt: new Date() },
    });

    const res = await app.inject({
      method: "POST",
      url: `/api/admin/payments/${payment.id}/refund`,
      headers: { cookie: authFor({ sub: econ.id, adminRole: "ECONOMY" }) },
      payload: { reason: "" },
    });
    expect(res.statusCode).toBe(400);

    const untouched = await prisma.payment.findUnique({ where: { id: payment.id } });
    expect(untouched!.status).toBe("settled");

    await app.close();
  });

  it("unknown payment id → 404", async () => {
    const app = await buildTestApp();
    const econ = await seedUser({ adminRole: "ECONOMY" });

    const res = await app.inject({
      method: "POST",
      url: "/api/admin/payments/does-not-exist/refund",
      headers: { cookie: authFor({ sub: econ.id, adminRole: "ECONOMY" }) },
      payload: { reason: "x" },
    });
    expect(res.statusCode).toBe(404);

    await app.close();
  });
});

describe("GET /api/admin/payments/:id — receipt detail", () => {
  it("returns receipt fields for a settled payment", async () => {
    const app = await buildTestApp();
    const support = await seedUser({ adminRole: "SUPPORT" });
    const player = await seedUser({ email: "buyer@example.com" });
    const payment = await prisma.payment.create({
      data: { userId: player.id, providerRef: `pay-${player.id}-1`, amountCents: 14900, diamonds: 270, status: "settled", settledAt: new Date() },
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/admin/payments/${payment.id}`,
      headers: { cookie: authFor({ sub: support.id, adminRole: "SUPPORT" }) },
    });
    expect(res.statusCode).toBe(200);
    const d = res.json().data;
    expect(d.diamonds).toBe(270);
    expect(d.amountCents).toBe(14900);
    expect(d.provider).toBe("paymongo");
    expect(d.email).toBe("buyer@example.com");
    expect(d.player.tag).toBe(player.tag);

    await app.close();
  });

  it("a pending payment is not exposed as a receipt (404)", async () => {
    const app = await buildTestApp();
    const support = await seedUser({ adminRole: "SUPPORT" });
    const player = await seedUser({});
    const payment = await prisma.payment.create({
      data: { userId: player.id, providerRef: `pay-${player.id}-pending`, amountCents: 4900, diamonds: 80, status: "pending" },
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/admin/payments/${payment.id}`,
      headers: { cookie: authFor({ sub: support.id, adminRole: "SUPPORT" }) },
    });
    expect(res.statusCode).toBe(404);

    await app.close();
  });
});
