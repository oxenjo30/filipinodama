import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { ok } from "../lib/errors.js";
import { requireAdmin } from "../auth/guards.js";

/**
 * Admin — global header search (/api/admin/search?q=). Backs the v3 delta
 * header search box (handoffv2-v3-diff.md row 16): up to 6 players, 4 guilds,
 * 4 tournaments, case-insensitive substring match on name/tag fields. A query
 * under 2 chars returns all-empty (matches the mockup's `gsq.length>0` gate,
 * plus a floor so a single keystroke doesn't scan the whole table).
 *
 * SUPPORT-gated for player search, then category-filtered using the live DB role:
 * guild results require MODERATOR and tournament results require ECONOMY, matching
 * the destination routes. The client mirrors this only for presentation.
 */
export async function adminSearchRoutes(app: FastifyInstance) {
  app.get("/admin/search", { preHandler: requireAdmin("SUPPORT") }, async (req) => {
    const { q } = z.object({ q: z.string().trim().optional().default("") }).parse(req.query);

    if (q.length < 2) return ok({ players: [], guilds: [], cups: [] });

    const canModerate = req.adminRole === "MODERATOR" || req.adminRole === "ECONOMY" || req.adminRole === "SUPERADMIN";
    const canEconomy = req.adminRole === "ECONOMY" || req.adminRole === "SUPERADMIN";
    const [players, guilds, cups] = await Promise.all([
      prisma.user.findMany({
        where: {
          isBot: false,
          deletedAt: null,
          OR: [
            { username: { contains: q, mode: "insensitive" } },
            { displayName: { contains: q, mode: "insensitive" } },
            { tag: { contains: q, mode: "insensitive" } },
          ],
        },
        take: 6,
        orderBy: { trophies: "desc" },
        select: { id: true, displayName: true, username: true, tag: true, trophies: true, rankTier: true },
      }),
      canModerate ? prisma.guild.findMany({
        where: {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { tag: { contains: q, mode: "insensitive" } },
          ],
        },
        take: 4,
        orderBy: { weeklyPoints: "desc" },
        select: { id: true, name: true, tag: true, _count: { select: { members: true } } },
      }) : Promise.resolve([]),
      canEconomy ? prisma.tournament.findMany({
        where: { name: { contains: q, mode: "insensitive" } },
        take: 4,
        orderBy: { createdAt: "desc" },
        select: { id: true, name: true, format: true, status: true },
      }) : Promise.resolve([]),
    ]);

    return ok({
      players: players.map((p) => ({
        id: p.id,
        displayName: p.displayName || p.username,
        tag: p.tag,
        trophies: p.trophies,
        rankTier: p.rankTier,
      })),
      guilds: guilds.map((g) => ({ id: g.id, name: g.name, tag: g.tag, members: g._count.members })),
      cups: cups.map((t) => ({ id: t.id, name: t.name, format: t.format, status: t.status })),
    });
  });
}
