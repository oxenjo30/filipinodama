import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { ok, err } from "../lib/errors.js";
import { requireAdmin } from "../auth/guards.js";

/**
 * Match integrity viewer — /api/admin/matches/*. A strictly READ-ONLY browser
 * over the existing Match model (no mutations, so no audit rows here). Lets a
 * MODERATOR inspect what actually happened in a match: the two sides, the
 * outcome, trophy/gold deltas, timing, and the raw settings + moves JSON.
 *
 * NOTE: the anti-cheat DETECTION subsystem (confidence scores, flag reasons,
 * detection signals) is Phase 2 and does NOT exist — none of that is fabricated
 * here. This is an honest match inspector over real data only.
 */

const MATCH_MODES = ["AI", "CASUAL", "RANKED", "PRIVATE", "LOCAL"] as const;

/** Whole seconds between start and end, or null if the match hasn't ended. */
function durationSec(startedAt: Date, endedAt: Date | null): number | null {
  if (!endedAt) return null;
  return Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000));
}

/** Number of entries in the moves Json array (0 for anything non-array). */
function moveCount(moves: unknown): number {
  return Array.isArray(moves) ? moves.length : 0;
}

const playerSelect = { select: { id: true, username: true, tag: true } } as const;

export async function adminMatchesRoutes(app: FastifyInstance) {
  // ── Match list — most recent first, filter by mode + by player, cursor-paged.
  app.get("/admin/matches", { preHandler: requireAdmin("MODERATOR") }, async (req) => {
    const q = z
      .object({
        mode: z.enum(MATCH_MODES).optional(),
        playerId: z.string().optional(),
        cursor: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      })
      .parse(req.query);

    const where: Prisma.MatchWhereInput = {
      ...(q.mode ? { mode: q.mode } : {}),
      ...(q.playerId ? { OR: [{ redId: q.playerId }, { blueId: q.playerId }] } : {}),
    };

    const rows = await prisma.match.findMany({
      where,
      orderBy: { startedAt: "desc" },
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      select: {
        id: true, mode: true, winner: true, reason: true,
        redTrophyDelta: true, blueTrophyDelta: true, goldReward: true,
        startedAt: true, endedAt: true,
        red: playerSelect, blue: playerSelect,
      },
    });
    const hasMore = rows.length > q.limit;
    const items = hasMore ? rows.slice(0, q.limit) : rows;

    return ok({
      items: items.map((m) => ({
        id: m.id,
        mode: m.mode,
        red: m.red,
        blue: m.blue,
        winner: m.winner,
        reason: m.reason,
        redTrophyDelta: m.redTrophyDelta,
        blueTrophyDelta: m.blueTrophyDelta,
        goldReward: m.goldReward,
        startedAt: m.startedAt,
        endedAt: m.endedAt,
        durationSec: durationSec(m.startedAt, m.endedAt),
      })),
      nextCursor: hasMore ? items[items.length - 1]!.id : null,
    });
  });

  // ── Match detail — everything above + settings, move count, and raw moves JSON.
  app.get<{ Params: { id: string } }>("/admin/matches/:id", { preHandler: requireAdmin("MODERATOR") }, async (req) => {
    const m = await prisma.match.findUnique({
      where: { id: req.params.id },
      select: {
        id: true, mode: true, winner: true, reason: true,
        redTrophyDelta: true, blueTrophyDelta: true, goldReward: true,
        startedAt: true, endedAt: true, settings: true, moves: true,
        red: playerSelect, blue: playerSelect,
      },
    });
    if (!m) throw err.notFound("NO_MATCH", "Match not found");

    return ok({
      id: m.id,
      mode: m.mode,
      red: m.red,
      blue: m.blue,
      winner: m.winner,
      reason: m.reason,
      redTrophyDelta: m.redTrophyDelta,
      blueTrophyDelta: m.blueTrophyDelta,
      goldReward: m.goldReward,
      startedAt: m.startedAt,
      endedAt: m.endedAt,
      durationSec: durationSec(m.startedAt, m.endedAt),
      settings: m.settings,
      moveCount: moveCount(m.moves),
      moves: m.moves,
    });
  });
}
