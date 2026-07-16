import type { Server as IOServer, Socket } from "socket.io";
import { EV, type DamathPlayerId, type DamathVariant } from "@dama/shared";
import { prisma } from "../db/client.js";
import { createLiveDamathMatch } from "./damath-match.js";
import {
  redis,
  RT_TTL,
  queuePush,
  queueUnshift,
  queueRemove,
  queuePopPair,
  getQueuedIn,
  setQueuedIn,
  type QueueEntry,
} from "./store.js";

/**
 * Math Dama matchmaking — a single "DAMATH" queue, Redis-backed (spec:
 * 2026-07-15-realtime-redis-scale-design.md) so any instance can serve
 * damath:mm:join/leave. Parallel to (and never touching) Classic's matchmaking.
 * Damath is UNRANKED with no economy, so there is NO trophy-tier bot-fill: an
 * empty queue simply keeps the player waiting for a real opponent (spec §7). The
 * server decides pairing + colours; the client only asks to join/leave.
 *
 * The store's QueueEntry has no `variant` field, so each waiter's chosen variant
 * is kept in a companion per-user key (rt:d:mmVariant:<userId>) read at pair
 * time. colorPref is unused (first-joiner is always Red) — stored as "either".
 */

const DAMATH_MODE = "DAMATH";
const variantKey = (userId: string) => `rt:d:mmVariant:${userId}`;

async function setQueuedVariant(userId: string, variant: DamathVariant): Promise<void> {
  await redis.set(variantKey(userId), variant, "EX", RT_TTL);
}
async function getQueuedVariant(userId: string): Promise<DamathVariant> {
  return ((await redis.get(variantKey(userId))) as DamathVariant | null) ?? "whole";
}

/** Remove a user from the Damath queue. Returns true if they were in it.
 *  Reads/writes the "damath"-family queue pointer so it never touches (or is
 *  confused by) the Classic queue a user might also be sitting in. */
export async function leaveDamathQueue(userId: string): Promise<boolean> {
  const mode = await getQueuedIn(userId, "damath");
  if (mode !== DAMATH_MODE) return false;
  await queueRemove(DAMATH_MODE, userId);
  await setQueuedIn(userId, null, "damath");
  await redis.del(variantKey(userId));
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
 * The user's CURRENT live socket (any of them), resolved via the presence room —
 * so a reconnect between join and pairing doesn't leave us holding a stale
 * socketId. Mirrors classic matchmaking's currentSocketForUser.
 */
async function currentSocketForUser(io: IOServer, userId: string) {
  const sockets = await io.in(`presence:${userId}`).fetchSockets();
  return sockets[0] ?? null;
}

async function requeueFront(entry: QueueEntry, variant: DamathVariant): Promise<void> {
  await queueUnshift(DAMATH_MODE, entry);
  await setQueuedIn(entry.userId, DAMATH_MODE, "damath");
  await setQueuedVariant(entry.userId, variant);
}

/**
 * Pair the two longest-waiting players. The first-joiner takes RED (opens),
 * matching the engine's Red-first convention. Creates the DamathMatch row, seeds
 * the live state, joins both sockets to the match room, and emits damathMmFound
 * with each player's colour + opponent. Loops until fewer than 2 remain.
 */
async function tryPair(io: IOServer): Promise<void> {
  for (;;) {
    const pair = await queuePopPair(DAMATH_MODE);
    if (!pair) break;
    const [a, b] = pair; // a joined earlier → Red
    const variantA = await getQueuedVariant(a.userId);
    const variantB = await getQueuedVariant(b.userId);
    await redis.del(variantKey(a.userId), variantKey(b.userId));

    // Resolve each player's CURRENT live socket by userId (not a stale socketId).
    const sa = await currentSocketForUser(io, a.userId);
    const sb = await currentSocketForUser(io, b.userId);
    if (!sa && !sb) continue;
    if (!sa) {
      await requeueFront(b, variantB);
      continue;
    }
    if (!sb) {
      await requeueFront(a, variantA);
      continue;
    }

    const redId = a.userId; // first joiner opens as Red
    const blueId = b.userId;
    // Both must agree on a variant; if they differ, use the Red player's choice
    // (MVP ships Whole only, so they always match in practice).
    const variant = variantA;

    let matchId: string;
    try {
      const match = await prisma.damathMatch.create({
        data: { variant, redId, blueId },
        select: { id: true },
      });
      matchId = match.id;
    } catch (e) {
      // DB failure: requeue both so they aren't silently dropped.
      await requeueFront(b, variantB);
      await requeueFront(a, variantA);
      throw e;
    }

    await createLiveDamathMatch(matchId, redId, blueId, variant);
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
    await leaveDamathQueue(userId);
    // colorPref is unused for Damath (first-joiner is always Red); store "either".
    const entry: QueueEntry = { userId, joinedAt: Date.now(), colorPref: "either" };
    await queuePush(DAMATH_MODE, entry);
    await setQueuedIn(userId, DAMATH_MODE, "damath");
    await setQueuedVariant(userId, variant);
    socket.emit(EV.damathMmSearching, {});

    try {
      await tryPair(io);
    } catch (e) {
      socket.emit(EV.damathMmCancelled, { reason: "server-error" });
      console.error("[damath-mm] tryPair failed", e);
    }
    // If still queued, the player simply waits for a real opponent. No bot-fill.
  });

  socket.on(EV.damathMmLeave, async () => {
    if (await leaveDamathQueue(userId)) socket.emit(EV.damathMmCancelled, { reason: "left" });
  });

  socket.on("disconnect", () => {
    void leaveDamathQueue(userId);
  });
}
