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
import { notifyGroupCut, notifyFinalPlacements, notifyFixtureReady } from "../lib/tournament-notify.js";
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
  losersBracketStructure,
  losersDropSlot,
  lWinnerAdvance,
  computeDoubleElimPlacements,
  L_ROUND_OFFSET,
  GF_ROUND,
  GF_RESET_ROUND,
  type SwissStanding,
  type DoubleElimMatchLike,
} from "../lib/tournament-bracket.js";
import {
  startGroupDoubleElim,
  maybeAdvanceGroupStage,
  maybeStartPlayoffs,
  recoverGroupDoubleElim,
  computeGroupDoubleElimPlacements,
  groupShapeOf,
  type CreatedFixture,
} from "./tournament-groups.js";

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
    if (tournament.format === "DOUBLE_ELIM") {
      return await startDoubleElim(db, tournamentId, n, clamped, actorId);
    }
    if (tournament.format === "GROUP_DOUBLE_ELIM") {
      return await startGroupDoubleElim(db, tournamentId, tournament, clamped, actorId);
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

/**
 * DOUBLE_ELIM start branch — seeds the WINNERS bracket exactly like
 * startSingleElim (same `seedPairings` call, same byes-auto-resolve
 * behavior, `bracket:"W"` on every W slot), then PRE-CREATES the entire
 * losers-bracket skeleton (`losersBracketStructure(B)`, `bracket:"L"`,
 * `status:"pending"`, empty entries) and the Grand Final's game-1 slot
 * (`bracket:"GF"`, `status:"pending"` — GF game 2, the bracket-reset game,
 * is created LAZILY by resolveDoubleElimSlot only if it's ever needed, not
 * here, since most tournaments never trigger a reset).
 *
 * Round-offset scheme (see tournament-bracket.ts's `L_ROUND_OFFSET`/`GF_ROUND`
 * doc comment): W rounds stay 1..log2(B); L rounds are stored as
 * 101,102,... (local L-round + L_ROUND_OFFSET); GF game 1 is round 201.
 *
 * W round-1 byes: a bye produces a `done` W-R1 slot with only one side
 * filled and no real loser — nothing drops to L for that slot (handled by
 * the bye-advance loop below skipping the drop step whenever the round-1
 * slot has no `blueEntryId`/`redEntryId` pair, i.e. `isBye`).
 *
 * MONEY-CRITICAL GATE: `n` MUST be an exact power of two (2,4,8,16,…) — see
 * the guard below. A non-power-of-two field seeds W-round-1 byes; a bye
 * produces NO loser, so the losers-bracket slot that loser would have
 * dropped into never gets its second competitor and stays "pending"
 * forever, which stalls the L-final, then the Grand Final, then
 * completeTournament (permanent 409 NOT_FINISHED) — entry-fee gold in, no
 * possible payout, no possible completion. Rejecting Start outright for any
 * non-power-of-two `n` is the only way this module currently guarantees DE
 * always reaches completion; a full L-bracket bye-propagation fix (letting
 * non-power-of-two fields actually play through) is tracked as a documented
 * follow-up, not yet implemented — see
 * docs/superpowers/specs/2026-07-10-tournaments-design.md and the
 * DE_NEEDS_POWER_OF_TWO test block in tournaments-core.test.ts.
 */
async function startDoubleElim(
  db: Db,
  tournamentId: string,
  n: number,
  clamped: Array<{ id: string }>,
  actorId: string,
) {
  if ((n & (n - 1)) !== 0) {
    throw err.badRequest(
      "DE_NEEDS_POWER_OF_TWO",
      `Double elimination needs an exact power-of-two number of registered players (2,4,8,16,…) — currently ${n}`,
    );
  }

  const B = nextPow2(n);
  const rounds = Math.log2(B);
  const lStructure = losersBracketStructure(B);

  return db.$transaction(async (tx) => {
    const flip = await tx.tournament.updateMany({ where: { id: tournamentId, status: "OPEN" }, data: { status: "RUNNING", startedAt: new Date() } });
    if (flip.count === 0) throw new Error("ALREADY_STARTED");

    for (let i = 0; i < clamped.length; i++) {
      await tx.tournamentEntry.update({ where: { id: clamped[i]!.id }, data: { seed: i + 1 } });
    }
    const bySeed = new Map<number, (typeof clamped)[number]>();
    clamped.forEach((e, i) => bySeed.set(i + 1, e));

    // ── W bracket: round 1 seeded pairings (byes auto-resolve), rounds 2..k empty. ──
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
          bracket: "W",
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

    const wSlotsByRoundSlot = new Map<string, string>(); // `${round}:${slot}` -> tmId (W bracket only)
    for (let r = 1; r <= rounds; r++) {
      const count = B / Math.pow(2, r);
      for (let s = 0; s < count; s++) {
        if (r === 1) continue; // already created above
        const created = await tx.tournamentMatch.create({
          data: { tournamentId, bracket: "W", round: r, slot: s, status: "pending" },
        });
        wSlotsByRoundSlot.set(`${r}:${s}`, created.id);
      }
    }
    const round1Rows = await tx.tournamentMatch.findMany({ where: { id: { in: round1Ids } } });
    for (const row of round1Rows) wSlotsByRoundSlot.set(`1:${row.slot}`, row.id);

    // ── L bracket skeleton: every slot pre-created pending/empty. ──
    const lSlotsByRoundSlot = new Map<string, string>(); // `${localRound}:${slot}` -> tmId
    for (const lr of lStructure) {
      for (let s = 0; s < lr.matches; s++) {
        const created = await tx.tournamentMatch.create({
          data: { tournamentId, bracket: "L", round: L_ROUND_OFFSET + lr.localRound, slot: s, status: "pending" },
        });
        lSlotsByRoundSlot.set(`${lr.localRound}:${s}`, created.id);
      }
    }

    // ── Grand Final game 1 skeleton (game 2 created lazily on reset). ──
    await tx.tournamentMatch.create({
      data: { tournamentId, bracket: "GF", round: GF_ROUND, slot: 0, status: "pending" },
    });

    // Advance W-R1 byes into W-round 2 immediately (mirrors startSingleElim).
    // A bye never produces a loser, so nothing drops to L for these slots.
    for (const row of round1Rows) {
      if (row.status !== "done" || !row.winnerEntryId) continue;
      if (rounds < 2) continue; // n==2 case: W-R1 IS the W-final, no W parent (still drops to L below via resolveDoubleElimSlot's own path — n==2 has no bye since both slots are always filled at B=2)
      const parent = parentSlot(row.round, row.slot);
      const parentId = wSlotsByRoundSlot.get(`${parent.round}:${parent.slot}`);
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
      after: { status: "RUNNING", n, bracketSize: B, rounds, format: "DOUBLE_ELIM", lMatchCount: lStructure.reduce((s, r) => s + r.matches, 0) },
      reason: "admin start",
    });

    return { bracketSize: B, rounds, seededCount: n };
  });
}

