import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { rankTierFor } from "@dama/shared";
import { prisma } from "../db/client.js";
import { ok, err } from "../lib/errors.js";
import { attachUser } from "../auth/guards.js";

const querySchema = z.object({
  scope: z.enum(["global", "friends", "guild"]).default("global"),
  season: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/** Public leaderboard row shape. */
function toRow(
  u: { id: string; username: string; displayName: string; tag: string; avatarUrl: string | null; frameId: string | null; countryCode: string | null; trophies: number; wins: number; losses: number; streak: number },
  rank: number,
) {
  const tier = rankTierFor(u.trophies);
  return {
    rank,
    userId: u.id,
    username: u.username,
    displayName: u.displayName,
    tag: u.tag,
    avatarUrl: u.avatarUrl,
    frameId: u.frameId,
    countryCode: u.countryCode,
    trophies: u.trophies,
    wins: u.wins,
    losses: u.losses,
    streak: u.streak,
    rankTier: { key: tier.key, label: tier.label, sub: tier.sub, accent: tier.accent, img: tier.img },
  };
}

const SELECT = {
  id: true,
  username: true,
  displayName: true,
  tag: true,
  avatarUrl: true,
  frameId: true,
  countryCode: true,
  trophies: true,
  wins: true,
  losses: true,
  streak: true,
} satisfies Prisma.UserSelect;

export async function leaderboardRoutes(app: FastifyInstance) {
  // GET /api/leaderboard?scope=global|friends|guild&season=&limit=
  //
  // The GLOBAL board is PUBLIC: anyone (signed out included) can view the ladder.
  // `friends`/`guild` scopes are inherently identity-scoped and still require a
  // signed-in user. We use attachUser (never rejects) so anonymous callers get
  // the global board and, when a session cookie is present, `me` is populated.
  app.get("/leaderboard", { preHandler: attachUser }, async (req) => {
    const { scope, season, limit } = querySchema.parse(req.query);
    const meId = req.userId ?? null;

    if (scope !== "global" && !meId) throw err.unauthorized();

    // Optional season validation (trophy ladder is global standing; season is
    // accepted for the current/active season and echoed back).
    let seasonId = season ?? null;
    if (season) {
      const s = await prisma.season.findUnique({ where: { id: season }, select: { id: true } });
      seasonId = s?.id ?? null;
    }

    // Resolve the candidate user-id set for the requested scope.
    let userIds: string[] | null = null; // null = unrestricted (global)

    // meId is guaranteed non-null here: the scope !== "global" guard above rejects
    // anonymous callers before we reach the identity-scoped branches.
    if (scope === "friends") {
      const friendships = await prisma.friendship.findMany({
        where: { OR: [{ aId: meId! }, { bId: meId! }] },
        select: { aId: true, bId: true },
      });
      const ids = new Set<string>([meId!]);
      for (const f of friendships) ids.add(f.aId === meId ? f.bId : f.aId);
      userIds = [...ids];
    } else if (scope === "guild") {
      const me = await prisma.guildMember.findUnique({
        where: { userId: meId! },
        select: { guildId: true },
      });
      if (!me) return ok({ scope, season: seasonId, rows: [], me: null });
      const members = await prisma.guildMember.findMany({
        where: { guildId: me.guildId },
        select: { userId: true },
      });
      userIds = members.map((m) => m.userId);
    }

    if (userIds !== null && userIds.length === 0) {
      return ok({ scope, season: seasonId, rows: [], me: null });
    }

    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      isGuest: false,
      isBot: false, // matchmaking NPCs never appear on the public ladder
      ...(userIds !== null ? { id: { in: userIds } } : {}),
    };

    const users = await prisma.user.findMany({
      where,
      orderBy: [{ trophies: "desc" }, { wins: "desc" }, { createdAt: "asc" }],
      take: limit,
      select: SELECT,
    });

    const rows = users.map((u, i) => toRow(u, i + 1));
    const me = rows.find((r) => r.userId === meId) ?? null;

    return ok({ scope, season: seasonId, rows, me });
  });
}
