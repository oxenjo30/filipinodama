import { describe, it, expect, afterEach, afterAll } from "vitest";
import { prisma } from "../src/db/client.js";
import { buildTestApp, seedUser, authFor, truncateAll } from "./helpers.js";

// Unconditional cleanup — LedgerEntry.userId has no onDelete: Cascade (defaults
// to Restrict), so truncateAll()'s user deleteMany does NOT clear ledger rows.
// This suite's gold faucet/sink assertions are exact, so any leftover in-window
// GOLD row from another test (or a prior run in this file) would break them.
// Match rows are cleared the same way, unconditionally, not "only if survivors."
afterEach(async () => {
  await prisma.ledgerEntry.deleteMany({});
  await prisma.match.deleteMany({});
  await prisma.inventoryItem.deleteMany({});
  await prisma.storeItem.deleteMany({ where: { id: { startsWith: "t_item_" } } });
  await truncateAll();
});
afterAll(async () => {
  await prisma.$disconnect();
});

const DAY = 86_400_000;

describe("admin-analytics RBAC", () => {
  it("SUPPORT token -> 403", async () => {
    const app = await buildTestApp();
    const u = await seedUser({ adminRole: "SUPPORT" });
    const res = await app.inject({ method: "GET", url: "/api/admin/analytics", headers: { cookie: authFor({ sub: u.id, adminRole: "SUPPORT" }) } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("MODERATOR token -> 403", async () => {
    const app = await buildTestApp();
    const u = await seedUser({ adminRole: "MODERATOR" });
    const res = await app.inject({ method: "GET", url: "/api/admin/analytics", headers: { cookie: authFor({ sub: u.id, adminRole: "MODERATOR" }) } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("ECONOMY token -> 200 with full envelope", async () => {
    const app = await buildTestApp();
    const u = await seedUser({ adminRole: "ECONOMY" });
    const res = await app.inject({ method: "GET", url: "/api/admin/analytics", headers: { cookie: authFor({ sub: u.id, adminRole: "ECONOMY" }) } });
    expect(res.statusCode).toBe(200);
    const { data } = res.json();
    expect(data).toHaveProperty("window");
    expect(data).toHaveProperty("days");
    expect(data).toHaveProperty("kpis");
    expect(data).toHaveProperty("newPlayersPerDay");
    expect(data).toHaveProperty("activePerDay");
    expect(data).toHaveProperty("activePerDayNote");
    expect(data).toHaveProperty("gold");
    expect(data).toHaveProperty("matchesByMode");
    expect(data).toHaveProperty("matchOutcomes");
    expect(data).toHaveProperty("rankTiers");
    expect(data).toHaveProperty("topItems");
    await app.close();
  });

  it("unauthenticated -> 401", async () => {
    const app = await buildTestApp();
    const res = await app.inject({ method: "GET", url: "/api/admin/analytics" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("stale token: DB-demoted admin (token still claims ECONOMY) -> 403", async () => {
    const app = await buildTestApp();
    const u = await seedUser({ adminRole: "SUPPORT" }); // DB row is SUPPORT now
    const staleCookie = authFor({ sub: u.id, adminRole: "ECONOMY" }); // stale claim
    const res = await app.inject({ method: "GET", url: "/api/admin/analytics", headers: { cookie: staleCookie } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

describe("admin-analytics metrics", () => {
  it("KPIs: totalPlayers/newPlayers over window, excluding bot/guest/old", async () => {
    const app = await buildTestApp();
    const admin = await seedUser({ adminRole: "ECONOMY" });
    // 2 real users created "now" (inside any window)
    await seedUser();
    await seedUser();
    // 1 real user backdated outside the 30d window
    const old = await seedUser();
    await prisma.user.update({ where: { id: old.id }, data: { createdAt: new Date(Date.now() - 40 * DAY) } });
    // 1 bot, 1 guest — excluded from totalPlayers/newPlayers entirely
    await seedUser({ isBot: true });
    await seedUser({ isGuest: true });

    const res = await app.inject({ method: "GET", url: "/api/admin/analytics?window=30d", headers: { cookie: authFor({ sub: admin.id, adminRole: "ECONOMY" }) } });
    expect(res.statusCode).toBe(200);
    const { data } = res.json();
    // totalPlayers: admin + 2 new + 1 old = 4 real accounts (bot/guest excluded)
    expect(data.kpis.totalPlayers).toBe(4);
    // newPlayers: admin itself (just seeded "now", inside the window) + the 2
    // explicit new users = 3; the backdated user and the bot/guest are excluded.
    expect(data.kpis.newPlayers).toBe(3);
    await app.close();
  });

  it("newPlayersPerDay: length === days, buckets correct, sums to newPlayers", async () => {
    const app = await buildTestApp();
    const admin = await seedUser({ adminRole: "ECONOMY" });
    await seedUser();
    await seedUser();

    const res = await app.inject({ method: "GET", url: "/api/admin/analytics?window=7d", headers: { cookie: authFor({ sub: admin.id, adminRole: "ECONOMY" }) } });
    const { data } = res.json();
    expect(data.days).toBe(7);
    expect(data.newPlayersPerDay).toHaveLength(7);
    const sum = data.newPlayersPerDay.reduce((s: number, b: { count: number }) => s + b.count, 0);
    expect(sum).toBe(data.kpis.newPlayers);
    await app.close();
  });

  it("activePerDay / activePlayers: windowed lastSeenAt correct; note present", async () => {
    const app = await buildTestApp();
    const admin = await seedUser({ adminRole: "ECONOMY" });
    const inWindow = await seedUser();
    await prisma.user.update({ where: { id: inWindow.id }, data: { lastSeenAt: new Date() } });
    const outWindow = await seedUser();
    await prisma.user.update({ where: { id: outWindow.id }, data: { lastSeenAt: new Date(Date.now() - 40 * DAY) } });

    const res = await app.inject({ method: "GET", url: "/api/admin/analytics?window=30d", headers: { cookie: authFor({ sub: admin.id, adminRole: "ECONOMY" }) } });
    const { data } = res.json();
    // admin (just seeded, lastSeenAt=now) + inWindow = 2 active in window
    expect(data.kpis.activePlayers).toBe(2);
    expect(data.activePerDayNote).toBeTruthy();
    const sum = data.activePerDay.reduce((s: number, b: { count: number }) => s + b.count, 0);
    expect(sum).toBe(2);
    await app.close();
  });

  it("gold faucet/sink + byReason: GOLD-only, window-only, exact sums", async () => {
    const app = await buildTestApp();
    const admin = await seedUser({ adminRole: "ECONOMY" });
    const p1 = await seedUser();

    // In-window GOLD rows
    await prisma.ledgerEntry.create({ data: { userId: p1.id, currency: "GOLD", amount: 100, balance: 100, reason: "admin_grant" } });
    await prisma.ledgerEntry.create({ data: { userId: p1.id, currency: "GOLD", amount: 50, balance: 150, reason: "match_reward" } });
    await prisma.ledgerEntry.create({ data: { userId: p1.id, currency: "GOLD", amount: -30, balance: 120, reason: "store_purchase" } });

    // Out-of-window GOLD row (backdated)
    const outRow = await prisma.ledgerEntry.create({ data: { userId: p1.id, currency: "GOLD", amount: 500, balance: 620, reason: "admin_grant" } });
    await prisma.$executeRawUnsafe(`UPDATE "LedgerEntry" SET "createdAt" = $1 WHERE id = $2`, new Date(Date.now() - 40 * DAY), outRow.id);

    // DIAMONDS row in-window — must NOT be counted (GOLD-only)
    await prisma.ledgerEntry.create({ data: { userId: p1.id, currency: "DIAMONDS", amount: 999, balance: 999, reason: "admin_grant" } });

    const res = await app.inject({ method: "GET", url: "/api/admin/analytics?window=30d", headers: { cookie: authFor({ sub: admin.id, adminRole: "ECONOMY" }) } });
    const { data } = res.json();
    expect(data.gold.faucet).toBe(150);
    expect(data.gold.sink).toBe(30);
    expect(data.gold.faucetPct).toBe(83);
    expect(data.kpis.goldFaucet).toBe(150);
    expect(data.kpis.goldSink).toBe(30);
    const byReason = data.gold.byReason as { reason: string; faucet: number; sink: number }[];
    const grantRow = byReason.find((r) => r.reason === "admin_grant");
    expect(grantRow?.faucet).toBe(100); // NOT 600 — out-of-window row excluded
    const matchRow = byReason.find((r) => r.reason === "match_reward");
    expect(matchRow?.faucet).toBe(50);
    const storeRow = byReason.find((r) => r.reason === "store_purchase");
    expect(storeRow?.sink).toBe(30);
    await app.close();
  });

  it("matchesByMode: counts + pct correct; 0-count mode included", async () => {
    const app = await buildTestApp();
    const admin = await seedUser({ adminRole: "ECONOMY" });
    const p1 = await seedUser();
    const p2 = await seedUser();

    await prisma.match.create({ data: { mode: "AI", redId: p1.id, settings: {}, moves: [] } });
    await prisma.match.create({ data: { mode: "AI", redId: p1.id, settings: {}, moves: [] } });
    await prisma.match.create({ data: { mode: "CASUAL", redId: p1.id, blueId: p2.id, settings: {}, moves: [] } });
    // out-of-window RANKED match — should not count
    const outMatch = await prisma.match.create({ data: { mode: "RANKED", redId: p1.id, blueId: p2.id, settings: {}, moves: [] } });
    await prisma.$executeRawUnsafe(`UPDATE "Match" SET "startedAt" = $1 WHERE id = $2`, new Date(Date.now() - 40 * DAY), outMatch.id);

    const res = await app.inject({ method: "GET", url: "/api/admin/analytics?window=30d", headers: { cookie: authFor({ sub: admin.id, adminRole: "ECONOMY" }) } });
    const { data } = res.json();
    const byMode = Object.fromEntries(data.matchesByMode.map((m: { mode: string; count: number; pct: number }) => [m.mode, m]));
    expect(byMode.AI.count).toBe(2);
    expect(byMode.CASUAL.count).toBe(1);
    expect(byMode.RANKED.count).toBe(0); // in-window count is 0 (the seeded row is out-of-window)
    expect(byMode.PRIVATE.count).toBe(0); // 0-count mode still present
    expect(byMode.LOCAL.count).toBe(0);
    expect(data.kpis.matchesInWindow).toBe(3);
    expect(byMode.AI.pct).toBeCloseTo(2 / 3);
    expect(byMode.CASUAL.pct).toBeCloseTo(1 / 3);
    const total = data.matchesByMode.reduce((s: number, m: { count: number }) => s + m.count, 0);
    expect(total).toBe(3);
    await app.close();
  });

  it("matchOutcomes: red/blue/draw/unfinished buckets add up to total", async () => {
    const app = await buildTestApp();
    const admin = await seedUser({ adminRole: "ECONOMY" });
    const p1 = await seedUser();
    const p2 = await seedUser();

    await prisma.match.create({ data: { mode: "CASUAL", redId: p1.id, blueId: p2.id, settings: {}, moves: [], winner: "red" } });
    await prisma.match.create({ data: { mode: "CASUAL", redId: p1.id, blueId: p2.id, settings: {}, moves: [], winner: "blue" } });
    await prisma.match.create({ data: { mode: "CASUAL", redId: p1.id, blueId: p2.id, settings: {}, moves: [], winner: "draw" } });
    await prisma.match.create({ data: { mode: "CASUAL", redId: p1.id, blueId: p2.id, settings: {}, moves: [], winner: null } });

    const res = await app.inject({ method: "GET", url: "/api/admin/analytics?window=30d", headers: { cookie: authFor({ sub: admin.id, adminRole: "ECONOMY" }) } });
    const { data } = res.json();
    expect(data.matchOutcomes.redWins).toBe(1);
    expect(data.matchOutcomes.blueWins).toBe(1);
    expect(data.matchOutcomes.draws).toBe(1);
    expect(data.matchOutcomes.unfinished).toBe(1);
    expect(data.matchOutcomes.total).toBe(4);
    expect(data.matchOutcomes.redWins + data.matchOutcomes.blueWins + data.matchOutcomes.draws + data.matchOutcomes.unfinished).toBe(data.matchOutcomes.total);
    await app.close();
  });

  it("rankTiers: all 7 tiers present in canonical order, counts correct, 0-count included, accent present", async () => {
    const app = await buildTestApp();
    const admin = await seedUser({ adminRole: "ECONOMY" });
    const p1 = await seedUser();
    const p2 = await seedUser();
    await prisma.user.update({ where: { id: p1.id }, data: { rankTier: "squire" } });
    await prisma.user.update({ where: { id: p2.id }, data: { rankTier: "datu" } });
    // admin itself defaults to "squire" too

    const res = await app.inject({ method: "GET", url: "/api/admin/analytics?window=30d", headers: { cookie: authFor({ sub: admin.id, adminRole: "ECONOMY" }) } });
    const { data } = res.json();
    expect(data.rankTiers).toHaveLength(7);
    const keys = data.rankTiers.map((t: { key: string }) => t.key);
    expect(keys).toEqual(["squire", "mandirigma", "kabalyero", "bayani", "datu", "star-guardian", "alamat"]);
    const byKey = Object.fromEntries(data.rankTiers.map((t: { key: string; count: number; accent: string }) => [t.key, t]));
    expect(byKey.squire.count).toBe(2); // admin + p1
    expect(byKey.datu.count).toBe(1);
    expect(byKey.mandirigma.count).toBe(0); // 0-count tier still present
    for (const t of data.rankTiers) expect(t.accent).toBeTruthy();
    await app.close();
  });

  it("topItems: ordered by owners desc, owners correct, pct = owners/totalPlayers, names/types resolved", async () => {
    const app = await buildTestApp();
    const admin = await seedUser({ adminRole: "ECONOMY" });
    const p1 = await seedUser();
    const p2 = await seedUser();
    const p3 = await seedUser();

    await prisma.storeItem.create({ data: { id: "t_item_popular", type: "SKIN", name: "Popular Skin", assetKey: "x" } });
    await prisma.storeItem.create({ data: { id: "t_item_rare", type: "BOARD", name: "Rare Board", assetKey: "y" } });

    await prisma.inventoryItem.create({ data: { userId: p1.id, itemId: "t_item_popular" } });
    await prisma.inventoryItem.create({ data: { userId: p2.id, itemId: "t_item_popular" } });
    await prisma.inventoryItem.create({ data: { userId: p3.id, itemId: "t_item_popular" } });
    await prisma.inventoryItem.create({ data: { userId: p1.id, itemId: "t_item_rare" } });

    const res = await app.inject({ method: "GET", url: "/api/admin/analytics?window=30d", headers: { cookie: authFor({ sub: admin.id, adminRole: "ECONOMY" }) } });
    const { data } = res.json();
    const items = data.topItems as { itemId: string; name: string; type: string; owners: number; pct: number }[];
    expect(items[0].itemId).toBe("t_item_popular");
    expect(items[0].owners).toBe(3);
    expect(items[0].name).toBe("Popular Skin");
    expect(items[0].type).toBe("SKIN");
    expect(items[0].pct).toBeCloseTo(3 / data.kpis.totalPlayers);
    const rare = items.find((i) => i.itemId === "t_item_rare")!;
    expect(rare.owners).toBe(1);
    expect(rare.pct).toBeCloseTo(1 / data.kpis.totalPlayers);
    await app.close();
  });

  it("window param: 7d vs 90d differ; default (no param) === 30d", async () => {
    const app = await buildTestApp();
    const admin = await seedUser({ adminRole: "ECONOMY" });
    const cookie = authFor({ sub: admin.id, adminRole: "ECONOMY" });

    const r7 = await app.inject({ method: "GET", url: "/api/admin/analytics?window=7d", headers: { cookie } });
    const r90 = await app.inject({ method: "GET", url: "/api/admin/analytics?window=90d", headers: { cookie } });
    const rDefault = await app.inject({ method: "GET", url: "/api/admin/analytics", headers: { cookie } });

    expect(r7.json().data.days).toBe(7);
    expect(r90.json().data.days).toBe(90);
    expect(r7.json().data.newPlayersPerDay).toHaveLength(7);
    expect(r90.json().data.newPlayersPerDay).toHaveLength(90);
    expect(rDefault.json().data.window).toBe("30d");
    expect(rDefault.json().data.days).toBe(30);
    await app.close();
  });

  it("bad window value -> 400", async () => {
    const app = await buildTestApp();
    const admin = await seedUser({ adminRole: "ECONOMY" });
    const cookie = authFor({ sub: admin.id, adminRole: "ECONOMY" });
    const res = await app.inject({ method: "GET", url: "/api/admin/analytics?window=1d", headers: { cookie } });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("empty DB: 200 with zeros/empty arrays, no throw, faucetPct === 50", async () => {
    const app = await buildTestApp();
    const admin = await seedUser({ adminRole: "ECONOMY" });
    const res = await app.inject({ method: "GET", url: "/api/admin/analytics?window=30d", headers: { cookie: authFor({ sub: admin.id, adminRole: "ECONOMY" }) } });
    expect(res.statusCode).toBe(200);
    const { data } = res.json();
    // The ECONOMY admin used to call the endpoint is itself 1 real, freshly
    // created account, so totalPlayers/newPlayers/activePlayers are 1, not 0 —
    // an endpoint that requires an authenticated admin can never see a truly
    // empty user table. Everything else (ledger/match/inventory-derived) is
    // genuinely empty since nothing else was seeded.
    expect(data.kpis.totalPlayers).toBe(1);
    expect(data.kpis.newPlayers).toBe(1);
    expect(data.gold.faucet).toBe(0);
    expect(data.gold.sink).toBe(0);
    expect(data.gold.faucetPct).toBe(50);
    expect(data.matchOutcomes.total).toBe(0);
    expect(data.topItems).toEqual([]);
    // totalPlayers is 1 (the admin itself) — pct divide-by-zero guard exercised
    // separately below when totalPlayers truly is 0 is not reachable via this
    // endpoint (an ECONOMY admin must exist to call it), so we assert the guard
    // logic directly via the topItems/rankTiers pct fields instead.
    for (const t of data.rankTiers) expect(Number.isFinite(t.pct)).toBe(true);
    await app.close();
  });
});
