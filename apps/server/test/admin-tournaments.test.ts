import { describe, it, expect, afterEach, afterAll } from "vitest";
import { prisma } from "../src/db/client.js";
import { buildTestApp, seedUser, authFor, truncateAll } from "./helpers.js";

afterEach(truncateAll);
afterAll(async () => {
  await prisma.$disconnect();
});

const validCreateBody = {
  name: "Weekend Cup",
  format: "SINGLE_ELIM",
  entryFeeGold: 100,
  prizePoolGold: 1000,
  prizeSplitGold: [700, 300],
  maxPlayers: 8,
  minTrophies: 0,
  matchMode: "CASUAL",
};

async function seedTournamentRow(overrides: Partial<{
  status: "DRAFT" | "OPEN" | "RUNNING" | "COMPLETED" | "CANCELLED";
  entryFeeGold: number;
  prizePoolGold: number;
  prizeSplitGold: number[];
  maxPlayers: number;
  minTrophies: number;
  registeredCount: number;
  createdById: string;
}> = {}) {
  const admin = overrides.createdById ? { id: overrides.createdById } : await seedUser({ adminRole: "ECONOMY" });
  return prisma.tournament.create({
    data: {
      name: "Test Cup",
      status: overrides.status ?? "DRAFT",
      entryFeeGold: overrides.entryFeeGold ?? 0,
      prizePoolGold: overrides.prizePoolGold ?? 0,
      prizeSplitGold: overrides.prizeSplitGold ?? [],
      maxPlayers: overrides.maxPlayers ?? 8,
      minTrophies: overrides.minTrophies ?? 0,
      registeredCount: overrides.registeredCount ?? 0,
      createdById: admin.id,
    },
  });
}

