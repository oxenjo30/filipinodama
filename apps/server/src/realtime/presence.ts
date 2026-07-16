import type { Server as IOServer, Socket } from "socket.io";
import { EV } from "@dama/shared";
import { prisma } from "../db/client.js";
import { recordDailyActivity } from "../lib/activity.js";
import { presenceAdd, presenceRemove, presenceIsOnline, presenceOnlineIds } from "./store.js";

/**
 * Live presence. Tracks which users have at least one connected socket, and
 * pushes presence:update to a user's friends when they come online or go offline.
 *
 * Redis-authoritative (spec: 2026-07-15-realtime-redis-scale-design.md): a
 * SET of socket ids per user + a SET of online userIds, both maintained with
 * atomic Lua (see store.ts presenceAdd/presenceRemove) so any instance in the
 * cluster sees consistent presence. A user is "online" while they hold ≥1
 * socket. On the first socket we notify friends "online" + stamp lastSeenAt;
 * on the last socket dropping we notify "offline" + stamp lastSeenAt again
 * (so REST can derive recency too).
 *
 * A socket also joins the room `presence:<userId>` so any code can target a
 * specific user's live sessions.
 */

export async function isOnline(userId: string): Promise<boolean> {
  return presenceIsOnline(userId);
}

/** Snapshot the currently-online userIds (used to seed a client's friend list). */
export async function onlineUserIds(): Promise<string[]> {
  return presenceOnlineIds();
}

/** The friend ids of `userId` (both directions of Friendship). */
async function friendIds(userId: string): Promise<string[]> {
  const rows = await prisma.friendship.findMany({
    where: { OR: [{ aId: userId }, { bId: userId }] },
    select: { aId: true, bId: true },
  });
  return rows.map((f) => (f.aId === userId ? f.bId : f.aId));
}

/** Tell a user's online friends that their presence changed. Best-effort: a DB
 *  failure must never bubble up — this is fired-and-forgotten from connect and
 *  disconnect, so an unhandled rejection here would crash the whole process. */
async function broadcastToFriends(io: IOServer, userId: string, status: "online" | "offline") {
  try {
    const ids = await friendIds(userId);
    const payload = { userId, status, at: Date.now() };
    for (const fid of ids) io.to(`presence:${fid}`).emit(EV.presenceUpdate, payload);
  } catch {
    /* presence is best-effort; a friend-lookup failure just means no broadcast */
  }
}

export function registerPresence(io: IOServer, socket: Socket) {
  const userId = socket.data.userId as string;

  // Join a personal room so friends' presence + DMs can target this user.
  void socket.join(`presence:${userId}`);

  // presenceAdd is atomic (Lua): returns true iff this was the user's first
  // socket (i.e. they were offline a moment ago), so two concurrent connects
  // for the same user can't both fire (or both skip) the "online" broadcast.
  void presenceAdd(userId, socket.id).then((wasOffline) => {
    if (wasOffline) {
      // First session → mark online for friends + stamp lastSeenAt.
      prisma.user
        .update({ where: { id: userId }, data: { lastSeenAt: new Date() } })
        .catch(() => {});
      // Record today's active day (once/user/day) for real retention analytics.
      // Best-effort: a failure here must never affect presence.
      recordDailyActivity(userId).catch(() => {});
      void broadcastToFriends(io, userId, "online");
    }
  });

  // On request, send the caller the set of their friends who are currently
  // online. Wrapped so a DB error can never become an unhandled rejection that
  // crashes the process.
  socket.on(EV.presencePing, async () => {
    try {
      prisma.user.update({ where: { id: userId }, data: { lastSeenAt: new Date() } }).catch(() => {});
      const ids = await friendIds(userId);
      const onlineFlags = await Promise.all(ids.map((id) => isOnline(id)));
      const onlineFriends = ids.filter((_, i) => onlineFlags[i]);
      socket.emit(EV.presenceUpdate, { snapshot: onlineFriends, at: Date.now() });
    } catch {
      /* presence is best-effort; a lookup failure just means no snapshot */
    }
  });

  socket.on("disconnect", () => {
    void presenceRemove(userId, socket.id).then((wentOffline) => {
      if (wentOffline) {
        prisma.user.update({ where: { id: userId }, data: { lastSeenAt: new Date() } }).catch(() => {});
        void broadcastToFriends(io, userId, "offline");
      }
    });
  });
}
