import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { ok, err } from "../lib/errors.js";
import { applyLedger, applyLedgerTx } from "../economy/ledger.js";
import { requireAuth, attachUser } from "../auth/guards.js";

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

// Cost of the premium pass, sourced from the seeded SEASON_PASS store item
// (seed id "seasonpass"). Fallback price only applies if that row is missing.
const PASS_ITEM_ID = "seasonpass";

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
  //
  // PUBLIC read: signed-out visitors get the season shell (name, dates, tiers)
  // with an empty progress (xp 0, nothing claimed, no pass) so the leaderboard's
  // season rail renders. Signed-in users get their real progress.
  app.get("/season/current", { preHandler: attachUser }, async (req) => {
    const userId = req.userId ?? null;
    const season = await currentSeason();
    if (!season) throw err.notFound("NO_SEASON", "No season is configured");

    const progress = userId
      ? await prisma.seasonProgress.findUnique({
          where: { userId_seasonId: { userId, seasonId: season.id } },
        })
      : null;
    const tiers = (season.tiers as unknown as Tier[]) ?? [];
    const xp = progress?.xp ?? 0;
    const claimed = progress?.claimed ?? [];
    // Real pass price from the seeded SEASON_PASS item, so the UI never shows a
    // number that differs from what /season/pass actually charges.
    const passItem = await prisma.storeItem.findUnique({ where: { id: PASS_ITEM_ID } });
    const passPrice = passItem?.priceDiamonds ?? 900;

    return ok({
      season: { id: season.id, name: season.name, startsAt: season.startsAt, endsAt: season.endsAt },
      hasPass: progress?.hasPass ?? false,
      passPrice,
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

    // Concurrency gate: a CONDITIONAL push (only where `claimed` does NOT already
    // contain this tier) is the mutual exclusion. Exactly one of two racing
    // claims flips the row (count===1) and is allowed to grant; the loser sees
    // count===0 and 409s. This prevents the double-grant the plain upsert had.
    if (progress) {
      const flipped = await prisma.seasonProgress.updateMany({
        where: { userId, seasonId: season.id, NOT: { claimed: { has: tier } } },
        data: { claimed: { push: tier } },
      });
      if (flipped.count === 0) throw err.conflict("TIER_ALREADY_CLAIMED", "Tier already claimed");
    } else {
      // No row yet → create it with this tier claimed. A unique (userId,seasonId)
      // makes a concurrent create throw P2002, which we treat as "already claimed".
      try {
        await prisma.seasonProgress.create({
          data: { userId, seasonId: season.id, xp, hasPass, claimed: [tier] },
        });
      } catch {
        // lost the create race — re-check and gate the same way
        const flipped = await prisma.seasonProgress.updateMany({
          where: { userId, seasonId: season.id, NOT: { claimed: { has: tier } } },
          data: { claimed: { push: tier } },
        });
        if (flipped.count === 0) throw err.conflict("TIER_ALREADY_CLAIMED", "Tier already claimed");
      }
    }

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
    const price = passItem?.priceDiamonds ?? 900;

    // Flip hasPass and spend in ONE transaction, gated by a conditional flip so
    // only one concurrent request can win (count===1) and charge. This closes
    // the read-then-act double-charge race: two clicks can't both debit.
    let diamondBalance: number;
    try {
      diamondBalance = await prisma.$transaction(async (tx) => {
        // Ensure a row exists (idempotent create; ignore if another racer made it).
        if (!progress) {
          try {
            await tx.seasonProgress.create({ data: { userId, seasonId: season.id } });
          } catch {
            /* P2002 — a concurrent create won; fall through to the flip */
          }
        }
        const flip = await tx.seasonProgress.updateMany({
          where: { userId, seasonId: season.id, hasPass: false },
          data: { hasPass: true },
        });
        if (flip.count === 0) throw new Error("PASS_ALREADY_OWNED");
        return applyLedgerTx(tx, {
          userId,
          currency: "DIAMONDS",
          amount: -price,
          reason: "season_pass",
          refType: "season_pass",
          refId: season.id,
        });
      });
    } catch (e) {
      if (e instanceof Error && e.message === "PASS_ALREADY_OWNED") {
        throw err.conflict("PASS_ALREADY_OWNED", "You already own the season pass");
      }
      if (e instanceof Error && e.message.startsWith("INSUFFICIENT")) {
        // tx rolled back → hasPass flip is undone automatically, no manual revert.
        throw err.badRequest("INSUFFICIENT_DIAMONDS", "Not enough diamonds for the season pass");
      }
      throw e;
    }

    return ok({ hasPass: true, spentDiamonds: price, diamondBalance, seasonId: season.id });
  });

  // ── Season-end rewards ──────────────────────────────────────────────────────
  // When a season has ended, a player claims a ONE-TIME bonus scaled to their
  // final leaderboard placement. We use the sentinel -1 in SeasonProgress.claimed
  // to mark the end-of-season reward as taken (never collides with real tiers ≥1).
  const SEASON_END_TIER = -1;

  /** Final placement + reward for a user in an ended season. */
  async function seasonEndReward(userId: string, seasonId: string) {
    // Final rank = position by trophies among all non-deleted users (the same
    // ordering the global leaderboard uses).
    const me = await prisma.user.findUnique({ where: { id: userId }, select: { trophies: true } });
    const trophies = me?.trophies ?? 0;
    const higher = await prisma.user.count({
      where: { deletedAt: null, trophies: { gt: trophies } },
    });
    const rank = higher + 1;
    // Reward brackets (gold + diamonds) by final placement.
    let gold = 500;
    let diamonds = 0;
    if (rank === 1) { gold = 10000; diamonds = 200; }
    else if (rank <= 3) { gold = 6000; diamonds = 100; }
    else if (rank <= 10) { gold = 3000; diamonds = 50; }
    else if (rank <= 50) { gold = 1500; diamonds = 20; }
    else if (rank <= 100) { gold = 1000; diamonds = 10; }
    return { rank, gold, diamonds, seasonId };
  }

  // GET /api/season/end-status — is the current season over, my placement + reward,
  // and whether I've claimed it.
  app.get("/season/end-status", { preHandler: requireAuth }, async (req) => {
    const userId = req.userId!;
    const season = await currentSeason();
    if (!season) return ok({ ended: false });
    const ended = season.endsAt.getTime() < Date.now();
    if (!ended) return ok({ ended: false, season: { id: season.id, name: season.name, endsAt: season.endsAt } });
    const progress = await prisma.seasonProgress.findUnique({
      where: { userId_seasonId: { userId, seasonId: season.id } },
    });
    const claimed = (progress?.claimed ?? []).includes(SEASON_END_TIER);
    const reward = await seasonEndReward(userId, season.id);
    return ok({ ended: true, season: { id: season.id, name: season.name, endsAt: season.endsAt }, claimed, reward });
  });

  // POST /api/season/end-claim — grant the season-end reward once.
  app.post("/season/end-claim", { preHandler: requireAuth }, async (req) => {
    const userId = req.userId!;
    const season = await currentSeason();
    if (!season) throw err.notFound("NO_SEASON", "No season is configured");
    if (season.endsAt.getTime() >= Date.now())
      throw err.badRequest("SEASON_NOT_ENDED", "The season hasn't ended yet");

    const reward = await seasonEndReward(userId, season.id);
    // Atomic claim gate: conditional push of the -1 sentinel (only if absent).
    const existing = await prisma.seasonProgress.findUnique({
      where: { userId_seasonId: { userId, seasonId: season.id } },
    });
    if (existing) {
      if (existing.claimed.includes(SEASON_END_TIER))
        throw err.conflict("ALREADY_CLAIMED", "Season rewards already claimed");
      const flipped = await prisma.seasonProgress.updateMany({
        where: { userId, seasonId: season.id, NOT: { claimed: { has: SEASON_END_TIER } } },
        data: { claimed: { push: SEASON_END_TIER } },
      });
      if (flipped.count === 0) throw err.conflict("ALREADY_CLAIMED", "Season rewards already claimed");
    } else {
      await prisma.seasonProgress.create({
        data: { userId, seasonId: season.id, claimed: [SEASON_END_TIER] },
      });
    }

    let goldBalance = 0;
    let diamondBalance = 0;
    if (reward.gold > 0)
      goldBalance = await applyLedger(prisma, { userId, currency: "GOLD", amount: reward.gold, reason: "season_end", refType: "season_end", refId: season.id });
    if (reward.diamonds > 0)
      diamondBalance = await applyLedger(prisma, { userId, currency: "DIAMONDS", amount: reward.diamonds, reason: "season_end", refType: "season_end", refId: season.id });
    return ok({ claimed: true, reward, goldBalance, diamondBalance });
  });
}
