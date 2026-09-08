import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { friendRequestSchema, friendRequestByTagSchema } from "@dama/shared";
import { prisma } from "../db/client.js";
import { ok, err } from "../lib/errors.js";
import { requireAuth } from "../auth/guards.js";
import { isBlockedBetween } from "./blocks.js";
import { pushUnreadCount } from "../lib/notify.js";
import { matchIdsForUser } from "../realtime/store.js";

/** Public-safe user shape for friend lists / requests / suggestions. */
function publicFriend(u: {
  id: string;
  username: string;
  displayName: string;
  tag: string;
  avatarUrl: string | null;
  frameId: string | null;
  trophies: number;
  rankTier: string;
  lastSeenAt: Date;
}) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    tag: u.tag,
    avatarUrl: u.avatarUrl,
    frameId: u.frameId,
    trophies: u.trophies,
    rankTier: u.rankTier,
    lastSeenAt: u.lastSeenAt,
    // presence is delivered live over sockets (presence:update); REST cannot
    // know it authoritatively, so we report "unknown" here.
    presence: "unknown" as const,
  };
}

const friendSelect = {
  id: true,
  username: true,
  displayName: true,
  tag: true,
  avatarUrl: true,
  frameId: true,
  trophies: true,
  rankTier: true,
  lastSeenAt: true,
} as const;

/**
 * Keep this as a PrismaPromise so a friend-request mutation and its stale-bell
 * dismissal commit or roll back together inside the caller's transaction.
 */
function dismissFriendRequestNotifications(userId: string, requestId: string) {
  return prisma.notification.updateMany({
    where: {
      userId,
      type: "friend_request",
      dismissedAt: null,
      data: { path: ["requestId"], equals: requestId } as Prisma.JsonFilter,
    },
    data: { dismissedAt: new Date() },
  });
}

/**
 * Create (or auto-accept) a friend request from `me` → `toUserId`.
 * Shared by POST /friends/request and POST /friends/request-by-tag so both
 * enforce the same honest guards: no self-friend, target exists, not already
 * friends, and a pending reverse request auto-accepts into a friendship.
 */
async function createFriendRequest(me: string, toUserId: string) {
  if (toUserId === me) throw err.badRequest("SELF_FRIEND", "You cannot friend yourself");

  const target = await prisma.user.findFirst({
    where: { id: toUserId, deletedAt: null },
    select: { id: true },
  });
  if (!target) throw err.notFound("USER_NOT_FOUND", "User not found");

  if (await isBlockedBetween(me, toUserId)) throw err.forbidden("BLOCKED", "You can't add this player.");

  // already friends?
  const [aId, bId] = me < toUserId ? [me, toUserId] : [toUserId, me];
  const existingFriendship = await prisma.friendship.findUnique({ where: { aId_bId: { aId, bId } } });
  if (existingFriendship) throw err.conflict("ALREADY_FRIENDS", "You are already friends");

  // reverse pending request? → auto-accept into a friendship
  const reverse = await prisma.friendRequest.findUnique({
    where: { fromId_toId: { fromId: toUserId, toId: me } },
  });
  if (reverse && reverse.status === "pending") {
    await prisma.$transaction([
      prisma.friendRequest.update({ where: { id: reverse.id }, data: { status: "accepted" } }),
      prisma.friendship.create({ data: { aId, bId } }),
      dismissFriendRequestNotifications(me, reverse.id),
    ]);
    return { status: "accepted" as const };
  }

  // upsert my outgoing request (re-send if previously declined)
  const request = await prisma.friendRequest.upsert({
    where: { fromId_toId: { fromId: me, toId: toUserId } },
    update: { status: "pending", createdAt: new Date() },
    create: { fromId: me, toId: toUserId, status: "pending" },
  });

  await prisma.notification.create({
    data: {
      userId: toUserId,
      type: "friend_request",
      title: "New friend request",
      data: { requestId: request.id, fromUserId: me },
    },
  });
  // Live-push the recipient's new unread count so their bell + "action needed"
  // badge lights up instantly, no refresh (mirrors the DM live-badge path).
  await pushUnreadCount(toUserId);

  return { status: "pending" as const, requestId: request.id };
}

