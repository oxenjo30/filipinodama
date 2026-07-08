import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { ok, err } from "../lib/errors.js";
import { isMuted } from "../lib/mute.js";
import { requireAuth } from "../auth/guards.js";
import { getIO } from "../realtime/io.js";
import { EV } from "@dama/shared";
import { ensureChannel, dmRefId, loadHistory, postMessage, markRead, unreadCount } from "./chat-service.js";

/**
 * Direct messages between friends. A DM = one Channel(type=DM, refId=<sorted
 * pair>) with a ChannelMember row per user (lastReadAt drives unread counts).
 *
 * Send is over REST (persist + broadcast to the recipient's presence room so
 * their open DM view + unread badge update live). History/list/read are REST.
 * You may only DM a confirmed friend.
 */

const sendSchema = z.object({ body: z.string().min(1).max(1000) });

async function assertFriends(me: string, other: string) {
  const [aId, bId] = me < other ? [me, other] : [other, me];
  const f = await prisma.friendship.findUnique({ where: { aId_bId: { aId, bId } } });
  if (!f) throw err.forbidden("NOT_FRIENDS", "You can only message friends");
}

export async function dmRoutes(app: FastifyInstance) {
  // GET /api/dm — my conversations (one row per friend with a channel), newest
  // activity first, with unread count + last message preview.
  app.get("/dm", { preHandler: requireAuth }, async (req) => {
    const me = req.userId!;
    // Channels I'm a member of that are DMs.
    const memberships = await prisma.channelMember.findMany({
      where: { userId: me, channel: { type: "DM" } },
      select: { channelId: true, lastReadAt: true, channel: { select: { refId: true } } },
    });
    const convos = await Promise.all(
      memberships.map(async (m) => {
        const [a, b] = (m.channel.refId ?? "").split(":");
        const otherId = a === me ? b : a;
        const [other, last, unread] = await Promise.all([
          prisma.user.findUnique({
            where: { id: otherId },
            select: { id: true, displayName: true, tag: true, avatarUrl: true },
          }),
          prisma.message.findFirst({
            where: { channelId: m.channelId },
            orderBy: { createdAt: "desc" },
            select: { body: true, createdAt: true, authorId: true },
          }),
          unreadCount(m.channelId, me),
        ]);
        return other
          ? {
              channelId: m.channelId,
              user: other,
              lastMessage: last?.body ?? null,
              lastAt: last?.createdAt ?? null,
              unread,
            }
          : null;
      }),
    );
    const items = convos
      .filter((c): c is NonNullable<typeof c> => !!c)
      .sort((x, y) => (y.lastAt?.getTime() ?? 0) - (x.lastAt?.getTime() ?? 0));
    return ok({ conversations: items });
  });

  // GET /api/dm/unread-total — sum of unread across all my DMs (nav badge).
  app.get("/dm/unread-total", { preHandler: requireAuth }, async (req) => {
    const me = req.userId!;
    const memberships = await prisma.channelMember.findMany({
      where: { userId: me, channel: { type: "DM" } },
      select: { channelId: true },
    });
    const counts = await Promise.all(memberships.map((m) => unreadCount(m.channelId, me)));
    return ok({ total: counts.reduce((a, b) => a + b, 0) });
  });

  // GET /api/dm/:userId — open (or lazily create) the DM with a friend + history.
  app.get<{ Params: { userId: string } }>("/dm/:userId", { preHandler: requireAuth }, async (req) => {
    const me = req.userId!;
    const other = req.params.userId;
    if (other === me) throw err.badRequest("SELF_DM", "You can't message yourself");
    await assertFriends(me, other);
    const channelId = await ensureChannel("DM", dmRefId(me, other), [me, other]);
    const [messages] = await Promise.all([loadHistory(channelId), markRead(channelId, me)]);
    const user = await prisma.user.findUnique({
      where: { id: other },
      select: { id: true, displayName: true, tag: true, avatarUrl: true },
    });
    return ok({ channelId, user, messages });
  });

  // POST /api/dm/:userId — send a message; persists + live-delivers to recipient.
  // Per-route throttle on top of the global IP ceiling: caps DM spam/flooding.
  app.post<{ Params: { userId: string } }>(
    "/dm/:userId",
    { preHandler: requireAuth, config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req) => {
    const me = req.userId!;
    const other = req.params.userId;
    if (other === me) throw err.badRequest("SELF_DM", "You can't message yourself");
    if (await isMuted(me)) throw err.forbidden("MUTED", "You are muted and can't send messages.");
    await assertFriends(me, other);
    const { body } = sendSchema.parse(req.body);
    const channelId = await ensureChannel("DM", dmRefId(me, other), [me, other]);
    const message = await postMessage(channelId, me, body);
    await markRead(channelId, me); // my own send counts as read for me

    // Live-deliver to the recipient's sessions (open thread + unread badge) AND
    // echo to the SENDER's own other tabs so an open thread on another device
    // updates too (the client dedupes by message id, so no double-render).
    const io = getIO();
    if (io) {
      io.to(`presence:${other}`).emit(EV.chatMessage, { channelId, message, kind: "dm", from: me });
      io.to(`presence:${other}`).emit(EV.chatNotify, { kind: "dm", from: me });
      io.to(`presence:${me}`).emit(EV.chatMessage, { channelId, message, kind: "dm", from: me });
    }
    return ok({ message });
  });

  // POST /api/dm-channel/:channelId/read — mark a DM channel read (clears my
  // unread). Guarded: you may only mark a channel you are a member of (no IDOR).
  app.post<{ Params: { channelId: string } }>(
    "/dm-channel/:channelId/read",
    { preHandler: requireAuth },
    async (req) => {
      const me = req.userId!;
      const member = await prisma.channelMember.findFirst({
        where: { channelId: req.params.channelId, userId: me },
        select: { id: true },
      });
      if (!member) throw err.forbidden("NOT_A_MEMBER", "Not your channel");
      await markRead(req.params.channelId, me);
      return ok({ read: true });
    },
  );
}
