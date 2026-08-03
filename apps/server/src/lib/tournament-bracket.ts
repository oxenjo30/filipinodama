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

// ─────────────────────────────── Swiss (pure) ──────────────────────────────

/**
 * Default number of Swiss rounds for `n` entries: ceil(log2(n)), min 1 — the
 * fewest rounds needed for the field to (in principle) separate into a
 * unique undefeated leader. Admin-settable at create/start; this is only the
 * fallback used when `Tournament.rounds` is left null.
 */
export function defaultSwissRounds(n: number): number {
  return Math.max(1, Math.ceil(Math.log2(Math.max(n, 1))));
}

/**
 * Round-1 Swiss pairing: standard "top half vs bottom half" — seed `i`
 * (1-indexed, i=1..floor(n/2)) plays seed `i + ceil(n/2)`. This spreads the
 * strongest seeds across the field's two halves instead of clustering them
 * (contrast with single-elim's 1-vs-n seeding, which is deliberately
 * top-heavy for a knockout bracket — Swiss round 1 has no elimination
 * stakes, so an even split is the standard convention).
 *
 * Odd n: the last seed (seed n, the one left over once the top/bottom split
 * is taken) sits out with a bye — represented as `{ slot, a: seed, bye: true }`
 * with no `b`. Pure — no I/O.
 */
export function swissPairRound1(seeds: number[]): Array<{ slot: number; a: number; b?: number; bye?: true }> {
  const n = seeds.length;
  const half = Math.ceil(n / 2);
  const out: Array<{ slot: number; a: number; b?: number; bye?: true }> = [];
  let slot = 0;
  for (let i = 0; i < Math.floor(n / 2); i++) {
    out.push({ slot: slot++, a: seeds[i]!, b: seeds[i + half]! });
  }
  if (n % 2 === 1) {
    // The unpaired seed is the one at index `half - 1` (0-indexed) — i.e.
    // the last seed of the top half, which has no bottom-half partner when
    // n is odd (e.g. n=5, half=3: seeds[0..1] pair with seeds[3..4]; seeds[2]
    // is left over).
    out.push({ slot: slot++, a: seeds[half - 1]!, bye: true });
  }
  return out;
}

/** One player's running Swiss score, for `swissPairNextRound`. */
export type SwissStanding = { entryId: string; seed: number; score: number };
export type SwissNextRoundPairing =
  | { aEntryId: string; bEntryId: string }
  | { aEntryId: string; bye: true };

