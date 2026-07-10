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
import { seedPairings, parentSlot, resolveTournamentSlot } from "../lib/tournament-bracket.js";

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
  const B = nextPow2(n);
  const rounds = Math.log2(B);

  try {
    return await db.$transaction(async (tx) => {
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
  } catch (e) {
    if (e instanceof Error && e.message === "ALREADY_STARTED") throw err.conflict("ALREADY_TERMINAL", "Tournament already started");
    if (e instanceof ApiError) throw e;
    throw e;
  }
}

// ─────────────────────────── Report result (advance) ───────────────────────────

/**
 * The only V1 bracket-advance path: admin reports the winner of a `ready`
 * slot. Delegates to resolveTournamentSlot for the atomic guard + advance;
 * this wrapper adds the tournament-scope lookup + audit row.
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
  const slot = await db.tournamentMatch.findUnique({ where: { id: tmId } });
  if (!slot || slot.tournamentId !== tournamentId) throw err.notFound("NO_TOURNAMENT_MATCH", "Tournament match slot not found");

  return db.$transaction(async (tx) => {
    await resolveTournamentSlot(tx, tmId, winnerEntryId, opts.matchId ?? null);
    const after = await tx.tournamentMatch.findUniqueOrThrow({ where: { id: tmId } });

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

// ─────────────────────────── Complete (pay prizes) ───────────────────────────

/**
 * Pay the champion + runner-up. Status flip is the FIRST step of the
 * transaction (atomic claim) so a losing concurrent complete 409s before
 * touching the ledger — this is what prevents double-pay, not merely the
 * ledger's unique index.
 *
 * `actorId` is the ACTING admin (the one who clicked Complete) — the audit
 * row must attribute to them, never to the tournament's creator.
 */
export async function completeTournament(db: Db, tournamentId: string, actorId: string, reason?: string) {
  const tournament = await db.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) throw err.notFound("NO_TOURNAMENT", "Tournament not found");

  const split = Array.isArray(tournament.prizeSplitGold) ? (tournament.prizeSplitGold as unknown as number[]) : [];
  if (split.length !== 2 || split[0]! + split[1]! !== tournament.prizePoolGold) {
    throw err.badRequest("PRIZE_SPLIT_MISMATCH", "prizeSplitGold must be a 2-tuple summing to prizePoolGold");
  }

  if (tournament.status !== "RUNNING") {
    // Pre-check for a clearer error before touching the transaction, but the
    // guarded flip below is still the real race-proof gate.
    if (tournament.status === "COMPLETED" || tournament.status === "CANCELLED") throw err.conflict("ALREADY_TERMINAL", "Tournament is already terminal");
  }

  // Find the final round's done slot (the champion) BEFORE flipping, to fail
  // fast with NOT_FINISHED if there's no champion yet.
  const maxRoundRow = await db.tournamentMatch.findFirst({ where: { tournamentId }, orderBy: { round: "desc" } });
  const finalRound = maxRoundRow?.round ?? 0;
  const finalSlot = await db.tournamentMatch.findFirst({ where: { tournamentId, round: finalRound } });
  if (!finalSlot || finalSlot.status !== "done" || !finalSlot.winnerEntryId) {
    throw err.conflict("NOT_FINISHED", "The tournament has no champion yet");
  }

  try {
    return await db.$transaction(async (tx) => {
      // FIRST STEP: guarded status flip.
      const flip = await tx.tournament.updateMany({ where: { id: tournamentId, status: "RUNNING" }, data: { status: "COMPLETED", completedAt: new Date() } });
      if (flip.count === 0) throw new Error("ALREADY_TERMINAL");

      const finalRow = await tx.tournamentMatch.findUniqueOrThrow({ where: { id: finalSlot.id } });
      const championEntryId = finalRow.winnerEntryId!;
      const runnerUpEntryId = finalRow.redEntryId === championEntryId ? finalRow.blueEntryId : finalRow.redEntryId;

      await tx.tournamentEntry.update({ where: { id: championEntryId }, data: { placement: 1 } });
      if (runnerUpEntryId) await tx.tournamentEntry.update({ where: { id: runnerUpEntryId }, data: { placement: 2 } });

      // Display-only placement 3 for the semifinal losers (never paid).
      if (finalRound >= 2) {
        const semis = await tx.tournamentMatch.findMany({ where: { tournamentId, round: finalRound - 1, status: "done" } });
        for (const m of semis) {
          const loser = m.redEntryId === m.winnerEntryId ? m.blueEntryId : m.redEntryId;
          if (loser) await tx.tournamentEntry.update({ where: { id: loser }, data: { placement: 3 } }).catch(() => {});
        }
      }

      const champEntry = await tx.tournamentEntry.findUniqueOrThrow({ where: { id: championEntryId } });
      if (split[0]! > 0) await payPrizeTx(tx, champEntry, split[0]!);
      if (runnerUpEntryId && split[1]! > 0) {
        const runnerEntry = await tx.tournamentEntry.findUniqueOrThrow({ where: { id: runnerUpEntryId } });
        await payPrizeTx(tx, runnerEntry, split[1]!);
      }

      await audit(tx, {
        actorId,
        action: "tournament.complete",
        targetType: "tournament",
        targetId: tournamentId,
        before: { status: "RUNNING" },
        after: { status: "COMPLETED", championEntryId, runnerUpEntryId, payout: split },
        reason: reason ?? "admin complete",
      });

      return { championEntryId, runnerUpEntryId, payout: split };
    });
  } catch (e) {
    if (e instanceof Error && e.message === "ALREADY_TERMINAL") throw err.conflict("ALREADY_TERMINAL", "Tournament is already terminal");
    if (e instanceof ApiError) throw e;
    throw e;
  }
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
