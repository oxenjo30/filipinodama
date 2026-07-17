import { EV } from "@dama/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db/client.js";
import { getIO } from "../realtime/io.js";

/**
 * Notification `type`s that are internal progress markers, not user-facing bell
 * items — mirrors notifications.ts's HIDDEN_TYPES so the live unread count we
 * push matches exactly what GET /api/notifications returns. Keep in sync.
 */
const HIDDEN_TYPES = ["lesson_complete"];

/** The recipient's current unread bell count (same query as the feed endpoint). */
export async function unreadNotifCount(userId: string): Promise<number> {
  return prisma.notification.count({
    where: { userId, readAt: null, dismissedAt: null, type: { notIn: HIDDEN_TYPES } },
  });
}

/**
 * Push the recipient's fresh unread notification count to all their connected
 * sockets (every device/tab). Emitted to the `presence:<userId>` room that every
 * authenticated socket joins on connect (see realtime/presence.ts). Best-effort:
 * if the socket server isn't up yet the DB row is still the source of truth and
 * the client will pick the count up on its next fetch.
 *
 * Call this AFTER creating the notification row(s) so the count reflects them.
 */
export async function pushUnreadCount(userId: string): Promise<void> {
  const io = getIO();
  if (!io) return; // sockets not ready — client fetches on next load
  try {
    const unreadCount = await unreadNotifCount(userId);
    io.to(`presence:${userId}`).emit(EV.notifNew, { unreadCount });
  } catch {
    // live badge is best-effort; the persisted notification still exists
  }
}

/**
 * Create a notification row AND live-push the recipient's new unread count so
 * their bell/action badge lights up instantly (no refresh) — the single path
 * that keeps the DB and the live badge in sync. `data` is the type-specific
 * payload (e.g. { requestId, fromUserId } for a friend request).
 */
export async function notifyUser(input: {
  userId: string;
  type: string;
  title: string;
  body?: string | null;
  data?: Prisma.InputJsonValue;
}): Promise<void> {
  await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      ...(input.data !== undefined ? { data: input.data } : {}),
    },
  });
  await pushUnreadCount(input.userId);
}
