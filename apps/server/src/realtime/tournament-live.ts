import type { Server as IOServer, Socket } from "socket.io";
import { EV, DEFAULT_SETTINGS, roundLabel, bracketOfRound, type GameSettings } from "@dama/shared";
import { prisma } from "../db/client.js";
import { err, ApiError } from "../lib/errors.js";
import { audit } from "../lib/audit.js";
import { reportResult } from "../modules/tournaments-core.js";
import { recoverGroupDoubleElim, groupShapeOf } from "../modules/tournament-groups.js";
import { notifyOpponentReadied, notifyFixtureClockStarted, notifyForfeit } from "../lib/tournament-notify.js";
import { createLiveMatch, onMatchEnd } from "./match.js";
import { scheduleJob, cancelJob } from "./jobs.js";
import { allow } from "./rate-limit.js";

/**
 * Tournament LIVE play — the ready-check, the auto-start handoff, and the
 * auto-advance that resolves a bracket slot once its match settles.
 *
 * Before this module, a tournament was admin-driven end to end: players joined,
 * then played somewhere else, and an admin reported every winner by hand. Here a
 * slot that is `ready` (both competitors known) becomes playable in-app — both
 * players press Ready, the server creates and seeds the match, drops them onto
 * the board, and advances the bracket by itself when the game settles.
 *
 * DELIBERATELY SEPARATE FROM tournaments-core.ts. That module owns gold (entry
 * fees, refunds, prize payouts) and the bracket invariants. This one owns socket
 * handoff and match lifecycle and moves no money at all — its only write into
 * bracket state is a call to core's existing `reportResult`, which already owns
 * every advancement rule (parent-slot filling, elimination, losers-bracket
 * drops, grand-final resets, progressive Swiss generation). Nothing about those
 * rules changes because a robot rather than an admin decided the winner.
 *
 * INVARIANTS
 *  1. ONE live match per slot. `TournamentMatch.matchId` is @unique and is
 *     claimed with a conditional update (`where: { matchId: null }`); the loser
 *     of that race deletes the Match row it optimistically created. Two players
 *     pressing Ready at the same instant can never produce two boards.
 *  2. READY IS A COMMITMENT — there is no un-ready. Disarming the deadline would
 *     let a player stall the bracket indefinitely (ready, wait, un-ready,
 *     repeat).
 *     This used to add that "neither side ready at the deadline" was unreachable
 *     by construction, because only a Ready ever armed the clock. The organiser
 *     START TIMER (Tournament.startWindowSec) makes it reachable on purpose: a
 *     fixture where NOBODY turns up otherwise has no clock at all and blocks its
 *     round forever. That state now resolves to the better seed — see
 *     resolveNoShow.
 *  3. EVERY automatic transition is recoverable. The no-show timer rides the
 *     at-most-once job queue and the advance rides a fire-and-forget onMatchEnd
 *     hook, so both can be dropped by an unlucky crash; `sweepTournamentReadyChecks`
 *     re-derives and applies whichever was lost. A dropped signal delays a slot,
 *     it never strands one.
 */

/** Match-mode-shaped settings for a tournament game. Tournament matches use the
 *  house defaults — a per-slot settings negotiation would be another lobby, and
 *  a Cup's games should be identical for everyone anyway. */
const TOURNAMENT_SETTINGS: GameSettings = { ...DEFAULT_SETTINGS };

/** Audit actor for transitions no human triggered. `AuditLog.actorId` is a plain
 *  String with no FK to User, so a sentinel is safe — and it keeps automatic
 *  advances visible in the same trail as admin reports. */
const SYSTEM_ACTOR = "system";

// ─────────────────────────── myMatch payload ───────────────────────────

export type TournamentMyMatch = {
  tournamentId: string;
  tmId: string;
  round: number;
  bracket: string;
  roundLabel: string;
  opponent: { userId: string; username: string; tag: string; avatarUrl: string | null; frameId: string | null } | null;
  iAmReady: boolean;
  opponentReady: boolean;
  deadlineAt: string | null;
  matchId: string | null;
  yourColor: "red" | "blue";
};

