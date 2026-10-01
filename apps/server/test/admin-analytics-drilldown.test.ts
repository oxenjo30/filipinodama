import { afterAll, afterEach, describe, expect, it } from "vitest";
import { prisma } from "../src/db/client.js";
import { authFor, buildTestApp, seedUser, truncateAll } from "./helpers.js";

afterEach(async () => {
  await prisma.match.deleteMany({});
  await truncateAll();
});
afterAll(async () => { await prisma.$disconnect(); });

const authHeader = (id: string, adminRole: "SUPPORT" | "MODERATOR" | "ECONOMY" | "SUPERADMIN") => ({
  cookie: authFor({ sub: id, adminRole }),
});

describe("admin analytics matchmaking drill-down", () => {
  it("requires a current ECONOMY role", async () => {
    const app = await buildTestApp();
    const support = await seedUser({ adminRole: "SUPPORT" });
    const moderator = await seedUser({ adminRole: "MODERATOR" });
    const economy = await seedUser({ adminRole: "ECONOMY" });

    expect((await app.inject({ method: "GET", url: "/api/admin/analytics/matchmaking-matches" })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/api/admin/analytics/matchmaking-matches", headers: authHeader(support.id, "SUPPORT") })).statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url: "/api/admin/analytics/matchmaking-matches", headers: authHeader(moderator.id, "MODERATOR") })).statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url: "/api/admin/analytics/matchmaking-matches", headers: authHeader(economy.id, "ECONOMY") })).statusCode).toBe(200);
    await app.close();
  });

  it("reconciles the ranked aggregate against the exact captured window and excludes other cohorts", async () => {
    const app = await buildTestApp();
    const admin = await seedUser({ adminRole: "ECONOMY" });
    const red = await seedUser();
    const blue = await seedUser();
    const bot = await seedUser({ isBot: true });
    const now = new Date();
    const endedAt = new Date(now.getTime() + 1_000);

    await prisma.match.create({ data: { mode: "RANKED", origin: "MATCHMAKING", redId: red.id, blueId: blue.id, settings: {}, moves: [], startedAt: now, endedAt, winner: "red" } });
    await prisma.match.create({ data: { mode: "RANKED", origin: "MATCHMAKING", redId: red.id, blueId: red.id, settings: {}, moves: [], startedAt: now, endedAt, winner: "red" } });
    await prisma.match.create({ data: { mode: "RANKED", origin: "MATCHMAKING", redId: red.id, blueId: bot.id, settings: {}, moves: [], startedAt: now } });
    await prisma.match.create({ data: { mode: "RANKED", origin: "ROOM", redId: red.id, blueId: blue.id, settings: {}, moves: [], startedAt: now, endedAt } });
    await prisma.match.create({ data: { mode: "RANKED", origin: "REMATCH", redId: red.id, blueId: blue.id, settings: {}, moves: [], startedAt: now, endedAt } });
    await prisma.match.create({ data: { mode: "RANKED", origin: "TOURNAMENT", redId: red.id, blueId: blue.id, settings: {}, moves: [], startedAt: now, endedAt } });
    await prisma.match.create({ data: { mode: "RANKED", origin: "LOCAL", redId: red.id, blueId: blue.id, settings: {}, moves: [], startedAt: now, endedAt } });
    await prisma.match.create({ data: { mode: "RANKED", origin: "LEGACY", redId: red.id, blueId: blue.id, settings: {}, moves: [], startedAt: now, endedAt } });
    await prisma.match.create({ data: { mode: "RANKED", origin: "MATCHMAKING", redId: red.id, settings: {}, moves: [], startedAt: now } });
    await prisma.match.create({ data: { mode: "CASUAL", origin: "MATCHMAKING", redId: red.id, blueId: blue.id, settings: {}, moves: [], startedAt: now } });
    await prisma.match.create({ data: { mode: "RANKED", origin: "MATCHMAKING", redId: red.id, blueId: blue.id, settings: {}, moves: [], startedAt: new Date(Date.now() + 60_000) } });

    const aggregate = await app.inject({ method: "GET", url: "/api/admin/analytics?window=30d", headers: authHeader(admin.id, "ECONOMY") });
    expect(aggregate.statusCode).toBe(200);
    const aggregateData = aggregate.json().data;
    const ranked = aggregateData.humanMatchmaking.byMode.find((row: { mode: string }) => row.mode === "RANKED");
    const params = new URLSearchParams({ mode: "RANKED", since: aggregateData.timeWindow.since, until: aggregateData.timeWindow.until });
    const list = await app.inject({ method: "GET", url: `/api/admin/analytics/matchmaking-matches?${params}`, headers: authHeader(admin.id, "ECONOMY") });
    expect(list.statusCode).toBe(200);
    expect(list.json().data.total).toBe(ranked.humanVsHumanStarted);
    expect(list.json().data.total).toBe(1);
    expect(list.json().data.items.every((row: { red: { id: string }; blue: { id: string } }) => row.red.id !== row.blue.id)).toBe(true);
    expect(list.json().data.timeWindow).toEqual(aggregateData.timeWindow);
    await app.close();
  });

  it("reconciles the casual aggregate and list using the same distinct-human cohort", async () => {
    const app = await buildTestApp();
    const admin = await seedUser({ adminRole: "ECONOMY" });
    const red = await seedUser();
    const blue = await seedUser();
    const now = new Date();

    await prisma.match.create({ data: { id: "casual-valid", mode: "CASUAL", origin: "MATCHMAKING", redId: red.id, blueId: blue.id, settings: {}, moves: [], startedAt: now } });
    await prisma.match.create({ data: { id: "casual-self", mode: "CASUAL", origin: "MATCHMAKING", redId: red.id, blueId: red.id, settings: {}, moves: [], startedAt: now } });
    await prisma.match.create({ data: { id: "ranked-valid", mode: "RANKED", origin: "MATCHMAKING", redId: red.id, blueId: blue.id, settings: {}, moves: [], startedAt: now } });

    const aggregate = await app.inject({ method: "GET", url: "/api/admin/analytics?window=30d", headers: authHeader(admin.id, "ECONOMY") });
    expect(aggregate.statusCode).toBe(200);
    const aggregateData = aggregate.json().data;
    const casual = aggregateData.humanMatchmaking.byMode.find((row: { mode: string }) => row.mode === "CASUAL");
    const params = new URLSearchParams({ mode: "CASUAL", since: aggregateData.timeWindow.since, until: aggregateData.timeWindow.until });
    const list = await app.inject({ method: "GET", url: `/api/admin/analytics/matchmaking-matches?${params}`, headers: authHeader(admin.id, "ECONOMY") });

    expect(list.statusCode).toBe(200);
    expect(list.json().data.total).toBe(casual.humanVsHumanStarted);
    expect(list.json().data.total).toBe(1);
    expect(list.json().data.items.map((row: { id: string; mode: string }) => [row.id, row.mode])).toEqual([["casual-valid", "CASUAL"]]);
    await app.close();
  });

  it("filters identities, completion and outcomes while returning bounded non-PII rows", async () => {
    const app = await buildTestApp();
    const admin = await seedUser({ adminRole: "ECONOMY" });
    const red = await seedUser();
    const blue = await seedUser();
    await prisma.user.update({ where: { id: blue.id }, data: { deletedAt: new Date() } });
    const startedAt = new Date(Date.now() - 5_000);
    const endedAt = new Date(startedAt.getTime() + 4_000);
    await prisma.match.create({
      data: {
        id: "drill-completed", mode: "RANKED", origin: "MATCHMAKING", redId: red.id, blueId: blue.id,
        settings: {}, moves: [], startedAt, endedAt, winner: "blue", reason: "resignation", redTrophyDelta: -9, blueTrophyDelta: 9,
      },
    });
    await prisma.match.create({ data: { id: "drill-unfinished", mode: "RANKED", origin: "MATCHMAKING", redId: blue.id, blueId: red.id, settings: {}, moves: [], startedAt: new Date(startedAt.getTime() - 1_000) } });
    await prisma.match.create({ data: { id: "drill-inconsistent", mode: "RANKED", origin: "MATCHMAKING", redId: blue.id, blueId: red.id, settings: {}, moves: [], winner: "blue", startedAt: new Date(startedAt.getTime() - 2_000) } });

    const params = new URLSearchParams({ player: blue.tag, completion: "completed", outcome: "blue" });
    const res = await app.inject({ method: "GET", url: `/api/admin/analytics/matchmaking-matches?${params}`, headers: authHeader(admin.id, "ECONOMY") });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.total).toBe(1);
    expect(data.items[0]).toMatchObject({
      id: "drill-completed", durationMs: 4_000, outcome: "blue", completion: "completed",
      reason: "resignation", redTrophyDelta: -9, blueTrophyDelta: 9,
      blue: { id: blue.id, username: blue.username, displayName: blue.displayName, tag: blue.tag, deleted: true },
    });
    expect(data.items[0].red).not.toHaveProperty("email");
    expect(data.items[0].blue).not.toHaveProperty("email");
    expect(data.items.map((row: { id: string }) => row.id).includes("drill-inconsistent")).toBe(false);
    const unfinished = await app.inject({ method: "GET", url: "/api/admin/analytics/matchmaking-matches?completion=unfinished&outcome=unfinished", headers: authHeader(admin.id, "ECONOMY") });
    expect(unfinished.json().data.items.map((row: { id: string }) => row.id)).toEqual(["drill-unfinished", "drill-inconsistent"]);
    await app.close();
  });

  it("paginates with stable startedAt/id ordering and includes both date boundaries", async () => {
    const app = await buildTestApp();
    const admin = await seedUser({ adminRole: "ECONOMY" });
    const red = await seedUser();
    const blue = await seedUser();
    const since = new Date(Date.now() - 60_000);
    const until = new Date(Date.now() - 1_000);
    const sameTime = new Date(since.getTime() + 30_000);
    for (const [id, startedAt] of [["drill-a", sameTime], ["drill-b", sameTime], ["drill-since", since], ["drill-until", until]] as const) {
      await prisma.match.create({ data: { id, mode: "RANKED", origin: "MATCHMAKING", redId: red.id, blueId: blue.id, settings: {}, moves: [], startedAt } });
    }
    await prisma.match.create({ data: { id: "drill-before", mode: "RANKED", origin: "MATCHMAKING", redId: red.id, blueId: blue.id, settings: {}, moves: [], startedAt: new Date(since.getTime() - 1) } });
    await prisma.match.create({ data: { id: "drill-after", mode: "RANKED", origin: "MATCHMAKING", redId: red.id, blueId: blue.id, settings: {}, moves: [], startedAt: new Date(until.getTime() + 1) } });

    const common = { since: since.toISOString(), until: until.toISOString(), limit: "2" };
    const first = await app.inject({ method: "GET", url: `/api/admin/analytics/matchmaking-matches?${new URLSearchParams({ ...common, page: "1" })}`, headers: authHeader(admin.id, "ECONOMY") });
    const second = await app.inject({ method: "GET", url: `/api/admin/analytics/matchmaking-matches?${new URLSearchParams({ ...common, page: "2" })}`, headers: authHeader(admin.id, "ECONOMY") });
    expect(first.json().data).toMatchObject({ total: 4, totalPages: 2, page: 1, limit: 2 });
    expect(first.json().data.items.map((row: { id: string }) => row.id)).toEqual(["drill-until", "drill-b"]);
    expect(second.json().data.items.map((row: { id: string }) => row.id)).toEqual(["drill-a", "drill-since"]);
    await app.close();
  });

  it("applies startedFrom/startedTo inside the preserved snapshot", async () => {
    const app = await buildTestApp();
    const admin = await seedUser({ adminRole: "ECONOMY" });
    const red = await seedUser();
    const blue = await seedUser();
    const since = new Date(Date.now() - 120_000);
    const until = new Date(Date.now() - 1_000);
    const from = new Date(since.getTime() + 40_000);
    const to = new Date(since.getTime() + 80_000);
    for (const [id, startedAt] of [["drill-date-before", new Date(from.getTime() - 1)], ["drill-date-from", from], ["drill-date-to", to], ["drill-date-after", new Date(to.getTime() + 1)]] as const) {
      await prisma.match.create({ data: { id, mode: "RANKED", origin: "MATCHMAKING", redId: red.id, blueId: blue.id, settings: {}, moves: [], startedAt } });
    }
    const params = new URLSearchParams({ since: since.toISOString(), until: until.toISOString(), startedFrom: from.toISOString(), startedTo: to.toISOString() });
    const res = await app.inject({ method: "GET", url: `/api/admin/analytics/matchmaking-matches?${params}`, headers: authHeader(admin.id, "ECONOMY") });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.timeWindow).toEqual({ since: since.toISOString(), until: until.toISOString() });
    expect(res.json().data.items.map((row: { id: string }) => row.id)).toEqual(["drill-date-to", "drill-date-from"]);
    await app.close();
  });

  it("rejects invalid pagination, filters and time ranges", async () => {
    const app = await buildTestApp();
    const admin = await seedUser({ adminRole: "ECONOMY" });
    const headers = authHeader(admin.id, "ECONOMY");
    for (const query of [
      "page=0", "limit=0", "limit=101", "mode=AI", "completion=done", "outcome=win", "since=not-a-date", "startedFrom=not-a-date",
      `since=${encodeURIComponent(new Date().toISOString())}&until=${encodeURIComponent(new Date(Date.now() - 1_000).toISOString())}`,
      `until=${encodeURIComponent(new Date(Date.now() + 60_000).toISOString())}`,
      `since=${encodeURIComponent(new Date(Date.now() - 91 * 86_400_000).toISOString())}&until=${encodeURIComponent(new Date(Date.now() - 1_000).toISOString())}`,
      `startedFrom=${encodeURIComponent(new Date().toISOString())}&startedTo=${encodeURIComponent(new Date(Date.now() - 1_000).toISOString())}`,
      `since=${encodeURIComponent(new Date(Date.now() - 60_000).toISOString())}&until=${encodeURIComponent(new Date(Date.now() - 1_000).toISOString())}&startedFrom=${encodeURIComponent(new Date(Date.now() - 60_001).toISOString())}`,
      `since=${encodeURIComponent(new Date(Date.now() - 60_000).toISOString())}&until=${encodeURIComponent(new Date(Date.now() - 1_000).toISOString())}&startedTo=${encodeURIComponent(new Date().toISOString())}`,
    ]) {
      const res = await app.inject({ method: "GET", url: `/api/admin/analytics/matchmaking-matches?${query}`, headers });
      expect(res.statusCode, query).toBe(400);
    }
    await app.close();
  });
});
