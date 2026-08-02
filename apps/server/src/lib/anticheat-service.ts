import { prisma } from "../db/client.js";
import { analyseMatch, shouldFlag, type SideAnalysis } from "./anticheat.js";
import { scheduleJob } from "../realtime/jobs.js";

/**
 * Persisting side of anti-cheat: load a match, replay it against the engine,
 * and store one MatchAnalysis row per human player.
 *
 * WHY THIS IS A BACKGROUND JOB AND NEVER AN HTTP HANDLER
 * The reference engine is `hard` — a depth-7 negamax whose `applyMove` deep
 * clones state at every node. Measured on this codebase it is ~430 ms PER
 * DECISION, so a normal match costs roughly 10-12 seconds to analyse. That is
 * far past any sane request timeout, and doing it inline would let a moderator
 * opening the queue pin a worker for ten seconds per match.
 *
 * The shallower `normal` engine is ~11 ms/decision and would be trivially
 * cheap, but a shallow reference plays the obvious move — which humans also
 * play — so agreement with it is far less diagnostic. Signal quality is the
 * whole point of the metric, so the depth is kept and the cost is moved off
 * the request path instead.
 */

/** Job type registered with the realtime job poller. */
export const ANTICHEAT_JOB = "anticheat-analyse" as const;

/** Queue a match for analysis. Cheap and idempotent — re-queuing replaces. */
export async function queueMatchAnalysis(matchId: string, delayMs = 0): Promise<void> {
  await scheduleJob(ANTICHEAT_JOB, matchId, delayMs, { matchId });
}

export interface AnalyseResult {
  status: "done" | "skipped" | "error";
  detail?: string;
}

/**
 * Analyse one match and upsert its rows. Safe to call repeatedly.
 *
 * A moderator's decision is never overwritten: once a row is CONFIRMED or
 * DISMISSED, a recompute refreshes the measured numbers but leaves the verdict
 * alone. Bots are skipped entirely — a bot's moves ARE the engine's, so it
 * would sit at 100% forever and bury real cases.
 */
export async function analyseAndStore(matchId: string): Promise<AnalyseResult> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: {
      id: true, moves: true, settings: true, startedAt: true, endedAt: true,
      redId: true, blueId: true,
      red: { select: { isBot: true } },
      blue: { select: { isBot: true } },
    },
  });
  if (!match) return { status: "error", detail: "Match not found" };
  if (!match.endedAt) return { status: "skipped", detail: "Match has not finished" };

  const durationSec = Math.max(0, Math.round((match.endedAt.getTime() - match.startedAt.getTime()) / 1000));
  const result = analyseMatch(match.moves, match.settings, durationSec);
  if (result.error) return { status: "error", detail: result.error };

  const existing = await prisma.matchAnalysis.findMany({ where: { matchId: match.id } });

  const sides: Array<{ side: "red" | "blue"; userId: string | null; isBot: boolean; a: SideAnalysis | null }> = [
    { side: "red", userId: match.redId, isBot: match.red?.isBot ?? false, a: result.red },
    { side: "blue", userId: match.blueId, isBot: match.blue?.isBot ?? false, a: result.blue },
  ];

  let written = 0;
  for (const side of sides) {
    if (!side.userId || side.isBot || !side.a) continue;
    const prior = existing.find((e) => e.userId === side.userId);
    const decided = prior && (prior.status === "CONFIRMED" || prior.status === "DISMISSED");
    const nextStatus = shouldFlag(side.a) ? "FLAGGED" : "CLEAR";

    await prisma.matchAnalysis.upsert({
      where: { matchId_userId: { matchId: match.id, userId: side.userId } },
      create: {
        matchId: match.id,
        userId: side.userId,
        side: side.side,
        moveCount: side.a.moveCount,
        decisionCount: side.a.decisionCount,
        engineMatchCount: side.a.engineMatchCount,
        engineMatchRate: side.a.engineMatchRate,
        suspicion: side.a.suspicion,
        reasons: side.a.reasons,
        status: nextStatus,
      },
      update: {
        side: side.side,
        moveCount: side.a.moveCount,
        decisionCount: side.a.decisionCount,
        engineMatchCount: side.a.engineMatchCount,
        engineMatchRate: side.a.engineMatchRate,
        suspicion: side.a.suspicion,
        reasons: side.a.reasons,
        computedAt: new Date(),
        ...(decided ? {} : { status: nextStatus }),
      },
    });
    written += 1;
  }

  return written > 0
    ? { status: "done" }
    : { status: "skipped", detail: "No human players to analyse (bot or incomplete match)" };
}

/** Job handler shape expected by startJobPoller. */
export async function handleAnticheatJob(payload: Record<string, unknown>): Promise<void> {
  const matchId = typeof payload.matchId === "string" ? payload.matchId : null;
  if (!matchId) return;
  const r = await analyseAndStore(matchId);
  if (r.status === "error") console.warn("[anticheat] analysis failed", matchId, r.detail);
}
