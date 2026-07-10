import type { Prisma } from "@prisma/client";
import { err } from "./errors.js";

/** A Prisma transaction client (what $transaction(cb) hands the callback). */
type Tx = Prisma.TransactionClient;

/**
 * Standard single-elimination seed pairing for a bracket of size B (power of
 * two): seed 1 vs seed B, seed 2 vs seed B-1, … so top seeds meet as late as
 * possible. `n` is the number of REAL registered entries (n ≤ B); any seed
 * number > n does not exist — a pairing where one side is > n is a bye (the
 * present side auto-advances with no match).
 *
 * Pure — no I/O. Returns B/2 pairings, one per round-1 slot, slot indices
 * 0..B/2-1 in the standard bracket order.
 */
export function seedPairings(n: number, B: number): Array<{ slot: number; top: number; bottom: number }> {
  // Standard single-elim seeding order via the classic recursive bracket
  // construction: start with [1,2] and repeatedly mirror-append (2k+1-i) so
  // seed 1 always meets seed B, seed 2 meets B-1, etc. once flattened.
  let order = [1, 2];
  while (order.length < B) {
    const size = order.length * 2;
    const next: number[] = [];
    for (const s of order) {
      next.push(s, size + 1 - s);
    }
    order = next;
  }
  const pairs: Array<{ slot: number; top: number; bottom: number }> = [];
  for (let slot = 0; slot < B / 2; slot++) {
    pairs.push({ slot, top: order[slot * 2]!, bottom: order[slot * 2 + 1]! });
  }
  return pairs;
}

/** Given a round-`round` slot `slot`, the parent slot it feeds in round+1. */
export function parentSlot(round: number, slot: number): { round: number; slot: number } {
  return { round: round + 1, slot: slot >> 1 };
}

export type BracketMatchLike = {
  round: number;
  slot: number;
  redEntryId: string | null;
  blueEntryId: string | null;
  winnerEntryId: string | null;
  status: string;
};

/**
 * Compute display placements from a full/partial set of TournamentMatch rows
 * (pure — no I/O). Champion = the winner of the highest-round `done` match
 * (placement 1). Runner-up = the loser of that same final match (placement 2).
 * Semifinal losers (the round below the final) are labeled placement 3 for
 * display only — single-elim guarantees at most one champion and at most one
 * runner-up, which is the property the V1 payout logic relies on.
 */
export function computePlacements(matches: BracketMatchLike[]): Array<{ entryId: string; placement: number }> {
  const results: Array<{ entryId: string; placement: number }> = [];
  if (matches.length === 0) return results;

  const maxRound = Math.max(...matches.map((m) => m.round));
  const final = matches.find((m) => m.round === maxRound && m.status === "done" && m.winnerEntryId != null);
  if (!final) return results;

  const champion = final.winnerEntryId!;
  const runnerUp = final.redEntryId === champion ? final.blueEntryId : final.redEntryId;
  results.push({ entryId: champion, placement: 1 });
  if (runnerUp) results.push({ entryId: runnerUp, placement: 2 });

  // Semifinal losers (round maxRound-1) → placement 3, display only.
  const semis = matches.filter((m) => m.round === maxRound - 1 && m.status === "done" && m.winnerEntryId != null);
  for (const m of semis) {
    const loser = m.redEntryId === m.winnerEntryId ? m.blueEntryId : m.redEntryId;
    if (loser) results.push({ entryId: loser, placement: 3 });
  }

  return results;
}

/**
 * Resolve a `ready` bracket slot with the reported winner, advance the winner
 * into its parent slot, and mark the loser eliminated. Runs entirely inside
 * the caller's transaction (semi-pure — the only I/O is the passed `tx`).
 *
 * Guard: the atomic claim is `status:"ready"` (NOT `status:{not:"done"}`) — a
 * `pending` slot (one or both competitors not yet filled) must not resolve.
 * Returns `{ ok: true, ... }` on success; throws err.conflict on a lost race
 * or an already-done slot, err.badRequest if the winner isn't a competitor.
 */
export async function resolveTournamentSlot(
  tx: Tx,
  tmId: string,
  winnerEntryId: string,
  matchId?: string | null,
): Promise<{ tournamentId: string; round: number; slot: number; parentReady: boolean }> {
  const slotRow = await tx.tournamentMatch.findUnique({ where: { id: tmId } });
  if (!slotRow) throw err.notFound("NO_TOURNAMENT_MATCH", "Tournament match slot not found");

  // Readiness is checked BEFORE the participant check: a `pending` slot (one
  // or both competitors not yet filled) must report SLOT_NOT_READY even if
  // the caller passed a bogus/non-participant winnerEntryId — "this slot
  // isn't ready to be reported at all" is the more accurate error than "that
  // player isn't in it" when there may be no real participants yet.
  if (slotRow.status !== "ready") {
    if (slotRow.status === "done") throw err.conflict("SLOT_DONE", "This slot was already resolved");
    throw err.conflict("SLOT_NOT_READY", "This slot's competitors aren't both filled in yet");
  }

  if (winnerEntryId !== slotRow.redEntryId && winnerEntryId !== slotRow.blueEntryId) {
    throw err.badRequest("NOT_A_PARTICIPANT", "Winner is not a competitor in this slot");
  }

  // The atomic claim is still the real concurrency guard (status:"ready" in
  // the WHERE clause) — the status check above is a fast pre-read for a
  // clearer error, not a substitute for this atomic update.
  const claim = await tx.tournamentMatch.updateMany({
    where: { id: tmId, status: "ready" },
    data: { winnerEntryId, matchId: matchId ?? undefined, status: "done", resolvedAt: new Date() },
  });
  if (claim.count === 0) {
    // Lost a race since the pre-read above (another report/claim won first).
    throw err.conflict("SLOT_DONE", "This slot was already resolved");
  }

  const loserEntryId = winnerEntryId === slotRow.redEntryId ? slotRow.blueEntryId : slotRow.redEntryId;
  if (loserEntryId) {
    await tx.tournamentEntry.update({ where: { id: loserEntryId }, data: { eliminated: true } });
  }

  // Advance the winner into the parent slot (round+1, slot>>1), if any.
  const parent = parentSlot(slotRow.round, slotRow.slot);
  const parentRow = await tx.tournamentMatch.findUnique({
    where: { tournamentId_round_slot: { tournamentId: slotRow.tournamentId, round: parent.round, slot: parent.slot } },
  });

  let parentReady = false;
  if (parentRow) {
    const isEven = slotRow.slot % 2 === 0;
    const data = isEven ? { redEntryId: winnerEntryId } : { blueEntryId: winnerEntryId };
    const otherSide = isEven ? parentRow.blueEntryId : parentRow.redEntryId;
    parentReady = otherSide != null;
    await tx.tournamentMatch.update({
      where: { id: parentRow.id },
      data: { ...data, ...(parentReady ? { status: "ready" } : {}) },
    });
  }

  return { tournamentId: slotRow.tournamentId, round: slotRow.round, slot: slotRow.slot, parentReady };
}
