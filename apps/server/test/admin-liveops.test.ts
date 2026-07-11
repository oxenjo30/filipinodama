import { describe, it, expect, afterEach, afterAll } from "vitest";
import { prisma } from "../src/db/client.js";
import { buildTestApp, seedUser, authFor, truncateAll } from "./helpers.js";

// Season isn't in truncateAll()'s TRUNCATE list, so this file cleans up its
// own rows to avoid leaking Season/SeasonProgress rows across test files.
afterEach(async () => {
  await prisma.season.deleteMany({ where: { id: { startsWith: "S_test_" } } });
  await truncateAll();
});
afterAll(async () => {
  await prisma.$disconnect();
});

let seasonSeq = 0;
async function seedSeason(extra: Record<string, unknown> = {}) {
  seasonSeq += 1;
  return prisma.season.create({
    data: {
      id: `S_test_${seasonSeq}_${process.pid}`,
      name: "Founders Season",
      startsAt: new Date("2026-01-01T00:00:00Z"),
      endsAt: new Date("2026-03-01T00:00:00Z"),
      tiers: [],
      ...extra,
    },
  });
}

describe("admin liveops seasons — number + endsLabel", () => {
  it("POST create with number + endsLabel persists them; GET list shows them", async () => {
    const app = await buildTestApp();
    const econ = await seedUser({ adminRole: "ECONOMY" });
    const cookie = authFor({ sub: econ.id, adminRole: "ECONOMY" });

    const res = await app.inject({
      method: "POST",
      url: "/api/admin/liveops/seasons",
      headers: { cookie },
      payload: {
        name: "Rainy Season",
        number: 3,
        endsLabel: "Ends in 12 days",
        startsAt: "2026-07-01T00:00:00Z",
        endsAt: "2026-08-01T00:00:00Z",
        reason: "launch season 3",
      },
    });
    expect(res.statusCode).toBe(200);
    const { id } = res.json().data;
    expect(id).toBeTruthy();

    const row = await prisma.season.findUnique({ where: { id } });
    expect(row!.number).toBe(3);
    expect(row!.endsLabel).toBe("Ends in 12 days");

    const list = await app.inject({ method: "GET", url: "/api/admin/liveops/seasons", headers: { cookie } });
    expect(list.statusCode).toBe(200);
    const item = list.json().data.items.find((i: { id: string }) => i.id === id);
    expect(item).toBeTruthy();
    expect(item.number).toBe(3);
    expect(item.endsLabel).toBe("Ends in 12 days");

    await prisma.season.delete({ where: { id } });
    await app.close();
  });

  it("PATCH updates number + endsLabel", async () => {
    const app = await buildTestApp();
    const econ = await seedUser({ adminRole: "ECONOMY" });
    const cookie = authFor({ sub: econ.id, adminRole: "ECONOMY" });
    const season = await seedSeason({ number: 1, endsLabel: "Ends soon" });

    const res = await app.inject({
      method: "PATCH",
      url: `/api/admin/liveops/seasons/${season.id}`,
      headers: { cookie },
      payload: { number: 2, endsLabel: "Ends in 3 days", reason: "bump season number" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.id).toBe(season.id);

    const after = await prisma.season.findUnique({ where: { id: season.id } });
    expect(after!.number).toBe(2);
    expect(after!.endsLabel).toBe("Ends in 3 days");
    // untouched fields persist
    expect(after!.name).toBe("Founders Season");

    const audits = await prisma.auditLog.findMany({ where: { action: "season.update", targetId: season.id } });
    expect(audits.length).toBe(1);
    expect((audits[0]!.after as { number: number }).number).toBe(2);
    expect((audits[0]!.after as { endsLabel: string }).endsLabel).toBe("Ends in 3 days");

    await app.close();
  });

  it("GET list returns number + endsLabel as null when unset", async () => {
    const app = await buildTestApp();
    const support = await seedUser({ adminRole: "SUPPORT" });
    const cookie = authFor({ sub: support.id, adminRole: "SUPPORT" });
    const season = await seedSeason();

    const res = await app.inject({ method: "GET", url: "/api/admin/liveops/seasons", headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const item = res.json().data.items.find((i: { id: string }) => i.id === season.id);
    expect(item).toBeTruthy();
    expect(item.number).toBeNull();
    expect(item.endsLabel).toBeNull();

    await app.close();
  });
});

// Quest isn't in truncateAll()'s TRUNCATE list, so this block cleans up its
// own test-created rows to avoid leaking Quest/QuestProgress across files.
describe("admin liveops quests — trigger", () => {
  afterEach(async () => {
    await prisma.questProgress.deleteMany({ where: { questId: { startsWith: "t_quest_admin_" } } });
    await prisma.quest.deleteMany({ where: { id: { startsWith: "t_quest_admin_" } } });
  });

  it("POST create with a valid trigger persists it; GET list returns it", async () => {
    const app = await buildTestApp();
    const econ = await seedUser({ adminRole: "ECONOMY" });
    const cookie = authFor({ sub: econ.id, adminRole: "ECONOMY" });
    const id = `t_quest_admin_${process.pid}_1`;

    const res = await app.inject({
      method: "POST",
      url: "/api/admin/liveops/quests",
      headers: { cookie },
      payload: {
        id,
        scope: "daily",
        title: "Win 5 ranked",
        goal: 5,
        rewardGold: 1000,
        trigger: { event: "ranked_won" },
        reason: "custom ranked-win quest",
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.id).toBe(id);

    const row = await prisma.quest.findUnique({ where: { id } });
    expect(row!.trigger).toEqual({ event: "ranked_won" });

    const list = await app.inject({ method: "GET", url: "/api/admin/liveops/quests", headers: { cookie } });
    expect(list.statusCode).toBe(200);
    const item = list.json().data.items.find((i: { id: string }) => i.id === id);
    expect(item).toBeTruthy();
    expect(item.trigger).toEqual({ event: "ranked_won" });

    await app.close();
  });

  it("POST create with an invalid trigger event → 400", async () => {
    const app = await buildTestApp();
    const econ = await seedUser({ adminRole: "ECONOMY" });
    const cookie = authFor({ sub: econ.id, adminRole: "ECONOMY" });
    const id = `t_quest_admin_${process.pid}_2`;

    const res = await app.inject({
      method: "POST",
      url: "/api/admin/liveops/quests",
      headers: { cookie },
      payload: {
        id,
        scope: "daily",
        title: "Bad trigger",
        goal: 1,
        rewardGold: 100,
        trigger: { event: "not-a-real-event" },
        reason: "should reject",
      },
    });
    expect(res.statusCode).toBe(400);

    const row = await prisma.quest.findUnique({ where: { id } });
    expect(row).toBeNull();

    await app.close();
  });

  it("POST create with NO trigger is allowed (draft quest, trigger null)", async () => {
    const app = await buildTestApp();
    const econ = await seedUser({ adminRole: "ECONOMY" });
    const cookie = authFor({ sub: econ.id, adminRole: "ECONOMY" });
    const id = `t_quest_admin_${process.pid}_3`;

    const res = await app.inject({
      method: "POST",
      url: "/api/admin/liveops/quests",
      headers: { cookie },
      payload: { id, scope: "daily", title: "No trigger yet", goal: 1, rewardGold: 50, reason: "draft" },
    });
    expect(res.statusCode).toBe(200);

    const row = await prisma.quest.findUnique({ where: { id } });
    expect(row!.trigger).toBeNull();

    await app.close();
  });

  it("PATCH edit sets a trigger on an existing quest", async () => {
    const app = await buildTestApp();
    const econ = await seedUser({ adminRole: "ECONOMY" });
    const cookie = authFor({ sub: econ.id, adminRole: "ECONOMY" });
    const id = `t_quest_admin_${process.pid}_4`;
    await prisma.quest.create({ data: { id, scope: "daily", title: "Edit me", goal: 3, rewardGold: 200 } });

    const res = await app.inject({
      method: "PATCH",
      url: `/api/admin/liveops/quests/${id}`,
      headers: { cookie },
      payload: { trigger: { event: "captures" }, reason: "wire up tracking" },
    });
    expect(res.statusCode).toBe(200);

    const row = await prisma.quest.findUnique({ where: { id } });
    expect(row!.trigger).toEqual({ event: "captures" });

    await app.close();
  });

  it("PATCH edit with an invalid trigger event → 400, leaves the quest unchanged", async () => {
    const app = await buildTestApp();
    const econ = await seedUser({ adminRole: "ECONOMY" });
    const cookie = authFor({ sub: econ.id, adminRole: "ECONOMY" });
    const id = `t_quest_admin_${process.pid}_5`;
    await prisma.quest.create({
      data: { id, scope: "daily", title: "Untouched", goal: 3, rewardGold: 200, trigger: { event: "match_played" } },
    });

    const res = await app.inject({
      method: "PATCH",
      url: `/api/admin/liveops/quests/${id}`,
      headers: { cookie },
      payload: { trigger: { event: "bogus" }, reason: "should reject" },
    });
    expect(res.statusCode).toBe(400);

    const row = await prisma.quest.findUnique({ where: { id } });
    expect(row!.trigger).toEqual({ event: "match_played" }); // unchanged

    await app.close();
  });
});