// ─────────────────────────── Double-elim advance (report) ───────────────────────────

/**
 * Resolve a `ready` DOUBLE_ELIM slot with the reported winner. Branches on
 * `slotRow.bracket`:
 *  - "W": winner advances to the W parent slot (identical mechanics to
 *    `resolveTournamentSlot`, scoped to `bracket:"W"`); the LOSER DROPS to
 *    the losers bracket via `losersDropSlot` instead of being eliminated
 *    (byes never reach here — a bye slot is created already `done`, so it
 *    can never be claimed `ready`).
 *  - "L": winner advances via `lWinnerAdvance` (or, if this was the
 *    L-bracket final, becomes the L-CHAMPION and is written straight into
 *    the Grand Final's L-side); the loser is `eliminated:true` — their
 *    SECOND loss.
 *  - "GF" (round GF_ROUND, game 1): if the W-side (0 prior losses) wins,
 *    they're the outright tournament champion — done, no reset. If the
 *    L-side (1 prior loss) wins, both competitors now have exactly one
 *    loss each — a BRACKET RESET: game 2 (round GF_RESET_ROUND) is
 *    created/filled here, `status:"ready"`, same two entries.
 *  - "GF" (round GF_RESET_ROUND, game 2): winner is the final champion —
 *    done, no further slot to fill.
 *
 * Whenever a W-final or L-final resolves, this also checks whether the
 * OTHER side of the Grand Final is already resolved — if so, fills the GF
 * slot (`status:"ready"`) right here (the second of the two to resolve is
 * the one that actually flips GF ready, mirroring the parent-slot
 * "otherSide != null" idempotent-fill pattern `resolveTournamentSlot` uses).
 *
 * Runs entirely inside the caller's transaction. `B` (bracket size) is
 * needed for `losersDropSlot`'s W-round validation — the caller
 * (`reportResult`) does NOT trust `nextPow2(tournament.maxPlayers)` for
 * this (maxPlayers is only an UPPER bound on registered entries; if fewer
 * than maxPlayers actually registered, the seeded bracket size can be
 * SMALLER than maxPlayers — e.g. maxPlayers=8 but n=3 seeds a B=4 bracket).
 * Instead `B` is derived from the ACTUAL number of W-round-1 slots that
 * were created at seed time (`2 * count of bracket:"W" round:1 matches`),
 * which is always exactly right regardless of how many players registered.
 */
