import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { moveSchema } from "@dama/shared";
import type { MatchMode, Prisma } from "@prisma/client";
import { prisma } from "../db/client.js";
import { ok, err } from "../lib/errors.js";
import { requireAuth } from "../auth/guards.js";
import { spectatorCount } from "../realtime/match.js";
import { listOpenRooms } from "../realtime/rooms.js";

const matchQuerySchema = z.object({
  userId: z.string().optional(),
  mode: z.enum(["AI", "CASUAL", "RANKED", "PRIVATE", "LOCAL"]).optional(),
  // filter by result relative to the requested userId: win | loss | draw
  result: z.enum(["win", "loss", "draw"]).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// POST /api/matches/local — client-reported finished offline game. Offline games
// never award ranked currency, so we don't accept trophy/gold deltas.
//
// `mode` accepts only the two offline kinds: LOCAL (pass-and-play) and AI. It is
// deliberately NOT free-form — a client must never be able to write a CASUAL or
// RANKED row through this route, which is unauthenticated as to outcome.
// `aiDifficulty` is required for AI and rejected otherwise, and is persisted into
// settings so per-difficulty records ("12W on Hard") can be derived.
const localMatchSchema = z.object({
  mode: z.enum(["LOCAL", "AI"]).default("LOCAL"),
  aiDifficulty: z.enum(["easy", "normal", "hard"]).optional(),
  settings: z.object({
    forcedMaxCapture: z.boolean(),
    drawMoveLimit: z.number().int().positive(),
    moveTimerSec: z.number().int().positive().optional(),
  }),
  moves: z.array(moveSchema),
  winner: z.enum(["red", "blue", "draw"]).nullable().optional(),
  reason: z.string().max(40).optional(),
  startedAt: z.coerce.date().optional(),
  endedAt: z.coerce.date().optional(),
});

const playerSelect = {
  select: { id: true, username: true, displayName: true, tag: true, avatarUrl: true, frameId: true, rankTier: true, trophies: true },
} as const;

/**
 * Capture tally per side, derived from moves[]. Red moves first, so red owns the
 * even-indexed plies and blue the odd ones (mirrors the prototype's redCap/blueCap).
 */
function captureCounts(moves: unknown): { redCaptures: number; blueCaptures: number } {
  let redCaptures = 0;
  let blueCaptures = 0;
  if (Array.isArray(moves)) {
    moves.forEach((mv, i) => {
      const caps = (mv && typeof mv === "object" && Array.isArray((mv as any).captures))
        ? (mv as any).captures.length
        : 0;
      if (i % 2 === 0) redCaptures += caps;
      else blueCaptures += caps;
    });
  }
  return { redCaptures, blueCaptures };
}

function serializeMatch(m: any) {
  const { redCaptures, blueCaptures } = captureCounts(m.moves);
  return {
    id: m.id,
    mode: m.mode,
    settings: m.settings,
    winner: m.winner,
    reason: m.reason,
    red: m.red ?? null,
    blue: m.blue ?? null,
    redTrophyDelta: m.redTrophyDelta,
    blueTrophyDelta: m.blueTrophyDelta,
    goldReward: m.goldReward,
    redCaptures,
    blueCaptures,
    moveCount: Array.isArray(m.moves) ? m.moves.length : 0,
    startedAt: m.startedAt,
    endedAt: m.endedAt,
  };
}

export async function matchRoutes(app: FastifyInstance) {
  // GET /api/matches?userId=&mode=&result= — paginated match history
  app.get("/matches", { preHandler: requireAuth }, async (req) => {
    const q = matchQuerySchema.parse(req.query);
    const forUserId = q.userId ?? req.userId!;

    const where: Prisma.MatchWhereInput = {
      OR: [{ redId: forUserId }, { blueId: forUserId }],
      ...(q.mode ? { mode: q.mode as MatchMode } : {}),
    };

    // result filter is relative to forUserId's side (red/blue).
    if (q.result === "draw") {
      where.winner = "draw";
    } else if (q.result === "win") {
      where.OR = [
        { redId: forUserId, winner: "red" },
        { blueId: forUserId, winner: "blue" },
      ];
      if (q.mode) where.mode = q.mode as MatchMode;
    } else if (q.result === "loss") {
      where.OR = [
        { redId: forUserId, winner: "blue" },
        { blueId: forUserId, winner: "red" },
      ];
      if (q.mode) where.mode = q.mode as MatchMode;
    }

    const rows = await prisma.match.findMany({
      where,
      orderBy: { startedAt: "desc" },
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      include: { red: playerSelect, blue: playerSelect },
    });
    const hasMore = rows.length > q.limit;
    const items = hasMore ? rows.slice(0, q.limit) : rows;
    return ok({
      items: items.map(serializeMatch),
      nextCursor: hasMore ? items[items.length - 1]!.id : null,
    });
  });

  // GET /api/matches/active — the caller's current in-progress match (endedAt
  // null), if any, so the Home "Continue Playing" card can resume it. Online
  // matches are server-authoritative + in-memory; the Match row exists with
  // endedAt null while live, so this is an honest "you have a game going" signal.
  //
  // We DON'T surface matches that can't actually be resumed:
  //   • vs a BOT — bot matches live only in the in-memory `live` map, so a server
  //     restart wipes them while the DB row stays open (endedAt null). Resuming
  //     one hits "no-such-match" → a dead card. Never advertise those.
  //   • STALE — a human match row left open long past any real session is almost
  //     certainly orphaned (crash/restart before the end was written). Cap it.
  app.get("/matches/active", { preHandler: requireAuth }, async (req) => {
    const me = req.userId!;
    const STALE_MS = 6 * 60 * 60 * 1000; // 6h — well beyond any real live game
    const m = await prisma.match.findFirst({
      where: {
        endedAt: null,
        mode: { in: ["CASUAL", "RANKED", "PRIVATE"] },
        startedAt: { gte: new Date(Date.now() - STALE_MS) },
        OR: [{ redId: me }, { blueId: me }],
        // Bot matches ARE included. The old exclusion was written when a bot
        // game lived only in an in-process Map and genuinely could not survive a
        // restart, so advertising one risked a dead "Continue Playing" card.
        // Since the Redis migration (582e458) live matches are durable in
        // rt:match:<id>, so a bot game is exactly as resumable as a human one —
        // and hiding them meant this endpoint answered "you have no game" to a
        // player who was in one, which is the question OnlineMatchPage asks on
        // mount. If the Redis state HAS expired, resuming emits match:illegal
        // with reason "no-such-match", which the client already handles by
        // ending the match cleanly rather than hanging.
      },
      orderBy: { startedAt: "desc" },
      include: { red: playerSelect, blue: playerSelect },
    });
    return ok({ match: m ? serializeMatch(m) : null });
  });

  // GET /api/matches/live — currently-live, watchable human-vs-human matches for
  // the Watch / Spectate page. "Watchable" mirrors /matches/active's own-match
  // rules (not ended, recent, no bot seat) but is NOT scoped to the caller — it's
  // every live match anyone could spectate. Ordered newest-first, capped so the
  // grid stays small.
  //
  // Two additions layered on top of the plain match rows:
  //   • viewers — the REAL spectator count from the realtime layer (match.ts),
  //     never fabricated/seeded. 0 is a legitimate value (no one is watching).
  //   • open private rooms — a room that's spectatable (live match, or an
  //     unstarted lobby with a guest already seated) is unshifted to the TOP of
  //     `items` as a synthetic entry (id "room-<code>") so a shareable room can
  //     be discovered without the code. A room's own match (once started) is a
  //     normal Match row too — excluded from the plain listing below so it
  //     isn't shown twice.
  app.get("/matches/live", { preHandler: requireAuth }, async (_req) => {
    const STALE_MS = 6 * 60 * 60 * 1000; // 6h — matches this old are effectively dead/orphaned
    const openRooms = await listOpenRooms();
    const roomMatchIds = new Set(openRooms.map((r) => r.matchId).filter((id): id is string => !!id));

    const rows = await prisma.match.findMany({
      where: {
        endedAt: null,
        startedAt: { gte: new Date(Date.now() - STALE_MS) },
        redId: { not: null },
        blueId: { not: null },
        // Neither side may be a bot — bot games aren't real spectator content.
        // `isNot` (null passes) rather than `is`, matching /matches/active.
        red: { isNot: { isBot: true } },
        blue: { isNot: { isBot: true } },
        ...(roomMatchIds.size > 0 ? { id: { notIn: [...roomMatchIds] } } : {}),
      },
      orderBy: { startedAt: "desc" },
      take: 30,
      include: { red: playerSelect, blue: playerSelect },
    });
    const matchItems = await Promise.all(
      rows.map(async (m) => ({ ...serializeMatch(m), viewers: await spectatorCount(m.id) })),
    );

    // Started rooms need their real moveCount + startedAt — a lightweight
    // second lookup (excluded from `rows` above so it's never double-fetched
    // with the full player includes it doesn't need here).
    const startedRoomIds = [...roomMatchIds];
    const startedRoomMatches = startedRoomIds.length
      ? await prisma.match.findMany({
          where: { id: { in: startedRoomIds } },
          select: { id: true, moves: true, startedAt: true },
        })
      : [];
    const roomMatchById = new Map(startedRoomMatches.map((m) => [m.id, m]));

    // Room host/guest cache real displayName/avatar/tag but not username/trophies
    // (never fetched for the lobby UI) — batch-fetch those so a room card's
    // players carry the same real fields as a normal match card.
    const roomUserIds = [...new Set(openRooms.flatMap((r) => [r.host.userId, ...(r.guest ? [r.guest.userId] : [])]))];
    const roomUsers = roomUserIds.length
      ? await prisma.user.findMany({ where: { id: { in: roomUserIds } }, select: { id: true, username: true, trophies: true } })
      : [];
    const roomUserById = new Map(roomUsers.map((u) => [u.id, u]));
    const roomPlayer = (m: { userId: string; displayName: string; avatarUrl: string | null; tag: string }) => ({
      id: m.userId,
      username: roomUserById.get(m.userId)?.username ?? m.displayName,
      displayName: m.displayName,
      tag: m.tag,
      avatarUrl: m.avatarUrl,
      trophies: roomUserById.get(m.userId)?.trophies ?? 0,
    });

    // Synthetic room entries — always unshifted to the top (listOpenRooms()'s
    // natural insertion order is fine; there are only ever a handful at once).
    const roomItems = openRooms.map((r) => {
      const rm = r.matchId ? roomMatchById.get(r.matchId) : undefined;
      return {
        id: `room-${r.code}`,
        room: true as const,
        code: r.code,
        mode: r.mode,
        red: roomPlayer(r.host),
        blue: r.guest ? roomPlayer(r.guest) : null,
        moveCount: Array.isArray(rm?.moves) ? rm.moves.length : 0,
        startedAt: rm?.startedAt ?? new Date(),
        viewers: r.viewers,
      };
    });

    const items = [...roomItems, ...matchItems];
    return ok({ items, liveCount: items.length });
  });

  // GET /api/matches/:id — full match incl. moves[] for replay
  app.get<{ Params: { id: string } }>("/matches/:id", { preHandler: requireAuth }, async (req) => {
    const m = await prisma.match.findUnique({
      where: { id: req.params.id },
      include: { red: playerSelect, blue: playerSelect },
    });
    if (!m) throw err.notFound("MATCH_NOT_FOUND", "Match not found");
    return ok({ match: { ...serializeMatch(m), moves: m.moves } });
  });

  // GET /api/matches/records — the caller's win/loss/draw tally per mode.
  //
  // This is what the Play tab's Game Modes tickets show ("47W - 31L" on Quick
  // Match, "12W on Hard" on Play vs AI): your standing IN that mode, not a
  // global record. `User` only stores global wins/losses, so it has to come
  // from Match — which is cheap, because `Match.mode` is a first-class enum and
  // the table already carries @@index([mode, endedAt]).
  //
  // Only FINISHED matches count (endedAt not null): an abandoned or in-flight
  // game is not a result. Draws are reported separately rather than folded into
  // losses so the client can render whichever it wants.
  app.get("/matches/records", { preHandler: requireAuth }, async (req) => {
    const userId = req.userId!;

    // One grouped pass over the user's finished matches. groupBy on
    // (mode, winner) plus the red/blue side is not expressible in one Prisma
    // groupBy, so group by mode+winner for each side and fold them together.
    const [asRed, asBlue] = await Promise.all([
      prisma.match.groupBy({
        by: ["mode", "winner"],
        where: { redId: userId, endedAt: { not: null } },
        _count: { _all: true },
      }),
      prisma.match.groupBy({
        by: ["mode", "winner"],
        where: { blueId: userId, endedAt: { not: null } },
        _count: { _all: true },
      }),
    ]);

    const byMode = new Map<string, { wins: number; losses: number; draws: number }>();
    const bump = (mode: string, key: "wins" | "losses" | "draws", n: number) => {
      const row = byMode.get(mode) ?? { wins: 0, losses: 0, draws: 0 };
      row[key] += n;
      byMode.set(mode, row);
    };
    for (const g of asRed) {
      const n = g._count._all;
      if (g.winner === "red") bump(g.mode, "wins", n);
      else if (g.winner === "blue") bump(g.mode, "losses", n);
      else if (g.winner === "draw") bump(g.mode, "draws", n);
    }
    for (const g of asBlue) {
      const n = g._count._all;
      if (g.winner === "blue") bump(g.mode, "wins", n);
      else if (g.winner === "red") bump(g.mode, "losses", n);
      else if (g.winner === "draw") bump(g.mode, "draws", n);
    }

    // AI difficulty lives in settings JSON, which cannot be grouped on in
    // Postgres via Prisma, so tally those rows in memory. AI is offline and
    // client-reported, so the volume here is a player's own history, not a scan.
    const aiRows = await prisma.match.findMany({
      where: { redId: userId, mode: "AI", endedAt: { not: null } },
      select: { winner: true, settings: true },
    });
    const ai: Record<string, { wins: number; losses: number; draws: number }> = {};
    for (const row of aiRows) {
      const raw = (row.settings as { aiDifficulty?: unknown } | null)?.aiDifficulty;
      const difficulty = raw === "easy" || raw === "normal" || raw === "hard" ? raw : "normal";
      const bucket = (ai[difficulty] ??= { wins: 0, losses: 0, draws: 0 });
      // The reporting client always owns the red side on an offline match.
      if (row.winner === "red") bucket.wins += 1;
      else if (row.winner === "blue") bucket.losses += 1;
      else if (row.winner === "draw") bucket.draws += 1;
    }

    return ok({
      modes: Object.fromEntries(byMode),
      ai,
    });
  });

  // POST /api/matches/local — persist a finished LOCAL/offline game.
  // mode is forced to LOCAL; NO trophy/gold is ever awarded here.
  app.post("/matches/local", { preHandler: requireAuth }, async (req) => {
    const input = localMatchSchema.parse(req.body);
    const userId = req.userId!;
    if (input.mode === "AI" && !input.aiDifficulty) {
      throw err.badRequest("AI_DIFFICULTY_REQUIRED", "aiDifficulty is required for AI matches");
    }
    if (input.mode !== "AI" && input.aiDifficulty) {
      throw err.badRequest("AI_DIFFICULTY_NOT_ALLOWED", "aiDifficulty only applies to AI matches");
    }
    const match = await prisma.match.create({
      data: {
        mode: input.mode,
        redId: userId, // the local player owns the record; opponent is offline
        blueId: null,
        settings: {
          ...input.settings,
          ...(input.aiDifficulty ? { aiDifficulty: input.aiDifficulty } : {}),
        } as unknown as Prisma.InputJsonValue,
        moves: input.moves as unknown as Prisma.InputJsonValue,
        winner: input.winner ?? null,
        reason: input.reason ?? null,
        redTrophyDelta: null,
        blueTrophyDelta: null,
        goldReward: 0,
        startedAt: input.startedAt ?? new Date(),
        endedAt: input.endedAt ?? new Date(),
      },
    });
    return ok({ match: { ...serializeMatch(match), moves: match.moves } });
  });
}
