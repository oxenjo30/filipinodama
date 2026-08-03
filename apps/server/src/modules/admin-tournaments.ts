/**
 * Admin tournament routes — HTTP shell around the core logic in
 * tournaments-core.ts. All routes require ECONOMY (tournaments move gold).
 * Every mutation writes an audit row. The core functions (join/leave/start/
 * report/complete/cancel) already write their own audit rows inside their
 * transaction for their specific action — this module does NOT double-audit
 * those; it only adds audit rows for actions the core doesn't cover itself
 * (create, edit, open), per the design doc's "don't double-audit" note.
 *
 * See docs/superpowers/specs/2026-07-10-tournaments-design.md
 * §"Admin API" for the exact route table this file implements.
 */
import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { ok, err, ApiError } from "../lib/errors.js";
import { requireAdmin } from "../auth/guards.js";
import { audit } from "../lib/audit.js";
import { startTournament, reportResult, completeTournament, cancelTournament } from "./tournaments-core.js";
import { groupStageShape } from "../lib/tournament-bracket.js";

const POWERS_OF_TWO = [2, 4, 8, 16, 32, 64, 128, 256] as const;
const ELIMINATION_FORMATS = new Set(["SINGLE_ELIM", "DOUBLE_ELIM"]);
/** All four tournament formats V2 planned (see
 * docs/superpowers/specs/2026-07-11-tournament-formats-v2.md) are now supported,
 * plus GROUP_DOUBLE_ELIM (docs/superpowers/specs/2026-08-03-ti-group-stage-format-design.md). */
const SUPPORTED_FORMATS = new Set(["SINGLE_ELIM", "ROUND_ROBIN", "SWISS", "DOUBLE_ELIM", "GROUP_DOUBLE_ELIM"]);
const ROUND_ROBIN_MAX_PLAYERS = 16; // match count = n(n-1)/2 grows fast — cap RR at 16
const SWISS_MAX_PLAYERS = 32; // Swiss scales far better than RR (rounds, not n(n-1)/2 matches) — cap at 32
/**
 * GROUP_DOUBLE_ELIM's group stage IS a round robin, so its match count carries
 * the same n(n-1)/2 growth per group — the literal International shape (18
 * players, two groups of nine) is already 94 matches. Cap the TOTAL rather than
 * the player count, because the player count alone does not tell you the cost:
 * 18 players in two groups is 94 matches, but 18 in three groups is 48.
 */
const GROUP_MAX_TOTAL_MATCHES = 120;

