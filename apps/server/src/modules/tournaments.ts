/**
 * Player-facing tournament routes — browse, join, leave. requireAuth on all
 * routes; join is additionally guest-blocked (guests can't hold gold
 * meaningfully / farmable — mirrors reports.ts's GUEST_CANNOT_REPORT block).
 *
 * join/leave delegate entirely to tournaments-core.ts, which already owns
 * every money-invariant + audit row for those two actions — this module adds
 * no additional audit call (would double-audit).
 *
 * See docs/superpowers/specs/2026-07-10-tournaments-design.md
 * §"Player-facing API" for the exact route table this file implements.
 */
import type { FastifyInstance } from "fastify";
import { prisma } from "../db/client.js";
import { ok, err } from "../lib/errors.js";
import { requireAuth } from "../auth/guards.js";
import { joinTournament, leaveTournament } from "./tournaments-core.js";

export async function tournamentsRoutes(app: FastifyInstance) {
  // GET /api/tournaments?status=OPEN|RUNNING — public list of joinable/live tournaments
  app.get("/tournaments", { preHandler: requireAuth }, async (req) => {
    const q = req.query as { status?: string };
    const status = q.status === "OPEN" || q.status === "RUNNING" ? q.status : undefined;
    const userId = req.userId!;

    const rows = await prisma.tournament.findMany({
      where: status ? { status } : { status: { in: ["OPEN", "RUNNING"] } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });

    const myEntries = await prisma.tournamentEntry.findMany({
      where: { tournamentId: { in: rows.map((r) => r.id) }, userId },
      select: { tournamentId: true },
    });
    const joinedSet = new Set(myEntries.map((e) => e.tournamentId));

    const items = rows.map((t) => ({
      id: t.id,
      name: t.name,
      format: t.format,
      status: t.status,
      entryFeeGold: t.entryFeeGold,
      prizePoolGold: t.prizePoolGold,
      maxPlayers: t.maxPlayers,
      registered: t.registeredCount,
      startsAt: t.startsAt,
      minTrophies: t.minTrophies,
      joined: joinedSet.has(t.id),
    }));

    return ok({ items });
  });

  // GET /api/tournaments/:id — detail + bracket + myEntry
  app.get<{ Params: { id: string } }>("/tournaments/:id", { preHandler: requireAuth }, async (req) => {
    const t = await prisma.tournament.findUnique({ where: { id: req.params.id } });
    if (!t) throw err.notFound("NO_TOURNAMENT", "Tournament not found");

    const entries = await prisma.tournamentEntry.findMany({
      where: { tournamentId: t.id },
      orderBy: { joinedAt: "asc" },
      include: { user: { select: { id: true, username: true, tag: true, avatarUrl: true } } },
    });
    const matches = await prisma.tournamentMatch.findMany({
      where: { tournamentId: t.id },
      orderBy: [{ round: "asc" }, { slot: "asc" }],
    });
    const grouped: Record<string, unknown[]> = {};
    for (const m of matches) {
      const key = String(m.round);
      (grouped[key] ??= []).push(m);
    }

    const myEntry = entries.find((e) => e.userId === req.userId) ?? null;

    return ok({
      ...t,
      entries,
      bracket: grouped,
      myEntry: myEntry
        ? { id: myEntry.id, seed: myEntry.seed, eliminated: myEntry.eliminated, placement: myEntry.placement }
        : null,
    });
  });

  // POST /api/tournaments/:id/join — guest-blocked
  app.post<{ Params: { id: string } }>("/tournaments/:id/join", { preHandler: requireAuth }, async (req, reply) => {
    if (req.isGuest) throw err.forbidden("GUEST_CANNOT_JOIN", "Guests can't join tournaments");
    const entry = await joinTournament(prisma, req.params.id, req.userId!);
    reply.code(201);
    return ok(entry);
  });

  // POST /api/tournaments/:id/leave — only while OPEN
  app.post<{ Params: { id: string } }>("/tournaments/:id/leave", { preHandler: requireAuth }, async (req) => {
    await leaveTournament(prisma, req.params.id, req.userId!);
    return ok({ left: true });
  });
}