/** Canonical unordered key for a pair of entry ids — order-independent. */
function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Generate the NEXT Swiss round's pairings from the standings-so-far. Core
 * algorithm (standard Swiss pairing):
 *  1. Sort all players by score desc, then seed asc (stable ordering within
 *     a score group — the highest seed in a tied group pairs first).
 *  2. Odd count → pull out ONE bye first: the LOWEST-scored player who has
 *     not already had a bye (scanning from the bottom of the sorted order;
 *     `alreadyByed` tracks who's had one). This keeps byes going to
 *     lower-ranked players and never repeats one.
 *  3. Walk the remaining (even-length) sorted list top to bottom. For each
 *     still-unpaired player, greedily pick the NEAREST still-unpaired
 *     opponent (in sorted order) they have NOT already played
 *     (`playedPairs`, canonical `min|max`-of-ids key). This naturally keeps
 *     pairings within (or as close as possible to) the same score group.
 *  4. Fallback: if a player's only remaining unpaired opponents are all
 *     rematches (can happen late in a group when few players remain), pair
 *     with the nearest one anyway — a forced rematch beats leaving someone
 *     unpaired. (Documented last-resort per the spec.)
 *
 * Pure — no I/O. `alreadyByed` is optional (defaults to empty) so single-bye
 * scenarios don't need to pass it explicitly.
 */
export function swissPairNextRound(
  standings: SwissStanding[],
  playedPairs: Set<string>,
  alreadyByed: Set<string> = new Set(),
): SwissNextRoundPairing[] {
  const sorted = [...standings].sort((a, b) => b.score - a.score || a.seed - b.seed);
  const out: SwissNextRoundPairing[] = [];

  let pool = sorted;
  if (pool.length % 2 === 1) {
    // Lowest-scored player without a prior bye — `sorted` is already score
    // desc/seed asc, so scanning from the bottom and taking the FIRST
    // bye-eligible candidate we meet naturally yields "lowest score, and
    // among ties the lowest seed" (since seed-asc ties sort earlier, i.e.
    // are encountered LATER when scanning from the bottom... so within a
    // tied-score group we must scan that group in seed-ascending order, not
    // take whichever is nearest the very end). Find the minimum score among
    // bye-eligible candidates, then the lowest-seed entry at that score.
    const eligible = pool.filter((p) => !alreadyByed.has(p.entryId));
    const candidates = eligible.length > 0 ? eligible : pool; // fallback: everyone's had a bye already
    const minScore = Math.min(...candidates.map((p) => p.score));
    const lowestGroup = candidates.filter((p) => p.score === minScore);
    const byePlayer = lowestGroup.sort((a, b) => a.seed - b.seed)[0]!;
    out.push({ aEntryId: byePlayer.entryId, bye: true });
    pool = pool.filter((p) => p.entryId !== byePlayer.entryId);
  }

  const unpaired = [...pool];
  while (unpaired.length > 0) {
    const player = unpaired.shift()!;
    // Prefer a non-rematch opponent, nearest in sorted (score/seed) order.
    let opponentIdx = unpaired.findIndex((o) => !playedPairs.has(pairKey(player.entryId, o.entryId)));
    if (opponentIdx === -1) {
      // Last resort: every remaining candidate is a rematch — take the nearest.
      opponentIdx = 0;
    }
    const opponent = unpaired.splice(opponentIdx, 1)[0]!;
    out.push({ aEntryId: player.entryId, bEntryId: opponent.entryId });
  }

  return out;
}

// ─────────────────────────── Double-elim (pure) ───────────────────────────
//
// ROUND-OFFSET SCHEME (documented here once, referenced by tournaments-core.ts):
// TournamentMatch.round/slot is a single (tournamentId,round,slot) unique
// index shared by all three sub-brackets. To avoid a schema change (adding
// `bracket` to the unique constraint) the three sub-brackets are namespaced
// by ROUND NUMBER instead: W rounds are 1..log2(B) (unchanged from
// single-elim), L rounds are offset by +100 (local L-round 1 is stored as
// round 101, local L-round 2 as 102, …), and the Grand Final is 201 (game 1)
// / 202 (game 2, the bracket-reset game). round<100 always means W,
// 100<=round<200 always means L, round>=200 always means GF — a match's
// `bracket` column ("W"/"L"/"GF") is redundant with this but is stored
// anyway for cheap querying/grouping (admin + web bracket views group by it
// directly instead of re-deriving from the round number).
//
// The three constants are DEFINED in @dama/shared (packages/shared/src/bracket.ts)
// because the clients need them to label rounds, and re-exported here so every
// existing importer of this module is unchanged. One definition, no drift: a
// second copy could disagree with the clients' idea of which rounds are losers
// rounds without failing a single test on this side.
export { L_ROUND_OFFSET, GF_ROUND, GF_RESET_ROUND } from "@dama/shared";
import { L_ROUND_OFFSET, GF_ROUND, GF_RESET_ROUND } from "@dama/shared";

/**
 * The losers-bracket ROUND SIZES (match counts) for a winners-bracket of size
 * B (power of two, B>=2). Verified against the standard double-elimination
 * structure for B=4 ([1,1]) and B=8 ([2,2,1,1]); the general form is
 * B/4,B/4,B/8,B/8,B/16,B/16,…,1,1 — `2*(k-1)` rounds where k=log2(B), summing
 * to B-2 total losers-bracket matches (B=2 has zero L-rounds: the single
 * W-R1 loser is trivially already the L-champion with no match needed).
 *
 * Each entry is `{ localRound, matches, dropsFrom }` — `dropsFrom` is the
 * W-round (1-indexed) whose losers fill the "new entrant" side of that L
 * round's matches (round sizes that are a pure consolidation — no new W
 * losers entering — have `dropsFrom: null`). Pure — no I/O.
 */
export function losersBracketStructure(B: number): Array<{ localRound: number; matches: number; dropsFrom: number | null }> {
  const k = Math.log2(B);
  if (!Number.isInteger(k) || B < 2) throw new Error(`losersBracketStructure: B must be a power of two >= 2, got ${B}`);
  if (k === 1) return []; // B=2: no losers bracket at all

  const out: Array<{ localRound: number; matches: number; dropsFrom: number | null }> = [];
  let localRound = 1;
  // W-round 1 losers (B/2 of them) always pair off amongst themselves first
  // (a pure drop round with no prior L-survivors to face).
  out.push({ localRound: localRound++, matches: B / 4, dropsFrom: 1 });
  for (let r = 2; r <= k; r++) {
    // Drop round: L-survivors-so-far (== previous round's match count) face
    // W-round-r's losers 1:1.
    const size = B / Math.pow(2, r);
    out.push({ localRound: localRound++, matches: size, dropsFrom: r });
    // Consolidation round: halve the survivors, UNLESS this was already the
    // last W-round (r===k) — the L-bracket final IS that last drop round;
    // no consolidation follows it.
    if (r < k && size > 1) {
      out.push({ localRound: localRound++, matches: size / 2, dropsFrom: null });
    }
  }
  return out;
}

/**
 * The CANONICAL drop target for the loser of winners-bracket round `wRound`
 * slot `wSlot` (wRound 1-indexed, wSlot 0-indexed, bracket size B). Returns
 * the LOCAL losers-bracket round number (1-indexed, NOT yet +100-offset —
 * callers apply `L_ROUND_OFFSET` themselves) and slot within that round.
 *
 * SIMPLIFIED MAPPING (documented deviation from tournament-standard seeding):
 * a fully standard bracket additionally reverses slot order on certain drop
 * rounds specifically to avoid an immediate rematch of a pairing that just
 * happened in the winners bracket. This implementation uses a plain
 * INDEX-ALIGNED mapping instead (W-round-r loser slot `s` always drops into
 * the L drop-round for round r at slot `s` if that round's match count
 * equals B/2^r, else `s` mapped onto the round's smaller slot count via
 * `s % matches`) — simpler, and it still guarantees every required
 * INVARIANT (valid slot 0..matches-1, no two same-round losers collide on
 * the same slot, every L round fills to exactly one winner) but does NOT
 * guarantee the zero-immediate-rematch property a fully standard bracket
 * has. See losersBracketStructure's doc comment for the round-size derivation
 * this mapping is built on. Pure — no I/O.
 */
export function losersDropSlot(wRound: number, wSlot: number, B: number): { localRound: number; slot: number } {
  const structure = losersBracketStructure(B);
  const target = structure.find((r) => r.dropsFrom === wRound);
  if (!target) throw new Error(`losersDropSlot: no L-round accepts drops from W-round ${wRound} for B=${B}`);
  // W-round-1 losers: B/2 losers pairing off B/4 matches, two losers per
  // match — slot = floor(wSlot/2). W-round-r>=2 losers: exactly one loser
  // per L-drop-round match (matches === B/2^r by construction) — slot =
  // wSlot directly.
  const slot = wRound === 1 ? Math.floor(wSlot / 2) : wSlot;
  if (slot < 0 || slot >= target.matches) {
    throw new Error(`losersDropSlot: computed slot ${slot} out of range for L-round ${target.localRound} (${target.matches} matches)`);
  }
  return { localRound: target.localRound, slot };
}

/** Given a local L-round `lRound` slot `lSlot`, the local L-round + slot its
 * winner advances into — i.e. `parentSlot` but for the losers bracket, which
 * is a single-elimination-shaped tree of its OWN (every L round's match
 * count is either equal to or double the next L round's, per
 * `losersBracketStructure`, so the parent slot is always `slot` unchanged
 * when the round sizes match 1:1 (a drop round feeding the round right
 * after it 1:1) or `slot>>1` when the next round is a consolidation halving
 * the survivor count. Both cases collapse to the same simple rule: within a
 * single L-round-to-L-round step the match count either stays the same or
 * halves, and slot indices are assigned low-to-high in both — so the parent
 * slot is `Math.floor(slot * (nextMatches / thisMatches))`. Pure — no I/O;
 * `structure` is the same array `losersBracketStructure(B)` returns (passed
 * in rather than recomputed so callers that already have it don't redo the
 * work, and so this function has no implicit B-dependence baked in).
 */
export function lWinnerAdvance(
  lRound: number,
  lSlot: number,
  structure: Array<{ localRound: number; matches: number; dropsFrom: number | null }>,
): { localRound: number; slot: number } | null {
  const idx = structure.findIndex((r) => r.localRound === lRound);
  if (idx === -1) throw new Error(`lWinnerAdvance: unknown L-round ${lRound}`);
  if (idx === structure.length - 1) return null; // L-bracket final — winner goes to the Grand Final, not another L slot
  const thisRound = structure[idx]!;
  const nextRound = structure[idx + 1]!;
  const slot = Math.floor((lSlot * nextRound.matches) / thisRound.matches);
  return { localRound: nextRound.localRound, slot };
}

export type DoubleElimMatchLike = {
  bracket: string; // "W" | "L" | "GF"
  round: number; // raw stored round (W: 1..k, L: 101.., GF: 201/202)
  slot: number;
  redEntryId: string | null;
  blueEntryId: string | null;
  winnerEntryId: string | null;
  status: string;
};

/**
 * Compute display placements from a full/partial set of DOUBLE_ELIM
 * TournamentMatch rows (pure — no I/O). Champion = 1 (the Grand Final's
 * ultimate winner — game 2's winner if a reset happened, else game 1's
 * winner). Runner-up = 2 (the Grand Final's ultimate loser — always the
 * L-bracket champion, whether they lost game 1 outright or lost the reset
 * game 2). Everyone else is placed by L-bracket elimination round: LATER L
 * elimination = HIGHER placement (3rd = the L-bracket-final loser, and so on
 * down through each earlier L round, with round-mates who lost in the same L
 * round tied at the same placement number — mirrors single-elim's
 * display-only semifinal-tie convention).
 */
export function computeDoubleElimPlacements(matches: DoubleElimMatchLike[]): Array<{ entryId: string; placement: number }> {
  const results: Array<{ entryId: string; placement: number }> = [];
  if (matches.length === 0) return results;

  const gf2 = matches.find((m) => m.round === GF_RESET_ROUND && m.status === "done" && m.winnerEntryId != null);
  const gf1 = matches.find((m) => m.round === GF_ROUND && m.status === "done" && m.winnerEntryId != null);
  const finalGame = gf2 ?? gf1;
  if (!finalGame) return results; // no champion decided yet

  const champion = finalGame.winnerEntryId!;
  const runnerUp = finalGame.redEntryId === champion ? finalGame.blueEntryId : finalGame.redEntryId;
  results.push({ entryId: champion, placement: 1 });
  if (runnerUp) results.push({ entryId: runnerUp, placement: 2 });

  // Every L-bracket match's loser is eliminated in that match — group losers
  // by L-round, later rounds (higher `round` number, since L rounds are
  // stored in ascending elimination order 101,102,...) get a lower (better)
  // placement number. The L-bracket-FINAL's loser already appears above as
  // the Grand Final's L-side entrant if they reached GF — but the L-final's
  // LOSER (the one eliminated in the L bracket itself, never reaching GF) is
  // placement 3.
  const lMatches = matches.filter((m) => m.bracket === "L" && m.status === "done" && m.winnerEntryId != null);
  const lRoundsDesc = [...new Set(lMatches.map((m) => m.round))].sort((a, b) => b - a);
  let placement = 3;
  for (const r of lRoundsDesc) {
    const losersThisRound = lMatches
      .filter((m) => m.round === r)
      .map((m) => (m.redEntryId === m.winnerEntryId ? m.blueEntryId : m.redEntryId))
      .filter((id): id is string => id != null);
    for (const loser of losersThisRound) {
      if (loser === runnerUp) continue; // already placed 2 (reached GF via the L bracket)
      results.push({ entryId: loser, placement });
    }
    if (losersThisRound.length > 0) placement += losersThisRound.length;
  }

  return results;
}

export type SwissEntryLike = { id: string; seed: number | null };
export type SwissMatchLike = {
  redEntryId: string;
  blueEntryId: string;
  winnerEntryId: string | null;
  status: string;
};

/**
 * Final Swiss standings: score = wins + byes (1 point each, from `matches`
 * plus `byeEntryIds` — the set of entries that received a bye at ANY point,
 * one point each since a Swiss run never grants the same entry two byes).
 * Tiebreak: (1) score desc, (2) Buchholz (sum of each opponent's OWN final
 * score, over every opponent this entry actually played — byes contribute no
 * opponent) desc, (3) seed asc as the final, always-stable tiebreak.
 * Pure — no I/O.
 */
export function computeSwissStandings(
  entries: SwissEntryLike[],
  matches: SwissMatchLike[],
  byeEntryIds: Set<string>,
): Array<{ entryId: string; placement: number }> {
  const score = new Map<string, number>();
  for (const e of entries) score.set(e.id, byeEntryIds.has(e.id) ? 1 : 0);

  const opponents = new Map<string, string[]>();
  const addOpponent = (a: string, b: string) => {
    if (!opponents.has(a)) opponents.set(a, []);
    opponents.get(a)!.push(b);
  };

  for (const m of matches) {
    if (m.status !== "done" || !m.winnerEntryId) continue;
    score.set(m.winnerEntryId, (score.get(m.winnerEntryId) ?? 0) + 1);
    addOpponent(m.redEntryId, m.blueEntryId);
    addOpponent(m.blueEntryId, m.redEntryId);
  }

  const seedOf = (id: string) => entries.find((e) => e.id === id)?.seed ?? Number.MAX_SAFE_INTEGER;
  const buchholzOf = (id: string) => (opponents.get(id) ?? []).reduce((sum, oppId) => sum + (score.get(oppId) ?? 0), 0);

  const ranked = [...entries].sort((a, b) => {
    const sa = score.get(a.id) ?? 0;
    const sb = score.get(b.id) ?? 0;
    if (sa !== sb) return sb - sa;
    const ba = buchholzOf(a.id);
    const bb = buchholzOf(b.id);
    if (ba !== bb) return bb - ba;
    return seedOf(a.id) - seedOf(b.id);
  });

  return ranked.map((e, i) => ({ entryId: e.id, placement: i + 1 }));
}

// ──────────────────── Group stage → double elim (GROUP_DOUBLE_ELIM) ────────────────────

/** Derived sizing for a GROUP_DOUBLE_ELIM event. All fields are consequences of the three inputs. */
export type GroupShape = {
  groupCount: number;
  groupSize: number;
  qualifiersPerGroup: number;
  /** Survivors of the group stage — and therefore the playoff bracket size B. */
  survivors: number;
  /** Seats in the upper bracket, and separately in the lower. Always survivors/2 each. */
  upperSeats: number;
  lowerSeats: number;
  eliminatedInGroups: number;
  groupMatches: number;
  playoffMatches: number;
  totalMatches: number;
};

/**
 * Validate and derive the shape of a GROUP_DOUBLE_ELIM event, or throw 400
 * INVALID_GROUP_SHAPE explaining which rule failed.
 *
 * `fieldSize` is the number of players who will ACTUALLY be seeded — not
 * maxPlayers. Those differ whenever a cup starts short, and every quantity here
 * depends on the real field.
 *
 * The upper/lower split is NOT configurable. The playoff bracket is an ordinary
 * double elimination of size `survivors` whose winners round 1 has already been
 * decided by the group stage, and a winners round 1 of size B yields exactly B/2
 * winners and B/2 losers — so the split is forced to half and half. That is also
 * exactly what The International does (4 up, 4 down of 8 qualifiers per group).
 *
 * Pure — no I/O.
 */
export function groupStageShape(fieldSize: number, groupCount: number, qualifiersPerGroup: number): GroupShape {
  const bad = (msg: string): never => {
    throw err.badRequest("INVALID_GROUP_SHAPE", msg);
  };

  if (!Number.isInteger(groupCount) || groupCount < 2) {
    bad("groupCount must be a whole number of at least 2 — cross-group seeding needs another group to pair against");
  }
  if (!Number.isInteger(fieldSize) || fieldSize < 4) bad("Need at least 4 players");
  if (fieldSize % groupCount !== 0) {
    bad(`${fieldSize} players do not divide evenly into ${groupCount} groups — unequal groups make qualification unfair`);
  }

  const groupSize = fieldSize / groupCount;

  if (!Number.isInteger(qualifiersPerGroup) || qualifiersPerGroup < 2) bad("qualifiersPerGroup must be at least 2");
  if (qualifiersPerGroup % 2 !== 0) {
    bad("qualifiersPerGroup must be even so the qualifiers split evenly between the upper and lower brackets");
  }
  if (qualifiersPerGroup >= groupSize) {
    bad(`qualifiersPerGroup (${qualifiersPerGroup}) must be fewer than the group size (${groupSize}) — otherwise the group stage eliminates nobody`);
  }

  const survivors = groupCount * qualifiersPerGroup;
  const k = Math.log2(survivors);
  if (!Number.isInteger(k) || survivors < 4) {
    bad(`${groupCount} groups x ${qualifiersPerGroup} qualifiers = ${survivors} survivors, which is not a power of two — the playoff bracket cannot be formed`);
  }

  // Winners rounds 2..k hold B/2^r matches each => B/2 - 1 in total (round 1 is
  // the group stage). The losers bracket is always B-2 matches. Plus one grand
  // final (a bracket reset would add a second, and is not counted here).
  const playoffMatches = survivors / 2 - 1 + (survivors - 2) + 1;
  const groupMatches = groupCount * ((groupSize * (groupSize - 1)) / 2);

  return {
    groupCount,
    groupSize,
    qualifiersPerGroup,
    survivors,
    upperSeats: survivors / 2,
    lowerSeats: survivors / 2,
    eliminatedInGroups: fieldSize - survivors,
    groupMatches,
    playoffMatches,
    totalMatches: groupMatches + playoffMatches,
  };
}

/**
 * Assign seeds 1..n to groups by SNAKE draft: 0,1,1,0,0,1,1,0… rather than
 * straight dealing. Returns `groupIndexBySeed[seed - 1]`.
 *
 * Straight dealing (`seed % groupCount`) would put seeds 1 and 2 — and every
 * other top seed — into the same group whenever seeding correlates with
 * strength. Snake alternates the direction each row so group strength stays
 * balanced, which matters because qualification is judged WITHIN a group: an
 * unbalanced draw eliminates a stronger player than it should.
 *
 * Pure — no I/O.
 */
export function snakeDraftGroups(n: number, groupCount: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / groupCount);
    const pos = i % groupCount;
    out.push(row % 2 === 0 ? pos : groupCount - 1 - pos);
  }
  return out;
}

