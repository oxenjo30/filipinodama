/**
 * Tournament economy + bracket core — the pure/semi-pure functions the admin
 * and player HTTP routes call. This module owns every gold movement and every
 * bracket-state transition; the route layer (admin-tournaments.ts /
 * tournaments.ts, a later task) is a thin HTTP shell around these functions.
 *
 * MONEY INVARIANTS (see docs/superpowers/specs/2026-07-10-tournaments-design.md
 * §"Economy / ledger flows" + §"Bracket lifecycle" for the full reasoning):
 *  1. Join is idempotent under a race: create-the-entry-first (its @@unique is
 *     the double-join guard) + an explicit P2002 catch around the whole
 *     $transaction (applyLedgerTx does NOT swallow P2002 the way applyLedger
 *     does — only the non-tx wrapper does that).
 *  2. Every per-entry gold move (debit/refund/prize) is keyed refId=entry.id,
 *     NEVER tournamentId — required because leave hard-deletes the entry, so a
 *     join→leave→rejoin→cancel sequence must not collide idempotency slots
 *     across the two distinct entries.
 *  3. Complete's status flip (RUNNING→COMPLETED) is the FIRST step of its
 *     transaction, before any payout — a losing concurrent complete 409s
 *     before touching the ledger, so double-pay can never happen even under a
 *     race.
 *  4. prizeSplitGold[0]+[1] must equal prizePoolGold — validated before any
 *     payout — so a payout can never exceed (or fall short of) the declared,
 *     real gold pool.
 *  5. Cancel refunds every un-refunded entry exactly once, keyed by that
 *     entry's own id; the guarded status flip happens first, same pattern as
 *     Complete.
 */
import type { PrismaClient, Prisma } from "@prisma/client";
import { err, ApiError } from "../lib/errors.js";
import { audit } from "../lib/audit.js";
import { chargeEntryFeeTx, refundEntryFeeTx, payPrizeTx } from "../economy/tournament-ledger.js";
import {
  seedPairings,
  parentSlot,
  resolveTournamentSlot,
  resolveRoundRobinSlot,
  roundRobinSchedule,
  computeRoundRobinStandings,
  defaultSwissRounds,
  swissPairRound1,
  swissPairNextRound,
  computeSwissStandings,
  type SwissStanding,
} from "../lib/tournament-bracket.js";

type Tx = Prisma.TransactionClient;
type Db = PrismaClient;

function isP2002(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}

/** Smallest power of two >= n (n >= 1). */
function nextPow2(n: number): number {
  let b = 1;
  while (b < n) b *= 2;
  return b;
}

// ─────────────────────────── Join ───────────────────────────

/**
 * Join a tournament: create the entry, claim a seat (capacity guard), charge
 * entryFeeGold — all inside ONE transaction, in that order (see module docs).
 *
 * Fast pre-read short-circuits the common sequential case; it is NOT the
 * concurrency guard (the @@unique + the conditional updateMany inside the
 * transaction are).
 */
export async function joinTournament(db: Db, tournamentId: string, userId: string) {
  const tournament = await db.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) throw err.notFound("NO_TOURNAMENT", "Tournament not found");
  if (tournament.status !== "OPEN") throw err.conflict("BAD_STATE", "Tournament is not open for registration");

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw err.unauthorized();
  if (user.trophies < tournament.minTrophies) throw err.forbidden("TROPHY_GATE", "You don't meet the trophy requirement");

  // Fast pre-read (cheap short-circuit only — not the concurrency guard).
  const existing = await db.tournamentEntry.findUnique({ where: { tournamentId_userId: { tournamentId, userId } } });
  if (existing) throw err.conflict("ALREADY_JOINED", "You already joined this tournament");
  if (tournament.registeredCount >= tournament.maxPlayers) throw err.conflict("TOURNAMENT_FULL", "This tournament is full");

  try {
    return await db.$transaction(async (tx) => {
      // (1) create the entry FIRST — its @@unique([tournamentId,userId]) is the
      // double-join concurrency guard, and its id must exist before it's used
      // as the ledger refId.
      const entry = await tx.tournamentEntry.create({ data: { tournamentId, userId } });

      // (2) capacity guard — the serialized counter, atomic at the row level.
      const claim = await tx.tournament.updateMany({
        where: { id: tournamentId, status: "OPEN", registeredCount: { lt: tournament.maxPlayers } },
        data: { registeredCount: { increment: 1 } },
      });
      if (claim.count === 0) throw new Error("TOURNAMENT_FULL");

      // (3) charge the entry fee, keyed refId=entry.id.
      if (tournament.entryFeeGold > 0) {
        await chargeEntryFeeTx(tx, entry, tournament.entryFeeGold);
      }

      await audit(tx, {
        actorId: userId,
        action: "tournament.join",
        targetType: "tournament",
        targetId: tournamentId,
        before: { registeredCount: tournament.registeredCount },
        after: { registeredCount: tournament.registeredCount + 1, entryId: entry.id },
        reason: "player join",
      });

      return entry;
    });
  } catch (e) {
    if (isP2002(e)) throw err.conflict("ALREADY_JOINED", "You already joined this tournament");
    if (e instanceof Error && e.message === "TOURNAMENT_FULL") throw err.conflict("TOURNAMENT_FULL", "This tournament is full");
    if (e instanceof Error && e.message === "INSUFFICIENT_GOLD") throw err.badRequest("INSUFFICIENT_GOLD", "Not enough gold to join");
    if (e instanceof ApiError) throw e;
    throw e;
  }
}

