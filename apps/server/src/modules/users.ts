import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { updateProfileSchema, equipSchema, deleteAccountSchema, rankTierFor } from "@dama/shared";
import type { Currency } from "@prisma/client";
import { prisma } from "../db/client.js";
import { ok, err } from "../lib/errors.js";
import { requireAuth } from "../auth/guards.js";

/** Public-profile projection: stats + rank tier + guild, never sensitive fields. */
function publicProfile(u: {
  id: string;
  username: string;
  displayName: string;
  tag: string;
  bio: string | null;
  avatarUrl: string | null;
  frameId: string | null;
  countryCode: string | null;
  trophies: number;
  rankTier: string;
  equippedBoard: string | null;
  equippedSkin: string | null;
  wins: number;
  losses: number;
  draws: number;
  streak: number;
  createdAt: Date;
  guildMember: { guildId: string; role: string; guild: { id: string; name: string; tag: string } } | null;
}) {
  const tier = rankTierFor(u.trophies);
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    tag: u.tag,
    bio: u.bio,
    avatarUrl: u.avatarUrl,
    frameId: u.frameId,
    countryCode: u.countryCode,
    trophies: u.trophies,
    rankTier: u.rankTier,
    tier: { key: tier.key, label: tier.label, sub: tier.sub, accent: tier.accent, img: tier.img },
    equippedBoard: u.equippedBoard,
    equippedSkin: u.equippedSkin,
    wins: u.wins,
    losses: u.losses,
    draws: u.draws,
    streak: u.streak,
    createdAt: u.createdAt,
    guild: u.guildMember
      ? { id: u.guildMember.guild.id, name: u.guildMember.guild.name, tag: u.guildMember.guild.tag, role: u.guildMember.role }
      : null,
  };
}

const guildInclude = {
  guildMember: { include: { guild: { select: { id: true, name: true, tag: true } } } },
} as const;

const ledgerQuerySchema = z.object({
  currency: z.enum(["GOLD", "DIAMONDS", "TROPHIES"]).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export async function userRoutes(app: FastifyInstance) {
  // GET /api/users/:id — public profile (stats, rank tier, guild)
  app.get<{ Params: { id: string } }>("/users/:id", async (req) => {
    const user = await prisma.user.findFirst({
      where: { id: req.params.id, deletedAt: null },
      include: guildInclude,
    });
    if (!user) throw err.notFound("USER_NOT_FOUND", "User not found");
    return ok({ user: publicProfile(user) });
  });

  // PATCH /api/users/me — update own profile
  app.patch("/users/me", { preHandler: requireAuth }, async (req) => {
    const input = updateProfileSchema.parse(req.body);
    const user = await prisma.user.update({
      where: { id: req.userId! },
      data: {
        ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
        ...(input.bio !== undefined ? { bio: input.bio } : {}),
        ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
        ...(input.countryCode !== undefined ? { countryCode: input.countryCode.toUpperCase() } : {}),
      },
      include: guildInclude,
    });
    return ok({ user: publicProfile(user) });
  });

  // PATCH /api/users/me/equip — equip owned cosmetics (must own the item)
  app.patch("/users/me/equip", { preHandler: requireAuth }, async (req) => {
    const input = equipSchema.parse(req.body);
    const userId = req.userId!;

    // Every referenced item id must be owned by the user (InventoryItem).
    const wanted = [input.board, input.skin, input.frame].filter((x): x is string => !!x);
    if (wanted.length) {
      const owned = await prisma.inventoryItem.findMany({
        where: { userId, itemId: { in: wanted } },
        select: { itemId: true },
      });
      const ownedSet = new Set(owned.map((o) => o.itemId));
      const missing = wanted.filter((id) => !ownedSet.has(id));
      if (missing.length) throw err.forbidden("NOT_OWNED", `Item(s) not owned: ${missing.join(", ")}`);
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.board !== undefined ? { equippedBoard: input.board } : {}),
        ...(input.skin !== undefined ? { equippedSkin: input.skin } : {}),
        ...(input.frame !== undefined ? { frameId: input.frame } : {}),
      },
      include: guildInclude,
    });
    return ok({ user: publicProfile(user) });
  });

  // DELETE /api/users/me — soft-delete (set deletedAt)
  app.delete("/users/me", { preHandler: requireAuth }, async (req) => {
    deleteAccountSchema.parse(req.body);
    const userId = req.userId!;
    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing || existing.deletedAt) throw err.notFound("USER_NOT_FOUND", "User not found");
    await prisma.user.update({ where: { id: userId }, data: { deletedAt: new Date() } });
    return ok({ deleted: true, deletedAt: new Date().toISOString() });
  });

  // GET /api/users/me/ledger?currency= — paginated currency history
  app.get("/users/me/ledger", { preHandler: requireAuth }, async (req) => {
    const q = ledgerQuerySchema.parse(req.query);
    const userId = req.userId!;
    const where = { userId, ...(q.currency ? { currency: q.currency as Currency } : {}) };
    const entries = await prisma.ledgerEntry.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const hasMore = entries.length > q.limit;
    const items = hasMore ? entries.slice(0, q.limit) : entries;
    return ok({
      items: items.map((e) => ({
        id: e.id,
        currency: e.currency,
        amount: e.amount,
        balance: e.balance,
        reason: e.reason,
        refType: e.refType,
        refId: e.refId,
        createdAt: e.createdAt,
      })),
      nextCursor: hasMore ? items[items.length - 1]!.id : null,
    });
  });

  // GET /api/users/me/export — GDPR data dump (json)
  app.get("/users/me/export", { preHandler: requireAuth }, async (req) => {
    const userId = req.userId!;
    const [user, ledger, inventory, orders, payments, friendships, sentReqs, recvReqs, guildMember, quests, seasons, notifications, matchesRed, matchesBlue] =
      await Promise.all([
        prisma.user.findUniqueOrThrow({ where: { id: userId } }),
        prisma.ledgerEntry.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
        prisma.inventoryItem.findMany({ where: { userId } }),
        prisma.order.findMany({ where: { userId } }),
        prisma.payment.findMany({ where: { userId } }),
        prisma.friendship.findMany({ where: { OR: [{ aId: userId }, { bId: userId }] } }),
        prisma.friendRequest.findMany({ where: { fromId: userId } }),
        prisma.friendRequest.findMany({ where: { toId: userId } }),
        prisma.guildMember.findUnique({ where: { userId } }),
        prisma.questProgress.findMany({ where: { userId } }),
        prisma.seasonProgress.findMany({ where: { userId } }),
        prisma.notification.findMany({ where: { userId } }),
        prisma.match.findMany({ where: { redId: userId } }),
        prisma.match.findMany({ where: { blueId: userId } }),
      ]);

    // Strip secrets from the account record.
    const { passwordHash, verifyToken, verifyExpires, resetToken, resetExpires, ...account } = user as any;

    return ok({
      exportedAt: new Date().toISOString(),
      account,
      ledger,
      inventory,
      orders,
      payments,
      friendships,
      friendRequests: { sent: sentReqs, received: recvReqs },
      guildMembership: guildMember,
      questProgress: quests,
      seasonProgress: seasons,
      notifications,
      matches: [...matchesRed, ...matchesBlue],
    });
  });
}
