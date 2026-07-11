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

// ─────────────────────────── Round-robin (pure) ───────────────────────────

/**
 * Round-robin schedule via the classic "circle method": seat seed 1 fixed at
 * the head of the circle, the remaining n-1 (or B-1 for a bye-padded odd n)
 * seeds rotate around it one position per round. Each rotation yields a full
 * round of n/2 (B/2) pairings; n-1 (B-1) rounds cover every unordered pair
 * exactly once.
 *
 * Odd n: padded with a dummy seed `0` (the "bye" seat) so the circle method's
 * even-n mechanics apply unchanged; any pairing where one side is `0` is
 * DROPPED from the output (documented bye — that seed sits out the round,
 * no TournamentMatch row is created for it). This yields the exact n(n-1)/2
 * real pairings for odd n, spread across n rounds (one bye per player).
 *
 * Pure — no I/O. `slot` is 0-based and contiguous per round.
 */
export function roundRobinSchedule(n: number): Array<{ round: number; slot: number; a: number; b: number }> {
  if (n < 2) return [];

  const hasBye = n % 2 === 1;
  const size = hasBye ? n + 1 : n; // circle size (even), seed 0 = the bye seat
  const rounds = size - 1;

  // Circle: position 0 is fixed (seed 1); positions 1..size-1 rotate.
  const rotating: number[] = [];
  for (let s = 2; s <= size; s++) rotating.push(hasBye && s === size ? 0 : s);
  // For odd n, seed `size` (the last rotating slot) is replaced by the bye
  // seat `0` so real seeds are exactly 1..n plus one bye marker.

  const out: Array<{ round: number; slot: number; a: number; b: number }> = [];
  const circle = [1, ...rotating]; // length = size

  for (let r = 0; r < rounds; r++) {
    const pairsThisRound: Array<{ a: number; b: number }> = [];
    for (let i = 0; i < size / 2; i++) {
      const a = circle[i]!;
      const b = circle[size - 1 - i]!;
      if (a === 0 || b === 0) continue; // bye seat — no match this round
      pairsThisRound.push({ a: Math.min(a, b), b: Math.max(a, b) });
    }
    pairsThisRound.forEach((p, slot) => out.push({ round: r + 1, slot, a: p.a, b: p.b }));

    // Rotate: fix index 0, rotate the rest right by one (standard circle method).
    const fixed = circle[0]!;
    const rest = circle.slice(1);
    rest.unshift(rest.pop()!);
    circle.length = 0;
    circle.push(fixed, ...rest);
  }

  return out;
}

export type RoundRobinEntryLike = { id: string; seed: number | null };
export type RoundRobinMatchLike = {
  redEntryId: string;
  blueEntryId: string;
  winnerEntryId: string | null;
  status: string;
};

/**
 * Rank round-robin entries by: (1) wins desc, (2) head-to-head result among
 * entries tied on wins (only decisive when the tied group reduces to a
 * strict linear order — a cycle, e.g. A beat B beat C beat A, is NOT
 * decisive and falls through to the next tiebreak), (3) seed asc as the
 * final, always-stable tiebreak. Pure — no I/O.
 */