// ─────────────────────────── Leave ───────────────────────────

/**
 * Leave a tournament while it's OPEN: refund the entry fee (keyed refId =
 * entry.id), hard-delete the entry, decrement registeredCount — all in one
 * transaction.
 */
export async function leaveTournament(db: Db, tournamentId: string, userId: string) {
  const tournament = await db.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) throw err.notFound("NO_TOURNAMENT", "Tournament not found");

  const entry = await db.tournamentEntry.findUnique({ where: { tournamentId_userId: { tournamentId, userId } } });
  if (!entry) throw err.notFound("NO_ENTRY", "You haven't joined this tournament");
  if (tournament.status !== "OPEN") throw err.conflict("BAD_STATE", "You can only leave while registration is open");

  return db.$transaction(async (tx) => {
    if (tournament.entryFeeGold > 0) {
      await refundEntryFeeTx(tx, entry, tournament.entryFeeGold);
    }
    await tx.tournamentEntry.delete({ where: { id: entry.id } });
    await tx.tournament.update({ where: { id: tournamentId }, data: { registeredCount: { decrement: 1 } } });

    await audit(tx, {
      actorId: userId,
      action: "tournament.leave",
      targetType: "tournament",
      targetId: tournamentId,
      before: { entryId: entry.id },
      after: { entryDeleted: true },
      reason: "player leave",
    });
  });
}

// ─────────────────────────── Start (seed the bracket) ───────────────────────────

/**
 * Seed the bracket on Start: assign seeds by joinedAt order, create round-1
 * slots with standard seed pairing (byes auto-resolved), create the empty
 * slot tree for rounds 2..rounds. One transaction; guarded status flip is
 * part of the same transaction so two concurrent Starts can't both seed.
 *
 * `actorId` is the ACTING admin (the one who clicked Start) — the audit row
 * must attribute to them, never to the tournament's creator.
 */
export async function startTournament(db: Db, tournamentId: string, actorId: string) {
  const tournament = await db.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) throw err.notFound("NO_TOURNAMENT", "Tournament not found");
  if (tournament.status !== "OPEN") throw err.conflict("BAD_STATE", "Tournament must be OPEN to start");

  const entries = await db.tournamentEntry.findMany({ where: { tournamentId }, orderBy: { joinedAt: "asc" } });
  // Defensive clamp: registeredCount should already guarantee entries.length <=
  // maxPlayers, but Start never trusts that blindly.
  const n = Math.min(entries.length, tournament.maxPlayers);
  if (n < 2) throw err.badRequest("TOO_FEW_PLAYERS", "Need at least 2 registered players to start");

  const clamped = entries.slice(0, n);

  try {
    if (tournament.format === "ROUND_ROBIN") {
      return await startRoundRobin(db, tournamentId, clamped, actorId);
    }
    if (tournament.format === "SWISS") {
      return await startSwiss(db, tournamentId, tournament.rounds, clamped, actorId);
    }
    return await startSingleElim(db, tournamentId, n, clamped, actorId);
  } catch (e) {
    if (e instanceof Error && e.message === "ALREADY_STARTED") throw err.conflict("ALREADY_TERMINAL", "Tournament already started");
    if (e instanceof ApiError) throw e;
    throw e;
  }
}

