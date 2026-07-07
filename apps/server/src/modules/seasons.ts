import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { ok, err } from "../lib/errors.js";
import { applyLedger } from "../economy/ledger.js";
import { requireAuth } from "../auth/guards.js";

/**
 * Progression: seasons / battle pass.
 * GET  /api/season/current  → active Season tiers + my progress + hasPass
 * POST /api/season/claim    { tier } → grant that tier's reward (free always,
 *                             premium only with the pass) once xp is high enough
 * POST /api/season/pass     → buy the premium pass with diamonds (in-currency)
 *
 * Tier defs live on Season.tiers (Json), shaped by the seed:
 *   { tier, xp, freeReward:{gold?,diamonds?}, premiumReward:{gold?,diamonds?} }
 * Claimed tiers are tracked in SeasonProgress.claimed (Int[]).
 */

// Cost of the premium pass, sourced from the seeded SEASON_PASS store item.
const PASS_ITEM_ID = "season-pass-s1";

const claimSchema = z.object({ tier: z.number().int().min(1) });

type Reward = { gold?: number; diamonds?: number };
type Tier = { tier: number; xp: number; freeReward?: Reward; premiumReward?: Reward };

/** The currently-running season (falls back to the most recent if none active). */
async function currentSeason() {
  const now = new Date();
  const active = await prisma.season.findFirst({
    where: { startsAt: { lte: now }, endsAt: { gte: now } },
    orderBy: { startsAt: "desc" },
  });
  return active ?? (await prisma.season.findFirst({ orderBy: { startsAt: "desc" } }));
}

async function grantReward(userId: string, reward: Reward | undefined, seasonId: string, tier: number) {
  if (!reward) return;
  if (reward.gold && reward.gold > 0) {
    await applyLedger(prisma, {
      userId,
      currency: "GOLD",
      amount: reward.gold,
      reason: "season",
      refType: "season_tier",
      refId: `${seasonId}:${tier}`,
    });
  }
  if (reward.diamonds && reward.diamonds > 0) {
    await applyLedger(prisma, {
      userId,
      currency: "DIAMONDS",
      amount: reward.diamonds,
      reason: "season",
      refType: "season_tier",
      refId: `${seasonId}:${tier}`,
    });
  }
}

export async function seasonRoutes(app: FastifyInstance) {
  // GET /api/season/current — tiers + my progress + hasPass
  app.get("/season/current", { preHandler: requireAuth }, async (req) => {
    const userId = req.userId!;
    const season = await currentSeason();
    if (!season) throw err.notFound("NO_SEASON", "No season is configured");

    const progress = await prisma.seasonProgress.findUnique({
      where: { userId_seasonId: { userId, seasonId: season.id } },
    });
    const tiers = (season.tiers as unknown as Tier[]) ?? [];
    const xp = progress?.xp ?? 0;
    const claimed = progress?.claimed ?? [];

    return ok({
      season: { id: season.id, name: season.name, startsAt: season.startsAt, endsAt: season.endsAt },
      hasPass: progress?.hasPass ?? false,
      xp,
      tiers: tiers.map((t) => ({
        tier: t.tier,
        xp: t.xp,
        freeReward: t.freeReward ?? null,
        premiumReward: t.premiumReward ?? null,
        unlocked: xp >= t.xp,
        claimed: claimed.includes(t.tier),
      })),
    });
  });

  // POST /api/season/claim { tier } — grant reward if xp/pass allows
  app.post("/season/claim", { preHandler: requireAuth }, async (req) => {
    const userId = req.userId!;
    const { tier } = claimSchema.parse(req.body);
    const season = await currentSeason();
    if (!season) throw err.notFound("NO_SEASON", "No season is configured");

    const tiers = (season.tiers as unknown as Tier[]) ?? [];
    const def = tiers.find((t) => t.tier === tier);
    if (!def) throw err.notFound("TIER_NOT_FOUND", "Tier not found");

    const progress = await prisma.seasonProgress.findUnique({
      where: { userId_seasonId: { userId, seasonId: season.id } },
    });
    const xp = progress?.xp ?? 0;
    const hasPass = progress?.hasPass ?? false;
    const claimed = progress?.claimed ?? [];

    if (xp < def.xp) throw err.badRequest("TIER_LOCKED", "Not enough season XP for this tier");
    if (claimed.includes(tier)) throw err.conflict("TIER_ALREADY_CLAIMED", "Tier already claimed");

    // Mark claimed atomically first so a concurrent duplicate can't double-grant.
    await prisma.seasonProgress.upsert({
      where: { userId_seasonId: { userId, seasonId: season.id } },
      update: { claimed: { push: tier } },
      create: { userId, seasonId: season.id, xp, hasPass, claimed: [tier] },
    });

    await grantReward(userId, def.freeReward, season.id, tier);
    if (hasPass) await grantReward(userId, def.premiumReward, season.id, tier);

    return ok({
      claimed: true,
      tier,
      freeReward: def.freeReward ?? null,
      premiumReward: hasPass ? def.premiumReward ?? null : null,
      hasPass,
    });
  });

  // POST /api/season/pass — buy the premium pass with diamonds (in-currency spend)
  app.post("/season/pass", { preHandler: requireAuth }, async (req) => {
    const userId = req.userId!;
    const season = await currentSeason();
    if (!season) throw err.notFound("NO_SEASON", "No season is configured");

    const progress = await prisma.seasonProgress.findUnique({
      where: { userId_seasonId: { userId, seasonId: season.id } },
    });
    if (progress?.hasPass) throw err.conflict("PASS_ALREADY_OWNED", "You already own the season pass");

    const passItem = await prisma.storeItem.findUnique({ where: { id: PASS_ITEM_ID } });
    const price = passItem?.priceDiamonds ?? 400;

    // Flip hasPass first (idempotency guard), then spend. applyLedger throws on
    // insufficient diamonds and rolls back its own tx; we revert the flag if so.
    const updated = await prisma.seasonProgress.upsert({
      where: { userId_seasonId: { userId, seasonId: season.id } },
      update: { hasPass: true },
      create: { userId, seasonId: season.id, hasPass: true },
    });

    let diamondBalance: number;
    try {
      diamondBalance = await applyLedger(prisma, {
        userId,
        currency: "DIAMONDS",
        amount: -price,
        reason: "season_pass",
        refType: "season_pass",
        refId: season.id,
      });
    } catch (e) {
      await prisma.seasonProgress.update({
        where: { id: updated.id },
        data: { hasPass: progress?.hasPass ?? false },
      });
      if (e instanceof Error && e.message.startsWith("INSUFFICIENT")) {
        throw err.badRequest("INSUFFICIENT_DIAMONDS", "Not enough diamonds for the season pass");
      }
      throw e;
    }

    return ok({ hasPass: true, spentDiamonds: price, diamondBalance, seasonId: season.id });
  });
}