export function computeRoundRobinStandings(
  entries: RoundRobinEntryLike[],
  matches: RoundRobinMatchLike[],
): Array<{ entryId: string; placement: number }> {
  const wins = new Map<string, number>();
  for (const e of entries) wins.set(e.id, 0);

  // headToHead.get(a)?.get(b) === true  ⇒  a beat b
  const headToHead = new Map<string, Map<string, boolean>>();
  const record = (winner: string, loser: string) => {
    if (!headToHead.has(winner)) headToHead.set(winner, new Map());
    headToHead.get(winner)!.set(loser, true);
  };

  for (const m of matches) {
    if (m.status !== "done" || !m.winnerEntryId) continue;
    wins.set(m.winnerEntryId, (wins.get(m.winnerEntryId) ?? 0) + 1);
    const loser = m.winnerEntryId === m.redEntryId ? m.blueEntryId : m.redEntryId;
    record(m.winnerEntryId, loser);
  }

  const seedOf = (id: string) => entries.find((e) => e.id === id)?.seed ?? Number.MAX_SAFE_INTEGER;

  // Group entries by win count, then order each group by head-to-head (when
  // decisive) with a seed-asc fallback, then concatenate groups by wins desc.
  const byWins = new Map<number, string[]>();
  for (const e of entries) {
    const w = wins.get(e.id) ?? 0;
    if (!byWins.has(w)) byWins.set(w, []);
    byWins.get(w)!.push(e.id);
  }

  const orderedWinCounts = [...byWins.keys()].sort((a, b) => b - a);
  const ranked: string[] = [];
  for (const w of orderedWinCounts) {
    const group = byWins.get(w)!;
    if (group.length === 1) {
      ranked.push(group[0]!);
      continue;
    }
    ranked.push(...orderGroupByHeadToHead(group, headToHead, seedOf));
  }

  return ranked.map((entryId, i) => ({ entryId, placement: i + 1 }));
}

/**
 * Order a tied-on-wins group by head-to-head record among just that group:
 * each member's within-group wins vs the rest of the group; if that itself
 * produces a further tie (including a full cycle where within-group wins are
 * all equal), fall back to seed ascending. Not a general transitive sort —
 * a single pass of "within-group wins desc, then seed asc" is sufficient for
 * the documented tiebreak rule (decisive H2H only resolves when it linearly
 * separates the group; cycles fall through to seed).
 */
function orderGroupByHeadToHead(
  group: string[],
  headToHead: Map<string, Map<string, boolean>>,
  seedOf: (id: string) => number,
): string[] {
  const withinGroupWins = new Map<string, number>();
  for (const id of group) {
    let w = 0;
    for (const other of group) {
      if (other === id) continue;
      if (headToHead.get(id)?.get(other)) w++;
    }
    withinGroupWins.set(id, w);
  }
  return [...group].sort((a, b) => {
    const wa = withinGroupWins.get(a)!;
    const wb = withinGroupWins.get(b)!;
    if (wa !== wb) return wb - wa;
    return seedOf(a) - seedOf(b);
  });
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

/**
 * Resolve a `ready` ROUND_ROBIN slot: set the winner, mark it done. NO parent
 * advance (RR has no bracket tree) and NO elimination (RR entries only drop
 * out at Complete, via standings — losing one game doesn't end a player's
 * tournament). Runs entirely inside the caller's transaction.
 *
 * Guard/error shape mirrors resolveTournamentSlot exactly (SLOT_NOT_READY /
 * SLOT_DONE / NOT_A_PARTICIPANT) so callers and the route layer don't need a
 * format-specific error contract.
 */
export async function resolveRoundRobinSlot(
  tx: Tx,
  tmId: string,
  winnerEntryId: string,
  matchId?: string | null,
): Promise<{ tournamentId: string; round: number; slot: number }> {
  const slotRow = await tx.tournamentMatch.findUnique({ where: { id: tmId } });
  if (!slotRow) throw err.notFound("NO_TOURNAMENT_MATCH", "Tournament match slot not found");

  if (slotRow.status !== "ready") {
    if (slotRow.status === "done") throw err.conflict("SLOT_DONE", "This slot was already resolved");
    throw err.conflict("SLOT_NOT_READY", "This slot's competitors aren't both filled in yet");
  }

  if (winnerEntryId !== slotRow.redEntryId && winnerEntryId !== slotRow.blueEntryId) {
    throw err.badRequest("NOT_A_PARTICIPANT", "Winner is not a competitor in this slot");
  }

  const claim = await tx.tournamentMatch.updateMany({
    where: { id: tmId, status: "ready" },
    data: { winnerEntryId, matchId: matchId ?? undefined, status: "done", resolvedAt: new Date() },
  });
  if (claim.count === 0) {
    throw err.conflict("SLOT_DONE", "This slot was already resolved");
  }

  return { tournamentId: slotRow.tournamentId, round: slotRow.round, slot: slotRow.slot };
}