/** SINGLE_ELIM start branch — byte-identical to the pre-formats-v2 behavior. */
async function startSingleElim(
  db: Db,
  tournamentId: string,
  n: number,
  clamped: Array<{ id: string }>,
  actorId: string,
) {
  const B = nextPow2(n);
  const rounds = Math.log2(B);

  return db.$transaction(async (tx) => {
    // Guarded status flip FIRST — only one concurrent Start can win.
    const flip = await tx.tournament.updateMany({ where: { id: tournamentId, status: "OPEN" }, data: { status: "RUNNING", startedAt: new Date() } });
    if (flip.count === 0) throw new Error("ALREADY_STARTED");

    // Assign seeds 1..n by joinedAt order.
    for (let i = 0; i < clamped.length; i++) {
      await tx.tournamentEntry.update({ where: { id: clamped[i]!.id }, data: { seed: i + 1 } });
    }
    const bySeed = new Map<number, (typeof clamped)[number]>();
    clamped.forEach((e, i) => bySeed.set(i + 1, e));

    // Round 1: standard seed pairing; byes for seeds > n.
    const pairs = seedPairings(n, B);
    const round1Ids: string[] = [];
    for (const p of pairs) {
      const topEntry = bySeed.get(p.top) ?? null;
      const bottomEntry = bySeed.get(p.bottom) ?? null;
      const isBye = !topEntry || !bottomEntry;
      const presentEntry = topEntry ?? bottomEntry;
      const created = await tx.tournamentMatch.create({
        data: {
          tournamentId,
          round: 1,
          slot: p.slot,
          redEntryId: topEntry?.id ?? null,
          blueEntryId: bottomEntry?.id ?? null,
          status: isBye ? "done" : topEntry && bottomEntry ? "ready" : "pending",
          winnerEntryId: isBye ? presentEntry?.id ?? null : null,
          resolvedAt: isBye ? new Date() : null,
        },
      });
      round1Ids.push(created.id);
    }

    // Rounds 2..rounds: empty pending slots.
    const slotsByRoundSlot = new Map<string, string>(); // `${round}:${slot}` -> tmId
    for (let r = 1; r <= rounds; r++) {
      const count = B / Math.pow(2, r);
      for (let s = 0; s < count; s++) {
        if (r === 1) continue; // already created above
        const created = await tx.tournamentMatch.create({
          data: { tournamentId, round: r, slot: s, status: "pending" },
        });
        slotsByRoundSlot.set(`${r}:${s}`, created.id);
      }
    }
    // record round-1 ids too, for bye advancement below
    const round1Rows = await tx.tournamentMatch.findMany({ where: { id: { in: round1Ids } } });
    for (const row of round1Rows) slotsByRoundSlot.set(`1:${row.slot}`, row.id);

    // Advance byes into round 2 immediately.
    for (const row of round1Rows) {
      if (row.status !== "done" || !row.winnerEntryId) continue;
      if (rounds < 2) continue; // n==2 case: round 1 IS the final, no parent
      const parent = parentSlot(row.round, row.slot);
      const parentId = slotsByRoundSlot.get(`${parent.round}:${parent.slot}`);
      if (!parentId) continue;
      const isEven = row.slot % 2 === 0;
      const parentRow = await tx.tournamentMatch.findUniqueOrThrow({ where: { id: parentId } });
      const data = isEven ? { redEntryId: row.winnerEntryId } : { blueEntryId: row.winnerEntryId };
      const otherSide = isEven ? parentRow.blueEntryId : parentRow.redEntryId;
      await tx.tournamentMatch.update({
        where: { id: parentId },
        data: { ...data, ...(otherSide != null ? { status: "ready" } : {}) },
      });
    }

    await audit(tx, {
      actorId,
      action: "tournament.start",
      targetType: "tournament",
      targetId: tournamentId,
      before: { status: "OPEN" },
      after: { status: "RUNNING", n, bracketSize: B, rounds },
      reason: "admin start",
    });

    return { bracketSize: B, rounds, seededCount: n };
  });
}

/**
 * ROUND_ROBIN start branch — assign seeds by joinedAt order (same as
 * single-elim), then create every pairing from `roundRobinSchedule(n)` as a
 * TournamentMatch with status "ready" (both sides are known immediately —
 * unlike elimination, there's no feeder round to wait on). `bracket` stays
 * unused ("W" default); there are no parent slots for RR.
 */
