import { describe, it, expect, afterEach, afterAll } from "vitest";
import { prisma } from "../src/db/client.js";
import { buildTestApp, seedUser, authFor, truncateAll } from "./helpers.js";

afterEach(truncateAll);
afterAll(async () => {
  await prisma.$disconnect();
});

async function seedMatch(overrides: Partial<{
  redId: string | null;
  blueId: string | null;
  winner: "red" | "blue" | "draw" | null;
  redTrophyDelta: number | null;
  blueTrophyDelta: number | null;
  moves: unknown;
  endedAt: Date | null;
}> = {}) {
  const red = overrides.redId !== undefined ? overrides.redId : (await seedUser({ trophies: 1200 })).id;
  const blue = overrides.blueId !== undefined ? overrides.blueId : (await seedUser({ trophies: 900 })).id;
  return prisma.match.create({
    data: {
      mode: "RANKED",
      redId: red,
      blueId: blue,
      settings: {},
      moves: (overrides.moves ?? []) as object,
      winner: overrides.winner ?? null,
      redTrophyDelta: overrides.redTrophyDelta ?? null,
      blueTrophyDelta: overrides.blueTrophyDelta ?? null,
      startedAt: new Date(),
      endedAt: overrides.endedAt === undefined ? new Date() : overrides.endedAt,
    },
  });
}

describe("GET /api/users/:id/profile-extras", () => {
  it("requires auth", async () => {
    const app = await buildTestApp();
    const target = await seedUser();
    const res = await app.inject({ method: "GET", url: `/api/users/${target.id}/profile-extras` });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("returns guild-free (via base profile) but populated favoriteMove/openings/recentMatches from seeded matches with moves", async () => {
    const app = await buildTestApp();
    const viewer = await seedUser();
    const player = await seedUser({ trophies: 1500 });
    const opponent = await seedUser({ displayName: "Rival" });

    // 3 finished matches, 2 sharing the same first move (b6 -> c5), 1 different (a6 -> b5).
    const sharedMoves = [{ from: { r: 2, c: 1 }, path: [{ r: 3, c: 2 }], captures: [], promotion: false }];
    const otherMoves = [{ from: { r: 2, c: 0 }, path: [{ r: 3, c: 1 }], captures: [], promotion: false }];

    await seedMatch({ redId: player.id, blueId: opponent.id, winner: "red", redTrophyDelta: 25, blueTrophyDelta: -5, moves: sharedMoves });
    await seedMatch({ redId: player.id, blueId: opponent.id, winner: "blue", redTrophyDelta: -5, blueTrophyDelta: 25, moves: sharedMoves });
    await seedMatch({ redId: opponent.id, blueId: player.id, winner: "draw", moves: otherMoves });

    const res = await app.inject({
      method: "GET",
      url: `/api/users/${player.id}/profile-extras`,
      headers: { cookie: authFor({ sub: viewer.id }) },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;

    // Favorite move: the most frequent first-move pair across the player's matches.
    expect(body.favoriteMove).toBe("b6 → c5");

    // Openings: top patterns with real usage percentages (2/3 shared, 1/3 other).
    expect(Array.isArray(body.openings)).toBe(true);
    expect(body.openings.length).toBeGreaterThanOrEqual(1);
    const top = body.openings[0];
    expect(top.label).toBe("b6 → c5");
    expect(top.pct).toBe(67);

    // Recent matches: real match rows, newest first, with result relative to the player.
    expect(body.recentMatches.length).toBe(3);
    const first = body.recentMatches[0];
    expect(first.opponentName).toBeTruthy();
    expect(["win", "loss", "draw"]).toContain(first.result);
    expect(first.hasReplay).toBe(true);

    // Badges: honest empty array — no fabricated backend.
    expect(body.badges).toEqual([]);

    await app.close();
  });

  it("is empty-safe for a user with no finished matches", async () => {
    const app = await buildTestApp();
    const viewer = await seedUser();
    const player = await seedUser();

    const res = await app.inject({
      method: "GET",
      url: `/api/users/${player.id}/profile-extras`,
      headers: { cookie: authFor({ sub: viewer.id }) },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.favoriteMove).toBeNull();
    expect(body.openings).toEqual([]);
    expect(body.recentMatches).toEqual([]);
    expect(body.badges).toEqual([]);

    await app.close();
  });

  it("404s for a non-existent user", async () => {
    const app = await buildTestApp();
    const viewer = await seedUser();
    const res = await app.inject({
      method: "GET",
      url: `/api/users/does-not-exist/profile-extras`,
      headers: { cookie: authFor({ sub: viewer.id }) },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe("GET /api/users/:id — guild field (used by the profile Guild tile)", () => {
  it("returns guild {id,name,tag} when the player is a guild member, null otherwise", async () => {
    const app = await buildTestApp();
    const viewer = await seedUser();
    const solo = await seedUser();
    const member = await seedUser();

    const guild = await prisma.guild.create({
      data: { name: `Test Guild ${Date.now()}`, tag: `#TG${Math.floor(Math.random() * 100000)}` },
    });
    await prisma.guildMember.create({ data: { guildId: guild.id, userId: member.id, role: "MEMBER" } });

    const soloRes = await app.inject({ method: "GET", url: `/api/users/${solo.id}`, headers: { cookie: authFor({ sub: viewer.id }) } });
    expect(soloRes.statusCode).toBe(200);
    expect(soloRes.json().data.user.guild).toBeNull();

    const memberRes = await app.inject({ method: "GET", url: `/api/users/${member.id}`, headers: { cookie: authFor({ sub: viewer.id }) } });
    expect(memberRes.statusCode).toBe(200);
    expect(memberRes.json().data.user.guild).toMatchObject({ id: guild.id, name: guild.name, tag: guild.tag });

    await prisma.guildMember.deleteMany({ where: { guildId: guild.id } });
    await prisma.guild.delete({ where: { id: guild.id } });
    await app.close();
  });
});