export type GroupQualifier = { entryId: string; groupIndex: number; groupPlacement: number };
export type SeededSlot = { slot: number; redEntryId: string; blueEntryId: string };

/**
 * Lay the group-stage qualifiers into the first playoff round of each bracket.
 *
 * Top half of each group (placements 1..q/2) go to the UPPER bracket, bottom
 * half (q/2+1..q) go straight to the LOWER bracket. Within each of those, a
 * global seed is built by INTERLEAVING groups at equal placement — A1, B1, A2,
 * B2, … — and the pairs then come from `seedPairings`, the same standard
 * mirror-append order the ordinary bracket uses.
 *
 * Going through seedPairings is what buys the separation properties. Listing
 * cross-group pairs and dropping them into slots 0,1,2,3 in order looks right
 * and is not: parentSlot(2,0) === parentSlot(2,1), so slots 0 and 1 share a
 * parent, and a naive listing puts the SAME group's top two seeds into the same
 * upper-bracket semifinal — a same-group rematch two rounds after they played a
 * full round robin. Interleaved seeds + seedPairings instead give:
 *
 *   slot 0  A1 v B4     slot 1  B2 v A3     slot 2  B1 v A4     slot 3  A2 v B3
 *
 * — every first-round match cross-group, A1 and A2 in OPPOSITE halves, and the
 * two group winners unable to meet before the upper-bracket final.
 *
 * (The losers bracket's later drop rounds use losersDropSlot's index-aligned
 * mapping, which is documented as not guaranteeing zero rematches; this function
 * only controls the first round of each bracket.)
 *
 * Pure — no I/O.
 */