async function startRoundRobin(db: Db, tournamentId: string, clamped: Array<{ id: string }>, actorId: string) {
  const n = clamped.length;
  const schedule = roundRobinSchedule(n);

  return db.$transaction(async (tx) => {
    const flip = await tx.tournament.updateMany({ where: { id: tournamentId, status: "OPEN" }, data: { status: "RUNNING", startedAt: new Date() } });
    if (flip.count === 0) throw new Error("ALREADY_STARTED");

    for (let i = 0; i < clamped.length; i++) {
      await tx.tournamentEntry.update({ where: { id: clamped[i]!.id }, data: { seed: i + 1 } });
    }
    const bySeed = new Map<number, (typeof clamped)[number]>();
    clamped.forEach((e, i) => bySeed.set(i + 1, e));

    for (const p of schedule) {
      const redEntry = bySeed.get(p.a)!;
      const blueEntry = bySeed.get(p.b)!;
      await tx.tournamentMatch.create({
        data: {
          tournamentId,
          round: p.round,
          slot: p.slot,
          redEntryId: redEntry.id,
          blueEntryId: blueEntry.id,
          status: "ready",
        },
      });
    }

    await audit(tx, {
      actorId,
      action: "tournament.start",
      targetType: "tournament",
      targetId: tournamentId,
      before: { status: "OPEN" },
      after: { status: "RUNNING", n, matchCount: schedule.length, format: "ROUND_ROBIN" },
      reason: "admin start",
    });

    return { bracketSize: n, rounds: Math.max(...schedule.map((p) => p.round), 0), seededCount: n };
  });
}

/**
 * SWISS start branch — assign seeds by joinedAt order (same as the other
 * formats), resolve `rounds` (the admin-set value if present, else
 * `defaultSwissRounds(n)` — PERSISTED onto the tournament row the first time
 * it starts, since every later progressive-generation step needs a stable
 * final-round number to stop at), then create ONLY round 1 via
 * `swissPairRound1`. Unlike RR, later rounds are NOT created here — they're
 * generated progressively by `reportResult` as each round completes (see
 * `maybeGenerateNextSwissRound` below). A bye slot is represented exactly
 * like single-elim's bye: `status:"done"`, `winnerEntryId` = the present
 * entry, `blueEntryId` stays null — so `computeSwissStandings`'s
 * `byeEntryIds` set and the "no repeat byes" rule can both be derived
 * straight from TournamentMatch rows with no separate bookkeeping table.
 */
async function startSwiss(
  db: Db,
  tournamentId: string,
  configuredRounds: number | null,
  clamped: Array<{ id: string }>,
  actorId: string,
) {
  const n = clamped.length;
  const rounds = configuredRounds ?? defaultSwissRounds(n);

  return db.$transaction(async (tx) => {
    const flip = await tx.tournament.updateMany({ where: { id: tournamentId, status: "OPEN" }, data: { status: "RUNNING", startedAt: new Date(), rounds } });
    if (flip.count === 0) throw new Error("ALREADY_STARTED");

    for (let i = 0; i < clamped.length; i++) {
      await tx.tournamentEntry.update({ where: { id: clamped[i]!.id }, data: { seed: i + 1 } });
    }
    const bySeed = new Map<number, (typeof clamped)[number]>();
    clamped.forEach((e, i) => bySeed.set(i + 1, e));

    const pairs = swissPairRound1(clamped.map((_, i) => i + 1));
    for (const p of pairs) {
      const aEntry = bySeed.get(p.a)!;
      const bEntry = p.bye ? null : bySeed.get(p.b!)!;
      await tx.tournamentMatch.create({
        data: {
          tournamentId,
          round: 1,
          slot: p.slot,
          redEntryId: aEntry.id,
          blueEntryId: bEntry?.id ?? null,
          status: p.bye ? "done" : "ready",
          winnerEntryId: p.bye ? aEntry.id : null,
          resolvedAt: p.bye ? new Date() : null,
        },
      });
    }

    await audit(tx, {
      actorId,
      action: "tournament.start",
      targetType: "tournament",
      targetId: tournamentId,
      before: { status: "OPEN" },
      after: { status: "RUNNING", n, rounds, format: "SWISS" },
      reason: "admin start",
    });

    return { bracketSize: n, rounds, seededCount: n };
  });
}

// ─────────────────────────── Report result (advance) ───────────────────────────

/**
 * The only V1 bracket-advance path: admin reports the winner of a `ready`
 * slot. Delegates to resolveTournamentSlot (elimination formats — advances
 * the winner into a parent slot + eliminates the loser) or
 * resolveRoundRobinSlot (ROUND_ROBIN and SWISS — just marks the slot done,
 * no advance, no elimination; SWISS reuses the exact same resolve semantics
 * as RR since neither format has a bracket tree to advance into) depending
 * on the tournament's format; this wrapper adds the tournament-scope lookup
 * + audit row shared by all three.
 *
 * SWISS-only: after resolving, if that slot's round is now fully reported
 * AND it isn't the tournament's final configured round, the next round's
 * pairings are generated right here (same transaction) — see
 * `maybeGenerateNextSwissRound`.
 *
 * `actorId` is optional so this function is directly testable without a
 * caller identity; the route task must always pass `req.userId!` in
 * production so the audit row is correctly attributed.
 */