/**
 * The signed-in player's current playable slot in this tournament, or null.
 *
 * "Current" = the EARLIEST unresolved slot they are seated in, by (round, slot).
 *
 * Elimination and Swiss formats seat a player in exactly one live slot at a
 * time, so "earliest" and "only" coincide there. ROUND_ROBIN does NOT: it
 * creates every fixture up front, so a player genuinely has several unresolved
 * slots and this function picks one of them. That made the ordering here
 * load-bearing rather than merely defensive — markReady enforces the SAME
 * ordering, so a player can only ready the fixture this function would have
 * shown them. See the rationale in markReady.
 *
 * Returned by GET /api/tournaments/:id AND pushed over EV.tournamentMatchState,
 * so both clients render one code path whether they polled or were pushed.
 */
export async function myTournamentMatch(tournamentId: string, userId: string): Promise<TournamentMyMatch | null> {
  const entry = await prisma.tournamentEntry.findUnique({
    where: { tournamentId_userId: { tournamentId, userId } },
    select: { id: true },
  });
  if (!entry) return null;

  const slot = await prisma.tournamentMatch.findFirst({
    where: {
      tournamentId,
      status: { not: "done" },
      OR: [{ redEntryId: entry.id }, { blueEntryId: entry.id }],
    },
    orderBy: [{ round: "asc" }, { slot: "asc" }],
  });
  if (!slot) return null;

  const iAmRed = slot.redEntryId === entry.id;
  const opponentEntryId = iAmRed ? slot.blueEntryId : slot.redEntryId;
  const opponentEntry = opponentEntryId
    ? await prisma.tournamentEntry.findUnique({
        where: { id: opponentEntryId },
        select: { user: { select: { id: true, username: true, tag: true, avatarUrl: true, frameId: true } } },
      })
    : null;

  // Round names come from the same helper the bracket columns use, so the card
  // and the bracket never disagree about what "Semifinals" means.
  const sectionRounds = (
    await prisma.tournamentMatch.findMany({
      where: { tournamentId, bracket: slot.bracket },
      select: { round: true },
      distinct: ["round"],
      orderBy: { round: "asc" },
    })
  ).map((r) => r.round);
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { format: true } });

  return {
    tournamentId,
    tmId: slot.id,
    round: slot.round,
    bracket: slot.bracket,
    roundLabel: roundLabel(slot.round, sectionRounds, tournament?.format === "DOUBLE_ELIM"),
    opponent: opponentEntry?.user
      ? {
          userId: opponentEntry.user.id,
          username: opponentEntry.user.username,
          tag: opponentEntry.user.tag,
          avatarUrl: opponentEntry.user.avatarUrl,
          frameId: opponentEntry.user.frameId,
        }
      : null,
    iAmReady: (iAmRed ? slot.redReadyAt : slot.blueReadyAt) != null,
    opponentReady: (iAmRed ? slot.blueReadyAt : slot.redReadyAt) != null,
    deadlineAt: slot.readyDeadlineAt ? slot.readyDeadlineAt.toISOString() : null,
    matchId: slot.matchId,
    yourColor: iAmRed ? "red" : "blue",
  };
}

/** Push the current myMatch state to both competitors of a slot. */
async function broadcastSlotState(io: IOServer, tournamentId: string, userIds: Array<string | null>): Promise<void> {
  for (const uid of userIds) {
    if (!uid) continue;
    const state = await myTournamentMatch(tournamentId, uid).catch(() => null);
    io.to(`presence:${uid}`).emit(EV.tournamentMatchState, state);
  }
}

/** The two seated users of a slot (null where a side is empty). */
async function seatUsers(slot: { redEntryId: string | null; blueEntryId: string | null }): Promise<{ redUserId: string | null; blueUserId: string | null }> {
  const ids = [slot.redEntryId, slot.blueEntryId].filter((v): v is string => v != null);
  const entries = await prisma.tournamentEntry.findMany({ where: { id: { in: ids } }, select: { id: true, userId: true } });
  const by = new Map(entries.map((e) => [e.id, e.userId]));
  return {
    redUserId: slot.redEntryId ? (by.get(slot.redEntryId) ?? null) : null,
    blueUserId: slot.blueEntryId ? (by.get(slot.blueEntryId) ?? null) : null,
  };
}

// ─────────────────────────── Ready → auto-start ───────────────────────────

/**
 * Mark `userId` ready on slot `tmId`, and auto-start the match if that was the
 * second player.
 *
 * Idempotent: pressing Ready again is a no-op that neither re-arms the deadline
 * nor re-starts the match.
 *
 * Exported for direct testing — the socket handler is a thin wrapper.
 */