export function seedPlayoffFromGroups(
  qualifiers: GroupQualifier[],
  shape: Pick<GroupShape, "groupCount" | "qualifiersPerGroup">,
): { upper: SeededSlot[]; lower: SeededSlot[] } {
  const half = shape.qualifiersPerGroup / 2;

  const layOut = (members: GroupQualifier[], rankOf: (q: GroupQualifier) => number): SeededSlot[] => {
    const size = members.length;
    if (size === 0) return [];
    const bySeed = new Map<number, string>();
    for (const q of members) {
      // Interleave groups at equal rank: rank 1 of every group first, then rank 2, …
      const seed = (rankOf(q) - 1) * shape.groupCount + q.groupIndex + 1;
      bySeed.set(seed, q.entryId);
    }
    const out: SeededSlot[] = [];
    for (const p of seedPairings(size, size)) {
      const red = bySeed.get(p.top);
      const blue = bySeed.get(p.bottom);
      if (!red || !blue) {
        throw err.badRequest("INVALID_GROUP_SHAPE", `Group qualifiers do not fill the bracket (missing seed ${!red ? p.top : p.bottom})`);
      }
      out.push({ slot: p.slot, redEntryId: red, blueEntryId: blue });
    }
    return out;
  };

  return {
    upper: layOut(
      qualifiers.filter((q) => q.groupPlacement <= half),
      (q) => q.groupPlacement,
    ),
    lower: layOut(
      qualifiers.filter((q) => q.groupPlacement > half && q.groupPlacement <= shape.qualifiersPerGroup),
      (q) => q.groupPlacement - half,
    ),
  };
}