export async function reportResult(
  db: Db,
  tournamentId: string,
  tmId: string,
  winnerEntryId: string,
  opts: { matchId?: string | null; reason?: string; actorId?: string } = {},
) {
  const tournament = await db.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) throw err.notFound("NO_TOURNAMENT", "Tournament not found");
  const slot = await db.tournamentMatch.findUnique({ where: { id: tmId } });
  if (!slot || slot.tournamentId !== tournamentId) throw err.notFound("NO_TOURNAMENT_MATCH", "Tournament match slot not found");

  return db.$transaction(async (tx) => {
    if (tournament.format === "ROUND_ROBIN" || tournament.format === "SWISS") {
      await resolveRoundRobinSlot(tx, tmId, winnerEntryId, opts.matchId ?? null);
    } else {
      await resolveTournamentSlot(tx, tmId, winnerEntryId, opts.matchId ?? null);
    }
    const after = await tx.tournamentMatch.findUniqueOrThrow({ where: { id: tmId } });

    if (tournament.format === "SWISS") {
      await maybeGenerateNextSwissRound(tx, tournament.id, tournament.rounds!, after.round);
    }

    if (opts.actorId) {
      await audit(tx, {
        actorId: opts.actorId,
        action: "tournament.match.report",
        targetType: "tournamentMatch",
        targetId: tmId,
        before: { status: "ready" },
        after: { status: "done", winnerEntryId },
        reason: opts.reason ?? "admin report",
      });
    }

    return after;
  });
}

/**
 * SWISS progressive round generation. Checks whether `justResolvedRound` is
 * now fully done (every match in that round has status "done"); if so AND
 * it's not yet the final configured round, computes standings-so-far +
 * the set of already-played pairs from every existing TournamentMatch row,
 * pairs the next round via `swissPairNextRound`, and creates those matches.
 *
 * CONCURRENCY GUARD: two reports racing to complete the same round's last
 * two matches could both observe "round fully done" and both try to
 * generate round+1. The guard is the same shape as every other atomic claim
 * in this module — but here it's a UNIQUE-CONSTRAINT race, not an
 * updateMany claim: `TournamentMatch.@@unique([tournamentId,round,slot])`
 * means the SECOND transaction's createMany for round+1 collides on
 * (tournamentId, round+1, slot=0) and throws P2002, which is caught and
 * treated as "already generated by the other transaction" (a no-op, not an
 * error) — so exactly one generation ever survives, never zero, never two.
 */
async function maybeGenerateNextSwissRound(tx: Tx, tournamentId: string, finalRound: number, justResolvedRound: number) {
  if (justResolvedRound >= finalRound) return; // final round done — nothing more to generate, Complete takes over

  const roundMatches = await tx.tournamentMatch.findMany({ where: { tournamentId, round: justResolvedRound } });
  if (roundMatches.length === 0 || roundMatches.some((m) => m.status !== "done")) return; // round not fully done yet

  const nextRound = justResolvedRound + 1;
  const existingNext = await tx.tournamentMatch.count({ where: { tournamentId, round: nextRound } });
  if (existingNext > 0) return; // already generated (by this call or a race winner)

  const entries = await tx.tournamentEntry.findMany({ where: { tournamentId }, select: { id: true, seed: true } });
  const allMatches = await tx.tournamentMatch.findMany({
    where: { tournamentId },
    select: { redEntryId: true, blueEntryId: true, winnerEntryId: true, status: true },
  });

  const standings: SwissStanding[] = entries.map((e) => {
    let score = 0;
    for (const m of allMatches) {
      if (m.status !== "done" || !m.winnerEntryId) continue;
      if (m.winnerEntryId !== e.id) continue;
      score += 1; // a bye's "match" also sets winnerEntryId=the bye recipient, so this counts byes too
    }
    return { entryId: e.id, seed: e.seed ?? Number.MAX_SAFE_INTEGER, score };
  });

  const playedPairs = new Set<string>();
  const byeEntryIds = new Set<string>();
  for (const m of allMatches) {
    if (m.redEntryId && m.blueEntryId) {
      const key = m.redEntryId < m.blueEntryId ? `${m.redEntryId}|${m.blueEntryId}` : `${m.blueEntryId}|${m.redEntryId}`;
      playedPairs.add(key);
    } else if (m.redEntryId && !m.blueEntryId && m.status === "done") {
      byeEntryIds.add(m.redEntryId); // this entry already had a bye — never give it a second one
    }
  }

  const pairings = swissPairNextRound(standings, playedPairs, byeEntryIds);

  try {
    let slot = 0;
    for (const p of pairings) {
      const isBye = "bye" in p && p.bye;
      await tx.tournamentMatch.create({
        data: {
          tournamentId,
          round: nextRound,
          slot: slot++,
          redEntryId: p.aEntryId,
          blueEntryId: isBye ? null : (p as { bEntryId: string }).bEntryId,
          status: isBye ? "done" : "ready",
          winnerEntryId: isBye ? p.aEntryId : null,
          resolvedAt: isBye ? new Date() : null,
        },
      });
    }
  } catch (e) {
    if (isP2002(e)) return; // lost the generation race — the other transaction already created this round
    throw e;
  }
}