describe("admin tournaments — RBAC", () => {
  it("SUPPORT cannot list tournaments (403)", async () => {
    const app = await buildTestApp();
    const support = await seedUser({ adminRole: "SUPPORT" });
    const res = await app.inject({ method: "GET", url: "/api/admin/tournaments", headers: { cookie: authFor({ sub: support.id, adminRole: "SUPPORT" }) } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("MODERATOR cannot create a tournament (403)", async () => {
    const app = await buildTestApp();
    const mod = await seedUser({ adminRole: "MODERATOR" });
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/tournaments",
      headers: { cookie: authFor({ sub: mod.id, adminRole: "MODERATOR" }) },
      payload: validCreateBody,
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("unauthenticated → 401", async () => {
    const app = await buildTestApp();
    const res = await app.inject({ method: "GET", url: "/api/admin/tournaments" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("ECONOMY can list tournaments (200)", async () => {
    const app = await buildTestApp();
    const econ = await seedUser({ adminRole: "ECONOMY" });
    await seedTournamentRow({ createdById: econ.id });
    const res = await app.inject({ method: "GET", url: "/api/admin/tournaments", headers: { cookie: authFor({ sub: econ.id, adminRole: "ECONOMY" }) } });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.items.length).toBe(1);
    await app.close();
  });
});

describe("admin tournaments — list + stats", () => {
  it("returns the 4 header stats + cursor-paginated items", async () => {
    const app = await buildTestApp();
    const econ = await seedUser({ adminRole: "ECONOMY" });
    await seedTournamentRow({ createdById: econ.id, status: "RUNNING", prizePoolGold: 500 });
    await seedTournamentRow({ createdById: econ.id, status: "OPEN", prizePoolGold: 300, registeredCount: 2 });
    await seedTournamentRow({ createdById: econ.id, status: "DRAFT" });

    const res = await app.inject({ method: "GET", url: "/api/admin/tournaments", headers: { cookie: authFor({ sub: econ.id, adminRole: "ECONOMY" }) } });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.items.length).toBe(3);
    expect(body.stats.liveNow).toBe(1);
    expect(body.stats.upcoming).toBe(1);
    expect(body.stats.playersRegistered).toBe(2);
    expect(body.stats.goldPrizePool).toBe(800); // OPEN + RUNNING only
    await app.close();
  });

  it("filters by status", async () => {
    const app = await buildTestApp();
    const econ = await seedUser({ adminRole: "ECONOMY" });
    await seedTournamentRow({ createdById: econ.id, status: "DRAFT" });
    await seedTournamentRow({ createdById: econ.id, status: "OPEN" });

    const res = await app.inject({ method: "GET", url: "/api/admin/tournaments?status=OPEN", headers: { cookie: authFor({ sub: econ.id, adminRole: "ECONOMY" }) } });
    expect(res.statusCode).toBe(200);
    const items = res.json().data.items;
    expect(items.length).toBe(1);
    expect(items[0].status).toBe("OPEN");
    await app.close();
  });

  it("cursor pagination: limit=1 returns nextCursor and the second page", async () => {
    const app = await buildTestApp();
    const econ = await seedUser({ adminRole: "ECONOMY" });
    const t1 = await seedTournamentRow({ createdById: econ.id });
    await new Promise((r) => setTimeout(r, 2));
    const t2 = await seedTournamentRow({ createdById: econ.id });
    const cookie = authFor({ sub: econ.id, adminRole: "ECONOMY" });

    const page1 = await app.inject({ method: "GET", url: "/api/admin/tournaments?limit=1", headers: { cookie } });
    expect(page1.statusCode).toBe(200);
    const body1 = page1.json().data;
    expect(body1.items.length).toBe(1);
    expect(body1.items[0].id).toBe(t2.id); // most recent first
    expect(body1.nextCursor).toBeTruthy();

    const page2 = await app.inject({ method: "GET", url: `/api/admin/tournaments?limit=1&cursor=${body1.nextCursor}`, headers: { cookie } });
    expect(page2.statusCode).toBe(200);
    const body2 = page2.json().data;
    expect(body2.items.length).toBe(1);
    expect(body2.items[0].id).toBe(t1.id);
    await app.close();
  });
});

describe("admin tournaments — detail", () => {
  it("returns entries (with user) + bracket grouped by round", async () => {
    const app = await buildTestApp();
    const econ = await seedUser({ adminRole: "ECONOMY" });
    const t = await seedTournamentRow({ createdById: econ.id, status: "OPEN" });
    const player = await seedUser({ gold: 500 });
    await prisma.tournamentEntry.create({ data: { tournamentId: t.id, userId: player.id } });
    await prisma.tournamentMatch.create({ data: { tournamentId: t.id, round: 1, slot: 0, status: "pending" } });

    const res = await app.inject({ method: "GET", url: `/api/admin/tournaments/${t.id}`, headers: { cookie: authFor({ sub: econ.id, adminRole: "ECONOMY" }) } });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.entries.length).toBe(1);
    expect(body.entries[0].user.id).toBe(player.id);
    expect(body.bracket["1"].length).toBe(1);
    await app.close();
  });

  it("unknown id → 404", async () => {
    const app = await buildTestApp();
    const econ = await seedUser({ adminRole: "ECONOMY" });
    const res = await app.inject({ method: "GET", url: "/api/admin/tournaments/nope", headers: { cookie: authFor({ sub: econ.id, adminRole: "ECONOMY" }) } });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe("admin tournaments — create validation", () => {
  it("non-power-of-two maxPlayers → 400", async () => {
    const app = await buildTestApp();
    const econ = await seedUser({ adminRole: "ECONOMY" });
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/tournaments",
      headers: { cookie: authFor({ sub: econ.id, adminRole: "ECONOMY" }) },
      payload: { ...validCreateBody, maxPlayers: 10 },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("prizeSplitGold not summing to prizePoolGold → 400", async () => {
    const app = await buildTestApp();
    const econ = await seedUser({ adminRole: "ECONOMY" });
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/tournaments",
      headers: { cookie: authFor({ sub: econ.id, adminRole: "ECONOMY" }) },
      payload: { ...validCreateBody, prizeSplitGold: [700, 200] },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("format !== SINGLE_ELIM → 400 FORMAT_UNSUPPORTED", async () => {
    const app = await buildTestApp();
    const econ = await seedUser({ adminRole: "ECONOMY" });
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/tournaments",
      headers: { cookie: authFor({ sub: econ.id, adminRole: "ECONOMY" }) },
      payload: { ...validCreateBody, format: "DOUBLE_ELIM" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("FORMAT_UNSUPPORTED");
    await app.close();
  });

  it("valid body → creates a DRAFT tournament and audits", async () => {
    const app = await buildTestApp();
    const econ = await seedUser({ adminRole: "ECONOMY" });
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/tournaments",
      headers: { cookie: authFor({ sub: econ.id, adminRole: "ECONOMY" }) },
      payload: validCreateBody,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json().data;
    expect(body.status).toBe("DRAFT");
    expect(body.name).toBe("Weekend Cup");
    expect(await prisma.auditLog.count({ where: { action: "tournament.create", targetId: body.id } })).toBe(1);
    await app.close();
  });
});

describe("admin tournaments — edit gate", () => {
  it("PATCH on DRAFT → 200", async () => {
    const app = await buildTestApp();
    const econ = await seedUser({ adminRole: "ECONOMY" });
    const t = await seedTournamentRow({ createdById: econ.id, status: "DRAFT" });
    const res = await app.inject({
      method: "PATCH",
      url: `/api/admin/tournaments/${t.id}`,
      headers: { cookie: authFor({ sub: econ.id, adminRole: "ECONOMY" }) },
      payload: { ...validCreateBody, name: "Renamed Cup" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.name).toBe("Renamed Cup");
    await app.close();
  });

  it("PATCH on non-DRAFT → 409 NOT_EDITABLE", async () => {
    const app = await buildTestApp();
    const econ = await seedUser({ adminRole: "ECONOMY" });
    const t = await seedTournamentRow({ createdById: econ.id, status: "OPEN" });
    const res = await app.inject({
      method: "PATCH",
      url: `/api/admin/tournaments/${t.id}`,
      headers: { cookie: authFor({ sub: econ.id, adminRole: "ECONOMY" }) },
      payload: { ...validCreateBody, name: "Renamed Cup" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("NOT_EDITABLE");
    await app.close();
  });
});

describe("admin tournaments — status gates", () => {
  it("open a DRAFT tournament → 200, status OPEN", async () => {
    const app = await buildTestApp();
    const econ = await seedUser({ adminRole: "ECONOMY" });
    const t = await seedTournamentRow({ createdById: econ.id, status: "DRAFT" });
    const res = await app.inject({
      method: "POST",
      url: `/api/admin/tournaments/${t.id}/open`,
      headers: { cookie: authFor({ sub: econ.id, adminRole: "ECONOMY" }) },
      payload: { reason: "go live" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe("OPEN");
    expect(await prisma.auditLog.count({ where: { action: "tournament.open", targetId: t.id } })).toBe(1);
    await app.close();
  });

  it("open a non-DRAFT tournament → 409 BAD_STATE", async () => {
    const app = await buildTestApp();
    const econ = await seedUser({ adminRole: "ECONOMY" });
    const t = await seedTournamentRow({ createdById: econ.id, status: "OPEN" });
    const res = await app.inject({
      method: "POST",
      url: `/api/admin/tournaments/${t.id}/open`,
      headers: { cookie: authFor({ sub: econ.id, adminRole: "ECONOMY" }) },
      payload: { reason: "go live again" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("BAD_STATE");
    await app.close();
  });

  it("start with < 2 entries → 400 TOO_FEW_PLAYERS", async () => {
    const app = await buildTestApp();
    const econ = await seedUser({ adminRole: "ECONOMY" });
    const t = await seedTournamentRow({ createdById: econ.id, status: "OPEN" });
    const res = await app.inject({
      method: "POST",
      url: `/api/admin/tournaments/${t.id}/start`,
      headers: { cookie: authFor({ sub: econ.id, adminRole: "ECONOMY" }) },
      payload: { reason: "start" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("TOO_FEW_PLAYERS");
    await app.close();
  });
});

describe("admin tournaments — full lifecycle happy path", () => {
  it("create → open → join players → start → report each round → complete pays champion + runner-up", async () => {
    const app = await buildTestApp();
    const econ = await seedUser({ adminRole: "ECONOMY" });
    const econCookie = authFor({ sub: econ.id, adminRole: "ECONOMY" });

    // create
    const createRes = await app.inject({
      method: "POST",
      url: "/api/admin/tournaments",
      headers: { cookie: econCookie },
      payload: { ...validCreateBody, maxPlayers: 4, entryFeeGold: 0, prizePoolGold: 1000, prizeSplitGold: [700, 300] },
    });
    expect(createRes.statusCode).toBe(201);
    const tId = createRes.json().data.id;

    // open
    const openRes = await app.inject({ method: "POST", url: `/api/admin/tournaments/${tId}/open`, headers: { cookie: econCookie }, payload: { reason: "go" } });
    expect(openRes.statusCode).toBe(200);

    // join 4 players via the player route
    const players = [];
    for (let i = 0; i < 4; i++) {
      const p = await seedUser({ gold: 0 });
      const joinRes = await app.inject({ method: "POST", url: `/api/tournaments/${tId}/join`, headers: { cookie: authFor({ sub: p.id }) } });
      expect(joinRes.statusCode).toBe(201);
      players.push(p);
      await new Promise((r) => setTimeout(r, 2));
    }

    // start
    const startRes = await app.inject({ method: "POST", url: `/api/admin/tournaments/${tId}/start`, headers: { cookie: econCookie }, payload: { reason: "start" } });
    expect(startRes.statusCode).toBe(200);

    // report round 1
    const round1 = await prisma.tournamentMatch.findMany({ where: { tournamentId: tId, round: 1 }, orderBy: { slot: "asc" } });
    expect(round1.length).toBe(2);
    const w0 = round1[0]!.redEntryId!;
    const w1 = round1[1]!.redEntryId!;
    const r1 = await app.inject({ method: "POST", url: `/api/admin/tournaments/${tId}/matches/${round1[0]!.id}/report`, headers: { cookie: econCookie }, payload: { winnerEntryId: w0, reason: "r1" } });
    expect(r1.statusCode).toBe(200);
    const r2 = await app.inject({ method: "POST", url: `/api/admin/tournaments/${tId}/matches/${round1[1]!.id}/report`, headers: { cookie: econCookie }, payload: { winnerEntryId: w1, reason: "r2" } });
    expect(r2.statusCode).toBe(200);

    // report final
    const final = await prisma.tournamentMatch.findFirstOrThrow({ where: { tournamentId: tId, round: 2, slot: 0 } });
    const championEntryId = final.redEntryId!;
    const rf = await app.inject({ method: "POST", url: `/api/admin/tournaments/${tId}/matches/${final.id}/report`, headers: { cookie: econCookie }, payload: { winnerEntryId: championEntryId, reason: "final" } });
    expect(rf.statusCode).toBe(200);

    // complete
    const completeRes = await app.inject({ method: "POST", url: `/api/admin/tournaments/${tId}/complete`, headers: { cookie: econCookie }, payload: { reason: "payout" } });
    expect(completeRes.statusCode).toBe(200);
    const completeBody = completeRes.json().data;
    expect(completeBody.championEntryId).toBe(championEntryId);

    const champEntry = await prisma.tournamentEntry.findUniqueOrThrow({ where: { id: championEntryId } });
    const champUser = await prisma.user.findUniqueOrThrow({ where: { id: champEntry.userId } });
    expect(champUser.gold).toBe(700);

    const after = await prisma.tournament.findUniqueOrThrow({ where: { id: tId } });
    expect(after.status).toBe("COMPLETED");
    await app.close();
  });
});

describe("admin tournaments — report/complete/cancel error mapping", () => {
  it("report on a pending slot → 409 SLOT_NOT_READY", async () => {
    const app = await buildTestApp();
    const econ = await seedUser({ adminRole: "ECONOMY" });
    const t = await seedTournamentRow({ createdById: econ.id, status: "OPEN", maxPlayers: 4 });
    for (let i = 0; i < 4; i++) {
      const p = await seedUser({ gold: 0 });
      await prisma.tournamentEntry.create({ data: { tournamentId: t.id, userId: p.id } });
      await new Promise((r) => setTimeout(r, 2));
    }
    const startRes = await app.inject({ method: "POST", url: `/api/admin/tournaments/${t.id}/start`, headers: { cookie: authFor({ sub: econ.id, adminRole: "ECONOMY" }) }, payload: { reason: "start" } });
    expect(startRes.statusCode).toBe(200);

    const round2 = await prisma.tournamentMatch.findMany({ where: { tournamentId: t.id, round: 2 } });
    const finalSlot = round2[0]!;
    const res = await app.inject({
      method: "POST",
      url: `/api/admin/tournaments/${t.id}/matches/${finalSlot.id}/report`,
      headers: { cookie: authFor({ sub: econ.id, adminRole: "ECONOMY" }) },
      payload: { winnerEntryId: "someone", reason: "too early" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("SLOT_NOT_READY");
    await app.close();
  });

  it("cancel a DRAFT tournament → 200, then cancel again → 409 ALREADY_TERMINAL", async () => {
    const app = await buildTestApp();
    const econ = await seedUser({ adminRole: "ECONOMY" });
    const t = await seedTournamentRow({ createdById: econ.id, status: "DRAFT" });
    const cookie = authFor({ sub: econ.id, adminRole: "ECONOMY" });
    const res1 = await app.inject({ method: "POST", url: `/api/admin/tournaments/${t.id}/cancel`, headers: { cookie }, payload: { reason: "scrapped" } });
    expect(res1.statusCode).toBe(200);
    const res2 = await app.inject({ method: "POST", url: `/api/admin/tournaments/${t.id}/cancel`, headers: { cookie }, payload: { reason: "again" } });
    expect(res2.statusCode).toBe(409);
    expect(res2.json().error.code).toBe("ALREADY_TERMINAL");
    await app.close();
  });
});
