import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { ok, err } from "../lib/errors.js";
import { requireAdmin } from "../auth/guards.js";
import { audit } from "../lib/audit.js";
import { banUser } from "../lib/sanctions.js";
import { queueMatchAnalysis } from "../lib/anticheat-service.js";

/**
 * Match integrity viewer — /api/admin/matches/*. A strictly READ-ONLY browser
 * over the existing Match model (no mutations, so no audit rows here). Lets a
 * MODERATOR inspect what actually happened in a match: the two sides, the
 * outcome, trophy/gold deltas, timing, and the raw settings + moves JSON.
 *
 * Anti-cheat detection now EXISTS (see lib/anticheat.ts): the routes below
 * replay a finished match against the engine and measure how often each player
 * chose the engine's move in positions where they actually had a choice.
 * Everything the admin UI shows is computed from real moves; nothing is
 * fabricated. Detection produces a case for a human to judge — it never bans on
 * its own.
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
        // Anti-cheat verdicts, so the queue table shows real flag state rather
        // than a placeholder. Cheap: at most two rows per match, indexed.
        analyses: {
          select: { id: true, userId: true, side: true, suspicion: true, engineMatchRate: true, status: true },
        },
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

  // -- Anti-cheat: analysis for one match -----------------------------------
  //
  // READ ONLY. Analysis is produced by a background job, never here: the
  // reference engine costs ~430 ms per decision (measured), so a single match
  // takes ~10-12 s to replay. Computing that inside a request would blow past
  // any timeout and pin a worker per match. If no row exists yet the response
  // says so and the caller can queue one.
  app.get<{ Params: { id: string } }>(
    "/admin/matches/:id/analysis",
    { preHandler: requireAdmin("MODERATOR") },
    async (req) => {
      const match = await prisma.match.findUnique({
        where: { id: req.params.id },
        select: { id: true, startedAt: true, endedAt: true, moves: true },
      });
      if (!match) throw err.notFound("MATCH_NOT_FOUND", "Match not found");

      const analyses = await prisma.matchAnalysis.findMany({
        where: { matchId: match.id },
        include: { reviewedBy: { select: { username: true, tag: true } } },
      });

      // Whole-match seconds per ply. Reported as CONTEXT and never scored: both
      // players share one clock, so it cannot be attributed to either of them.
      // Per-move think time — the signal that would actually catch an engine
      // user — is unrecoverable because stored moves carry no timestamps.
      const dur = durationSec(match.startedAt, match.endedAt);
      const plies = moveCount(match.moves);
      const avgSecPerMove = dur !== null && plies > 0 ? dur / plies : null;

      return ok({
        matchId: match.id,
        analyses,
        analysed: analyses.length > 0,
        finished: match.endedAt !== null,
        moveCount: plies,
        avgSecPerMove,
      });
    }
  );

  // Queue (or re-queue) a match for analysis. Returns immediately; the poller
  // picks it up. Re-queuing the same match replaces the pending job rather
  // than stacking duplicates.
  app.post<{ Params: { id: string } }>(
    "/admin/matches/:id/analysis",
    { preHandler: requireAdmin("MODERATOR") },
    async (req) => {
      const match = await prisma.match.findUnique({
        where: { id: req.params.id },
        select: { id: true, endedAt: true },
      });
      if (!match) throw err.notFound("MATCH_NOT_FOUND", "Match not found");
      if (!match.endedAt) throw err.badRequest("MATCH_UNFINISHED", "Only finished matches can be analysed");
      await queueMatchAnalysis(match.id);
      return ok({ queued: true });
    }
  );

  // -- Anti-cheat: the review queue -----------------------------------------
  app.get("/admin/anticheat/queue", { preHandler: requireAdmin("MODERATOR") }, async (req) => {
    const q = z
      .object({
        status: z.enum(["FLAGGED", "CONFIRMED", "DISMISSED", "CLEAR"]).default("FLAGGED"),
        cursor: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      })
      .parse(req.query);

    const rows = await prisma.matchAnalysis.findMany({
      where: { status: q.status },
      orderBy: [{ suspicion: "desc" }, { computedAt: "desc" }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      include: {
        user: { select: { id: true, username: true, tag: true } },
        reviewedBy: { select: { username: true, tag: true } },
        match: { select: { id: true, mode: true, winner: true, startedAt: true, endedAt: true } },
      },
    });
    const hasMore = rows.length > q.limit;
    const items = hasMore ? rows.slice(0, q.limit) : rows;
    return ok({ items, nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null });
  });

  // -- Anti-cheat: prior signal on a player ---------------------------------
  // The "Priors" tile: what else is on this account. Confirmed cases, still-open
  // flags and player-submitted CHEATING reports are three different kinds of
  // evidence, so they are counted separately rather than summed into one number.
  app.get<{ Params: { userId: string } }>(
    "/admin/anticheat/priors/:userId",
    { preHandler: requireAdmin("MODERATOR") },
    async (req) => {
      const [confirmed, flagged, dismissed, cheatReports] = await Promise.all([
        prisma.matchAnalysis.count({ where: { userId: req.params.userId, status: "CONFIRMED" } }),
        prisma.matchAnalysis.count({ where: { userId: req.params.userId, status: "FLAGGED" } }),
        prisma.matchAnalysis.count({ where: { userId: req.params.userId, status: "DISMISSED" } }),
        prisma.report.count({ where: { accusedId: req.params.userId, reason: "CHEATING" } }),
      ]);
      return ok({ confirmed, flagged, dismissed, cheatReports });
    }
  );

  // -- Anti-cheat: a moderator's decision ------------------------------------
  //
  // Confirming can optionally ban, reusing the same sanction path the reports
  // queue uses: there is one way to ban a player, not two. Detection itself
  // never bans; a human always does.
  app.post<{ Params: { id: string } }>(
    "/admin/anticheat/:id/review",
    { preHandler: requireAdmin("MODERATOR") },
    async (req) => {
      const body = z
        .object({
          decision: z.enum(["CONFIRMED", "DISMISSED"]),
          note: z.string().trim().min(1).max(500),
          banDurationHours: z.number().int().min(0).max(24 * 365).optional(),
        })
        .parse(req.body);

      const row = await prisma.matchAnalysis.findUnique({ where: { id: req.params.id } });
      if (!row) throw err.notFound("ANALYSIS_NOT_FOUND", "Analysis not found");
      if (row.status === "CONFIRMED" || row.status === "DISMISSED") {
        throw err.conflict("ALREADY_REVIEWED", "This case has already been reviewed");
      }
      if (body.decision === "DISMISSED" && body.banDurationHours !== undefined) {
        throw err.badRequest("BAN_ON_DISMISS", "Cannot ban while dismissing a case");
      }

      await prisma.$transaction(async (tx) => {
        await tx.matchAnalysis.update({
          where: { id: row.id },
          data: {
            status: body.decision,
            reviewedById: req.userId!,
            reviewedAt: new Date(),
            reviewNote: body.note,
          },
        });
        if (body.decision === "CONFIRMED" && body.banDurationHours !== undefined) {
          await banUser(tx, {
            targetId: row.userId,
            actorId: req.userId!,
            durationHours: body.banDurationHours,
            reason: body.note,
          });
        }
        await audit(tx, {
          actorId: req.userId!,
          action: "anticheat." + body.decision.toLowerCase(),
          targetType: "matchAnalysis",
          targetId: row.id,
          before: { status: row.status, suspicion: row.suspicion },
          after: { status: body.decision, banned: body.banDurationHours !== undefined },
          reason: body.note,
        });
      });

      return ok({ status: body.decision });
    }
  );
}
