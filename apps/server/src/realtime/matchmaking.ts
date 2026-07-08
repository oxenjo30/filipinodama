import type { Server as IOServer, Socket } from "socket.io";
import { EV, DEFAULT_SETTINGS, type GameSettings, type PieceColor } from "@dama/shared";
import type { MatchMode as PrismaMatchMode } from "@prisma/client";
import { prisma } from "../db/client.js";
import { createLiveMatch } from "./match.js";

/**
 * In-memory matchmaking. Single-instance authoritative queue keyed by mode.
 * (Redis is optional for horizontal scaling later — a Map is correct for one
 * process today.) The SERVER decides pairings, colors and settings; the client
 * only asks to join/leave a queue.
 */

/** Only these modes are matched here; PRIVATE/LOCAL/AI use other flows. */
type QueueMode = "CASUAL" | "RANKED";
const QUEUE_MODES: QueueMode[] = ["CASUAL", "RANKED"];

type Waiting = {
  userId: string;
  socketId: string;
  joinedAt: number;
};

/** mode -> ordered list of waiting players (FIFO). */
const queues: Map<QueueMode, Waiting[]> = new Map(
  QUEUE_MODES.map((m) => [m, [] as Waiting[]]),
);

/** userId -> the mode they are currently queued in (one queue at a time). */
const queuedIn: Map<string, QueueMode> = new Map();

function isQueueMode(x: unknown): x is QueueMode {
  return x === "CASUAL" || x === "RANKED";
}

/** Remove a user from every queue. Returns true if they were in one. */
export function leaveAllQueues(userId: string): boolean {
  const mode = queuedIn.get(userId);
  if (!mode) return false;
  const q = queues.get(mode)!;
  const idx = q.findIndex((w) => w.userId === userId);
  if (idx >= 0) q.splice(idx, 1);
  queuedIn.delete(userId);
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
  /** Equipped piece-skin ART KEY (e.g. "sarimanok"), resolved from the equipped
   *  SKIN item's assetKey so the opponent's board shows their real skin. null =
   *  default discs. */
  skin: string | null;
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
      equippedSkin: true,
    },
  });
  if (!u) return null;
  // equippedSkin is a store-item id; the board needs the item's assetKey (the
  // PieceSkin art key). Resolve it, treating the classic skin as default.
  let skin: string | null = null;
  if (u.equippedSkin) {
    const item = await prisma.storeItem.findUnique({
      where: { id: u.equippedSkin },
      select: { assetKey: true },
    });
    if (item?.assetKey && item.assetKey !== "classic") skin = item.assetKey;
  }
  const { equippedSkin: _omit, ...rest } = u;
  return { ...rest, skin };
}

/**
 * Try to pair the two longest-waiting players in `mode`. Creates the Match row +
 * seeds the live game state, joins both sockets to the match room, and emits
 * EV.mmFound to each with their own color. Runs until fewer than 2 remain.
 */
async function tryMatch(io: IOServer, mode: QueueMode): Promise<void> {
  const q = queues.get(mode)!;
  while (q.length >= 2) {
    const a = q.shift()!;
    const b = q.shift()!;
    queuedIn.delete(a.userId);
    queuedIn.delete(b.userId);

    // Both sockets must still be connected; if one dropped, requeue the other.
    const sa = io.sockets.sockets.get(a.socketId);
    const sb = io.sockets.sockets.get(b.socketId);
    if (!sa && !sb) continue;
    if (!sa) {
      requeueFront(mode, b);
      continue;
    }
    if (!sb) {
      requeueFront(mode, a);
      continue;
    }

    // Randomize colors so seat assignment is fair.
    const aIsRed = Math.random() < 0.5;
    const redId = aIsRed ? a.userId : b.userId;
    const blueId = aIsRed ? b.userId : a.userId;
    const settings: GameSettings = { ...DEFAULT_SETTINGS };
    const prismaMode = mode as PrismaMatchMode;

    let matchId: string;
    try {
      const match = await prisma.match.create({
        data: {
          mode: prismaMode,
          redId,
          blueId,
          settings: settings as unknown as object,
          moves: [] as unknown as object,
        },
        select: { id: true },
      });
      matchId = match.id;
    } catch (e) {
      // DB failure: put both players back so they aren't silently dropped.
      requeueFront(mode, b);
      requeueFront(mode, a);
      throw e;
    }

    // Seed authoritative in-memory game state and register the match loop room.
    createLiveMatch(matchId, redId, blueId, mode, settings);

    // Both players join the io room named after the match id.
    await sa.join(matchId);
    await sb.join(matchId);

    const [ua, ub] = await Promise.all([publicUser(a.userId), publicUser(b.userId)]);

    const colorOf = (uid: string): PieceColor => (uid === redId ? "red" : "blue");

    sa.emit(EV.mmFound, {
      matchId,
      opponent: ub,
      yourColor: colorOf(a.userId),
      settings,
    });
    sb.emit(EV.mmFound, {
      matchId,
      opponent: ua,
      yourColor: colorOf(b.userId),
      settings,
    });
  }
}

function requeueFront(mode: QueueMode, w: Waiting) {
  queues.get(mode)!.unshift(w);
  queuedIn.set(w.userId, mode);
}

export function registerMatchmaking(io: IOServer, socket: Socket) {
  const userId = socket.data.userId as string;

  socket.on(EV.mmJoin, async (payload: { mode?: unknown } = {}) => {
    const mode = payload?.mode;
    if (!isQueueMode(mode)) {
      socket.emit(EV.mmCancelled, { reason: "invalid-mode" });
      return;
    }

    // A user may only be in one queue at a time — leaving any previous one first.
    leaveAllQueues(userId);

    // Guard against being matched with yourself from a second tab: if you are
    // already the sole waiter, refresh your socket id rather than double-queue.
    const q = queues.get(mode)!;
    q.push({ userId, socketId: socket.id, joinedAt: Date.now() });
    queuedIn.set(userId, mode);

    socket.emit(EV.mmSearching, { mode });

    try {
      await tryMatch(io, mode);
    } catch (e) {
      socket.emit(EV.mmCancelled, { reason: "server-error" });
      // eslint-disable-next-line no-console
      console.error("[matchmaking] tryMatch failed", e);
    }
  });

  socket.on(EV.mmLeave, () => {
    const was = leaveAllQueues(userId);
    if (was) socket.emit(EV.mmCancelled, { reason: "left" });
  });

  socket.on("disconnect", () => {
    leaveAllQueues(userId);
  });
}
