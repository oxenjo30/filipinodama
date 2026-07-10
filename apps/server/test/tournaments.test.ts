import { describe, it, expect, afterEach, afterAll } from "vitest";
import { prisma } from "../src/db/client.js";
import { buildTestApp, seedUser, authFor, truncateAll } from "./helpers.js";

afterEach(truncateAll);
afterAll(async () => {
  await prisma.$disconnect();
});

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
      status: overrides.status ?? "OPEN",
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

describe("player tournaments — list + detail", () => {
  it("GET /api/tournaments?status=OPEN returns joinable tournaments with fee/pool/registered/joined", async () => {
    const app = await buildTestApp();
    const t = await seedTournamentRow({ status: "OPEN", entryFeeGold: 100, prizePoolGold: 1000, maxPlayers: 8 });
    const player = await seedUser({ gold: 500 });

    const res = await app.inject({ method: "GET", url: "/api/tournaments?status=OPEN", headers: { cookie: authFor({ sub: player.id }) } });
    expect(res.statusCode).toBe(200);
    const items = res.json().data.items;
    expect(items.length).toBe(1);
    expect(items[0].id).toBe(t.id);
    expect(items[0].entryFeeGold).toBe(100);
    expect(items[0].prizePoolGold).toBe(1000);
    expect(items[0].maxPlayers).toBe(8);
    expect(items[0].registered).toBe(0);
    expect(items[0].joined).toBe(false);
    await app.close();
  });

  it("GET /api/tournaments/:id returns detail + bracket + myEntry", async () => {
    const app = await buildTestApp();
    const t = await seedTournamentRow({ status: "OPEN" });
    const player = await seedUser({ gold: 500 });
    await prisma.tournamentEntry.create({ data: { tournamentId: t.id, userId: player.id } });

    const res = await app.inject({ method: "GET", url: `/api/tournaments/${t.id}`, headers: { cookie: authFor({ sub: player.id }) } });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.id).toBe(t.id);
    expect(body.myEntry).toBeTruthy();
    expect(body.myEntry.eliminated).toBe(false);
    await app.close();
  });
});

describe("player tournaments — join", () => {
  it("guest → 403 GUEST_CANNOT_JOIN", async () => {
    const app = await buildTestApp();
    const t = await seedTournamentRow({ status: "OPEN", entryFeeGold: 0 });
    const guest = await seedUser({ isGuest: true, gold: 500 });

    const res = await app.inject({ method: "POST", url: `/api/tournaments/${t.id}/join`, headers: { cookie: authFor({ sub: guest.id, isGuest: true }) } });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("GUEST_CANNOT_JOIN");
    await app.close();
  });

  it("happy path: charges entryFeeGold, creates entry, returns 201", async () => {
    const app = await buildTestApp();
    const t = await seedTournamentRow({ status: "OPEN", entryFeeGold: 100, maxPlayers: 8 });
    const player = await seedUser({ gold: 500 });

    const res = await app.inject({ method: "POST", url: `/api/tournaments/${t.id}/join`, headers: { cookie: authFor({ sub: player.id }) } });
    expect(res.statusCode).toBe(201);

    const after = await prisma.user.findUniqueOrThrow({ where: { id: player.id } });
    expect(after.gold).toBe(400);
    const entry = await prisma.tournamentEntry.findUnique({ where: { tournamentId_userId: { tournamentId: t.id, userId: player.id } } });
    expect(entry).toBeTruthy();
    await app.close();
  });

  it("insufficient gold → 400 INSUFFICIENT_GOLD", async () => {
    const app = await buildTestApp();
    const t = await seedTournamentRow({ status: "OPEN", entryFeeGold: 100 });
    const player = await seedUser({ gold: 10 });

    const res = await app.inject({ method: "POST", url: `/api/tournaments/${t.id}/join`, headers: { cookie: authFor({ sub: player.id }) } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("INSUFFICIENT_GOLD");
    await app.close();
  });

  it("below minTrophies → 403 TROPHY_GATE", async () => {
    const app = await buildTestApp();
    const t = await seedTournamentRow({ status: "OPEN", minTrophies: 500 });
    const player = await seedUser({ gold: 500, trophies: 10 });

    const res = await app.inject({ method: "POST", url: `/api/tournaments/${t.id}/join`, headers: { cookie: authFor({ sub: player.id }) } });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("TROPHY_GATE");
    await app.close();
  });

  it("double-join by the same user concurrently → one 201, one 409, never a 500", async () => {
    const app = await buildTestApp();
    const t = await seedTournamentRow({ status: "OPEN", entryFeeGold: 100, maxPlayers: 8 });
    const player = await seedUser({ gold: 500 });
    const cookie = authFor({ sub: player.id });

    const [a, b] = await Promise.all([
      app.inject({ method: "POST", url: `/api/tournaments/${t.id}/join`, headers: { cookie } }),
      app.inject({ method: "POST", url: `/api/tournaments/${t.id}/join`, headers: { cookie } }),
    ]);
    const codes = [a.statusCode, b.statusCode].sort();
    expect(codes).toEqual([201, 409]);
    expect(codes).not.toContain(500);

    const entries = await prisma.tournamentEntry.count({ where: { tournamentId: t.id, userId: player.id } });
    expect(entries).toBe(1);
    await app.close();
  });
});

describe("player tournaments — leave", () => {
  it("leave while OPEN → 200, refunds gold", async () => {
    const app = await buildTestApp();
    const t = await seedTournamentRow({ status: "OPEN", entryFeeGold: 100, maxPlayers: 8 });
    const player = await seedUser({ gold: 500 });
    const joinRes = await app.inject({ method: "POST", url: `/api/tournaments/${t.id}/join`, headers: { cookie: authFor({ sub: player.id }) } });
    expect(joinRes.statusCode).toBe(201);

    const res = await app.inject({ method: "POST", url: `/api/tournaments/${t.id}/leave`, headers: { cookie: authFor({ sub: player.id }) } });
    expect(res.statusCode).toBe(200);

    const after = await prisma.user.findUniqueOrThrow({ where: { id: player.id } });
    expect(after.gold).toBe(500);
    await app.close();
  });

  it("leave while RUNNING → 409 BAD_STATE", async () => {
    const app = await buildTestApp();
    const t = await seedTournamentRow({ status: "OPEN", entryFeeGold: 0, maxPlayers: 8 });
    const player = await seedUser({ gold: 500 });
    const joinRes = await app.inject({ method: "POST", url: `/api/tournaments/${t.id}/join`, headers: { cookie: authFor({ sub: player.id }) } });
    expect(joinRes.statusCode).toBe(201);
    await prisma.tournament.update({ where: { id: t.id }, data: { status: "RUNNING" } });

    const res = await app.inject({ method: "POST", url: `/api/tournaments/${t.id}/leave`, headers: { cookie: authFor({ sub: player.id }) } });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("BAD_STATE");
    await app.close();
  });
});