// ─────────────────────────── Complete (pay prizes) ───────────────────────────

/** One resolved placement, ready for the shared payout loop below. */
type PlacementRow = { entryId: string; placement: number };

/**
 * Pay top-N by final placement. Status flip is the FIRST step of the
 * transaction (atomic claim) so a losing concurrent complete 409s before
 * touching the ledger — this is what prevents double-pay, not merely the
 * ledger's unique index.
 *
 * `prizeSplitGold` is an int array of length 1..maxPlayers, every entry >= 0,
 * summing to prizePoolGold. A split of length K pays placements 1..K by
 * final ranking; placements beyond split.length are still recorded (display)
 * but unpaid. SINGLE_ELIM's classic 2-tuple (champion/runner-up) is just the
 * N=2 case of this general rule — its placement computation (final-slot
 * champion/runner-up + display-only semifinal-loser 3rd) is unchanged from
 * before this generalization.
 *
 * `actorId` is the ACTING admin (the one who clicked Complete) — the audit
 * row must attribute to them, never to the tournament's creator.
 */
export async function completeTournament(db: Db, tournamentId: string, actorId: string, reason?: string) {
  const tournament = await db.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) throw err.notFound("NO_TOURNAMENT", "Tournament not found");

  const split = Array.isArray(tournament.prizeSplitGold) ? (tournament.prizeSplitGold as unknown as number[]) : [];
  const sum = split.reduce((a, b) => a + b, 0);
  const valid =
    split.length >= 1 &&
    split.length <= tournament.maxPlayers &&
    split.every((v) => Number.isInteger(v) && v >= 0) &&
    sum === tournament.prizePoolGold;
  if (!valid) {
    throw err.badRequest("PRIZE_SPLIT_MISMATCH", "prizeSplitGold must be a 1..maxPlayers-length array of non-negative integers summing to prizePoolGold");
  }

  if (tournament.status !== "RUNNING") {
    // Pre-check for a clearer error before touching the transaction, but the
    // guarded flip below is still the real race-proof gate.
    if (tournament.status === "COMPLETED" || tournament.status === "CANCELLED") throw err.conflict("ALREADY_TERMINAL", "Tournament is already terminal");
  }

  // Fail fast with NOT_FINISHED (format-specific readiness check) BEFORE
  // flipping status, so a premature Complete never touches the ledger.
  if (tournament.format === "ROUND_ROBIN") {
    const unfinished = await db.tournamentMatch.count({ where: { tournamentId, status: { not: "done" } } });
    const total = await db.tournamentMatch.count({ where: { tournamentId } });
    if (total === 0 || unfinished > 0) throw err.conflict("NOT_FINISHED", "Not every round-robin match has been reported yet");
  } else if (tournament.format === "SWISS") {
    // Ready only once the FINAL configured round exists and every match in
    // it is done — earlier rounds being incomplete is impossible to reach
    // here (progressive generation only creates round+1 once round is fully
    // done), but an in-progress final round (or the final round not yet
    // generated because an earlier round is still open) must still 409.
    const finalRoundMatches = await db.tournamentMatch.findMany({ where: { tournamentId, round: tournament.rounds ?? -1 } });
    if (finalRoundMatches.length === 0 || finalRoundMatches.some((m) => m.status !== "done")) {
      throw err.conflict("NOT_FINISHED", "Not every Swiss round has been reported yet");
    }
  } else {
    // Elimination formats: find the final round's done slot (the champion).
    const maxRoundRow = await db.tournamentMatch.findFirst({ where: { tournamentId }, orderBy: { round: "desc" } });
    const finalRound = maxRoundRow?.round ?? 0;
    const finalSlot = await db.tournamentMatch.findFirst({ where: { tournamentId, round: finalRound } });
    if (!finalSlot || finalSlot.status !== "done" || !finalSlot.winnerEntryId) {
      throw err.conflict("NOT_FINISHED", "The tournament has no champion yet");
    }
  }

  try {
    return await db.$transaction(async (tx) => {
      // FIRST STEP: guarded status flip.
      const flip = await tx.tournament.updateMany({ where: { id: tournamentId, status: "RUNNING" }, data: { status: "COMPLETED", completedAt: new Date() } });
      if (flip.count === 0) throw new Error("ALREADY_TERMINAL");

      const placements: PlacementRow[] =
        tournament.format === "ROUND_ROBIN"
          ? await computeRoundRobinPlacements(tx, tournamentId)
          : tournament.format === "SWISS"
            ? await computeSwissPlacements(tx, tournamentId)
            : await computeSingleElimPlacements(tx, tournamentId);

      for (const p of placements) {
        await tx.tournamentEntry.update({ where: { id: p.entryId }, data: { placement: p.placement } }).catch(() => {});
      }

      // Shared payout-by-placement loop: placement i (1-based) gets split[i-1]
      // gold, when that slot exists and is > 0.
      const paidOut: Record<number, { entryId: string; amount: number }> = {};
      for (let i = 1; i <= split.length; i++) {
        const amount = split[i - 1]!;
        if (amount <= 0) continue;
        const row = placements.find((p) => p.placement === i);
        if (!row) continue; // fewer real placements than split length (edge case) — nothing to pay
        const entry = await tx.tournamentEntry.findUniqueOrThrow({ where: { id: row.entryId } });
        await payPrizeTx(tx, entry, amount);
        paidOut[i] = { entryId: row.entryId, amount };
      }

      await audit(tx, {
        actorId,
        action: "tournament.complete",
        targetType: "tournament",
        targetId: tournamentId,
        before: { status: "RUNNING" },
        after: { status: "COMPLETED", placements, payout: split, paidOut },
        reason: reason ?? "admin complete",
      });

      // Back-compat return shape for SINGLE_ELIM callers (existing route/tests
      // read championEntryId/runnerUpEntryId) plus the general placements/payout.
      const championEntryId = placements.find((p) => p.placement === 1)?.entryId ?? null;
      const runnerUpEntryId = placements.find((p) => p.placement === 2)?.entryId ?? null;
      return { championEntryId, runnerUpEntryId, payout: split, placements };
    });
  } catch (e) {
    if (e instanceof Error && e.message === "ALREADY_TERMINAL") throw err.conflict("ALREADY_TERMINAL", "Tournament is already terminal");
    if (e instanceof ApiError) throw e;
    throw e;
  }
}