async function resolveDoubleElimSlot(
  tx: Tx,
  tournamentId: string,
  B: number,
  tmId: string,
  winnerEntryId: string,
  matchId?: string | null,
): Promise<{ tournamentId: string; round: number; slot: number; bracket: string }> {
  const slotRow = await tx.tournamentMatch.findUnique({ where: { id: tmId } });
  if (!slotRow) throw err.notFound("NO_TOURNAMENT_MATCH", "Tournament match slot not found");

  if (slotRow.status !== "ready") {
    if (slotRow.status === "done") throw err.conflict("SLOT_DONE", "This slot was already resolved");
    throw err.conflict("SLOT_NOT_READY", "This slot's competitors aren't both filled in yet");
  }
  if (winnerEntryId !== slotRow.redEntryId && winnerEntryId !== slotRow.blueEntryId) {
    throw err.badRequest("NOT_A_PARTICIPANT", "Winner is not a competitor in this slot");
  }

  // Atomic claim — the real concurrency guard (mirrors resolveTournamentSlot).
  const claim = await tx.tournamentMatch.updateMany({
    where: { id: tmId, status: "ready" },
    data: { winnerEntryId, matchId: matchId ?? undefined, status: "done", resolvedAt: new Date() },
  });
  if (claim.count === 0) throw err.conflict("SLOT_DONE", "This slot was already resolved");

  const loserEntryId = winnerEntryId === slotRow.redEntryId ? slotRow.blueEntryId : slotRow.redEntryId;

  if (slotRow.bracket === "W") {
    // Winner advances within W (unchanged single-elim mechanics).
    const parent = parentSlot(slotRow.round, slotRow.slot);
    const parentRow = await tx.tournamentMatch.findUnique({
      where: { tournamentId_round_slot: { tournamentId, round: parent.round, slot: parent.slot } },
    });
    if (parentRow && parentRow.bracket === "W") {
      const isEven = slotRow.slot % 2 === 0;
      const data = isEven ? { redEntryId: winnerEntryId } : { blueEntryId: winnerEntryId };
      const otherSide = isEven ? parentRow.blueEntryId : parentRow.redEntryId;
      await tx.tournamentMatch.update({
        where: { id: parentRow.id },
        data: { ...data, ...(otherSide != null ? { status: "ready" } : {}) },
      });
    } else if (!parentRow) {
      // slotRow.round === rounds (the W-final) — no W parent; winner is the
      // W-CHAMPION, headed straight to the Grand Final (handled below).
      await fillGrandFinalSide(tx, tournamentId, "W", winnerEntryId);
    }

    // Loser DROPS to L instead of being eliminated. SPECIAL CASE B=2: there
    // is no losers bracket at all (losersBracketStructure(2) === []) — the
    // single W-R1/W-final loser is trivially already the L-champion (zero L
    // matches needed) and goes straight into the Grand Final's L-side.
    if (loserEntryId && B === 2) {
      await fillGrandFinalSide(tx, tournamentId, "L", loserEntryId);
    } else if (loserEntryId) {
      const drop = losersDropSlot(slotRow.round, slotRow.slot, B);
      const lRound = L_ROUND_OFFSET + drop.localRound;
      const lRow = await tx.tournamentMatch.findUniqueOrThrow({
        where: { tournamentId_round_slot: { tournamentId, round: lRound, slot: drop.slot } },
      });
      // Index-aligned mapping (see losersDropSlot's doc comment): the FIRST
      // W-loser to land on a given L slot fills `redEntryId`, the second
      // (only possible for W-round-1's 2-losers-per-slot pairing) fills
      // `blueEntryId`. Whichever side is still empty gets this loser —
      // race-safe because this whole function runs inside the caller's tx
      // and the W-slot's own atomic claim above already serializes the two
      // sibling W-R1 matches' drops relative to each other in practice, but
      // the "fill whichever side is empty" logic is itself idempotent/order-
      // independent regardless.
      const data = lRow.redEntryId == null ? { redEntryId: loserEntryId } : { blueEntryId: loserEntryId };
      const otherSideFilled = lRow.redEntryId != null || lRow.blueEntryId != null;
      await tx.tournamentMatch.update({
        where: { id: lRow.id },
        data: { ...data, ...(otherSideFilled ? { status: "ready" } : {}) },
      });
    }
  } else if (slotRow.bracket === "L") {
    // Second loss — eliminated.
    if (loserEntryId) {
      await tx.tournamentEntry.update({ where: { id: loserEntryId }, data: { eliminated: true } });
    }
    const structure = losersBracketStructure(B);
    const localRound = slotRow.round - L_ROUND_OFFSET;
    const advance = lWinnerAdvance(localRound, slotRow.slot, structure);
    if (advance) {
      const nextRound = L_ROUND_OFFSET + advance.localRound;
      const nextRow = await tx.tournamentMatch.findUniqueOrThrow({
        where: { tournamentId_round_slot: { tournamentId, round: nextRound, slot: advance.slot } },
      });
      const data = nextRow.redEntryId == null ? { redEntryId: winnerEntryId } : { blueEntryId: winnerEntryId };
      const otherSideFilled = nextRow.redEntryId != null || nextRow.blueEntryId != null;
      await tx.tournamentMatch.update({
        where: { id: nextRow.id },
        data: { ...data, ...(otherSideFilled ? { status: "ready" } : {}) },
      });
    } else {
      // This WAS the L-bracket final — winner is the L-CHAMPION.
      await fillGrandFinalSide(tx, tournamentId, "L", winnerEntryId);
    }
  } else {
    // GF game 1 or game 2.
    if (slotRow.round === GF_ROUND) {
      // W-side is whichever competitor has zero prior L-bracket losses —
      // by construction the W-champion was written into `redEntryId` and
      // the L-champion into `blueEntryId` by fillGrandFinalSide (W always
      // resolves and fills first in every real bracket, since the L final
      // itself depends on the W-final loser dropping in — but to stay
      // correct even if a caller reported L's fill first, fillGrandFinalSide
      // pins W to red / L to blue explicitly rather than "whoever filled
      // first", so this check is unambiguous).
      const wSide = slotRow.redEntryId;
      if (winnerEntryId === wSide) {
        // W-champion won outright — tournament champion decided, no reset.
      } else {
        // L-champion won game 1 — BRACKET RESET: create/ready game 2.
        await tx.tournamentMatch.create({
          data: {
            tournamentId,
            bracket: "GF",
            round: GF_RESET_ROUND,
            slot: 0,
            redEntryId: slotRow.redEntryId,
            blueEntryId: slotRow.blueEntryId,
            status: "ready",
          },
        });
      }
    }
    // GF_RESET_ROUND: winner is the champion, nothing further to fill.
  }

  const after = await tx.tournamentMatch.findUniqueOrThrow({ where: { id: tmId } });
  return { tournamentId, round: after.round, slot: after.slot, bracket: after.bracket };
}