export async function markReady(io: IOServer, tmId: string, userId: string): Promise<TournamentMyMatch | null> {
  const slot = await prisma.tournamentMatch.findUnique({ where: { id: tmId } });
  if (!slot) throw err.notFound("NO_TOURNAMENT_MATCH", "Tournament match slot not found");

  const tournament = await prisma.tournament.findUnique({ where: { id: slot.tournamentId } });
  if (!tournament) throw err.notFound("NO_TOURNAMENT", "Tournament not found");
  if (tournament.status !== "RUNNING") throw err.conflict("BAD_STATE", "This tournament isn't running");

  if (slot.status === "done") throw err.conflict("SLOT_DONE", "This match is already decided");
  if (slot.status !== "ready") throw err.conflict("SLOT_NOT_READY", "This match is still waiting for an opponent");
  // Already live: the client should be resyncing into the board, not readying.
  if (slot.matchId) throw err.conflict("ALREADY_STARTED", "This match is already in progress");

  const { redUserId, blueUserId } = await seatUsers(slot);
  const iAmRed = redUserId === userId;
  const iAmBlue = blueUserId === userId;
  if (!iAmRed && !iAmBlue) throw err.forbidden("NOT_A_PARTICIPANT", "You aren't a competitor in this match");

  // A player may only ready the slot their client is ACTUALLY SHOWING them —
  // i.e. the same "current" slot myTournamentMatch resolves, using the same
  // ordering. Without this, readying is exploitable in any format that has more
  // than one live fixture per player at a time:
  //
  //   ROUND_ROBIN creates EVERY fixture status:"ready" up front (startRoundRobin),
  //   but myTournamentMatch only ever surfaces the EARLIEST unresolved one. So a
  //   player could ready a fixture their opponent's UI was not pointing at, arm
  //   that opponent's no-show clock, and take the win by forfeit via resolveNoShow
  //   without a game ever being played. It also fired by ACCIDENT: anyone who
  //   cleared their fixtures faster than the field ended up holding matches their
  //   opponents could not see.
  //
  // Single-elim, Swiss and double-elim seat a player in one live slot at a time,
  // so for them this check is a no-op. It does not deadlock a stuck round robin
  // either: an absent opponent on the earliest fixture is resolved by that
  // fixture's own no-show forfeit, which then promotes the next one.
  const myEntryId = iAmRed ? slot.redEntryId : slot.blueEntryId;
  const currentSlot = await prisma.tournamentMatch.findFirst({
    where: {
      tournamentId: slot.tournamentId,
      status: { not: "done" },
      OR: [{ redEntryId: myEntryId }, { blueEntryId: myEntryId }],
    },
    orderBy: [{ round: "asc" }, { slot: "asc" }],
    select: { id: true },
  });
  if (currentSlot && currentSlot.id !== tmId) {
    throw err.conflict("NOT_YOUR_CURRENT_MATCH", "Finish your current match first");
  }

  const alreadyReady = (iAmRed ? slot.redReadyAt : slot.blueReadyAt) != null;
  const opponentReady = (iAmRed ? slot.blueReadyAt : slot.redReadyAt) != null;

  if (!alreadyReady) {
    const now = new Date();
    // Arm the opponent's no-show clock on the FIRST ready only. `readyDeadlineAt`
    // is written conditionally (only when still null) so a simultaneous pair of
    // first-readies can't move the deadline later than the earliest one.
    const armDeadline = slot.readyDeadlineAt == null;
    const deadline = armDeadline ? new Date(now.getTime() + tournament.readyWindowSec * 1000) : slot.readyDeadlineAt;

    await prisma.tournamentMatch.updateMany({
      where: { id: tmId, ...(iAmRed ? { redReadyAt: null } : { blueReadyAt: null }) },
      data: {
        ...(iAmRed ? { redReadyAt: now } : { blueReadyAt: now }),
        ...(armDeadline ? { readyDeadlineAt: deadline } : {}),
      },
    });

    if (armDeadline && deadline) {
      // Prompt firing; the sweeper is what makes it certain (jobs are at-most-once).
      await scheduleJob("tournament-noshow", tmId, Math.max(0, deadline.getTime() - now.getTime()), { tmId });
    }

    // Warn the other side that their clock is running. This is the ONLY signal a
    // player gets before losing a match they never saw, so it is sent on every
    // first-ready — not only when this call armed the deadline, since the
    // organiser start timer may have armed it earlier.
    if (!opponentReady) {
      const fresh = await prisma.tournamentMatch.findUnique({ where: { id: tmId } });
      if (fresh) await notifyOpponentReadied(fresh);
    }
  }

  // Second ready → play ball.
  if (opponentReady || alreadyReady) {
    const fresh = await prisma.tournamentMatch.findUnique({ where: { id: tmId } });
    if (fresh && fresh.redReadyAt && fresh.blueReadyAt && !fresh.matchId) {
      await autoStartMatch(io, tmId);
      // autoStartMatch broadcasts tournamentStart + state itself.
      return myTournamentMatch(slot.tournamentId, userId);
    }
  }

  await broadcastSlotState(io, slot.tournamentId, [redUserId, blueUserId]);
  return myTournamentMatch(slot.tournamentId, userId);
}

