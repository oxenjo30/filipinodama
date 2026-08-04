import type { Server as IOServer, Socket } from "socket.io";
import { EV, DEFAULT_SETTINGS, type GameSettings, type PieceColor } from "@dama/shared";
import type { MatchMode as PrismaMatchMode } from "@prisma/client";
import { prisma } from "../db/client.js";
import { createLiveMatch, maybePlayBotMove } from "./match.js";
import { scheduleJob, cancelJob } from "./jobs.js";
import { queuePush, queueUnshift, queueRemove, queuePopPair, getQueuedIn, setQueuedIn, type QueueEntry } from "./store.js";

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

/** The seeded bot usernames (lowercase), kept in sync with prisma/seed.ts. These
 *  fill empty queues; the picker chooses among the nearest-rated few at random. */
const BOT_USERNAMES = [
  "bakonawa", "lakan", "mayari", "apolaki", "amihan", "haliya", "tala", "sidapa",
  "bathala", "magwayen", "dumakulem", "lam-ang", "kanlaon", "diwata", "panday",
];

/**
 * Matchmaking, backed by Redis (spec: 2026-07-15-realtime-redis-scale-design.md).
 * The queue (per mode), the "which queue is this user in" pointer, and the
 * bot-fill fallback timer are all externalized so any instance in the cluster
 * can serve mm:join/mm:leave and the bot-fill job fires exactly once
 * cluster-wide (jobs.ts). The SERVER decides pairings, colors and settings; the
 * client only asks to join/leave a queue.
 */

/** Only these modes are matched here; PRIVATE/LOCAL/AI use other flows. */
type QueueMode = "CASUAL" | "RANKED";

/** A player's preferred side. "either" = no preference (matches anyone). */
type ColorPref = "red" | "blue" | "either";
function asColorPref(x: unknown): ColorPref {
  return x === "red" || x === "blue" ? x : "either";
}

function isQueueMode(x: unknown): x is QueueMode {
  return x === "CASUAL" || x === "RANKED";
}

/** Remove a user from every queue (and cancel any pending bot-fill job).
 *  Returns true if they were in one. */
export async function leaveAllQueues(userId: string): Promise<boolean> {
  await cancelJob("bot-fill", userId); // no longer waiting → drop any pending bot fallback
  const mode = await getQueuedIn(userId);
  if (!mode) return false;
  await queueRemove(mode, userId);
  await setQueuedIn(userId, null);
  return true;
}

/**
 * The user's CURRENT live socket (any of them if multiple), resolved via the
 * `presence:<userId>` room every socket joins (presence.ts) — so a reconnect
 * between mm:join and pairing doesn't leave us holding a stale socketId. Returns
 * null when the user has no connected socket. Prefers a socket that is NOT
 * already in an active match room, but any live socket is fine for matchmaking.
 */
async function currentSocketForUser(io: IOServer, userId: string) {
  const sockets = await io.in(`presence:${userId}`).fetchSockets();
  return sockets[0] ?? null;
}

/**
 * Deliver a matchmaking result to EVERY live socket the user has, not just one.
 *
 * OWNER-REPORTED (2026-08-03, reproduced on web AND Android): "searching for a
 * casual/ranked match, no bot ever appears". The player was in fact matched
 * every time — their own match history showed three CASUAL games against bots
 * (kanlaon, diwata, panday), each with moves=1 (the bot's opening move) and then
 * `reason: "abandon"` because the human never moved. They never moved because
 * they never SAW the match: `mm:found` was emitted to a single socket picked as
 * `sockets[0]` out of their presence room, and that account had NINE sockets in
 * it (accumulated across reconnects and browser tabs). Picking arbitrarily meant
 * usually picking a dead one, so the event went nowhere while a real match ran
 * without them — and the queue entry was already consumed, so the player sat on
 * "Finding opponent" forever with nothing left server-side to show for it.
 *
 * `sockets[0]` was never a safe choice: fetchSockets() has no ordering contract,
 * a presence room legitimately holds several sockets (two tabs, phone + web, a
 * reconnect whose predecessor has not timed out yet), and socket.io only prunes
 * a dead member on its own timeout — which is far longer than the 7-20s bot-fill
 * window. Emitting to the ROOM is both correct and simpler: every live socket is
 * told, dead members are a no-op, and it matches how the rest of the realtime
 * layer already addresses a user (`io.to('presence:<id>')` in match.ts and
 * damath-rooms.ts).
 *
 * socketsJoin likewise moves ALL of the user's sockets into the match room, so a
 * second tab is not left outside the match loop and unable to receive moves.
 */
async function deliverToUser(io: IOServer, userId: string, matchId: string, event: string, payload: unknown): Promise<void> {
  const room = `presence:${userId}`;
  await io.in(room).socketsJoin(matchId);
  io.to(room).emit(event, payload);
}

/**
 * Tell a user their matchmaking attempt was dropped (their socket went away
 * before pairing), so the client leaves the "Finding opponent…" state instead
 * of spinning forever. Targets the presence room so it reaches whatever socket
 * they currently have; a truly-offline user simply receives nothing.
 */
