import { describe, it, expect, afterEach, afterAll } from "vitest";
import { prisma } from "../src/db/client.js";
import { invalidateConfig } from "../src/lib/config-service.js";
import { DEFAULT_LADDER, CONFIG_KEY } from "../src/lib/daily-rewards.js";
import { buildTestApp, seedUser, authFor, truncateAll } from "./helpers.js";

afterEach(async () => {
  await prisma.config.deleteMany({});
  await truncateAll();
  invalidateConfig();
});
afterAll(async () => {
  await prisma.$disconnect();
});

const VALID_LADDER = [
  { type: "gold", amt: 120 },
  { type: "gold", amt: 180 },
  { type: "gem", amt: 5 },
  { type: "gold", amt: 350 },
  { type: "gem", amt: 15 },
  { type: "gold", amt: 600 },
  { type: "chest", gold: 1500, gem: 40 },
];

describe("admin daily-rewards (v3 delta A6)", () => {
  it("GET returns production defaults when no config saved", async () => {
    const app = await buildTestApp();
    const support = await seedUser({ adminRole: "SUPPORT" });
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/liveops/daily-rewards",
      headers: { cookie: authFor({ sub: support.id, adminRole: "SUPPORT" }) },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.ladder).toEqual(DEFAULT_LADDER);
    await app.close();
  });

  it("SUPERADMIN save persists + writes an audit row", async () => {
    const app = await buildTestApp();
    const su = await seedUser({ adminRole: "SUPERADMIN" });
    const cookie = authFor({ sub: su.id, adminRole: "SUPERADMIN" });

    const res = await app.inject({
      method: "POST",
      url: "/api/admin/liveops/daily-rewards",
      headers: { cookie },
      payload: { ladder: VALID_LADDER, reason: "owner-approved rebalance" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.ladder).toEqual(VALID_LADDER);

    const row = await prisma.config.findUnique({ where: { key: CONFIG_KEY } });
    expect(row).toBeTruthy();
    expect(JSON.parse(row!.value)).toEqual(VALID_LADDER);

    const audit = await prisma.auditLog.findFirst({
      where: { action: "economy.dailyRewards", actorId: su.id },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).toBeTruthy();
    expect(audit!.reason).toBe("owner-approved rebalance");
    expect((audit!.after as any).ladder).toEqual(VALID_LADDER);

    // GET now reflects the saved ladder, not the default.
    const getRes = await app.inject({
      method: "GET",
      url: "/api/admin/liveops/daily-rewards",
      headers: { cookie },
    });
    expect(getRes.json().data.ladder).toEqual(VALID_LADDER);

    await app.close();
  });

  it("non-SUPERADMIN save → 403; unauthenticated → 401", async () => {
    const app = await buildTestApp();
    const econ = await seedUser({ adminRole: "ECONOMY" });
    const cookie = authFor({ sub: econ.id, adminRole: "ECONOMY" });

    const forbidden = await app.inject({
      method: "POST",
      url: "/api/admin/liveops/daily-rewards",
      headers: { cookie },
      payload: { ladder: VALID_LADDER, reason: "trying anyway" },
    });
    expect(forbidden.statusCode).toBe(403);

    const unauth = await app.inject({
      method: "POST",
      url: "/api/admin/liveops/daily-rewards",
      payload: { ladder: VALID_LADDER, reason: "no auth" },
    });
    expect(unauth.statusCode).toBe(401);

    await app.close();
  });

  it("validation rejects negative/absurd amounts and malformed shapes", async () => {
    const app = await buildTestApp();
    const su = await seedUser({ adminRole: "SUPERADMIN" });
    const cookie = authFor({ sub: su.id, adminRole: "SUPERADMIN" });

    const negative = VALID_LADDER.map((r, i) => (i === 0 ? { type: "gold", amt: -50 } : r));
    let res = await app.inject({
      method: "POST",
      url: "/api/admin/liveops/daily-rewards",
      headers: { cookie },
      payload: { ladder: negative, reason: "x" },
    });
    expect(res.statusCode).toBe(400);

    const absurd = VALID_LADDER.map((r, i) => (i === 1 ? { type: "gold", amt: 999_999_999 } : r));
    res = await app.inject({
      method: "POST",
      url: "/api/admin/liveops/daily-rewards",
      headers: { cookie },
      payload: { ladder: absurd, reason: "x" },
    });
    expect(res.statusCode).toBe(400);

    const absurdGems = VALID_LADDER.map((r, i) => (i === 2 ? { type: "gem", amt: 5000 } : r));
    res = await app.inject({
      method: "POST",
      url: "/api/admin/liveops/daily-rewards",
      headers: { cookie },
      payload: { ladder: absurdGems, reason: "x" },
    });
    expect(res.statusCode).toBe(400);

    // Day 7 must be a chest — reject a 7-gold-days ladder.
    const noChest = VALID_LADDER.map((r, i) => (i === 6 ? { type: "gold", amt: 100 } : r));
    res = await app.inject({
      method: "POST",
      url: "/api/admin/liveops/daily-rewards",
      headers: { cookie },
      payload: { ladder: noChest, reason: "x" },
    });
    expect(res.statusCode).toBe(400);

    // Wrong length.
    res = await app.inject({
      method: "POST",
      url: "/api/admin/liveops/daily-rewards",
      headers: { cookie },
      payload: { ladder: VALID_LADDER.slice(0, 6), reason: "x" },
    });
    expect(res.statusCode).toBe(400);

    // No config row was written by any of the rejected attempts.
    const row = await prisma.config.findUnique({ where: { key: CONFIG_KEY } });
    expect(row).toBeNull();

    await app.close();
  });

  it("player daily-login claim pays from the SAVED ladder (day 1 amount matches config)", async () => {
    const app = await buildTestApp();
    const su = await seedUser({ adminRole: "SUPERADMIN" });
    const suCookie = authFor({ sub: su.id, adminRole: "SUPERADMIN" });

    const saveRes = await app.inject({
      method: "POST",
      url: "/api/admin/liveops/daily-rewards",
      headers: { cookie: suCookie },
      payload: { ladder: VALID_LADDER, reason: "seed for claim test" },
    });
    expect(saveRes.statusCode).toBe(200);

    // Fresh player: loginStreak 0 / lastLoginBonusAt null → day 1, not claimed.
    const player = await seedUser({});
    const playerCookie = authFor({ sub: player.id, adminRole: null });

    const statusRes = await app.inject({
      method: "GET",
      url: "/api/rewards/daily-login",
      headers: { cookie: playerCookie },
    });
    expect(statusRes.statusCode).toBe(200);
    expect(statusRes.json().data.day).toBe(1);
    expect(statusRes.json().data.rewardToday).toBe(VALID_LADDER[0].amt); // 120 gold, from config not the 100-gold default

    const claimRes = await app.inject({
      method: "POST",
      url: "/api/rewards/daily-login",
      headers: { cookie: playerCookie },
    });
    expect(claimRes.statusCode).toBe(200);
    const claimed = claimRes.json().data;
    expect(claimed.day).toBe(1);
    expect(claimed.rewardGold).toBe(VALID_LADDER[0].amt);
    expect(claimed.goldBalance).toBe(VALID_LADDER[0].amt);

    const updated = await prisma.user.findUnique({ where: { id: player.id } });
    expect(updated!.gold).toBe(VALID_LADDER[0].amt);

    await app.close();
  });

  it("player daily-login claim credits diamonds too on a gem day", async () => {
    const app = await buildTestApp();
    const su = await seedUser({ adminRole: "SUPERADMIN" });
    const suCookie = authFor({ sub: su.id, adminRole: "SUPERADMIN" });
    await app.inject({
      method: "POST",
      url: "/api/admin/liveops/daily-rewards",
      headers: { cookie: suCookie },
      payload: { ladder: VALID_LADDER, reason: "seed" },
    });

    const player = await seedUser({});
    // Force the player to day 3 (a gem day) by giving them a 2-day-old streak of 1.
    await prisma.user.update({
      where: { id: player.id },
      data: { loginStreak: 2, lastLoginBonusAt: new Date(Date.now() - 24 * 3600 * 1000) },
    });
    const playerCookie = authFor({ sub: player.id, adminRole: null });

    const claimRes = await app.inject({
      method: "POST",
      url: "/api/rewards/daily-login",
      headers: { cookie: playerCookie },
    });
    expect(claimRes.statusCode).toBe(200);
    const claimed = claimRes.json().data;
    expect(claimed.day).toBe(3);
    expect(claimed.rewardGems).toBe(VALID_LADDER[2].amt); // 5 diamonds

    const updated = await prisma.user.findUnique({ where: { id: player.id } });
    expect(updated!.diamonds).toBe(VALID_LADDER[2].amt);

    await app.close();
  });
});