/**
 * SINGLE_ELIM placement branch — unchanged from the pre-formats-v2 behavior:
 * champion (final-slot winner) = 1, runner-up (final-slot loser) = 2,
 * semifinal losers = 3 (display-only, never paid unless split.length >= 3).
 */
async function computeSingleElimPlacements(tx: Tx, tournamentId: string): Promise<PlacementRow[]> {
  const maxRoundRow = await tx.tournamentMatch.findFirst({ where: { tournamentId }, orderBy: { round: "desc" } });
  const finalRound = maxRoundRow?.round ?? 0;
  const finalSlot = await tx.tournamentMatch.findFirstOrThrow({ where: { tournamentId, round: finalRound } });

  const championEntryId = finalSlot.winnerEntryId!;
  const runnerUpEntryId = finalSlot.redEntryId === championEntryId ? finalSlot.blueEntryId : finalSlot.redEntryId;

  const placements: PlacementRow[] = [{ entryId: championEntryId, placement: 1 }];
  if (runnerUpEntryId) placements.push({ entryId: runnerUpEntryId, placement: 2 });

  if (finalRound >= 2) {
    const semis = await tx.tournamentMatch.findMany({ where: { tournamentId, round: finalRound - 1, status: "done" } });
    for (const m of semis) {
      const loser = m.redEntryId === m.winnerEntryId ? m.blueEntryId : m.redEntryId;
      if (loser) placements.push({ entryId: loser, placement: 3 });
    }
  }

  return placements;
}

/**
 * ROUND_ROBIN placement branch — ranks by computeRoundRobinStandings (wins
 * desc, head-to-head, seed asc), placements 1..n.
 */