const createBody = z
  .object({
    name: z.string().trim().min(1).max(80),
    format: z.enum(["SINGLE_ELIM", "DOUBLE_ELIM", "SWISS", "ROUND_ROBIN", "GROUP_DOUBLE_ELIM"]),
    entryFeeGold: z.number().int().min(0).max(1_000_000),
    prizePoolGold: z.number().int().min(0),
    maxPlayers: z.number().int().min(2),
    minTrophies: z.number().int().min(0).default(0),
    matchMode: z.enum(["CASUAL", "RANKED"]).default("CASUAL"),
    startsAt: z.string().datetime().optional().nullable(),
    // Top-N prize split: 1..maxPlayers non-negative integers summing to
    // prizePoolGold. A 2-tuple (the pre-V2 shape) is just the N=2 case.
    prizeSplitGold: z.array(z.number().int().min(0)).min(1),
    // SWISS ONLY: the number of Swiss rounds. Optional — Start computes
    // ceil(log2(n)) when left unset. Ignored (but harmless) for other formats.
    rounds: z.number().int().min(1).max(20).optional().nullable(),
    // GROUP_DOUBLE_ELIM ONLY: how many round-robin groups, and how many of each
    // group survive into the playoff bracket. Required for that format, ignored
    // for every other (and nulled out on write, so a format change cannot leave
    // a stale shape behind).
    groupCount: z.number().int().min(2).max(16).optional().nullable(),
    qualifiersPerGroup: z.number().int().min(2).max(64).optional().nullable(),
    // READY CHECK (V1.5): seconds a player has to press Ready once their
    // OPPONENT has, before forfeiting the slot. 1 minute .. 1 hour; the schema
    // default (600 = 10 min) applies when the client omits it.
    readyWindowSec: z.number().int().min(60).max(3600).default(600),
    // ORGANISER START TIMER (optional; omit or null = off). Seconds a fixture
    // may sit playable before its no-show clock starts on its own, so a pair
    // who BOTH fail to turn up cannot block their round indefinitely.
    // Bounded below by readyWindowSec-scale values for the same reason: a
    // 60-second start window would forfeit players who are merely slow to open
    // the app.
    startWindowSec: z.number().int().min(300).max(86400).optional().nullable(),
  })
  .superRefine((b, ctx) => {
    if (!SUPPORTED_FORMATS.has(b.format)) {
      ctx.addIssue({ code: "custom", message: "This format is not supported yet", path: ["format"] });
    }
    // Bracket-size validation is format-specific: power-of-two is an
    // ELIMINATION-bracket requirement (SINGLE_ELIM/DOUBLE_ELIM); ROUND_ROBIN
    // and SWISS relax that to any n within their own cap (match/round count
    // grows differently for each, so each gets its own cap).
    if (ELIMINATION_FORMATS.has(b.format)) {
      if (!(POWERS_OF_TWO as readonly number[]).includes(b.maxPlayers)) {
        ctx.addIssue({ code: "custom", message: "maxPlayers must be a power of two in {2,4,8,16,32,64,128,256}", path: ["maxPlayers"] });
      }
    } else if (b.format === "ROUND_ROBIN") {
      if (b.maxPlayers > ROUND_ROBIN_MAX_PLAYERS) {
        ctx.addIssue({ code: "custom", message: `Round robin is capped at ${ROUND_ROBIN_MAX_PLAYERS} players`, path: ["maxPlayers"] });
      }
    } else if (b.format === "SWISS") {
      if (b.maxPlayers > SWISS_MAX_PLAYERS) {
        ctx.addIssue({ code: "custom", message: `Swiss is capped at ${SWISS_MAX_PLAYERS} players`, path: ["maxPlayers"] });
      }
    } else if (b.format === "GROUP_DOUBLE_ELIM") {
      // maxPlayers is deliberately NOT constrained to a power of two here — 18,
      // 12 and 10 are all legal fields. It is the SURVIVOR count that has to be
      // a power of two, which groupStageShape checks.
      if (b.groupCount == null || b.qualifiersPerGroup == null) {
        ctx.addIssue({ code: "custom", message: "This format needs groupCount and qualifiersPerGroup", path: ["groupCount"] });
      } else {
        try {
          // Validated against maxPlayers because this format requires a FULL
          // field to start (see startGroupDoubleElim) — so maxPlayers really is
          // the field size here, unlike every other format.
          const shape = groupStageShape(b.maxPlayers, b.groupCount, b.qualifiersPerGroup);
          if (shape.totalMatches > GROUP_MAX_TOTAL_MATCHES) {
            ctx.addIssue({
              code: "custom",
              message: `That shape is ${shape.totalMatches} matches, over the ${GROUP_MAX_TOTAL_MATCHES} cap — use more groups or fewer players`,
              path: ["groupCount"],
            });
          }
        } catch (e) {
          ctx.addIssue({ code: "custom", message: e instanceof ApiError ? e.message : "Invalid group shape", path: ["groupCount"] });
        }
      }
    }
    if (b.prizeSplitGold.length > b.maxPlayers) {
      ctx.addIssue({ code: "custom", message: "prizeSplitGold cannot pay more placements than maxPlayers", path: ["prizeSplitGold"] });
    }
    if (b.prizeSplitGold.reduce((a, v) => a + v, 0) !== b.prizePoolGold) {
      ctx.addIssue({ code: "custom", message: "prizeSplitGold must sum to prizePoolGold", path: ["prizeSplitGold"] });
    }
  });

const reasonBody = z.object({ reason: z.string().trim().min(1).max(500) });
const reportBody = z.object({
  winnerEntryId: z.string().min(1),
  matchId: z.string().min(1).optional(),
  reason: z.string().trim().min(1).max(500).optional(),
});

/**
 * Group matches for the admin bracket view, keyed by round number — UNCHANGED
 * shape from before DOUBLE_ELIM (`{round: match[]}`), so SINGLE_ELIM/
 * ROUND_ROBIN/SWISS clients need no change. Each match row still carries its
 * own `bracket` field ("W"/"L"/"GF") — DOUBLE_ELIM's round-offset scheme (W
 * rounds 1..k, L rounds 101+, GF 201+; see tournament-bracket.ts's
 * ROUND-OFFSET doc comment) means round numbers never collide ACROSS
 * brackets, so a flat round-keyed map already segregates W/L/GF into
 * distinct round buckets — the client groups by `bracket` client-side when
 * rendering a three-column DE view (see BracketDrawer's `roundsByBracket`).
 */