/**
 * Create the real Match for a slot whose competitors have both readied, seed it
 * live, and push both players onto the board.
 *
 * ORDERING IS THE RACE GUARD. `matchId` is a foreign key, so the Match row has
 * to exist before the slot can point at it; the claim is therefore a conditional
 * update AFTER the insert, and a loser deletes the row it just created. Doing it
 * the other way round (claim, then create) isn't possible without a nullable
 * sentinel, and "just check first" would be a TOCTOU. Match rows are cheap and
 * this race needs two simultaneous second-readies on the same slot.
 */
async function autoStartMatch(io: IOServer, tmId: string): Promise<void> {
  const slot = await prisma.tournamentMatch.findUnique({ where: { id: tmId } });
  if (!slot || slot.matchId || slot.status !== "ready") return;

  const tournament = await prisma.tournament.findUnique({ where: { id: slot.tournamentId } });
  if (!tournament || tournament.status !== "RUNNING") return;

  const { redUserId, blueUserId } = await seatUsers(slot);
  if (!redUserId || !blueUserId) return; // a bye never reaches here (byes are created `done`)

  // `matchMode` has existed on Tournament since the first tournaments migration,
  // admin-settable and read by nothing — it was reserved for exactly this. CASUAL
  // (the default) means no ranked trophies and the normal per-win gold, and still
  // gets anti-cheat analysis; an admin who picks RANKED opts that Cup into the ladder.
  const match = await prisma.match.create({
    data: {
      mode: tournament.matchMode,
      origin: "TOURNAMENT",
      redId: redUserId,
      blueId: blueUserId,
      settings: TOURNAMENT_SETTINGS as unknown as object,
      moves: [] as unknown as object,
    },
    select: { id: true },
  });

  const claim = await prisma.tournamentMatch.updateMany({
    where: { id: tmId, matchId: null, status: "ready" },
    data: { matchId: match.id, readyDeadlineAt: null },
  });
  if (claim.count === 0) {
    // Lost the race — another call already started this slot. Drop the orphan.
    await prisma.match.delete({ where: { id: match.id } }).catch(() => {});
    return;
  }

  await cancelJob("tournament-noshow", tmId);

  // Seed the live match BEFORE anyone can move. Awaited for the same reason
  // rooms.ts awaits it: not awaiting races the first match:move ahead of the
  // Redis write, which surfaces to the player as "no such match".
  await createLiveMatch(match.id, redUserId, blueUserId, tournament.matchMode, TOURNAMENT_SETTINGS);

  // Put both players' live sockets into the match room, then tell them to open
  // the board — the same handoff a private room performs on start.
  for (const uid of [redUserId, blueUserId]) {
    const room = io.sockets.adapter.rooms.get(`presence:${uid}`);
    if (room) for (const sid of room) io.sockets.sockets.get(sid)?.join(match.id);
  }
  const base = { tournamentId: slot.tournamentId, tmId, matchId: match.id };
  io.to(`presence:${redUserId}`).emit(EV.tournamentStart, { ...base, yourColor: "red" });
  io.to(`presence:${blueUserId}`).emit(EV.tournamentStart, { ...base, yourColor: "blue" });

  await broadcastSlotState(io, slot.tournamentId, [redUserId, blueUserId]);
}

// ─────────────────────────── Auto-advance on settle ───────────────────────────