async function computeRoundRobinPlacements(tx: Tx, tournamentId: string): Promise<PlacementRow[]> {
  const entries = await tx.tournamentEntry.findMany({ where: { tournamentId }, select: { id: true, seed: true } });
  const matches = await tx.tournamentMatch.findMany({
    where: { tournamentId },
    select: { redEntryId: true, blueEntryId: true, winnerEntryId: true, status: true },
  });
  const standings = computeRoundRobinStandings(
    entries.map((e) => ({ id: e.id, seed: e.seed })),
    matches
      .filter((m): m is typeof m & { redEntryId: string; blueEntryId: string } => m.redEntryId != null && m.blueEntryId != null)
      .map((m) => ({ redEntryId: m.redEntryId, blueEntryId: m.blueEntryId, winnerEntryId: m.winnerEntryId, status: m.status })),
  );
  return standings;
}

/**
 * SWISS placement branch — ranks by computeSwissStandings (score = wins +
 * byes desc, Buchholz desc, seed asc), placements 1..n. `byeEntryIds` is
 * every entry that has a `done` bye slot (blueEntryId null) anywhere in the
 * match history — same derivation `maybeGenerateNextSwissRound` uses to
 * avoid repeat byes, reused here so a bye's point is counted at Complete
 * exactly the same way it was counted while pairing rounds.
 */
async function computeSwissPlacements(tx: Tx, tournamentId: string): Promise<PlacementRow[]> {
  const entries = await tx.tournamentEntry.findMany({ where: { tournamentId }, select: { id: true, seed: true } });
  const matches = await tx.tournamentMatch.findMany({
    where: { tournamentId },
    select: { redEntryId: true, blueEntryId: true, winnerEntryId: true, status: true },
  });

  const byeEntryIds = new Set<string>();
  const realMatches: Array<{ redEntryId: string; blueEntryId: string; winnerEntryId: string | null; status: string }> = [];
  for (const m of matches) {
    if (m.redEntryId && m.blueEntryId) {
      realMatches.push({ redEntryId: m.redEntryId, blueEntryId: m.blueEntryId, winnerEntryId: m.winnerEntryId, status: m.status });
    } else if (m.redEntryId && !m.blueEntryId && m.status === "done") {
      byeEntryIds.add(m.redEntryId);
    }
  }

  return computeSwissStandings(
    entries.map((e) => ({ id: e.id, seed: e.seed })),
    realMatches,
    byeEntryIds,
  );
}

// ─────────────────────────── Cancel (refund all) ───────────────────────────

/**
 * Cancel a tournament from DRAFT/OPEN/RUNNING: guarded status flip first
 * (same atomic-claim pattern as Complete), then refund every paid,
 * un-refunded entry, keyed refId=entry.id.
 *
 * `actorId` is the ACTING admin (the one who clicked Cancel) — the audit row
 * must attribute to them, never to the tournament's creator.
 */
export async function cancelTournament(db: Db, tournamentId: string, actorId: string, reason?: string) {
  const tournament = await db.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) throw err.notFound("NO_TOURNAMENT", "Tournament not found");

  try {
    return await db.$transaction(async (tx) => {
      const flip = await tx.tournament.updateMany({
        where: { id: tournamentId, status: { in: ["DRAFT", "OPEN", "RUNNING"] } },
        data: { status: "CANCELLED", cancelledAt: new Date() },
      });
      if (flip.count === 0) throw new Error("ALREADY_TERMINAL");

      const entries = await tx.tournamentEntry.findMany({ where: { tournamentId, refunded: false } });
      let refundedCount = 0;
      if (tournament.entryFeeGold > 0) {
        for (const entry of entries) {
          await refundEntryFeeTx(tx, entry, tournament.entryFeeGold);
          await tx.tournamentEntry.update({ where: { id: entry.id }, data: { refunded: true } });
          refundedCount++;
        }
      }

      await audit(tx, {
        actorId,
        action: "tournament.cancel",
        targetType: "tournament",
        targetId: tournamentId,
        before: { status: tournament.status },
        after: { status: "CANCELLED", refundedCount, refundTotal: refundedCount * tournament.entryFeeGold },
        reason: reason ?? "admin cancel",
      });

      return { refundedCount };
    });
  } catch (e) {
    if (e instanceof Error && e.message === "ALREADY_TERMINAL") throw err.conflict("ALREADY_TERMINAL", "Tournament is already terminal");
    if (e instanceof ApiError) throw e;
    throw e;
  }
}
