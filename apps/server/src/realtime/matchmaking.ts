import type { Server as IOServer, Socket } from "socket.io";
import { EV, DEFAULT_SETTINGS, type GameSettings, type PieceColor } from "@dama/shared";
import type { MatchMode as PrismaMatchMode } from "@prisma/client";
import { prisma } from "../db/client.js";
import { createLiveMatch, maybePlayBotMove } from "./match.js";

/**
 * How long a player waits for a REAL human before we fill the match with a
 * highly-skilled bot. Gives humans a fair chance to queue up first; only falls
 * back to a bot when nobody arrives (empty-queue fill).
 */
const BOT_FILL_MS = 7000;

/** Pending bot-fill timers keyed by userId, so a real match cancels the fallback. */
const botTimers: Map<string, NodeJS.Timeout> = new Map();

function cancelBotTimer(userId: string): void {
  const t = botTimers.get(userId);
  if (t) {
    clearTimeout(t);
    botTimers.delete(userId);
  }
}

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
  cancelBotTimer(userId); // no longer waiting → drop any pending bot fallback
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
    // A real human pairing wins — cancel any pending bot fallback for both.
    cancelBotTimer(a.userId);
    cancelBotTimer(b.userId);

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

/**
 * Fill an empty queue with a highly-skilled BOT after the grace window. Picks a
 * seeded bot user closest to the player's trophy tier (so it reads as a fair,
 * real-looking opponent — no "BOT" label), creates a real Match against it, and
 * hands off to the live match loop. The server plays the bot's turns with the
 * engine (see match.ts maybePlayBotMove). Trophies/gold settle normally for the
 * human; the bot user's stats move too but are never surfaced.
 */
async function startBotMatch(io: IOServer, userId: string, socketId: string, mode: QueueMode): Promise<void> {
  // Still connected + still the sole waiter for this mode?
  const socket = io.sockets.sockets.get(socketId);
  if (!socket) {
    leaveAllQueues(userId);
    return;
  }

  // The queuing human's trophies, to pick a comparably-rated bot.
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { trophies: true } });
  const myTrophies = me?.trophies ?? 1000;

  // Seeded bots are real users (isGuest:false) with names/avatars/trophies. Pick
  // the one whose trophies are nearest the player's for a believable pairing.
  const bots = await prisma.user.findMany({
    where: { username: { in: ["lakan", "mayari", "amihan", "tala", "bathala", "dumakulem"] } },
    select: { id: true, trophies: true },
  });
  if (bots.length === 0) return; // no bots seeded → leave the player queued
  const bot = bots.reduce((best, b) =>
    Math.abs(b.trophies - myTrophies) < Math.abs(best.trophies - myTrophies) ? b : best,
  );

  // Pull the human out of the queue (they're about to be matched).
  leaveAllQueues(userId);

  // Randomize colours; seed the DB match + live state; mark the bot's colour so
  // the match loop drives its moves.
  const humanIsRed = Math.random() < 0.5;
  const redId = humanIsRed ? userId : bot.id;
  const blueId = humanIsRed ? bot.id : userId;
  const botColor: PieceColor = humanIsRed ? "blue" : "red";
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
    console.error("[matchmaking] bot match create failed", e);
    return;
  }

  createLiveMatch(matchId, redId, blueId, mode, settings, botColor);
  await socket.join(matchId);

  const opponent = await publicUser(bot.id);
  socket.emit(EV.mmFound, {
    matchId,
    opponent,
    yourColor: humanIsRed ? "red" : "blue",
    settings,
  });

  // If the bot has the opening move (red), let the server play it.
  maybePlayBotMove(io, matchId);
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

    // If a human didn't pair us during tryMatch (we're still queued), arm the
    // grace-window bot fallback: after BOT_FILL_MS, if STILL waiting, fill with a
    // highly-skilled bot so the player is never stuck on an empty queue.
    if (queuedIn.get(userId) === mode) {
      cancelBotTimer(userId); // replace any stale timer from a previous join
      const timer = setTimeout(() => {
        botTimers.delete(userId);
        // Re-check we're still the sole waiter for this mode before botting.
        if (queuedIn.get(userId) !== mode) return;
        void startBotMatch(io, userId, socket.id, mode).catch((err) =>
          console.error("[matchmaking] startBotMatch failed", err),
        );
      }, BOT_FILL_MS);
      botTimers.set(userId, timer);
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
