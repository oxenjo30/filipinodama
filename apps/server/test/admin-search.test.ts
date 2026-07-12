import { describe, it, expect, afterEach, afterAll } from "vitest";
import { prisma } from "../src/db/client.js";
import { buildTestApp, seedUser, authFor, truncateAll } from "./helpers.js";

// truncateAll() clears Tournament but not Guild (see helpers.ts) — this file
// creates guild rows, so clean those up explicitly (same precedent as
// profile-extras.test.ts:144-145).
afterEach(async () => {
  await prisma.guildMember.deleteMany({ where: { guild: { tag: { startsWith: "#SRCH" } } } });
  await prisma.guild.deleteMany({ where: { tag: { startsWith: "#SRCH" } } });
  await truncateAll();
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe("GET /api/admin/search", () => {
  it("unauthenticated → 401", async () => {
    const app = await buildTestApp();
    const res = await app.inject({ method: "GET", url: "/api/admin/search?q=alpha" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("non-admin (role-less user) → 403", async () => {
    const app = await buildTestApp();
    const plain = await seedUser();
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/search?q=alpha",
      headers: { cookie: authFor({ sub: plain.id }) },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("q shorter than 2 chars → all-empty arrays, no admin needed to fail early (still requires auth)", async () => {
    const app = await buildTestApp();
    const support = await seedUser({ adminRole: "SUPPORT" });
    const cookie = authFor({ sub: support.id, adminRole: "SUPPORT" });

    const res = await app.inject({ method: "GET", url: "/api/admin/search?q=a", headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ players: [], guilds: [], cups: [] });

    const noQuery = await app.inject({ method: "GET", url: "/api/admin/search", headers: { cookie } });
    expect(noQuery.statusCode).toBe(200);
    expect(noQuery.json().data).toEqual({ players: [], guilds: [], cups: [] });
    await app.close();
  });

  it("finds players by displayName/username/tag substring (case-insensitive)", async () => {
    const app = await buildTestApp();
    const support = await seedUser({ adminRole: "SUPPORT" });
    const cookie = authFor({ sub: support.id, adminRole: "SUPPORT" });
    const target = await seedUser({ displayName: "Alphaeus Cruz", trophies: 1500 });
    await seedUser({ displayName: "Someone Else" });

    const res = await app.inject({ method: "GET", url: "/api/admin/search?q=ALPHA", headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const { players } = res.json().data;
    expect(players.length).toBe(1);
    expect(players[0]).toMatchObject({ id: target.id, displayName: "Alphaeus Cruz", trophies: 1500 });
    expect(players[0].tag).toBeTruthy();
    expect(players[0].rankTier).toBeTruthy();
    await app.close();
  });

  it("finds guilds by name/tag substring and includes a member count", async () => {
    const app = await buildTestApp();
    const support = await seedUser({ adminRole: "SUPPORT" });
    const cookie = authFor({ sub: support.id, adminRole: "SUPPORT" });
    const member = await seedUser();
    const guild = await prisma.guild.create({ data: { name: "Alpha Battalion", tag: "#SRCH1" } });
    await prisma.guildMember.create({ data: { guildId: guild.id, userId: member.id, role: "LEADER" } });

    const res = await app.inject({ method: "GET", url: "/api/admin/search?q=alpha", headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const { guilds } = res.json().data;
    expect(guilds.length).toBe(1);
    expect(guilds[0]).toMatchObject({ id: guild.id, name: "Alpha Battalion", tag: "#SRCH1", members: 1 });
    await app.close();
  });

  it("finds tournaments (cups) by name substring", async () => {
    const app = await buildTestApp();
    const support = await seedUser({ adminRole: "SUPPORT" });
    const cookie = authFor({ sub: support.id, adminRole: "SUPPORT" });
    const admin = await seedUser({ adminRole: "ECONOMY" });
    const cup = await prisma.tournament.create({
      data: { name: "Alpha Weekend Cup", status: "OPEN", format: "SINGLE_ELIM", createdById: admin.id },
    });

    const res = await app.inject({ method: "GET", url: "/api/admin/search?q=weekend", headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const { cups } = res.json().data;
    expect(cups.length).toBe(1);
    expect(cups[0]).toMatchObject({ id: cup.id, name: "Alpha Weekend Cup", format: "SINGLE_ELIM", status: "OPEN" });
    await app.close();
  });

  it("respects the 6/4/4 caps even when more than that many rows match", async () => {
    const app = await buildTestApp();
    const support = await seedUser({ adminRole: "SUPPORT" });
    const cookie = authFor({ sub: support.id, adminRole: "SUPPORT" });
    const admin = await seedUser({ adminRole: "ECONOMY" });

    for (let i = 0; i < 8; i++) await seedUser({ displayName: `Zeta Player ${i}` });
    for (let i = 0; i < 6; i++) await prisma.guild.create({ data: { name: `Zeta Guild ${i}`, tag: `#SRCH${i}` } });
    for (let i = 0; i < 6; i++) await prisma.tournament.create({ data: { name: `Zeta Cup ${i}`, status: "DRAFT", format: "SINGLE_ELIM", createdById: admin.id } });

    const res = await app.inject({ method: "GET", url: "/api/admin/search?q=zeta", headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const { players, guilds, cups } = res.json().data;
    expect(players.length).toBe(6);
    expect(guilds.length).toBe(4);
    expect(cups.length).toBe(4);
    await app.close();
  });
});
