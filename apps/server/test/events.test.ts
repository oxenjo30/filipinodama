import { describe, it, expect, afterEach, afterAll } from "vitest";
import { prisma } from "../src/db/client.js";
import { buildTestApp, seedUser, authFor, truncateAll } from "./helpers.js";

// truncateAll() already includes LiveEvent, so no manual cleanup needed beyond it.
afterEach(async () => {
  await truncateAll();
});
afterAll(async () => {
  await prisma.$disconnect();
});

async function seedEvent(extra: Record<string, unknown> = {}) {
  return prisma.liveEvent.create({
    data: {
      name: "Weekend Double Gold",
      type: "double_gold",
      status: "scheduled",
      scope: "all_players",
      reward: "2x gold on wins",
      createdByName: "seed#0000",
      ...extra,
    },
  });
}

describe("player scheduled events — GET /api/events", () => {
  it("requires auth: no cookie → 401", async () => {
    const app = await buildTestApp();
    const res = await app.inject({ method: "GET", url: "/api/events" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("returns scheduled + live events, excludes ended", async () => {
    const app = await buildTestApp();
    const player = await seedUser();
    const scheduled = await seedEvent({ name: "Fiesta Weekend", status: "scheduled" });
    const live = await seedEvent({ name: "Double Gold Now", status: "live" });
    await seedEvent({ name: "Old Sale", status: "ended" });

    const res = await app.inject({
      method: "GET",
      url: "/api/events",
      headers: { cookie: authFor({ sub: player.id }) },
    });
    expect(res.statusCode).toBe(200);
    const items = res.json().data.items;
    expect(items.length).toBe(2);
    const ids = items.map((i: { id: string }) => i.id);
    expect(ids).toContain(scheduled.id);
    expect(ids).toContain(live.id);
    expect(ids).not.toContain("Old Sale");
    for (const item of items) {
      expect(item.status).not.toBe("ended");
    }
    await app.close();
  });

  it("returns the expected display shape (id, name, type, status, scope, reward, startsLabel, endsLabel, color)", async () => {
    const app = await buildTestApp();
    const player = await seedUser();
    const event = await seedEvent({
      name: "Fiesta Weekend",
      type: "fiesta",
      status: "scheduled",
      scope: "all_players",
      reward: "Bonus gold drops",
      startsLabel: "Jul 12",
      endsLabel: "Jul 14",
      color: "#22c55e",
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/events",
      headers: { cookie: authFor({ sub: player.id }) },
    });
    expect(res.statusCode).toBe(200);
    const [item] = res.json().data.items;
    expect(item).toEqual({
      id: event.id,
      name: "Fiesta Weekend",
      type: "fiesta",
      status: "scheduled",
      scope: "all_players",
      reward: "Bonus gold drops",
      startsLabel: "Jul 12",
      endsLabel: "Jul 14",
      color: "#22c55e",
    });
    await app.close();
  });

  it("orders soonest/createdAt (most recently created first)", async () => {
    const app = await buildTestApp();
    const player = await seedUser();
    const first = await seedEvent({ name: "First" });
    const second = await seedEvent({ name: "Second" });

    const res = await app.inject({
      method: "GET",
      url: "/api/events",
      headers: { cookie: authFor({ sub: player.id }) },
    });
    expect(res.statusCode).toBe(200);
    const items = res.json().data.items;
    expect(items[0].id).toBe(second.id);
    expect(items[1].id).toBe(first.id);
    await app.close();
  });

  it("empty → empty array", async () => {
    const app = await buildTestApp();
    const player = await seedUser();
    const res = await app.inject({
      method: "GET",
      url: "/api/events",
      headers: { cookie: authFor({ sub: player.id }) },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.items).toEqual([]);
    await app.close();
  });
});
