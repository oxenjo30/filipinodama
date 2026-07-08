import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { moveSchema } from "@dama/shared";
import type { MatchMode, Prisma } from "@prisma/client";
import { prisma } from "../db/client.js";
import { ok, err } from "../lib/errors.js";
import { requireAuth } from "../auth/guards.js";

const matchQuerySchema = z.object({
  userId: z.string().optional(),
  mode: z.enum(["AI", "CASUAL", "RANKED", "PRIVATE", "LOCAL"]).optional(),
  // filter by result relative to the requested userId: win | loss | draw
  result: z.enum(["win", "loss", "draw"]).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// POST /api/matches/local — client-reported finished offline game. mode is fixed
// to LOCAL and never awards ranked currency, so we don't accept trophy/gold deltas.
const localMatchSchema = z.object({
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
        // Neither side is a bot — bot games are unresumable after a restart.
        // `isNot` (null passes) rather than `is`, since red/blue are nullable.
        red: { isNot: { isBot: true } },
        blue: { isNot: { isBot: true } },
      },
      orderBy: { startedAt: "desc" },
      include: { red: playerSelect, blue: playerSelect },
    });
    return ok({ match: m ? serializeMatch(m) : null });
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

  // POST /api/matches/local — persist a finished LOCAL/offline game.
  // mode is forced to LOCAL; NO trophy/gold is ever awarded here.
  app.post("/matches/local", { preHandler: requireAuth }, async (req) => {
    const input = localMatchSchema.parse(req.body);
    const userId = req.userId!;
    const match = await prisma.match.create({
      data: {
        mode: "LOCAL",
        redId: userId, // the local player owns the record; opponent is offline
        blueId: null,
        settings: input.settings as unknown as Prisma.InputJsonValue,
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
