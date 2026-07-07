import type { Server as IOServer, Socket } from "socket.io";
import { EV } from "@dama/shared";
import { prisma } from "../db/client.js";

/**
 * Live presence. Tracks which users have at least one connected socket, and
 * pushes presence:update to a user's friends when they come online or go offline.
 *
 * In-memory + single-instance (a Map keyed by userId → set of socket ids). A
 * user is "online" while they hold ≥1 socket. On the first socket we notify
 * friends "online" + stamp lastSeenAt; on the last socket dropping we notify
 * "offline" + stamp lastSeenAt again (so REST can derive recency too).
 *
 * A socket also joins the room `presence:<userId>` so any code can target a
 * specific user's live sessions.
 */

/** userId → set of live socket ids. Presence = set non-empty. */
const online = new Map<string, Set<string>>();

export function isOnline(userId: string): boolean {
  return (online.get(userId)?.size ?? 0) > 0;
}

/** Snapshot the currently-online userIds (used to seed a client's friend list). */
export function onlineUserIds(): string[] {
  return [...online.keys()].filter((id) => (online.get(id)?.size ?? 0) > 0);
}

/** The friend ids of `userId` (both directions of Friendship). */
async function friendIds(userId: string): Promise<string[]> {
  const rows = await prisma.friendship.findMany({
    where: { OR: [{ aId: userId }, { bId: userId }] },
    select: { aId: true, bId: true },
  });
  return rows.map((f) => (f.aId === userId ? f.bId : f.aId));
}

/** Tell a user's online friends that their presence changed. */
async function broadcastToFriends(io: IOServer, userId: string, status: "online" | "offline") {
  const ids = await friendIds(userId);
  const payload = { userId, status, at: Date.now() };
  for (const fid of ids) io.to(`presence:${fid}`).emit(EV.presenceUpdate, payload);
}

export function registerPresence(io: IOServer, socket: Socket) {
  const userId = socket.data.userId as string;

  // Join a personal room so friends' presence + DMs can target this user.
  void socket.join(`presence:${userId}`);

  const wasOffline = !isOnline(userId);
  const set = online.get(userId) ?? new Set<string>();
  set.add(socket.id);
  online.set(userId, set);

  if (wasOffline) {
    // First session → mark online for friends + stamp lastSeenAt.
    prisma.user
      .update({ where: { id: userId }, data: { lastSeenAt: new Date() } })
      .catch(() => {});
    void broadcastToFriends(io, userId, "online");
  }

  // On request, send the caller the set of their friends who are currently online.
  socket.on(EV.presencePing, async () => {
    prisma.user.update({ where: { id: userId }, data: { lastSeenAt: new Date() } }).catch(() => {});
    const ids = await friendIds(userId);
    const onlineFriends = ids.filter((id) => isOnline(id));
    socket.emit(EV.presenceUpdate, { snapshot: onlineFriends, at: Date.now() });
  });

  socket.on("disconnect", () => {
    const s = online.get(userId);
    if (!s) return;
    s.delete(socket.id);
    if (s.size === 0) {
      online.delete(userId);
      prisma.user.update({ where: { id: userId }, data: { lastSeenAt: new Date() } }).catch(() => {});
      void broadcastToFriends(io, userId, "offline");
    }
  });
}