/**
 * Resolve the bracket slot backing a just-settled match.
 *
 * Registered as an onMatchEnd hook, so it runs for EVERY match in the game —
 * the `findUnique` on the unique `matchId` index is the cheap negative answer
 * for ordinary matches and must stay a single indexed lookup.
 *
 * Exported so the sweeper (and tests) can drive the same path directly.
 */
export async function advanceForSettledMatch(io: IOServer, matchId: string): Promise<void> {
  const slot = await prisma.tournamentMatch.findUnique({ where: { matchId } });
  if (!slot) return; // an ordinary match — nothing to do
  if (slot.status === "done") return; // already advanced (admin report, or a re-run of this)

  const match = await prisma.match.findUnique({ where: { id: matchId }, select: { winner: true, endedAt: true } });
  if (!match || !match.endedAt) return; // not actually settled yet

  const { redUserId, blueUserId } = await seatUsers(slot);

  // A DRAW decides nothing, and a bracket slot needs exactly one winner. Reset
  // the slot so the pair can replay it: clear the ready state and release
  // `matchId` (it is @unique, so a replay cannot claim a new match until this
  // one lets go). The drawn Match row itself stays in history untouched.
  if (match.winner !== "red" && match.winner !== "blue") {
    await prisma.tournamentMatch.update({
      where: { id: slot.id },
      data: { matchId: null, redReadyAt: null, blueReadyAt: null, readyDeadlineAt: null },
    });
    await audit(prisma, {
      actorId: SYSTEM_ACTOR,
      action: "tournament.match.draw-replay",
      targetType: "tournamentMatch",
      targetId: slot.id,
      before: { matchId },
      after: { matchId: null, replay: true },
      reason: "drawn tournament match — slot reset for a replay",
    }).catch(() => {});
    await broadcastSlotState(io, slot.tournamentId, [redUserId, blueUserId]);
    return;
  }

  const winnerEntryId = match.winner === "red" ? slot.redEntryId : slot.blueEntryId;
  if (!winnerEntryId) return; // malformed slot — leave it for an admin rather than guessing

  try {
    await reportResult(prisma, slot.tournamentId, slot.id, winnerEntryId, {
      matchId,
      actorId: SYSTEM_ACTOR,
      reason: "auto-advance: tournament match settled",
    });
  } catch (e) {
    // SLOT_DONE means somebody (an admin, or a racing re-run of this hook) got
    // there first — that is a success for our purposes, not a failure.
    if (e instanceof ApiError && e.code === "SLOT_DONE") return;
    throw e;
  }

  // Both players may now have a NEXT slot — push fresh state to each.
  await broadcastSlotState(io, slot.tournamentId, [redUserId, blueUserId]);
}

// ─────────────────────────── No-show forfeit ───────────────────────────

/**
 * Forfeit a slot whose ready deadline expired with only one player ready.
 *
 * The player who showed up advances. The "neither ready" case cannot happen: the
 * deadline only exists because somebody readied, and there is no un-ready.
 *
 * Safe to call repeatedly on the same slot — every exit path re-reads current
 * state, and `reportResult` refuses an already-resolved slot.
 */
