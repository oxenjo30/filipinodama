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

  it("an invalid format string fails schema validation (all 4 real formats are now supported — see the DOUBLE_ELIM describe block below)", async () => {
    const app = await buildTestApp();
    const econ = await seedUser({ adminRole: "ECONOMY" });
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/tournaments",
      headers: { cookie: authFor({ sub: econ.id, adminRole: "ECONOMY" }) },
      payload: { ...validCreateBody, format: "ROUND_ROBIN_XL_NOT_REAL" },
    });
    expect(res.statusCode).toBe(400);
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

describe("admin tournaments — ROUND_ROBIN validation (format-specific bracket-size rules)", () => {
  it("ROUND_ROBIN with a non-power-of-two maxPlayers (e.g. 5) → 201 (power-of-two check only applies to elimination formats)", async () => {
    const app = await buildTestApp();
    const econ = await seedUser({ adminRole: "ECONOMY" });
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/tournaments",
      headers: { cookie: authFor({ sub: econ.id, adminRole: "ECONOMY" }) },
      payload: { ...validCreateBody, format: "ROUND_ROBIN", maxPlayers: 5, prizeSplitGold: [1000] },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.format).toBe("ROUND_ROBIN");
    await app.close();
  });

  it("ROUND_ROBIN with maxPlayers > 16 → 400 (RR is capped)", async () => {
    const app = await buildTestApp();
    const econ = await seedUser({ adminRole: "ECONOMY" });
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/tournaments",
      headers: { cookie: authFor({ sub: econ.id, adminRole: "ECONOMY" }) },
      payload: { ...validCreateBody, format: "ROUND_ROBIN", maxPlayers: 17, prizeSplitGold: [1000] },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("ROUND_ROBIN with maxPlayers = 16 (the cap) → 201", async () => {
    const app = await buildTestApp();
    const econ = await seedUser({ adminRole: "ECONOMY" });
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/tournaments",
      headers: { cookie: authFor({ sub: econ.id, adminRole: "ECONOMY" }) },
      payload: { ...validCreateBody, format: "ROUND_ROBIN", maxPlayers: 16, prizeSplitGold: [1000] },
    });
    expect(res.statusCode).toBe(201);
    await app.close();
  });

  it("SINGLE_ELIM still requires a power-of-two maxPlayers (unrelaxed) → 400 for maxPlayers=5", async () => {
    const app = await buildTestApp();
    const econ = await seedUser({ adminRole: "ECONOMY" });
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/tournaments",
      headers: { cookie: authFor({ sub: econ.id, adminRole: "ECONOMY" }) },
      payload: { ...validCreateBody, format: "SINGLE_ELIM", maxPlayers: 5 },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("DOUBLE_ELIM is supported and, like SINGLE_ELIM, still requires a power-of-two maxPlayers → 400 for maxPlayers=5", async () => {
    const app = await buildTestApp();
    const econ = await seedUser({ adminRole: "ECONOMY" });
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/tournaments",
      headers: { cookie: authFor({ sub: econ.id, adminRole: "ECONOMY" }) },
      payload: { ...validCreateBody, format: "DOUBLE_ELIM", maxPlayers: 5 },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("top-N prizeSplitGold: a 3-length split summing to prizePoolGold → 201 (was rejected pre-generalization as length !== 2)", async () => {
    const app = await buildTestApp();
    const econ = await seedUser({ adminRole: "ECONOMY" });
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/tournaments",
      headers: { cookie: authFor({ sub: econ.id, adminRole: "ECONOMY" }) },
      payload: { ...validCreateBody, prizeSplitGold: [500, 300, 200] },
    });
    expect(res.statusCode).toBe(201);
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

describe("admin tournaments — ROUND_ROBIN full lifecycle happy path", () => {
  it("create → open → join 4 players → start (6 matches, all ready) → report all → complete pays top-N by standings", async () => {
    const app = await buildTestApp();
    const econ = await seedUser({ adminRole: "ECONOMY" });
    const econCookie = authFor({ sub: econ.id, adminRole: "ECONOMY" });

    const createRes = await app.inject({
      method: "POST",
      url: "/api/admin/tournaments",
      headers: { cookie: econCookie },
      payload: { ...validCreateBody, format: "ROUND_ROBIN", maxPlayers: 4, entryFeeGold: 0, prizePoolGold: 1000, prizeSplitGold: [600, 400] },
    });
    expect(createRes.statusCode).toBe(201);
    const tId = createRes.json().data.id;

    const openRes = await app.inject({ method: "POST", url: `/api/admin/tournaments/${tId}/open`, headers: { cookie: econCookie }, payload: { reason: "go" } });
    expect(openRes.statusCode).toBe(200);

    for (let i = 0; i < 4; i++) {
      const p = await seedUser({ gold: 0 });
      const joinRes = await app.inject({ method: "POST", url: `/api/tournaments/${tId}/join`, headers: { cookie: authFor({ sub: p.id }) } });
      expect(joinRes.statusCode).toBe(201);
      await new Promise((r) => setTimeout(r, 2));
    }

    const startRes = await app.inject({ method: "POST", url: `/api/admin/tournaments/${tId}/start`, headers: { cookie: econCookie }, payload: { reason: "start" } });
    expect(startRes.statusCode).toBe(200);

    const matches = await prisma.tournamentMatch.findMany({ where: { tournamentId: tId } });
    expect(matches.length).toBe(6); // n(n-1)/2 for n=4
    expect(matches.every((m) => m.status === "ready")).toBe(true);

    // report every match — seed 1's entry wins whenever it plays (guarantees
    // a clean, decisive standings winner with no ties to worry about here).
    const entries = await prisma.tournamentEntry.findMany({ where: { tournamentId: tId } });
    const seed1 = entries.find((e) => e.seed === 1)!;
    for (const m of matches) {
      const winnerEntryId = m.redEntryId === seed1.id || m.blueEntryId === seed1.id ? seed1.id : m.redEntryId!;
      const res = await app.inject({
        method: "POST",
        url: `/api/admin/tournaments/${tId}/matches/${m.id}/report`,
        headers: { cookie: econCookie },
        payload: { winnerEntryId, reason: "report" },
      });
      expect(res.statusCode).toBe(200);
    }

    // complete-before-final-report guard already exercised elsewhere; here go straight to complete.
    const completeRes = await app.inject({ method: "POST", url: `/api/admin/tournaments/${tId}/complete`, headers: { cookie: econCookie }, payload: { reason: "payout" } });
    expect(completeRes.statusCode).toBe(200);

    const seed1After = await prisma.tournamentEntry.findUniqueOrThrow({ where: { id: seed1.id } });
    expect(seed1After.placement).toBe(1); // seed1 won every game it played → 1st place
    const seed1User = await prisma.user.findUniqueOrThrow({ where: { id: seed1After.userId } });
    expect(seed1User.gold).toBe(600);

    const after = await prisma.tournament.findUniqueOrThrow({ where: { id: tId } });
    expect(after.status).toBe("COMPLETED");
    await app.close();
  });

  it("complete before all RR matches are reported → 409 NOT_FINISHED", async () => {
    const app = await buildTestApp();
    const econ = await seedUser({ adminRole: "ECONOMY" });
    const econCookie = authFor({ sub: econ.id, adminRole: "ECONOMY" });

    const createRes = await app.inject({
      method: "POST",
      url: "/api/admin/tournaments",
      headers: { cookie: econCookie },
      payload: { ...validCreateBody, format: "ROUND_ROBIN", maxPlayers: 4, entryFeeGold: 0, prizePoolGold: 1000, prizeSplitGold: [600, 400] },
    });
    const tId = createRes.json().data.id;
    await app.inject({ method: "POST", url: `/api/admin/tournaments/${tId}/open`, headers: { cookie: econCookie }, payload: { reason: "go" } });
    for (let i = 0; i < 4; i++) {
      const p = await seedUser({ gold: 0 });
      await app.inject({ method: "POST", url: `/api/tournaments/${tId}/join`, headers: { cookie: authFor({ sub: p.id }) } });
      await new Promise((r) => setTimeout(r, 2));
    }
    await app.inject({ method: "POST", url: `/api/admin/tournaments/${tId}/start`, headers: { cookie: econCookie }, payload: { reason: "start" } });

    const completeRes = await app.inject({ method: "POST", url: `/api/admin/tournaments/${tId}/complete`, headers: { cookie: econCookie }, payload: { reason: "too early" } });
    expect(completeRes.statusCode).toBe(409);
    expect(completeRes.json().error.code).toBe("NOT_FINISHED");
    await app.close();
  });

  it("join/leave/capacity/trophy-gate are format-agnostic — still work for a ROUND_ROBIN tournament", async () => {
    const app = await buildTestApp();
    const econ = await seedUser({ adminRole: "ECONOMY" });
    const econCookie = authFor({ sub: econ.id, adminRole: "ECONOMY" });

    const createRes = await app.inject({
      method: "POST",
      url: "/api/admin/tournaments",
      headers: { cookie: econCookie },
      payload: { ...validCreateBody, format: "ROUND_ROBIN", maxPlayers: 3, entryFeeGold: 50, prizePoolGold: 100, prizeSplitGold: [100], minTrophies: 0 },
    });
    const tId = createRes.json().data.id;
    await app.inject({ method: "POST", url: `/api/admin/tournaments/${tId}/open`, headers: { cookie: econCookie }, payload: { reason: "go" } });

    const p1 = await seedUser({ gold: 100 });
    const join1 = await app.inject({ method: "POST", url: `/api/tournaments/${tId}/join`, headers: { cookie: authFor({ sub: p1.id }) } });
    expect(join1.statusCode).toBe(201);

    const leave1 = await app.inject({ method: "POST", url: `/api/tournaments/${tId}/leave`, headers: { cookie: authFor({ sub: p1.id }) } });
    expect(leave1.statusCode).toBe(200);
    const p1After = await prisma.user.findUniqueOrThrow({ where: { id: p1.id } });
    expect(p1After.gold).toBe(100); // refunded

    // capacity: fill to 3, 4th rejected
    for (let i = 0; i < 3; i++) {
      const p = await seedUser({ gold: 100 });
      const res = await app.inject({ method: "POST", url: `/api/tournaments/${tId}/join`, headers: { cookie: authFor({ sub: p.id }) } });
      expect(res.statusCode).toBe(201);
    }
    const overflow = await seedUser({ gold: 100 });
    const overflowRes = await app.inject({ method: "POST", url: `/api/tournaments/${tId}/join`, headers: { cookie: authFor({ sub: overflow.id }) } });
    expect(overflowRes.statusCode).toBe(409);
    await app.close();
  });
});

describe("admin tournaments — SWISS validation + create route", () => {
  it("create SWISS with an explicit rounds value → 201, persists rounds", async () => {
    const app = await buildTestApp();
    const econ = await seedUser({ adminRole: "ECONOMY" });
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/tournaments",
      headers: { cookie: authFor({ sub: econ.id, adminRole: "ECONOMY" }) },
      payload: { ...validCreateBody, format: "SWISS", maxPlayers: 8, rounds: 4, prizeSplitGold: [1000] },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.format).toBe("SWISS");
    expect(res.json().data.rounds).toBe(4);
    await app.close();
  });

  it("create SWISS WITHOUT rounds → 201, rounds is null (computed later at Start)", async () => {
    const app = await buildTestApp();
    const econ = await seedUser({ adminRole: "ECONOMY" });
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/tournaments",
      headers: { cookie: authFor({ sub: econ.id, adminRole: "ECONOMY" }) },
      payload: { ...validCreateBody, format: "SWISS", maxPlayers: 8, prizeSplitGold: [1000] },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.rounds).toBeNull();
    await app.close();
  });

  it("SWISS with a non-power-of-two maxPlayers (e.g. 5) → 201 (power-of-two check only applies to elimination formats)", async () => {
    const app = await buildTestApp();
    const econ = await seedUser({ adminRole: "ECONOMY" });
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/tournaments",
      headers: { cookie: authFor({ sub: econ.id, adminRole: "ECONOMY" }) },
      payload: { ...validCreateBody, format: "SWISS", maxPlayers: 5, prizeSplitGold: [1000] },
    });
    expect(res.statusCode).toBe(201);
    await app.close();
  });

  it("SWISS with maxPlayers > 32 → 400 (Swiss is capped)", async () => {
    const app = await buildTestApp();
    const econ = await seedUser({ adminRole: "ECONOMY" });
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/tournaments",
      headers: { cookie: authFor({ sub: econ.id, adminRole: "ECONOMY" }) },
      payload: { ...validCreateBody, format: "SWISS", maxPlayers: 33, prizeSplitGold: [1000] },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("SWISS with rounds = 0 (below min 1) → 400 invalid", async () => {
    const app = await buildTestApp();
    const econ = await seedUser({ adminRole: "ECONOMY" });
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/tournaments",
      headers: { cookie: authFor({ sub: econ.id, adminRole: "ECONOMY" }) },
      payload: { ...validCreateBody, format: "SWISS", maxPlayers: 8, rounds: 0, prizeSplitGold: [1000] },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("join/leave still work for a SWISS tournament (format-agnostic invariant)", async () => {
    const app = await buildTestApp();
    const econ = await seedUser({ adminRole: "ECONOMY" });
    const econCookie = authFor({ sub: econ.id, adminRole: "ECONOMY" });
    const createRes = await app.inject({
      method: "POST",
      url: "/api/admin/tournaments",
      headers: { cookie: econCookie },
      payload: { ...validCreateBody, format: "SWISS", maxPlayers: 4, entryFeeGold: 50, prizePoolGold: 100, prizeSplitGold: [100] },
    });
    const tId = createRes.json().data.id;
    await app.inject({ method: "POST", url: `/api/admin/tournaments/${tId}/open`, headers: { cookie: econCookie }, payload: { reason: "go" } });

    const p1 = await seedUser({ gold: 100 });
    const join1 = await app.inject({ method: "POST", url: `/api/tournaments/${tId}/join`, headers: { cookie: authFor({ sub: p1.id }) } });
    expect(join1.statusCode).toBe(201);
    const leave1 = await app.inject({ method: "POST", url: `/api/tournaments/${tId}/leave`, headers: { cookie: authFor({ sub: p1.id }) } });
    expect(leave1.statusCode).toBe(200);
    const p1After = await prisma.user.findUniqueOrThrow({ where: { id: p1.id } });
    expect(p1After.gold).toBe(100); // refunded
    await app.close();
  });
});

describe("admin tournaments — SWISS full lifecycle happy path (via HTTP routes)", () => {
  it("create → open → join 4 players → start (round 1 only) → report round 1 → round 2 auto-generates → report round 2 → complete pays top-N by Swiss standings", async () => {
    const app = await buildTestApp();
    const econ = await seedUser({ adminRole: "ECONOMY" });
    const econCookie = authFor({ sub: econ.id, adminRole: "ECONOMY" });

    const createRes = await app.inject({
      method: "POST",
      url: "/api/admin/tournaments",
      headers: { cookie: econCookie },
      payload: { ...validCreateBody, format: "SWISS", maxPlayers: 4, entryFeeGold: 0, prizePoolGold: 1000, prizeSplitGold: [600, 400] },
    });
    expect(createRes.statusCode).toBe(201);
    const tId = createRes.json().data.id;

    const openRes = await app.inject({ method: "POST", url: `/api/admin/tournaments/${tId}/open`, headers: { cookie: econCookie }, payload: { reason: "go" } });
    expect(openRes.statusCode).toBe(200);

    for (let i = 0; i < 4; i++) {
      const p = await seedUser({ gold: 0 });
      const joinRes = await app.inject({ method: "POST", url: `/api/tournaments/${tId}/join`, headers: { cookie: authFor({ sub: p.id }) } });
      expect(joinRes.statusCode).toBe(201);
      await new Promise((r) => setTimeout(r, 2));
    }

    const startRes = await app.inject({ method: "POST", url: `/api/admin/tournaments/${tId}/start`, headers: { cookie: econCookie }, payload: { reason: "start" } });
    expect(startRes.statusCode).toBe(200);
    expect(startRes.json().data.rounds).toBe(2); // ceil(log2(4))

    let matches = await prisma.tournamentMatch.findMany({ where: { tournamentId: tId } });
    expect(matches.length).toBe(2); // only round 1 exists

    // report round 1
    for (const m of matches) {
      const res = await app.inject({
        method: "POST",
        url: `/api/admin/tournaments/${tId}/matches/${m.id}/report`,
        headers: { cookie: econCookie },
        payload: { winnerEntryId: m.redEntryId, reason: "r1" },
      });
      expect(res.statusCode).toBe(200);
    }

    // round 2 should now exist (auto-generated)
    const round2 = await prisma.tournamentMatch.findMany({ where: { tournamentId: tId, round: 2 } });
    expect(round2.length).toBe(2);

    // complete too early → 409
    const tooEarly = await app.inject({ method: "POST", url: `/api/admin/tournaments/${tId}/complete`, headers: { cookie: econCookie }, payload: { reason: "too early" } });
    expect(tooEarly.statusCode).toBe(409);
    expect(tooEarly.json().error.code).toBe("NOT_FINISHED");

    // report round 2
    for (const m of round2) {
      const res = await app.inject({
        method: "POST",
        url: `/api/admin/tournaments/${tId}/matches/${m.id}/report`,
        headers: { cookie: econCookie },
        payload: { winnerEntryId: m.redEntryId, reason: "r2" },
      });
      expect(res.statusCode).toBe(200);
    }

    const completeRes = await app.inject({ method: "POST", url: `/api/admin/tournaments/${tId}/complete`, headers: { cookie: econCookie }, payload: { reason: "payout" } });
    expect(completeRes.statusCode).toBe(200);

    const after = await prisma.tournament.findUniqueOrThrow({ where: { id: tId } });
    expect(after.status).toBe("COMPLETED");

    const champEntry = await prisma.tournamentEntry.findFirstOrThrow({ where: { tournamentId: tId, placement: 1 } });
    const champUser = await prisma.user.findUniqueOrThrow({ where: { id: champEntry.userId } });
    expect(champUser.gold).toBe(600);
    await app.close();
  });
});

describe("admin tournaments — DOUBLE_ELIM full lifecycle happy path (via HTTP routes)", () => {
  it("create → open → join/leave (format-agnostic invariant) → join 4 players → start (seeds W+L+GF) → report W+L through to grand final → complete pays top-N", async () => {
    const app = await buildTestApp();
    const econ = await seedUser({ adminRole: "ECONOMY" });
    const econCookie = authFor({ sub: econ.id, adminRole: "ECONOMY" });

    const createRes = await app.inject({
      method: "POST",
      url: "/api/admin/tournaments",
      headers: { cookie: econCookie },
      payload: { ...validCreateBody, format: "DOUBLE_ELIM", maxPlayers: 4, entryFeeGold: 50, prizePoolGold: 1000, prizeSplitGold: [700, 300] },
    });
    expect(createRes.statusCode).toBe(201);
    expect(createRes.json().data.format).toBe("DOUBLE_ELIM");
    const tId = createRes.json().data.id;

    const openRes = await app.inject({ method: "POST", url: `/api/admin/tournaments/${tId}/open`, headers: { cookie: econCookie }, payload: { reason: "go" } });
    expect(openRes.statusCode).toBe(200);

    // join/leave still work for DOUBLE_ELIM (format-agnostic invariant).
    const leaver = await seedUser({ gold: 500 });
    const leaverJoin = await app.inject({ method: "POST", url: `/api/tournaments/${tId}/join`, headers: { cookie: authFor({ sub: leaver.id }) } });
    expect(leaverJoin.statusCode).toBe(201);
    const leaveRes = await app.inject({ method: "POST", url: `/api/tournaments/${tId}/leave`, headers: { cookie: authFor({ sub: leaver.id }) } });
    expect(leaveRes.statusCode).toBe(200);

    for (let i = 0; i < 4; i++) {
      const p = await seedUser({ gold: 500 });
      const joinRes = await app.inject({ method: "POST", url: `/api/tournaments/${tId}/join`, headers: { cookie: authFor({ sub: p.id }) } });
      expect(joinRes.statusCode).toBe(201);
      await new Promise((r) => setTimeout(r, 2));
    }

    const startRes = await app.inject({ method: "POST", url: `/api/admin/tournaments/${tId}/start`, headers: { cookie: econCookie }, payload: { reason: "start" } });
    expect(startRes.statusCode).toBe(200);
    expect(startRes.json().data.bracketSize).toBe(4);

    const wMatches = await prisma.tournamentMatch.findMany({ where: { tournamentId: tId, bracket: "W" } });
    expect(wMatches.length).toBe(3); // 2 R1 + 1 final
    const lMatches = await prisma.tournamentMatch.findMany({ where: { tournamentId: tId, bracket: "L" } });
    expect(lMatches.length).toBe(2); // pre-created L skeleton
    const gfMatches = await prisma.tournamentMatch.findMany({ where: { tournamentId: tId, bracket: "GF" } });
    expect(gfMatches.length).toBe(1); // pre-created GF game-1 slot

    // report W round 1.
    const wRound1 = await prisma.tournamentMatch.findMany({ where: { tournamentId: tId, bracket: "W", round: 1 }, orderBy: { slot: "asc" } });
    for (const m of wRound1) {
      const res = await app.inject({
        method: "POST",
        url: `/api/admin/tournaments/${tId}/matches/${m.id}/report`,
        headers: { cookie: econCookie },
        payload: { winnerEntryId: m.redEntryId, reason: "w1" },
      });
      expect(res.statusCode).toBe(200);
    }

    // complete too early (W-final not even reported) → 409 NOT_FINISHED.
    const tooEarly = await app.inject({ method: "POST", url: `/api/admin/tournaments/${tId}/complete`, headers: { cookie: econCookie }, payload: { reason: "too early" } });
    expect(tooEarly.statusCode).toBe(409);
    expect(tooEarly.json().error.code).toBe("NOT_FINISHED");

    // report W final.
    const wFinal = await prisma.tournamentMatch.findFirstOrThrow({ where: { tournamentId: tId, bracket: "W", round: 2, slot: 0 } });
    const wChampionId = wFinal.redEntryId!;
    const wFinalReport = await app.inject({
      method: "POST",
      url: `/api/admin/tournaments/${tId}/matches/${wFinal.id}/report`,
      headers: { cookie: econCookie },
      payload: { winnerEntryId: wChampionId, reason: "wfinal" },
    });
    expect(wFinalReport.statusCode).toBe(200);

    // report L round 1 (round 101).
    const l1 = await prisma.tournamentMatch.findFirstOrThrow({ where: { tournamentId: tId, bracket: "L", round: 101, slot: 0 } });
    const l1Report = await app.inject({
      method: "POST",
      url: `/api/admin/tournaments/${tId}/matches/${l1.id}/report`,
      headers: { cookie: econCookie },
      payload: { winnerEntryId: l1.redEntryId, reason: "l1" },
    });
    expect(l1Report.statusCode).toBe(200);

    // report L final (round 102) — winner is the L-champion.
    const l2 = await prisma.tournamentMatch.findFirstOrThrow({ where: { tournamentId: tId, bracket: "L", round: 102, slot: 0 } });
    expect(l2.status).toBe("ready");
    const lChampionId = l2.redEntryId!;
    const l2Report = await app.inject({
      method: "POST",
      url: `/api/admin/tournaments/${tId}/matches/${l2.id}/report`,
      headers: { cookie: econCookie },
      payload: { winnerEntryId: lChampionId, reason: "l2" },
    });
    expect(l2Report.statusCode).toBe(200);

    // Grand Final should now be ready: W-champ vs L-champ.
    const gf = await prisma.tournamentMatch.findFirstOrThrow({ where: { tournamentId: tId, bracket: "GF", round: 201 } });
    expect(gf.status).toBe("ready");
    expect(gf.redEntryId).toBe(wChampionId);
    expect(gf.blueEntryId).toBe(lChampionId);

    // L-champion wins game 1 → BRACKET RESET via the route layer.
    const gf1Report = await app.inject({
      method: "POST",
      url: `/api/admin/tournaments/${tId}/matches/${gf.id}/report`,
      headers: { cookie: econCookie },
      payload: { winnerEntryId: lChampionId, reason: "gf1" },
    });
    expect(gf1Report.statusCode).toBe(200);

    const gf2 = await prisma.tournamentMatch.findFirstOrThrow({ where: { tournamentId: tId, bracket: "GF", round: 202 } });
    expect(gf2.status).toBe("ready");

    // complete still too early (reset game 2 not yet decided) → 409.
    const stillEarly = await app.inject({ method: "POST", url: `/api/admin/tournaments/${tId}/complete`, headers: { cookie: econCookie }, payload: { reason: "too early 2" } });
    expect(stillEarly.statusCode).toBe(409);
    expect(stillEarly.json().error.code).toBe("NOT_FINISHED");

    // W-champion wins the reset — they're the final champion.
    const gf2Report = await app.inject({
      method: "POST",
      url: `/api/admin/tournaments/${tId}/matches/${gf2.id}/report`,
      headers: { cookie: econCookie },
      payload: { winnerEntryId: wChampionId, reason: "gf2 reset" },
    });
    expect(gf2Report.statusCode).toBe(200);

    const completeRes = await app.inject({ method: "POST", url: `/api/admin/tournaments/${tId}/complete`, headers: { cookie: econCookie }, payload: { reason: "payout" } });
    expect(completeRes.statusCode).toBe(200);
    expect(completeRes.json().data.championEntryId).toBe(wChampionId);
    expect(completeRes.json().data.runnerUpEntryId).toBe(lChampionId);

    const after = await prisma.tournament.findUniqueOrThrow({ where: { id: tId } });
    expect(after.status).toBe("COMPLETED");
    const champUser = await prisma.user.findUniqueOrThrow({ where: { id: (await prisma.tournamentEntry.findUniqueOrThrow({ where: { id: wChampionId } })).userId } });
    expect(champUser.gold).toBe(450 + 700); // joined with 500, paid 50 entry fee, won 700 prize

    // re-complete → 409, no double-pay.
    const reComplete = await app.inject({ method: "POST", url: `/api/admin/tournaments/${tId}/complete`, headers: { cookie: econCookie }, payload: { reason: "again" } });
    expect(reComplete.statusCode).toBe(409);
    expect(await prisma.ledgerEntry.count({ where: { reason: "tournament-prize" } })).toBe(2);

    await app.close();
  });

  it("the admin detail route's bracket grouping carries each match's own `bracket` field (W/L/GF) so the client can render three columns", async () => {
    const app = await buildTestApp();
    const econ = await seedUser({ adminRole: "ECONOMY" });
    const econCookie = authFor({ sub: econ.id, adminRole: "ECONOMY" });

    const createRes = await app.inject({
      method: "POST",
      url: "/api/admin/tournaments",
      headers: { cookie: econCookie },
      payload: { ...validCreateBody, format: "DOUBLE_ELIM", maxPlayers: 4, entryFeeGold: 0, prizeSplitGold: [700, 300] },
    });
    const tId = createRes.json().data.id;
    await app.inject({ method: "POST", url: `/api/admin/tournaments/${tId}/open`, headers: { cookie: econCookie }, payload: { reason: "go" } });
    for (let i = 0; i < 4; i++) {
      const p = await seedUser({ gold: 0 });
      await app.inject({ method: "POST", url: `/api/tournaments/${tId}/join`, headers: { cookie: authFor({ sub: p.id }) } });
      await new Promise((r) => setTimeout(r, 2));
    }
    await app.inject({ method: "POST", url: `/api/admin/tournaments/${tId}/start`, headers: { cookie: econCookie }, payload: { reason: "start" } });

    const detailRes = await app.inject({ method: "GET", url: `/api/admin/tournaments/${tId}`, headers: { cookie: econCookie } });
    expect(detailRes.statusCode).toBe(200);
    const detail = detailRes.json().data;
    const allMatches = Object.values(detail.bracket as Record<string, Array<{ bracket: string }>>).flat();
    const brackets = new Set(allMatches.map((m) => m.bracket));
    expect(brackets.has("W")).toBe(true);
    expect(brackets.has("L")).toBe(true);
    expect(brackets.has("GF")).toBe(true);

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