/**
 * Fill the Grand Final's W-side (`redEntryId`) or L-side (`blueEntryId`)
 * with a just-decided W-champion or L-champion. Idempotent/order-independent
 * — whichever of the two (W-final, L-final) resolves SECOND is the one that
 * actually observes the other side already filled and flips GF to `ready`.
 */
async function fillGrandFinalSide(tx: Tx, tournamentId: string, side: "W" | "L", entryId: string) {
  const gf = await tx.tournamentMatch.findUniqueOrThrow({
    where: { tournamentId_round_slot: { tournamentId, round: GF_ROUND, slot: 0 } },
  });
  const data = side === "W" ? { redEntryId: entryId } : { blueEntryId: entryId };
  const otherSide = side === "W" ? gf.blueEntryId : gf.redEntryId;
  await tx.tournamentMatch.update({
    where: { id: gf.id },
    data: { ...data, ...(otherSide != null ? { status: "ready" } : {}) },
  });
}

// ─────────────────────────── Report result (advance) ───────────────────────────

/**
 * The only V1 bracket-advance path: admin reports the winner of a `ready`
 * slot. Delegates to resolveTournamentSlot (SINGLE_ELIM — advances the
 * winner into a parent slot + eliminates the loser), resolveRoundRobinSlot
 * (ROUND_ROBIN and SWISS — just marks the slot done, no advance, no
 * elimination; SWISS reuses the exact same resolve semantics as RR since
 * neither format has a bracket tree to advance into), or
 * resolveDoubleElimSlot (DOUBLE_ELIM — see its own doc comment) depending on
 * the tournament's format; this wrapper adds the tournament-scope lookup +
 * audit row shared by all four.
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

  // Filled inside the transaction, sent after it commits — a failed
  // notification must never roll back a reported result.
  let cutOutcomes: Array<{ entryId: string; groupPlacement: number; bracket: "upper" | "lower" | "out" }> = [];
  let newFixtures: CreatedFixture[] = [];

  const settled = await db.$transaction(async (tx) => {
    if (tournament.format === "ROUND_ROBIN" || tournament.format === "SWISS") {
      await resolveRoundRobinSlot(tx, tmId, winnerEntryId, opts.matchId ?? null);
    } else if (tournament.format === "GROUP_DOUBLE_ELIM") {
      // Dispatch on the MATCH's bracket, not the tournament's format: this one
      // format contains both kinds of slot. A group fixture resolves with
      // round-robin semantics (mark it done, advance nobody, eliminate nobody —
      // the cut happens later, from the standings); a playoff slot resolves as
      // ordinary double elimination.
      if (slot.bracket === "G") {
        await resolveRoundRobinSlot(tx, tmId, winnerEntryId, opts.matchId ?? null);
      } else {
        // B comes from the STORED bracket size. The W-round-1 count the plain
        // DOUBLE_ELIM branch uses below would be 0 here — this format never
        // seeds that round — and B=0 throws inside losersBracketStructure,
        // making every playoff match permanently unreportable.
        const B = tournament.bracketSize ?? 0;
        await resolveDoubleElimSlot(tx, tournamentId, B, tmId, winnerEntryId, opts.matchId ?? null);
      }
    } else if (tournament.format === "DOUBLE_ELIM") {
      // B = the ACTUAL seeded bracket size, derived from the real W-round-1
      // slot count — NOT nextPow2(maxPlayers), which only bounds the seeded
      // size from above (see resolveDoubleElimSlot's doc comment).
      const wRound1Count = await tx.tournamentMatch.count({ where: { tournamentId, bracket: "W", round: 1 } });
      const B = wRound1Count * 2;
      await resolveDoubleElimSlot(tx, tournamentId, B, tmId, winnerEntryId, opts.matchId ?? null);
    } else {
      await resolveTournamentSlot(tx, tmId, winnerEntryId, opts.matchId ?? null);
    }
    const after = await tx.tournamentMatch.findUniqueOrThrow({ where: { id: tmId } });

    if (tournament.format === "SWISS") {
      await maybeGenerateNextSwissRound(tx, tournament.id, tournament.rounds!, after.round);
    }

    if (tournament.format === "GROUP_DOUBLE_ELIM" && after.bracket === "G") {
      const shape = groupShapeOf(tournament);
      // Generate the next group round, then — if that was the last one — cut the
      // field and seed the playoff bracket. Both are no-ops until their round is
      // genuinely complete, and both are idempotent.
      newFixtures = await maybeAdvanceGroupStage(tx, tournamentId, shape, after.round);
      cutOutcomes = await maybeStartPlayoffs(tx, tournamentId, shape);
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

  // The group stage just ended: tell everyone whether they are through, and to
  // which side of the bracket. Empty for every other report.
  await notifyFixtureReady(newFixtures);
  await notifyGroupCut(tournamentId, cutOutcomes);

  return settled;
}

/**
 * SWISS progressive round generation. Checks whether `justResolvedRound` is
 * now fully done (every match in that round has status "done"); if so AND
 * it's not yet the final configured round, computes standings-so-far +
 * the set of already-played pairs from every existing TournamentMatch row,
 * pairs the next round via `swissPairNextRound`, and creates those matches.
 *
 * CONCURRENCY GUARD (partial — does NOT cover every race, see below): two
 * reports racing to complete the round's SAME last match (e.g. a
 * double-submit) both attempt this function; the P2002 catch around the
 * round+1 `create` below means at most one generation survives if both
 * reach the create step with the round already fully done in their own
 * transaction's view — it prevents a DUPLICATE round, never a lost one.
 *
 * IMPORTANT — this guard does NOT prevent zero-generation: two reports for
 * the round's two DIFFERENT last matches, racing under READ COMMITTED, can
 * each read `roundMatches` before the other's `status:"done"` update
 * commits — each transaction then sees its OWN match done but the OTHER
 * still "ready", concludes the round isn't fully done yet, and returns
 * early at the `roundMatches.some(...)` check below without ever reaching
 * the create step. Both transactions can commit having generated nothing,
 * even though the round genuinely finished. This function alone cannot
 * close that window (it only ever sees one committed snapshot per call).
 * The real fix is `recoverMissingSwissRounds`, called from
 * `completeTournament` — it re-checks after every relevant transaction has
 * committed and lazily generates whatever this function's callers missed,
 * so a lost generation here is always self-healing rather than a permanent
 * stall. See recoverMissingSwissRounds's doc comment for the full picture.
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

/**
 * BUG 2 FIX — lazily recover any SWISS round that finished but never got its
 * next round generated, because `maybeGenerateNextSwissRound` lost the
 * concurrent-report race (see its doc comment for the exact mechanism: two
 * different-match reports racing under READ COMMITTED can each see the
 * round as not-yet-done and both skip generation, even though the round IS
 * fully done once both commit).
 *
 * Called unconditionally at the top of `completeTournament`'s SWISS branch,
 * BEFORE the NOT_FINISHED readiness check — this is what turns "stranded
 * forever" into "self-heals on the very next Complete attempt (or any
 * future one)". Runs in its OWN fresh transaction (separate from Complete's
 * main transaction) specifically so its reads see every prior report's
 * fully-committed state — the exact snapshot the racing reports couldn't
 * see of EACH OTHER, but which is trivially available by the time anyone
 * calls Complete afterward.
 *
 * Walks forward one round at a time (not just "the max round"): each step
 * re-derives the max existing round from the DB (never trusts a stale
 * count across iterations) and calls `maybeGenerateNextSwissRound` for it;
 * that function is itself idempotent (a no-op if round+1 already exists or
 * the round isn't fully done), so this loop is safe to call on every
 * Complete attempt, stranded or not — it terminates the moment a round
 * isn't fully done yet (the real "not finished" case) or the final round
 * has already been reached.
 */