export async function resolveNoShow(io: IOServer, tmId: string): Promise<boolean> {
  const slot = await prisma.tournamentMatch.findUnique({ where: { id: tmId } });
  if (!slot) return false;
  if (slot.status !== "ready" || slot.matchId) return false; // started or already decided
  if (!slot.readyDeadlineAt || slot.readyDeadlineAt.getTime() > Date.now()) return false; // not expired

  const redReady = slot.redReadyAt != null;
  const blueReady = slot.blueReadyAt != null;
  if (redReady && blueReady) return false; // both ready — auto-start owns it

  let winnerEntryId: string | null;
  let reason: string;

  if (redReady || blueReady) {
    winnerEntryId = redReady ? slot.redEntryId : slot.blueEntryId;
    reason = "auto-advance: opponent did not ready up before the deadline";
  } else {
    // DOUBLE NO-SHOW. Unreachable until the organiser start timer existed,
    // because the clock only ever armed when somebody pressed Ready — so a
    // fixture with nobody present simply had no deadline. With the timer on it
    // does, and this branch is what stops one absent PAIR from blocking a round
    // and stalling the tournament behind it.
    //
    // The better seed advances. It has to be somebody: a bracket slot with no
    // winner never fills its parent, and leaving the fixture unresolved is the
    // stall we are here to prevent. Seed is the only ordering both players
    // earned before the fixture, so it is the least arbitrary tiebreak
    // available, and it is deterministic. An organiser who wants a different
    // outcome can still report the slot manually before the clock expires.
    const seats = await prisma.tournamentEntry.findMany({
      where: { id: { in: [slot.redEntryId, slot.blueEntryId].filter((v): v is string => v != null) } },
      select: { id: true, seed: true },
    });
    const bySeed = [...seats].sort((a, b) => (a.seed ?? Number.MAX_SAFE_INTEGER) - (b.seed ?? Number.MAX_SAFE_INTEGER));
    winnerEntryId = bySeed[0]?.id ?? null;
    reason = "auto-advance: neither player readied up before the deadline (better seed advances)";
  }

  if (!winnerEntryId) return false;

  try {
    await reportResult(prisma, slot.tournamentId, tmId, winnerEntryId, {
      actorId: SYSTEM_ACTOR,
      reason,
    });
  } catch (e) {
    if (e instanceof ApiError && e.code === "SLOT_DONE") return false;
    throw e;
  }

  await notifyForfeit(slot, winnerEntryId, !redReady && !blueReady);

  const { redUserId, blueUserId } = await seatUsers(slot);
  await broadcastSlotState(io, slot.tournamentId, [redUserId, blueUserId]);
  return true;
}

/** Job handler for the `tournament-noshow` timer. */
export async function handleTournamentNoShow(io: IOServer, payload: Record<string, unknown>): Promise<void> {
  const tmId = typeof payload?.tmId === "string" ? payload.tmId : null;
  if (!tmId) return;
  await resolveNoShow(io, tmId);
}

// ─────────────────────────── Backstop sweeper ───────────────────────────

/**
 * Periodic reconciler for the two automatic transitions that can be LOST.
 *
 * (a) The no-show timer rides the Redis job queue, which is at-most-once by
 *     design: a poller that claims the job and then dies loses it, and no
 *     instance retries. Without this sweep an expired slot would wait forever.
 *
 * (b) The advance rides `onMatchEnd`, which is synchronous fire-and-forget — a
 *     crash between settlement and the DB write leaves a slot whose match has
 *     `endedAt` set but whose bracket never moved.
 *
 * Both are re-derived here from durable state, so a dropped signal delays a slot
 * by up to one tick instead of stranding it. Same self-healing philosophy as
 * `recoverMissingSwissRounds` and `sweepAbandonedMatches`. Cheap no-op when
 * nothing is pending: both queries are index-backed and normally return zero rows.
 */