async function notifyDropped(io: IOServer, userId: string): Promise<void> {
  await leaveAllQueues(userId);
  io.to(`presence:${userId}`).emit(EV.mmCancelled, { reason: "dropped" });
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
 * EV.mmFound to each with their own color. Runs until fewer than 2 remain
 * (queuePopPair returns null — the Lua script only pops when the queue holds
 * at least 2 entries).
 */
async function tryMatch(io: IOServer, mode: QueueMode): Promise<void> {
  while (true) {
    const pair = await queuePopPair(mode);
    if (!pair) break;
    const [a, b] = pair;

    // Resolve each player's CURRENT live socket by userId — NOT the socketId
    // captured at mm:join. Mobile sockets reconnect routinely (network changes,
    // the polling→websocket upgrade), so the stored socketId is frequently stale
    // by pairing time. Using the presence room (`presence:<userId>`, joined by
    // every socket in presence.ts) gives the user's real current socket, so a
    // reconnect between join and pairing no longer strands them. (Bug: the old
    // code looked up the stale socketId, found it dead, and SILENTLY DROPPED that
    // player from the queue with no signal → "stuck on Finding opponent forever".)
    const sa = await currentSocketForUser(io, a.userId);
    const sb = await currentSocketForUser(io, b.userId);
    if (!sa && !sb) {
      // Both genuinely gone — tell each (harmless if truly offline) and move on.
      await notifyDropped(io, a.userId);
      await notifyDropped(io, b.userId);
      continue;
    }
    if (!sa) {
      // a is gone: requeue b (still searching) and tell a it was dropped so its
      // client can leave the "searching" state instead of spinning forever.
      await requeueFront(mode, b);
      await notifyDropped(io, a.userId);
      continue;
    }
    if (!sb) {
      await requeueFront(mode, a);
      await notifyDropped(io, b.userId);
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
      await requeueFront(mode, b);
      await requeueFront(mode, a);
      throw e;
    }

    // Seed authoritative game state in Redis and register the match loop room.
    await createLiveMatch(matchId, redId, blueId, mode, settings);

    const [ua, ub] = await Promise.all([publicUser(a.userId), publicUser(b.userId)]);

    const colorOf = (uid: string): PieceColor => (uid === redId ? "red" : "blue");

    // Opponent's real device (v3 delta, Row 4-6: "Playing on {device}" on the
    // Match Found reveal), captured from their handshake User-Agent at connect
    // time (see classifyDevice in ./index.ts). Default to "web" if somehow unset.
    const deviceA = (sa.data.device as ClientDevice | undefined) ?? "web";
    const deviceB = (sb.data.device as ClientDevice | undefined) ?? "web";

    // Join + notify EVERY socket each player has, not just the one fetchSockets
    // happened to return first — see deliverToUser. sa/sb above are still the
    // right liveness check and the right place to read `data.device`; they are
    // simply not a safe delivery target.
    await deliverToUser(io, a.userId, matchId, EV.mmFound, {
      matchId,
      opponent: ub ? { ...ub, device: deviceB } : ub,
      yourColor: colorOf(a.userId),
      settings,
    });
    await deliverToUser(io, b.userId, matchId, EV.mmFound, {
      matchId,
      opponent: ua ? { ...ua, device: deviceA } : ua,
      yourColor: colorOf(b.userId),
      settings,
    });
  }
}

async function requeueFront(mode: QueueMode, w: QueueEntry): Promise<void> {
  await queueUnshift(mode, w);
  await setQueuedIn(w.userId, mode);
}

/**
 * Fill an empty queue with a highly-skilled BOT after the grace window. Picks a
 * seeded bot user closest to the player's trophy tier (so it reads as a fair,
 * real-looking opponent — no "BOT" label), creates a real Match against it, and
 * hands off to the live match loop. The server plays the bot's turns with the
 * engine (see match.ts maybePlayBotMove). Trophies/gold settle normally for the
 * human; the bot user's stats move too but are never surfaced.
 */
async function startBotMatch(io: IOServer, userId: string, mode: QueueMode, colorPref: ColorPref): Promise<void> {
  // Resolve the user's CURRENT socket by userId (not a stored socketId) so a
  // reconnect during the 7-20s bot-fill wait doesn't make the fill silently fail
  // and strand the player on "Finding opponent" (same stale-socketId class of
  // bug the human-pairing path had).
  const socket = await currentSocketForUser(io, userId);
  if (!socket) {
    console.warn(`[matchmaking] bot-fill skipped: no live socket for ${userId} (${mode})`);
    await leaveAllQueues(userId);
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
  if (bots.length === 0) {
    // Nothing to fill with (bots not seeded / renamed). Leave the player queued
    // rather than dropping them, but say so — this used to fail completely
    // silently, which is exactly the state that made this bug undiagnosable.
    console.error("[matchmaking] bot-fill impossible: no seeded bot users match BOT_USERNAMES");
    return;
  }
  const nearest = [...bots]
    .sort((a, b) => Math.abs(a.trophies - myTrophies) - Math.abs(b.trophies - myTrophies))
    .slice(0, 3);
  const bot = nearest[Math.floor(Math.random() * nearest.length)];

  // Pull the human out of the queue (they're about to be matched).
  await leaveAllQueues(userId);

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

  await createLiveMatch(matchId, redId, blueId, mode, settings, botColor);

  const opponent = await publicUser(bot.id);
  // Bots are deliberately presented as real opponents (existing owner-approved
  // disguise design — no "BOT" label anywhere). Riding that same design here:
  // give the bot a plausible device at random rather than a fixed/obviously
  // synthetic value, so the "Playing on {device}" reveal reads the same as a
  // real human opponent's.
  const botDevice: ClientDevice = Math.random() < 0.5 ? "mobile" : "web";
  // Room delivery, not `socket.emit`. This is the exact line the owner's bug
  // came through: the match was created and the bot even played its opening
  // move, but mm:found went to one arbitrarily-chosen socket out of nine and the
  // player never learned they were in a game. See deliverToUser.
  await deliverToUser(io, userId, matchId, EV.mmFound, {
    matchId,
    opponent: opponent ? { ...opponent, device: botDevice } : opponent,
    yourColor: humanIsRed ? "red" : "blue",
    settings,
  });

  // If the bot has the opening move (red), let the server play it.
  maybePlayBotMove(io, matchId);
}

/**
 * The `bot-fill` job handler (cross-instance, exactly-once via jobs.ts). Armed
 * by mm:join after tryMatch leaves the player still queued; re-validates the
 * player is STILL the sole waiter for this mode before botting, since the
 * queue state may have changed on any instance in the interim.
 */
export async function handleBotFill(io: IOServer, payload: Record<string, unknown>): Promise<void> {
  const userId = payload.userId as string;
  const mode = payload.mode as QueueMode;
  const colorPref = payload.colorPref as ColorPref;
  // Re-check we're still the sole waiter for this mode before botting.
  const stillQueued = await getQueuedIn(userId);
  if (stillQueued !== mode) {
    // The player left / was paired / was dequeued in the interim. Benign on its
    // own, but log it: an unexplained run of these is the signature of the
    // teardown bug this path just had (a stray socket dropping wiped the queue).
    console.log(`[matchmaking] bot-fill stood down for ${userId}: queued=${stillQueued ?? "none"} expected=${mode}`);
    return;
  }
  console.log(`[matchmaking] bot-fill firing for ${userId} (${mode})`);
  await startBotMatch(io, userId, mode, colorPref).catch((err) =>
    console.error("[matchmaking] startBotMatch failed", err),
  );
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
    await leaveAllQueues(userId);

    const entry: QueueEntry = { userId, joinedAt: Date.now(), colorPref };
    await queuePush(mode, entry);
    await setQueuedIn(userId, mode);

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
    // highly-skilled bot so the player is never stuck on an empty queue. The
    // job is cluster-wide exactly-once (jobs.ts), so whichever instance is
    // running when it fires handles it — not necessarily this one.
    if ((await getQueuedIn(userId)) === mode) {
      await scheduleJob("bot-fill", userId, botFillDelay(), { userId, mode, colorPref });
    }
  });

  socket.on(EV.mmLeave, async () => {
    const was = await leaveAllQueues(userId);
    if (was) socket.emit(EV.mmCancelled, { reason: "left" });
  });

  socket.on("disconnect", () => {
    // Only drop the queue entry when the user's LAST socket goes.
    //
    // OWNER-REPORTED (2026-08-04, web, RANKED): "no bot ever fills after the
    // 7-20s wait". This handler used to call leaveAllQueues() unconditionally,
    // keyed by userId — so ANY socket closing dequeued the player and cancelled
    // their pending bot-fill job, even while they were still connected on
    // another socket watching "Finding opponent". A user routinely holds more
    // than one (a second tab, phone + web, or a reconnect whose predecessor has
    // not timed out yet — the 2026-08-03 report found NINE on one account), and
    // socket.io only prunes a dead member on its own timeout, which is far
    // longer than the bot-fill window. Nothing re-arms the job and no
    // mm:cancelled is emitted, so the player waits forever.
    //
    // This is the same multi-socket correctness bug the mmFound DELIVERY path
    // had (see deliverToUser) — that fix addressed delivery and left teardown
    // still single-socket, which is why the symptom survived it.
    //
    // By the time "disconnect" fires, socket.io has already removed this socket
    // from its rooms, so the presence room holds exactly the user's OTHER live
    // sockets: a non-null result here means they're still around.
    void (async () => {
      if (await currentSocketForUser(io, userId)) return; // still connected elsewhere
      await leaveAllQueues(userId);
    })().catch((e) => console.error("[matchmaking] disconnect cleanup failed", e));
  });
}