async function recoverMissingSwissRounds(db: Db, tournamentId: string, finalRound: number) {
  // Bounded by finalRound so a malformed/adversarial state can never loop
  // unboundedly — there are at most `finalRound` rounds to ever recover.
  for (let i = 0; i < finalRound; i++) {
    const maxRoundRow = await db.tournamentMatch.findFirst({ where: { tournamentId }, orderBy: { round: "desc" } });
    const maxRound = maxRoundRow?.round ?? 0;
    if (maxRound === 0 || maxRound >= finalRound) return; // nothing seeded yet, or already at/past the final round

    const before = await db.tournamentMatch.count({ where: { tournamentId, round: maxRound + 1 } });
    if (before > 0) return; // next round already exists — nothing stranded at this step

    await db.$transaction((tx) => maybeGenerateNextSwissRound(tx, tournamentId, finalRound, maxRound));

    const after = await db.tournamentMatch.count({ where: { tournamentId, round: maxRound + 1 } });
    if (after === 0) return; // maxRound genuinely isn't fully done yet (real NOT_FINISHED) — stop, don't loop forever
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
    // LAZY RECOVERY (BUG 2 fix): reportResult's own progressive generation
    // can be lost to a genuine READ COMMITTED race — if a round's last TWO
    // matches are reported concurrently in DIFFERENT transactions, each
    // transaction's read of "is this round fully done?" can miss the
    // other's still-uncommitted update, so BOTH observe the round as
    // not-yet-done and BOTH skip generation, even though the round IS fully
    // done once both commit. That would strand the tournament forever (round
    // fully done, round+1 never created, Complete 409s NOT_FINISHED with no
    // way out). Recover here, unconditionally, before the readiness check:
    // walk forward from whatever round currently exists, generating any
    // round whose predecessor is fully done but wasn't generated yet —
    // idempotent/no-op when nothing is actually stranded.
    await recoverMissingSwissRounds(db, tournamentId, tournament.rounds ?? 1);

    // Ready only once the FINAL configured round exists and every match in
    // it is done — an in-progress final round (or the final round not yet
    // generated because an earlier round is still open) must still 409.
    const finalRoundMatches = await db.tournamentMatch.findMany({ where: { tournamentId, round: tournament.rounds ?? -1 } });
    if (finalRoundMatches.length === 0 || finalRoundMatches.some((m) => m.status !== "done")) {
      throw err.conflict("NOT_FINISHED", "Not every Swiss round has been reported yet");
    }
  } else if (tournament.format === "DOUBLE_ELIM" || tournament.format === "GROUP_DOUBLE_ELIM") {
    if (tournament.format === "GROUP_DOUBLE_ELIM") {
      // LAZY RECOVERY, same reasoning as the SWISS branch above: a concurrent
      // pair of reports can lose a group round's generation, or the whole
      // group→playoff transition, to a READ COMMITTED race. Unlike Swiss, the
      // stranded state can be "group stage finished, no bracket ever created",
      // which no player action can escape. Idempotent when nothing is stuck.
      // The ready-check sweeper calls this too, so a stranded cup heals on its
      // own rather than waiting for an admin to attempt Complete.
      await recoverGroupDoubleElim(db, tournamentId, groupShapeOf(tournament));
    }
    // Ready only once the Grand Final is fully decided: game 1 (round
    // GF_ROUND) done AND either (a) the W-side won it outright (no reset,
    // champion decided) or (b) a reset happened and game 2 (GF_RESET_ROUND)
    // is ALSO done. Checking "game 1 done" alone would incorrectly allow
    // Complete right after a reset-triggering game 1, before game 2 exists.
    const gf1 = await db.tournamentMatch.findFirst({ where: { tournamentId, bracket: "GF", round: GF_ROUND } });
    if (!gf1 || gf1.status !== "done" || !gf1.winnerEntryId) {
      throw err.conflict("NOT_FINISHED", "The double-elim grand final hasn't been decided yet");
    }
    const wasReset = gf1.winnerEntryId === gf1.blueEntryId; // L-side (blue) won game 1 → reset happened
    if (wasReset) {
      const gf2 = await db.tournamentMatch.findFirst({ where: { tournamentId, bracket: "GF", round: GF_RESET_ROUND } });
      if (!gf2 || gf2.status !== "done" || !gf2.winnerEntryId) {
        throw err.conflict("NOT_FINISHED", "The grand-final bracket reset hasn't been decided yet");
      }
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
    const result = await db.$transaction(async (tx) => {
      // FIRST STEP: guarded status flip.
      const flip = await tx.tournament.updateMany({ where: { id: tournamentId, status: "RUNNING" }, data: { status: "COMPLETED", completedAt: new Date() } });
      if (flip.count === 0) throw new Error("ALREADY_TERMINAL");

      const placements: PlacementRow[] =
        tournament.format === "ROUND_ROBIN"
          ? await computeRoundRobinPlacements(tx, tournamentId)
          : tournament.format === "SWISS"
            ? await computeSwissPlacements(tx, tournamentId)
            : tournament.format === "DOUBLE_ELIM"
              ? await computeDoubleElimPlacementsTx(tx, tournamentId)
              : tournament.format === "GROUP_DOUBLE_ELIM"
                ? await computeGroupDoubleElimPlacements(tx, tournamentId)
                : await computeSingleElimPlacements(tx, tournamentId);

      for (const p of placements) {
        await tx.tournamentEntry.update({ where: { id: p.entryId }, data: { placement: p.placement } }).catch(() => {});
      }

      // Shared payout-by-placement loop. Placement i (1-based) is worth
      // split[i-1] gold, but placements are NOT necessarily distinct: every
      // format with a losers bracket produces TIES with GAPS by design —
      // computeDoubleElimPlacements returns e.g. 1,2,3,4,5,5,7,7, and
      // GROUP_DOUBLE_ELIM stacks tied group-stage exits on top of that.
      //
      // A tied group therefore SPLITS the pooled value of the consecutive
      // placement slots it occupies: two players tied at 5th share
      // split[4]+split[5] between them. Paying "the first row that matches
      // placement 5" instead would hand one of them split[4], pay nobody for
      // 6th, and leave that gold undistributed while the audit row recorded the
      // full split as paid out — advertised prize pool != gold actually moved.
      //
      // The remainder of an uneven division is dealt out one gold at a time
      // rather than dropped, so the sum paid always equals the sum of the slots
      // covered. Members are ordered by entry id purely for determinism.
      const byPlacement = new Map<number, string[]>();
      for (const p of placements) {
        if (!byPlacement.has(p.placement)) byPlacement.set(p.placement, []);
        byPlacement.get(p.placement)!.push(p.entryId);
      }

      const paidOut: Array<{ placement: number; entryId: string; amount: number }> = [];
      for (const place of [...byPlacement.keys()].sort((a, b) => a - b)) {
        const members = [...byPlacement.get(place)!].sort();

        let pot = 0;
        for (let i = place; i <= place + members.length - 1; i++) {
          const amount = split[i - 1] ?? 0;
          if (amount > 0) pot += amount;
        }
        if (pot <= 0) continue;

        const each = Math.floor(pot / members.length);
        let remainder = pot - each * members.length;
        for (const entryId of members) {
          const amount = each + (remainder > 0 ? 1 : 0);
          if (remainder > 0) remainder -= 1;
          if (amount <= 0) continue;
          const entry = await tx.tournamentEntry.findUniqueOrThrow({ where: { id: entryId } });
          await payPrizeTx(tx, entry, amount);
          paidOut.push({ placement: place, entryId, amount });
        }
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
      return { championEntryId, runnerUpEntryId, payout: split, placements, paidOut };
    });

    // AFTER the payout transaction has COMMITTED. Everyone learns how they
    // finished, and anyone paid learns what they won — a gold balance moving
    // with no explanation is indistinguishable from a bug. Best-effort by
    // construction: notifyFinalPlacements swallows its own errors, so a bell
    // failure can never unwind a prize that has already been paid.
    await notifyFinalPlacements(tournamentId, result.placements, result.paidOut);
    return result;
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
 * DOUBLE_ELIM placement branch — thin DB wrapper around the pure
 * `computeDoubleElimPlacements(matches)`: champion = Grand Final's ultimate
 * winner (1), runner-up = the L-bracket champion (2, whether they lost GF
 * game 1 outright or lost the reset game 2), everyone else ranked by
 * L-bracket elimination round (later = higher placement).
 */
async function computeDoubleElimPlacementsTx(tx: Tx, tournamentId: string): Promise<PlacementRow[]> {
  const matches = await tx.tournamentMatch.findMany({
    where: { tournamentId },
    select: { bracket: true, round: true, slot: true, redEntryId: true, blueEntryId: true, winnerEntryId: true, status: true },
  });
  const asLike: DoubleElimMatchLike[] = matches.map((m) => ({
    bracket: m.bracket,
    round: m.round,
    slot: m.slot,
    redEntryId: m.redEntryId,
    blueEntryId: m.blueEntryId,
    winnerEntryId: m.winnerEntryId,
    status: m.status,
  }));
  return computeDoubleElimPlacements(asLike);
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