export async function sweepTournamentReadyChecks(io: IOServer): Promise<{ forfeited: number; advanced: number }> {
  let forfeited = 0;
  let advanced = 0;

  // (a) Expired ready deadlines.
  const expired = await prisma.tournamentMatch.findMany({
    where: { status: "ready", matchId: null, readyDeadlineAt: { lte: new Date() } },
    select: { id: true },
    take: 100,
  });
  for (const row of expired) {
    try {
      if (await resolveNoShow(io, row.id)) forfeited++;
    } catch (e) {
      console.error("[tournament-live] no-show sweep failed", row.id, e);
    }
  }

  // (a2) ORGANISER START TIMER — arm the clock on fixtures nobody has readied.
  //
  // readyWindowSec is armed by the FIRST Ready, which means a fixture where
  // neither player turns up carries no deadline at all and is never swept: it
  // blocks its round, and the round blocks the tournament. Where the organiser
  // has set startWindowSec, the clock instead starts from the moment the
  // fixture is playable, so an absent player is resolved whether or not their
  // opponent is there to start it.
  //
  // Armed HERE rather than at every place a fixture becomes ready — there are a
  // dozen of those across five formats, and each would be a chance to forget
  // one. The cost is that the clock starts at the next sweep tick rather than
  // the exact instant, which is immaterial against a window measured in
  // minutes. Only ever WRITES a null deadline, so it can never move a deadline
  // a player's Ready already set.
  const unarmed = await prisma.tournamentMatch.findMany({
    where: {
      status: "ready",
      matchId: null,
      readyDeadlineAt: null,
      tournament: { status: "RUNNING", startWindowSec: { not: null } },
    },
    select: { id: true, tournament: { select: { startWindowSec: true } } },
    take: 200,
  });
  for (const row of unarmed) {
    const window = row.tournament.startWindowSec;
    if (!window) continue;
    const deadline = new Date(Date.now() + window * 1000);
    // Conditional on still being null so a Ready landing in this same instant
    // wins, rather than having its (earlier) deadline pushed out.
    const armed = await prisma.tournamentMatch.updateMany({
      where: { id: row.id, readyDeadlineAt: null, status: "ready", matchId: null },
      data: { readyDeadlineAt: deadline },
    });
    if (armed.count > 0) {
      await scheduleJob("tournament-noshow", row.id, Math.max(0, deadline.getTime() - Date.now()), { tmId: row.id });
      const slot = await prisma.tournamentMatch.findUnique({ where: { id: row.id } });
      // Nobody has acted yet, so BOTH players need telling — that is the whole
      // point of a clock that starts without a player starting it.
      if (slot) await notifyFixtureClockStarted(slot, deadline);
    }
  }

  // (b) Settled matches whose slot never advanced.
  const stranded = await prisma.tournamentMatch.findMany({
    where: { status: { not: "done" }, matchId: { not: null }, match: { endedAt: { not: null } } },
    select: { matchId: true },
    take: 100,
  });
  for (const row of stranded) {
    if (!row.matchId) continue;
    try {
      await advanceForSettledMatch(io, row.matchId);
      advanced++;
    } catch (e) {
      console.error("[tournament-live] advance sweep failed", row.matchId, e);
    }
  }

  // (c) GROUP_DOUBLE_ELIM cups stuck between phases.
  //
  // A concurrent pair of reports can lose a group round's generation — or the
  // whole group-to-playoff transition — to a READ COMMITTED race (the mechanism
  // is documented on maybeGenerateNextSwissRound). Swiss recovers this from
  // completeTournament, but that is not enough here: Complete is only reachable
  // once the PLAYOFFS are over, so "group stage finished, bracket never
  // created" would be unreachable by any player action and unrecoverable
  // without an admin, with entry-fee gold already taken. Sweeping it means a
  // stranded cup heals on its own within a tick.
  //
  // recoverGroupDoubleElim is idempotent and a cheap no-op when nothing is
  // stuck, so this runs unconditionally for every RUNNING cup of this format.
  const groupCups = await prisma.tournament.findMany({
    where: { status: "RUNNING", format: "GROUP_DOUBLE_ELIM" },
    select: { id: true, maxPlayers: true, groupCount: true, qualifiersPerGroup: true },
    take: 50,
  });
  for (const t of groupCups) {
    try {
      await recoverGroupDoubleElim(prisma, t.id, groupShapeOf(t));
    } catch (e) {
      console.error("[tournament-live] group-stage recovery sweep failed", t.id, e);
    }
  }

  return { forfeited, advanced };
}

// ─────────────────────────── Wiring ───────────────────────────

/**
 * Bind the auto-advance hook to match settlement. Called once per process from
 * registerRealtime — NOT at module load, because the hook needs the io instance
 * and module-load order relative to io creation isn't guaranteed.
 */
export function registerTournamentMatchEndHook(io: IOServer): void {
  onMatchEnd((matchId) => {
    void advanceForSettledMatch(io, matchId).catch((e) =>
      console.error("[tournament-live] auto-advance failed", matchId, e),
    );
  });
}

/** Per-socket handlers. */
export function registerTournamentLive(io: IOServer, socket: Socket) {
  const userId = socket.data.userId as string;

  socket.on(EV.tournamentReady, async (payload: { tmId?: unknown } = {}) => {
    if (!allow(socket, "tournament:ready", 10, 10_000)) return;
    const tmId = typeof payload?.tmId === "string" ? payload.tmId : null;
    if (!tmId) return;
    try {
      await markReady(io, tmId, userId);
    } catch (e) {
      // Surface the reason on the caller's own socket; the shape mirrors the
      // REST error envelope so clients can reuse their message mapping.
      const code = e instanceof ApiError ? e.code : "READY_FAILED";
      const message = e instanceof ApiError ? e.message : "Couldn't ready up.";
      socket.emit(EV.tournamentMatchState, { error: { code, message } });
      if (!(e instanceof ApiError)) console.error("[tournament-live] ready failed", tmId, e);
    }
  });
}

/** Exported for the bracket display layer / tests. */
export { bracketOfRound };
