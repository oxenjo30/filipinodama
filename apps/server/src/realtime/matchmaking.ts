import type { Server as IOServer, Socket } from "socket.io";
import { EV, DEFAULT_SETTINGS, type GameSettings, type PieceColor } from "@dama/shared";
import type { MatchMode as PrismaMatchMode } from "@prisma/client";
import { prisma } from "../db/client.js";
import { createLiveMatch, maybePlayBotMove } from "./match.js";

/** Mirrors ClientDevice from ./index.ts (kept as a plain union here to avoid an
 *  import cycle — index.ts registers this module). */
type ClientDevice = "mobile" | "web" | "tablet";

/**
 * How long a player waits for a REAL human before we fill the match with a
 * highly-skilled bot. Gives humans a fair chance to queue up first; only falls
 * back to a bot when nobody arrives (empty-queue fill).
 *
 * The wait is RANDOMIZED per queue attempt within [min,max] (default 7–20s) so
 * the bot never joins at a predictable moment — a fixed delay would make it
 * obvious the opponent is a bot. Tunable via env without a code change.
 */
const BOT_FILL_MIN_MS = Number(process.env.BOT_FILL_MIN_MS) || 7000;
const BOT_FILL_MAX_MS = Number(process.env.BOT_FILL_MAX_MS) || 20000;
function botFillDelay(): number {
  const min = Math.min(BOT_FILL_MIN_MS, BOT_FILL_MAX_MS);
  const max = Math.max(BOT_FILL_MIN_MS, BOT_FILL_MAX_MS);
  return min + Math.floor(Math.random() * (max - min + 1));
}

/** Pending bot-fill timers keyed by userId, so a real match cancels the fallback. */
const botTimers: Map<string, NodeJS.Timeout> = new Map();

/** The seeded bot usernames (lowercase), kept in sync with prisma/seed.ts. These
 *  fill empty queues; the picker chooses among the nearest-rated few at random. */
const BOT_USERNAMES = [
  "bakonawa", "lakan", "mayari", "apolaki", "amihan", "haliya", "tala", "sidapa",
  "bathala", "magwayen", "dumakulem", "lam-ang", "kanlaon", "diwata", "panday",
];

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

/** A player's preferred side. "either" = no preference (matches anyone). */
type ColorPref = "red" | "blue" | "either";
function asColorPref(x: unknown): ColorPref {
  return x === "red" || x === "blue" ? x : "either";
}

type Waiting = {
  userId: string;
  socketId: string;
  joinedAt: number;
  /** preferred colour; honoured when compatible, else the player is flipped. */
  colorPref: ColorPref;
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
  /** Equipped profile-frame item id, so the opponent's avatar shows their frame. */
  frameId: string | null;
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
      frameId: true,
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

    // Assign colours honouring both players' preferences when compatible, else
    // fall back to random. "either" is flexible; a hard conflict (both want the
    // same colour) can't both win, so it degrades to random.
    let aIsRed: boolean;
    if (a.colorPref === "red" && b.colorPref !== "red") aIsRed = true;
    else if (a.colorPref === "blue" && b.colorPref !== "blue") aIsRed = false;
    else if (b.colorPref === "red" && a.colorPref !== "red") aIsRed = false;
    else if (b.colorPref === "blue" && a.colorPref !== "blue") aIsRed = true;
    else aIsRed = Math.random() < 0.5; // both "either", or same hard pick → random
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

    // Opponent's real device (v3 delta, Row 4-6: "Playing on {device}" on the
    // Match Found reveal), captured from their handshake User-Agent at connect
    // time (see classifyDevice in ./index.ts). Default to "web" if somehow unset.
    const deviceA = (sa.data.device as ClientDevice | undefined) ?? "web";
    const deviceB = (sb.data.device as ClientDevice | undefined) ?? "web";

    sa.emit(EV.mmFound, {
      matchId,
      opponent: ub ? { ...ub, device: deviceB } : ub,
      yourColor: colorOf(a.userId),
      settings,
    });
    sb.emit(EV.mmFound, {
      matchId,
      opponent: ua ? { ...ua, device: deviceA } : ua,
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
async function startBotMatch(io: IOServer, userId: string, socketId: string, mode: QueueMode, colorPref: ColorPref): Promise<void> {
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
  // a believable opponent: sort by trophy distance to the player, then RANDOMLY
  // pick among the 3 nearest — so the same player facing bots at the same tier
  // doesn't always get the identical opponent (which would give the bot away).
  const bots = await prisma.user.findMany({
    where: { username: { in: BOT_USERNAMES } },
    select: { id: true, trophies: true },
  });
  if (bots.length === 0) return; // no bots seeded → leave the player queued
  const nearest = [...bots]
    .sort((a, b) => Math.abs(a.trophies - myTrophies) - Math.abs(b.trophies - myTrophies))
    .slice(0, 3);
  const bot = nearest[Math.floor(Math.random() * nearest.length)];

  // Pull the human out of the queue (they're about to be matched).
  leaveAllQueues(userId);

  // vs a BOT the human always gets their preferred colour (the bot takes the
  // other side); "either" → random. Then seed the match + mark the bot's colour.
  const humanIsRed = colorPref === "red" ? true : colorPref === "blue" ? false : Math.random() < 0.5;
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
  // Bots are deliberately presented as real opponents (existing owner-approved
  // disguise design — no "BOT" label anywhere). Riding that same design here:
  // give the bot a plausible device at random rather than a fixed/obviously
  // synthetic value, so the "Playing on {device}" reveal reads the same as a
  // real human opponent's.
  const botDevice: ClientDevice = Math.random() < 0.5 ? "mobile" : "web";
  socket.emit(EV.mmFound, {
    matchId,
    opponent: opponent ? { ...opponent, device: botDevice } : opponent,
    yourColor: humanIsRed ? "red" : "blue",
    settings,
  });

  // If the bot has the opening move (red), let the server play it.
  maybePlayBotMove(io, matchId);
}

export function registerMatchmaking(io: IOServer, socket: Socket) {
  const userId = socket.data.userId as string;

  socket.on(EV.mmJoin, async (payload: { mode?: unknown; colorPref?: unknown } = {}) => {
    const mode = payload?.mode;
    if (!isQueueMode(mode)) {
      socket.emit(EV.mmCancelled, { reason: "invalid-mode" });
      return;
    }
    const colorPref = asColorPref(payload?.colorPref);

    // A user may only be in one queue at a time — leaving any previous one first.
    leaveAllQueues(userId);

    // Guard against being matched with yourself from a second tab: if you are
    // already the sole waiter, refresh your socket id rather than double-queue.
    const q = queues.get(mode)!;
    q.push({ userId, socketId: socket.id, joinedAt: Date.now(), colorPref });
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
    // grace-window bot fallback: after a RANDOMIZED delay (7–20s, so the bot
    // never joins at a predictable moment), if STILL waiting, fill with a
    // highly-skilled bot so the player is never stuck on an empty queue.
    if (queuedIn.get(userId) === mode) {
      cancelBotTimer(userId); // replace any stale timer from a previous join
      const timer = setTimeout(() => {
        botTimers.delete(userId);
        // Re-check we're still the sole waiter for this mode before botting.
        if (queuedIn.get(userId) !== mode) return;
        void startBotMatch(io, userId, socket.id, mode, colorPref).catch((err) =>
          console.error("[matchmaking] startBotMatch failed", err),
        );
      }, botFillDelay());
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
