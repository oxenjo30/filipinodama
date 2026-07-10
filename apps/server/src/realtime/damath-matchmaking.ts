import type { Server as IOServer, Socket } from "socket.io";
import { EV, type DamathPlayerId, type DamathVariant } from "@dama/shared";
import { prisma } from "../db/client.js";
import { createLiveDamathMatch } from "./damath-match.js";

/**
 * Math Dama matchmaking — a single DAMATH_CASUAL queue, parallel to (and never
 * touching) Classic's matchmaking. Damath is UNRANKED with no economy, so there
 * is NO trophy-tier bot-fill: an empty queue simply keeps the player waiting for
 * a real opponent (spec §7). The server decides pairing + colours; the client
 * only asks to join/leave.
 */

type Waiting = {
  userId: string;
  socketId: string;
  variant: DamathVariant;
  joinedAt: number;
};

/** FIFO queue of players waiting for a Damath match. */
let queue: Waiting[] = [];
/** userIds currently queued (one queue entry per user). */
const queued = new Set<string>();

/** Remove a user from the queue. Returns true if they were in it. */
export function leaveDamathQueue(userId: string): boolean {
  if (!queued.has(userId)) return false;
  queue = queue.filter((w) => w.userId !== userId);
  queued.delete(userId);
  return true;
}

type PublicUser = {
  id: string;
  username: string;
  displayName: string;
  tag: string;
  avatarUrl: string | null;
  trophies: number;
  rankTier: string;
};

async function publicUser(userId: string): Promise<PublicUser | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      displayName: true,
      tag: true,
      avatarUrl: true,
      trophies: true,
      rankTier: true,
    },
  });
  return u ?? null;
}

/**
 * Pair the two longest-waiting players. The first-joiner takes RED (opens),
 * matching the engine's Red-first convention. Creates the DamathMatch row, seeds
 * the live state, joins both sockets to the match room, and emits damathMmFound
 * with each player's colour + opponent.
 */
async function tryPair(io: IOServer): Promise<void> {
  while (queue.length >= 2) {
    const a = queue.shift()!; // earlier joiner → Red
    const b = queue.shift()!;
    queued.delete(a.userId);
    queued.delete(b.userId);

    const sa = io.sockets.sockets.get(a.socketId);
    const sb = io.sockets.sockets.get(b.socketId);
    // If a socket dropped, requeue the survivor at the front and continue.
    if (!sa && !sb) continue;
    if (!sa) {
      queue.unshift(b);
      queued.add(b.userId);
      continue;
    }
    if (!sb) {
      queue.unshift(a);
      queued.add(a.userId);
      continue;
    }

    const redId = a.userId; // first joiner opens as Red
    const blueId = b.userId;
    // Both must agree on a variant; if they differ, use the Red player's choice
    // (MVP ships Whole only, so they always match in practice).
    const variant = a.variant;

    let matchId: string;
    try {
      const match = await prisma.damathMatch.create({
        data: { variant, redId, blueId },
        select: { id: true },
      });
      matchId = match.id;
    } catch (e) {
      // DB failure: requeue both so they aren't silently dropped.
      queue.unshift(b, a);
      queued.add(a.userId);
      queued.add(b.userId);
      throw e;
    }

    createLiveDamathMatch(matchId, redId, blueId, variant);
    await sa.join(matchId);
    await sb.join(matchId);

    const [ua, ub] = await Promise.all([publicUser(a.userId), publicUser(b.userId)]);
    const colorOf = (uid: string): DamathPlayerId => (uid === redId ? "red" : "blue");

    sa.emit(EV.damathMmFound, { matchId, opponent: ub, yourColor: colorOf(a.userId), variant });
    sb.emit(EV.damathMmFound, { matchId, opponent: ua, yourColor: colorOf(b.userId), variant });
  }
}

export function registerDamathMatchmaking(io: IOServer, socket: Socket) {
  const userId = socket.data.userId as string;

  socket.on(EV.damathMmJoin, async (payload: { variant?: unknown } = {}) => {
    const variant = (typeof payload?.variant === "string" ? payload.variant : "whole") as DamathVariant;

    // One queue entry per user; leaving any previous wait first.
    leaveDamathQueue(userId);
    queue.push({ userId, socketId: socket.id, variant, joinedAt: Date.now() });
    queued.add(userId);
    socket.emit(EV.damathMmSearching, {});

    try {
      await tryPair(io);
    } catch (e) {
      socket.emit(EV.damathMmCancelled, { reason: "server-error" });
      console.error("[damath-mm] tryPair failed", e);
    }
    // If still queued, the player simply waits for a real opponent. No bot-fill.
  });

  socket.on(EV.damathMmLeave, () => {
    if (leaveDamathQueue(userId)) socket.emit(EV.damathMmCancelled, { reason: "left" });
  });

  socket.on("disconnect", () => {
    leaveDamathQueue(userId);
  });
}