export async function friendRoutes(app: FastifyInstance) {
  // GET /api/friends — accepted friends (presence unknown over REST)
  app.get("/friends", { preHandler: requireAuth }, async (req) => {
    const me = req.userId!;
    const rows = await prisma.friendship.findMany({
      where: { OR: [{ aId: me }, { bId: me }] },
      include: {
        a: { select: friendSelect },
        b: { select: friendSelect },
      },
      orderBy: { createdAt: "desc" },
    });
    const base = rows.map((f) => publicFriend(f.aId === me ? f.b : f.a));
    // Annotate each friend with a REAL "in a live match" flag from the realtime
    // layer's rt:userMatch:<uid> Redis index (already maintained by match
    // create/remove). Drives the amber "in-game" presence state on the Friends
    // screen (mockup 3-state dot). Best-effort: a Redis hiccup just yields
    // inMatch=false, never fabricated.
    const friends = await Promise.all(
      base.map(async (u) => {
        let inMatch = false;
        try {
          inMatch = (await matchIdsForUser(u.id)).length > 0;
        } catch {
          /* realtime index unavailable → treat as not-in-match */
        }
        return { ...u, inMatch };
      }),
    );
    return ok({ friends });
  });

  // GET /api/friends/requests — incoming + outgoing (pending only)
  app.get("/friends/requests", { preHandler: requireAuth }, async (req) => {
    const me = req.userId!;
    const [incoming, outgoing] = await Promise.all([
      prisma.friendRequest.findMany({
        where: { toId: me, status: "pending" },
        include: { from: { select: friendSelect } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.friendRequest.findMany({
        where: { fromId: me, status: "pending" },
        include: { to: { select: friendSelect } },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    return ok({
      incoming: incoming.map((r) => ({ id: r.id, createdAt: r.createdAt, user: publicFriend(r.from) })),
      outgoing: outgoing.map((r) => ({ id: r.id, createdAt: r.createdAt, user: publicFriend(r.to) })),
    });
  });

  // POST /api/friends/request  { toUserId }
  app.post("/friends/request", { preHandler: requireAuth }, async (req) => {
    const me = req.userId!;
    const { toUserId } = friendRequestSchema.parse(req.body);
    return ok(await createFriendRequest(me, toUserId));
  });

  // POST /api/friends/request-by-tag  { tag }
  // Resolve a #NNNN player tag → userId, then create the request. Honest errors:
  // empty/malformed tag → 400, no such tag → 404, self / already-friends bubble
  // up from createFriendRequest with their own honest codes.
  app.post("/friends/request-by-tag", { preHandler: requireAuth }, async (req) => {
    const me = req.userId!;
    const { tag } = friendRequestByTagSchema.parse(req.body);
    // Normalize: trim, strip a single leading '#', re-add it so lookup matches
    // the stored "#NNNN" format regardless of whether the user typed the hash.
    const bare = tag.trim().replace(/^#/, "");
    if (!bare) throw err.badRequest("INVALID_TAG", "Enter a player tag like #3947");
    const normalized = `#${bare}`;

    const target = await prisma.user.findFirst({
      where: { tag: normalized, deletedAt: null },
      select: { id: true },
    });
    if (!target) throw err.notFound("USER_NOT_FOUND", "No player found with that tag");

    return ok(await createFriendRequest(me, target.id));
  });

  // POST /api/friends/request/:id/accept
  app.post<{ Params: { id: string } }>(
    "/friends/request/:id/accept",
    { preHandler: requireAuth },
    async (req) => {
      const me = req.userId!;
      const request = await prisma.friendRequest.findUnique({ where: { id: req.params.id } });
      if (!request || request.toId !== me) throw err.notFound("REQUEST_NOT_FOUND", "Friend request not found");
      if (request.status !== "pending") throw err.conflict("NOT_PENDING", "Request is no longer pending");

      const [aId, bId] = request.fromId < request.toId
        ? [request.fromId, request.toId]
        : [request.toId, request.fromId];

      await prisma.$transaction([
        prisma.friendRequest.update({ where: { id: request.id }, data: { status: "accepted" } }),
        prisma.friendship.upsert({
          where: { aId_bId: { aId, bId } },
          update: {},
          create: { aId, bId },
        }),
        dismissFriendRequestNotifications(me, request.id),
      ]);

      await prisma.notification.create({
        data: {
          userId: request.fromId,
          type: "friend_accept",
          title: "Friend request accepted",
          data: { byUserId: me },
        },
      });

      return ok({ status: "accepted" });
    },
  );

  // POST /api/friends/request/:id/decline
  app.post<{ Params: { id: string } }>(
    "/friends/request/:id/decline",
    { preHandler: requireAuth },
    async (req) => {
      const me = req.userId!;
      const request = await prisma.friendRequest.findUnique({ where: { id: req.params.id } });
      if (!request || request.toId !== me) throw err.notFound("REQUEST_NOT_FOUND", "Friend request not found");
      if (request.status !== "pending") throw err.conflict("NOT_PENDING", "Request is no longer pending");

      await prisma.$transaction([
        prisma.friendRequest.update({ where: { id: request.id }, data: { status: "declined" } }),
        dismissFriendRequestNotifications(me, request.id),
      ]);
      return ok({ status: "declined" });
    },
  );

  // DELETE /api/friends/:userId — unfriend
  app.delete<{ Params: { userId: string } }>(
    "/friends/:userId",
    { preHandler: requireAuth },
    async (req) => {
      const me = req.userId!;
      const other = req.params.userId;
      const [aId, bId] = me < other ? [me, other] : [other, me];
      const friendship = await prisma.friendship.findUnique({ where: { aId_bId: { aId, bId } } });
      if (!friendship) throw err.notFound("NOT_FRIENDS", "You are not friends with this user");

      // also clear any resolved/pending request rows so a fresh request can be sent
      await prisma.$transaction([
        prisma.friendship.delete({ where: { id: friendship.id } }),
        prisma.friendRequest.deleteMany({
          where: {
            OR: [
              { fromId: me, toId: other },
              { fromId: other, toId: me },
            ],
          },
        }),
      ]);
      return ok({ removed: true });
    },
  );

  // GET /api/friends/suggested — a few users who aren't already friends/pending/self
  app.get("/friends/suggested", { preHandler: requireAuth }, async (req) => {
    const me = req.userId!;

    const [friendships, requests] = await Promise.all([
      prisma.friendship.findMany({
        where: { OR: [{ aId: me }, { bId: me }] },
        select: { aId: true, bId: true },
      }),
      prisma.friendRequest.findMany({
        where: { status: "pending", OR: [{ fromId: me }, { toId: me }] },
        select: { fromId: true, toId: true },
      }),
    ]);

    const exclude = new Set<string>([me]);
    for (const f of friendships) exclude.add(f.aId === me ? f.bId : f.aId);
    for (const r of requests) exclude.add(r.fromId === me ? r.toId : r.fromId);

    const candidates = await prisma.user.findMany({
      where: {
        id: { notIn: [...exclude] },
        isGuest: false,
        deletedAt: null,
        adminRole: null, // never suggest admin/staff accounts
      },
      select: friendSelect,
      orderBy: { trophies: "desc" },
      take: 8,
    });

    return ok({ suggested: candidates.map(publicFriend) });
  });
}
