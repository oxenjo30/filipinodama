import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  updateProfileSchema,
  equipSchema,
  equipEmoteSchema,
  deleteAccountSchema,
  rankTierFor,
  containsProfanity,
} from "@dama/shared";
import type { Currency } from "@prisma/client";
import { prisma } from "../db/client.js";
import { ok, err } from "../lib/errors.js";
import { requireAuth, attachUser } from "../auth/guards.js";

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
  equippedEmotes: string[];
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
    equippedEmotes: u.equippedEmotes,
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

const playerNameSelect = { select: { id: true, displayName: true, tag: true } } as const;

/** Algebraic square label, e.g. {r:2,c:1} -> "b3" (matches ReplayModal's notation). */
const squareLabel = (sq: { r: number; c: number } | undefined | null): string | null => {
  if (!sq || typeof sq.r !== "number" || typeof sq.c !== "number") return null;
  const file = "abcdefgh"[sq.c];
  if (!file) return null;
  return `${file}${8 - sq.r}`;
};

/** First-move label for one match's moves[] (server-stored Move[] JSON), e.g. "b3 -> c4". */
function firstMoveLabel(moves: unknown): string | null {
  if (!Array.isArray(moves) || moves.length === 0) return null;
  const first = moves[0] as { from?: { r: number; c: number }; path?: { r: number; c: number }[] } | undefined;
  const from = squareLabel(first?.from);
  const to = squareLabel(first?.path?.[first.path.length - 1]);
  if (!from || !to) return null;
  return `${from} → ${to}`;
}

/**
 * Derives "favorite move" + "favorite openings" from a player's last 30 finished
 * matches: the most frequent first-move square-pair, mapped to a friendly label.
 * NEVER fabricated — both are omitted/empty when there isn't enough real data.
 */
async function computeOpeningStats(userId: string): Promise<{ favoriteMove: string | null; openings: { label: string; pct: number }[] }> {
  const matches = await prisma.match.findMany({
    where: { OR: [{ redId: userId }, { blueId: userId }], endedAt: { not: null } },
    orderBy: { endedAt: "desc" },
    take: 30,
    select: { moves: true },
  });

  const counts = new Map<string, number>();
  let total = 0;
  for (const m of matches) {
    const label = firstMoveLabel(m.moves);
    if (!label) continue;
    counts.set(label, (counts.get(label) ?? 0) + 1);
    total += 1;
  }
  if (total === 0) return { favoriteMove: null, openings: [] };

  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const favoriteMove = ranked[0][0];
  const openings = ranked.slice(0, 3).map(([label, count]) => ({
    label,
    pct: Math.round((count / total) * 100),
  }));
  return { favoriteMove, openings };
}

/** Recent finished matches for the public "Match Replays" list — real data, capped to 5. */
async function recentMatchesFor(userId: string) {
  const rows = await prisma.match.findMany({
    where: { OR: [{ redId: userId }, { blueId: userId }], endedAt: { not: null } },
    orderBy: { endedAt: "desc" },
    take: 5,
    include: { red: playerNameSelect, blue: playerNameSelect },
  });
  return rows.map((m) => {
    const iAmRed = m.redId === userId;
    const opponent = iAmRed ? m.blue : m.red;
    const trophyDelta = iAmRed ? m.redTrophyDelta : m.blueTrophyDelta;
    const result: "win" | "loss" | "draw" =
      m.winner === "draw" || m.winner === null ? "draw" : (m.winner === "red") === iAmRed ? "win" : "loss";
    return {
      id: m.id,
      opponentName: opponent?.displayName ?? (m.mode === "AI" || m.mode === "LOCAL" ? "Computer" : "Opponent"),
      result,
      mode: m.mode,
      trophyDelta: trophyDelta ?? null,
      endedAt: m.endedAt,
      hasReplay: Array.isArray(m.moves) && m.moves.length > 0,
    };
  });
}