function bracketByRound(matches: { round: number }[]) {
  const grouped: Record<string, unknown[]> = {};
  for (const m of matches) {
    const key = String(m.round);
    (grouped[key] ??= []).push(m);
  }
  return grouped;
}

export async function adminTournamentsRoutes(app: FastifyInstance) {
  // GET /admin/tournaments?status=&cursor=&limit= — list + 4 header stats
  app.get("/admin/tournaments", { preHandler: requireAdmin("ECONOMY") }, async (req) => {
    const q = z
      .object({
        status: z.enum(["DRAFT", "OPEN", "RUNNING", "COMPLETED", "CANCELLED"]).optional(),
        cursor: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      })
      .parse(req.query);

    const where: Prisma.TournamentWhereInput = q.status ? { status: q.status } : {};
    const rows = await prisma.tournament.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > q.limit;
    const items = hasMore ? rows.slice(0, q.limit) : rows;

    const [liveNow, upcoming, registeredAgg, prizeAgg] = await Promise.all([
      prisma.tournament.count({ where: { status: "RUNNING" } }),
      prisma.tournament.count({ where: { status: "OPEN" } }),
      prisma.tournament.aggregate({ where: { status: { in: ["OPEN", "RUNNING"] } }, _sum: { registeredCount: true } }),
      prisma.tournament.aggregate({ where: { status: { in: ["OPEN", "RUNNING"] } }, _sum: { prizePoolGold: true } }),
    ]);

    return ok({
      items,
      nextCursor: hasMore ? items[items.length - 1]!.id : null,
      stats: {
        liveNow,
        upcoming,
        playersRegistered: registeredAgg._sum.registeredCount ?? 0,
        goldPrizePool: prizeAgg._sum.prizePoolGold ?? 0,
      },
    });
  });

  // GET /admin/tournaments/:id — detail incl. entries (with user) + bracket by round
  app.get<{ Params: { id: string } }>("/admin/tournaments/:id", { preHandler: requireAdmin("ECONOMY") }, async (req) => {
    const t = await prisma.tournament.findUnique({ where: { id: req.params.id } });
    if (!t) throw err.notFound("NO_TOURNAMENT", "Tournament not found");
    const entries = await prisma.tournamentEntry.findMany({
      where: { tournamentId: t.id },
      orderBy: { joinedAt: "asc" },
      include: { user: { select: { id: true, username: true, tag: true, avatarUrl: true, trophies: true } } },
    });
    const matches = await prisma.tournamentMatch.findMany({
      where: { tournamentId: t.id },
      orderBy: [{ round: "asc" }, { slot: "asc" }],
    });

    return ok({ ...t, entries, bracket: bracketByRound(matches) });
  });

  // POST /admin/tournaments — create a DRAFT
  app.post("/admin/tournaments", { preHandler: requireAdmin("ECONOMY") }, async (req, reply) => {
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) {
      const formatIssue = parsed.error.issues.find((i) => i.path[0] === "format");
      if (formatIssue) throw err.badRequest("FORMAT_UNSUPPORTED", "This tournament format is not supported");
      throw err.badRequest("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid request");
    }
    const b = parsed.data;
    const actorId = req.userId!;

    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.tournament.create({
        data: {
          name: b.name,
          format: b.format,
          entryFeeGold: b.entryFeeGold,
          prizePoolGold: b.prizePoolGold,
          prizeSplitGold: b.prizeSplitGold,
          maxPlayers: b.maxPlayers,
          minTrophies: b.minTrophies,
          matchMode: b.matchMode,
          startsAt: b.startsAt ? new Date(b.startsAt) : null,
          rounds: b.format === "SWISS" ? (b.rounds ?? null) : null,
          startWindowSec: b.startWindowSec ?? null,
          groupCount: b.format === "GROUP_DOUBLE_ELIM" ? (b.groupCount ?? null) : null,
          qualifiersPerGroup: b.format === "GROUP_DOUBLE_ELIM" ? (b.qualifiersPerGroup ?? null) : null,
          readyWindowSec: b.readyWindowSec,
          createdById: actorId,
        },
      });
      await audit(tx, {
        actorId,
        action: "tournament.create",
        targetType: "tournament",
        targetId: row.id,
        before: null,
        after: row,
        reason: "admin create",
      });
      return row;
    });

    reply.code(201);
    return ok(created);
  });

  // PATCH /admin/tournaments/:id — edit ONLY while DRAFT
  app.patch<{ Params: { id: string } }>("/admin/tournaments/:id", { preHandler: requireAdmin("ECONOMY") }, async (req) => {
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) {
      const formatIssue = parsed.error.issues.find((i) => i.path[0] === "format");
      if (formatIssue) throw err.badRequest("FORMAT_UNSUPPORTED", "This tournament format is not supported");
      throw err.badRequest("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid request");
    }
    const b = parsed.data;
    const actorId = req.userId!;

    const existing = await prisma.tournament.findUnique({ where: { id: req.params.id } });
    if (!existing) throw err.notFound("NO_TOURNAMENT", "Tournament not found");
    if (existing.status !== "DRAFT") throw err.conflict("NOT_EDITABLE", "Tournament can only be edited while DRAFT");

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.tournament.update({
        where: { id: req.params.id },
        data: {
          name: b.name,
          format: b.format,
          entryFeeGold: b.entryFeeGold,
          prizePoolGold: b.prizePoolGold,
          prizeSplitGold: b.prizeSplitGold,
          maxPlayers: b.maxPlayers,
          minTrophies: b.minTrophies,
          matchMode: b.matchMode,
          startsAt: b.startsAt ? new Date(b.startsAt) : null,
          rounds: b.format === "SWISS" ? (b.rounds ?? null) : null,
          startWindowSec: b.startWindowSec ?? null,
          groupCount: b.format === "GROUP_DOUBLE_ELIM" ? (b.groupCount ?? null) : null,
          qualifiersPerGroup: b.format === "GROUP_DOUBLE_ELIM" ? (b.qualifiersPerGroup ?? null) : null,
          readyWindowSec: b.readyWindowSec,
        },
      });
      await audit(tx, {
        actorId,
        action: "tournament.update",
        targetType: "tournament",
        targetId: row.id,
        before: existing,
        after: row,
        reason: "admin edit",
      });
      return row;
    });

    return ok(updated);
  });

  // POST /admin/tournaments/:id/open — DRAFT -> OPEN
  app.post<{ Params: { id: string } }>("/admin/tournaments/:id/open", { preHandler: requireAdmin("ECONOMY") }, async (req) => {
    const { reason } = reasonBody.parse(req.body);
    const actorId = req.userId!;
    const id = req.params.id;

    const existing = await prisma.tournament.findUnique({ where: { id } });
    if (!existing) throw err.notFound("NO_TOURNAMENT", "Tournament not found");

    const updated = await prisma.$transaction(async (tx) => {
      const flip = await tx.tournament.updateMany({ where: { id, status: "DRAFT" }, data: { status: "OPEN", openedAt: new Date() } });
      if (flip.count === 0) throw err.conflict("BAD_STATE", "Tournament must be DRAFT to open");
      const row = await tx.tournament.findUniqueOrThrow({ where: { id } });
      await audit(tx, {
        actorId,
        action: "tournament.open",
        targetType: "tournament",
        targetId: id,
        before: { status: "DRAFT" },
        after: { status: "OPEN" },
        reason,
      });
      return row;
    });

    return ok(updated);
  });

  // POST /admin/tournaments/:id/start — OPEN -> RUNNING + seed bracket
  app.post<{ Params: { id: string } }>("/admin/tournaments/:id/start", { preHandler: requireAdmin("ECONOMY") }, async (req) => {
    reasonBody.parse(req.body);
    const result = await startTournament(prisma, req.params.id, req.userId!);
    return ok(result);
  });

  // POST /admin/tournaments/:id/matches/:tmId/report — the only advance path
  app.post<{ Params: { id: string; tmId: string } }>(
    "/admin/tournaments/:id/matches/:tmId/report",
    { preHandler: requireAdmin("ECONOMY") },
    async (req) => {
      const b = reportBody.parse(req.body);
      const result = await reportResult(prisma, req.params.id, req.params.tmId, b.winnerEntryId, {
        matchId: b.matchId ?? null,
        reason: b.reason,
        actorId: req.userId!,
      });
      return ok(result);
    },
  );

  // POST /admin/tournaments/:id/complete — pays top-N by final placement
  app.post<{ Params: { id: string } }>("/admin/tournaments/:id/complete", { preHandler: requireAdmin("ECONOMY") }, async (req) => {
    const { reason } = reasonBody.parse(req.body);
    const result = await completeTournament(prisma, req.params.id, req.userId!, reason);
    return ok(result);
  });

  // POST /admin/tournaments/:id/cancel — refunds all
  app.post<{ Params: { id: string } }>("/admin/tournaments/:id/cancel", { preHandler: requireAdmin("ECONOMY") }, async (req) => {
    const { reason } = reasonBody.parse(req.body);
    const result = await cancelTournament(prisma, req.params.id, req.userId!, reason);
    return ok(result);
  });
}
