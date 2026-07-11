import { describe, it, expect, afterEach, afterAll } from "vitest";
import { prisma } from "../src/db/client.js";
import { buildTestApp, seedUser, authFor, truncateAll } from "./helpers.js";

afterEach(truncateAll);
afterAll(async () => {
  await prisma.$disconnect();
});

async function seedMatch(overrides: Partial<{
  mode: "AI" | "CASUAL" | "RANKED" | "PRIVATE" | "LOCAL" | "DAMATH";
  redId: string | null;
  blueId: string | null;
  endedAt: Date | null;
  startedAt: Date;
  moves: unknown;
}> = {}) {
  const red = overrides.redId !== undefined ? overrides.redId : (await seedUser({ trophies: 1200 })).id;
  const blue = overrides.blueId !== undefined ? overrides.blueId : (await seedUser({ trophies: 900 })).id;
  return prisma.match.create({
    data: {
      mode: overrides.mode ?? "RANKED",
      redId: red,
      blueId: blue,
      settings: {},
      moves: (overrides.moves ?? []) as object,
      startedAt: overrides.startedAt ?? new Date(),
      endedAt: overrides.endedAt === undefined ? null : overrides.endedAt,
    },
  });
}

describe("GET /api/matches/live", () => {
  it("returns currently-live human-vs-human matches with both players + trophies + moveCount + liveCount", async () => {
    const app = await buildTestApp();
    const viewer = await seedUser();
    const m = await seedMatch({ moves: [{ from: { r: 2, c: 1 }, path: [{ r: 3, c: 2 }], captures: [] }] });

    const res = await app.inject({ method: "GET", url: "/api/matches/live", headers: { cookie: authFor({ sub: viewer.id }) } });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.liveCount).toBe(1);
    expect(body.items.length).toBe(1);
    const item = body.items[0];
    expect(item.id).toBe(m.id);
    expect(item.mode).toBe("RANKED");
    expect(item.red).toBeTruthy();
    expect(item.blue).toBeTruthy();
    expect(item.red.username).toBeTruthy();
    expect(typeof item.red.trophies).toBe("number");
    expect(item.blue.username).toBeTruthy();
    expect(item.moveCount).toBe(1);
    await app.close();
  });

  it("excludes ended matches (endedAt set)", async () => {
    const app = await buildTestApp();
    const viewer = await seedUser();
    await seedMatch({ endedAt: new Date() });

    const res = await app.inject({ method: "GET", url: "/api/matches/live", headers: { cookie: authFor({ sub: viewer.id }) } });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.liveCount).toBe(0);
    expect(body.items.length).toBe(0);
    await app.close();
  });

  it("excludes bot matches (either side isBot)", async () => {
    const app = await buildTestApp();
    const viewer = await seedUser();
    const bot = await seedUser({ isBot: true });
    const human = await seedUser();
    await seedMatch({ redId: human.id, blueId: bot.id });

    const res = await app.inject({ method: "GET", url: "/api/matches/live", headers: { cookie: authFor({ sub: viewer.id }) } });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.liveCount).toBe(0);
    expect(body.items.length).toBe(0);
    await app.close();
  });

  it("returns empty items + liveCount 0 when nothing is live", async () => {
    const app = await buildTestApp();
    const viewer = await seedUser();

    const res = await app.inject({ method: "GET", url: "/api/matches/live", headers: { cookie: authFor({ sub: viewer.id }) } });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.items).toEqual([]);
    expect(body.liveCount).toBe(0);
    await app.close();
  });

  it("requires auth", async () => {
    const app = await buildTestApp();
    const res = await app.inject({ method: "GET", url: "/api/matches/live" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});
