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
import { ok, err } from "../lib/errors.js";
import { requireAdmin } from "../auth/guards.js";
import { audit } from "../lib/audit.js";
import { startTournament, reportResult, completeTournament, cancelTournament } from "./tournaments-core.js";

const POWERS_OF_TWO = [2, 4, 8, 16, 32, 64, 128, 256] as const;
const ELIMINATION_FORMATS = new Set(["SINGLE_ELIM", "DOUBLE_ELIM"]);
/** Formats supported end-to-end THIS stage. DOUBLE_ELIM stays rejected until
 * its own stage ships (see docs/superpowers/specs/2026-07-11-tournament-formats-v2.md). */
const SUPPORTED_FORMATS = new Set(["SINGLE_ELIM", "ROUND_ROBIN", "SWISS"]);
const ROUND_ROBIN_MAX_PLAYERS = 16; // match count = n(n-1)/2 grows fast — cap RR at 16
const SWISS_MAX_PLAYERS = 32; // Swiss scales far better than RR (rounds, not n(n-1)/2 matches) — cap at 32

const createBody = z
  .object({
    name: z.string().trim().min(1).max(80),
    format: z.enum(["SINGLE_ELIM", "DOUBLE_ELIM", "SWISS", "ROUND_ROBIN"]),
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
      if (formatIssue) throw err.badRequest("FORMAT_UNSUPPORTED", "Only SINGLE_ELIM, ROUND_ROBIN, and SWISS are supported right now");
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
      if (formatIssue) throw err.badRequest("FORMAT_UNSUPPORTED", "Only SINGLE_ELIM, ROUND_ROBIN, and SWISS are supported right now");
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
