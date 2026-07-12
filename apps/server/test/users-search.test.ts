import { describe, it, expect, afterEach, afterAll } from "vitest";
import { prisma } from "../src/db/client.js";
import { buildTestApp, seedUser, authFor, truncateAll } from "./helpers.js";

afterEach(truncateAll);
afterAll(async () => {
  await prisma.$disconnect();
});

describe("GET /api/users/search", () => {
  it("finds by username substring, case-insensitively", async () => {
    const app = await buildTestApp();
    const viewer = await seedUser();
    const target = await seedUser({ username: "t_user_bagani_hero", displayName: "Bagani the Hero" });

    const res = await app.inject({
      method: "GET",
      url: "/api/users/search?q=BAGANI",
      headers: { cookie: authFor({ sub: viewer.id }) },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.items.some((u: { id: string }) => u.id === target.id)).toBe(true);
    const item = body.items.find((u: { id: string }) => u.id === target.id);
    expect(item.username).toBe(target.username);
    expect(item.displayName).toBe(target.displayName);
    expect(item.tag).toBe(target.tag);
    expect(typeof item.trophies).toBe("number");
    expect(item).not.toHaveProperty("email");
    await app.close();
  });

  it("finds by tag", async () => {
    const app = await buildTestApp();
    const viewer = await seedUser();
    const target = await seedUser();

    const res = await app.inject({
      method: "GET",
      url: `/api/users/search?q=${encodeURIComponent(target.tag)}`,
      headers: { cookie: authFor({ sub: viewer.id }) },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.items.some((u: { id: string }) => u.id === target.id)).toBe(true);
    await app.close();
  });

  it("excludes bots and deleted users", async () => {
    const app = await buildTestApp();
    const viewer = await seedUser();
    const bot = await seedUser({ username: "t_user_matchbot", isBot: true });
    const deleted = await seedUser({ username: "t_user_matchgone", deletedAt: new Date() });

    const res = await app.inject({
      method: "GET",
      url: "/api/users/search?q=t_user_match",
      headers: { cookie: authFor({ sub: viewer.id }) },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.items.some((u: { id: string }) => u.id === bot.id)).toBe(false);
    expect(body.items.some((u: { id: string }) => u.id === deleted.id)).toBe(false);
    await app.close();
  });

  it("returns empty for q shorter than 2 chars", async () => {
    const app = await buildTestApp();
    const viewer = await seedUser();
    await seedUser({ username: "t_user_a" });

    const res = await app.inject({
      method: "GET",
      url: "/api/users/search?q=a",
      headers: { cookie: authFor({ sub: viewer.id }) },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.items).toEqual([]);
    await app.close();
  });

  it("requires auth", async () => {
    const app = await buildTestApp();
    const res = await app.inject({ method: "GET", url: "/api/users/search?q=ab" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});