const ledgerQuerySchema = z.object({
  currency: z.enum(["GOLD", "DIAMONDS", "TROPHIES"]).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const userSearchQuerySchema = z.object({
  q: z.string().optional().default(""),
});

/** Public search-result projection — only fields safe to show in a results list. */
const searchSelect = {
  id: true,
  username: true,
  displayName: true,
  tag: true,
  avatarUrl: true,
  frameId: true,
  trophies: true,
  rankTier: true,
} as const;

export async function userRoutes(app: FastifyInstance) {
  // GET /api/users/:id — public profile (stats, rank tier, guild)
  app.get<{ Params: { id: string } }>("/users/:id", { preHandler: attachUser }, async (req) => {
    const user = await prisma.user.findFirst({
      where: { id: req.params.id, deletedAt: null },
      include: guildInclude,
    });
    if (!user) throw err.notFound("USER_NOT_FOUND", "User not found");

    const me = req.userId ?? null;
    let relationship: "self" | "friends" | "request-sent" | "request-received" | "none" = "none";
    let requestId: string | undefined;

    if (me && !user.isBot) {
      if (me === user.id) {
        relationship = "self";
      } else {
        const [aId, bId] = me < user.id ? [me, user.id] : [user.id, me];
        const friendship = await prisma.friendship.findUnique({ where: { aId_bId: { aId, bId } } });
        if (friendship) {
          relationship = "friends";
        } else {
          const outgoing = await prisma.friendRequest.findUnique({
            where: { fromId_toId: { fromId: me, toId: user.id } },
          });
          if (outgoing && outgoing.status === "pending") {
            relationship = "request-sent";
          } else {
            const incoming = await prisma.friendRequest.findUnique({
              where: { fromId_toId: { fromId: user.id, toId: me } },
            });
            if (incoming && incoming.status === "pending") {
              relationship = "request-received";
              requestId = incoming.id;
            }
          }
        }
      }
    }

    return ok({ user: { ...publicProfile(user), isBot: user.isBot, relationship, requestId } });
  });

  // GET /api/users/:id/profile-extras — public profile enrichment (v3 delta):
  // favorite move + favorite openings (derived from the player's last 30 finished
  // matches' first move), recent match replays (≤5), and badges. Guild is already
  // on the base /users/:id payload. Every field is real-data-or-empty — nothing
  // here is generated/fabricated; a player with no finished matches gets nulls
  // and empty arrays, never placeholder content.
  app.get<{ Params: { id: string } }>("/users/:id/profile-extras", { preHandler: requireAuth }, async (req) => {
    const user = await prisma.user.findFirst({
      where: { id: req.params.id, deletedAt: null },
      select: { id: true },
    });
    if (!user) throw err.notFound("USER_NOT_FOUND", "User not found");

    const [{ favoriteMove, openings }, recentMatches] = await Promise.all([
      computeOpeningStats(user.id),
      recentMatchesFor(user.id),
    ]);

    // No achievements/badges backend exists yet — an honest empty list, not
    // fabricated chips (see tasks/lessons.md-style rule: never invent data).
    return ok({ favoriteMove, openings, recentMatches, badges: [] as string[] });
  });

  // GET /api/users/search?q= — global player search (topbar 🔍). Case-insensitive
  // substring match on username, displayName, or tag. Bots and deleted accounts
  // are excluded; guests ARE included (they're real players). Capped to 20
  // results, and a query shorter than 2 chars returns empty (avoid full scans).
  app.get("/users/search", { preHandler: requireAuth }, async (req) => {
    const { q } = userSearchQuerySchema.parse(req.query);
    const query = q.trim();
    if (query.length < 2) return ok({ items: [] });

    const users = await prisma.user.findMany({
      where: {
        isBot: false,
        deletedAt: null,
        OR: [
          { username: { contains: query, mode: "insensitive" } },
          { displayName: { contains: query, mode: "insensitive" } },
          { tag: { contains: query, mode: "insensitive" } },
        ],
      },
      select: searchSelect,
      take: 20,
      orderBy: { trophies: "desc" },
    });
    return ok({ items: users });
  });

  // PATCH /api/users/me — update own profile
  app.patch("/users/me", { preHandler: requireAuth }, async (req) => {
    const input = updateProfileSchema.parse(req.body);
    if (input.displayName && containsProfanity(input.displayName))
      throw err.badRequest("INAPPROPRIATE_LANGUAGE", "That display name contains inappropriate language. Please choose another.");
    if (input.bio && containsProfanity(input.bio))
      throw err.badRequest("INAPPROPRIATE_LANGUAGE", "Your bio contains inappropriate language. Please revise it.");
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

    // Every referenced item id must be owned by the user (InventoryItem) AND
    // its ItemType must match the slot it's being equipped into — otherwise a
    // SKIN id could be dropped into the board slot (type confusion).
    const slotType: Record<string, "BOARD" | "SKIN" | "FRAME" | "AVATAR"> = {};
    if (input.board !== undefined && input.board) slotType[input.board] = "BOARD";
    if (input.skin !== undefined && input.skin) slotType[input.skin] = "SKIN";
    if (input.frame !== undefined && input.frame) slotType[input.frame] = "FRAME";
    if (input.avatar !== undefined && input.avatar) slotType[input.avatar] = "AVATAR";
    const wanted = Object.keys(slotType);
    if (wanted.length) {
      const owned = await prisma.inventoryItem.findMany({
        where: { userId, itemId: { in: wanted } },
        select: { itemId: true, item: { select: { type: true } } },
      });
      const ownedMap = new Map(owned.map((o) => [o.itemId, o.item.type]));
      const missing = wanted.filter((id) => !ownedMap.has(id));
      if (missing.length) throw err.forbidden("NOT_OWNED", `Item(s) not owned: ${missing.join(", ")}`);
      const mistyped = wanted.filter((id) => ownedMap.get(id) !== slotType[id]);
      if (mistyped.length)
        throw err.badRequest("WRONG_SLOT", `Item(s) wrong type for slot: ${mistyped.join(", ")}`);
    }

    // The avatar slot stores the AVATAR item's assetKey on User.avatarUrl (that
    // is how avatars render), not the item id — look it up when equipping one.
    let avatarUrlUpdate: string | undefined;
    if (input.avatar !== undefined && input.avatar) {
      const item = await prisma.storeItem.findUnique({ where: { id: input.avatar }, select: { assetKey: true } });
      avatarUrlUpdate = item?.assetKey ?? undefined;
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.board !== undefined ? { equippedBoard: input.board } : {}),
        ...(input.skin !== undefined ? { equippedSkin: input.skin } : {}),
        ...(input.frame !== undefined ? { frameId: input.frame } : {}),
        ...(avatarUrlUpdate !== undefined ? { avatarUrl: avatarUrlUpdate } : {}),
      },
      include: guildInclude,
    });
    return ok({ user: publicProfile(user) });
  });

  // PATCH /api/users/me/equip-emote — toggle an owned EMOTE into/out of the
  // equipped set (max 6, matching the prototype loadout). Must own the emote.
  app.patch("/users/me/equip-emote", { preHandler: requireAuth }, async (req) => {
    const input = equipEmoteSchema.parse(req.body);
    const userId = req.userId!;
    const owned = await prisma.inventoryItem.findFirst({
      where: { userId, itemId: input.itemId, item: { type: "EMOTE" } },
      select: { itemId: true },
    });
    if (!owned) throw err.forbidden("NOT_OWNED", "You don't own this emote");
    const me = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { equippedEmotes: true } });
    const set = new Set(me.equippedEmotes);
    if (input.equipped) {
      if (!set.has(input.itemId) && set.size >= 6) throw err.badRequest("EMOTE_LIMIT", "You can equip up to 6 emotes");
      set.add(input.itemId);
    } else {
      set.delete(input.itemId);
    }
    const user = await prisma.user.update({
      where: { id: userId },
      data: { equippedEmotes: [...set] },
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
    // Soft-delete AND kill every refresh session so existing tokens can't be
    // rotated back into access after the account is gone.
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { deletedAt: new Date() } }),
      prisma.session.deleteMany({ where: { userId } }),
    ]);
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
    // pendingEmailToken is a live credential — whoever holds it can complete an
    // email change — so it must be stripped here exactly like verifyToken and
    // resetToken. The GDPR export is a file the user downloads and may share.
    const {
      passwordHash, verifyToken, verifyExpires, resetToken, resetExpires,
      pendingEmailToken, pendingEmailExpires, ...account
    } = user as any;

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
