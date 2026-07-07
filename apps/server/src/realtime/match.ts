import type { Server as IOServer, Socket } from "socket.io";
import {
  EV,
  ECONOMY,
  type GameState,
  type GameSettings,
  type Move,
  type PieceColor,
} from "@dama/shared";
import { createInitialState, isLegal, applyMove } from "@dama/game-engine";
import type { MatchMode as PrismaMatchMode } from "@prisma/client";
import { prisma } from "../db/client.js";
import { applyLedger } from "../economy/ledger.js";

/**
 * SERVER-AUTHORITATIVE match loop.
 *
 * The server holds the one true GameState per live match in memory (seeded at
 * match start). The client NEVER decides legality or outcome: every EV.matchMove
 * is validated with the game engine before it is applied and broadcast. When the
 * engine reports a result, the match is settled once (Match row written + trophy
 * and gold deltas applied through the ledger) and removed from memory.
 */

type LiveMatch = {
  matchId: string;
  redId: string | null;
  blueId: string | null;
  mode: PrismaMatchMode;
  state: GameState;
  /** guards against double-settlement (result reached + resign racing). */
  settled: boolean;
};

/** matchId -> authoritative live state. */
const live: Map<string, LiveMatch> = new Map();

/**
 * Seed a live match. Called by matchmaking (and any room-start flow) the moment
 * two players are paired. The engine builds the opening position; the same
 * `settings` are persisted on the Match row so replays are exact.
 */
export function createLiveMatch(
  matchId: string,
  redId: string | null,
  blueId: string | null,
  mode: PrismaMatchMode | string,
  settings: GameSettings,
): LiveMatch {
  const state = createInitialState(settings, matchId);
  const lm: LiveMatch = {
    matchId,
    redId,
    blueId,
    mode: mode as PrismaMatchMode,
    state,
    settled: false,
  };
  live.set(matchId, lm);
  return lm;
}

/** The color this user plays in a match, or null if they are not a player. */
function colorOf(lm: LiveMatch, userId: string): PieceColor | null {
  if (lm.redId === userId) return "red";
  if (lm.blueId === userId) return "blue";
  return null;
}

function userIdForColor(lm: LiveMatch, color: PieceColor): string | null {
  return color === "red" ? lm.redId : lm.blueId;
}

/**
 * Settle a finished match exactly once: persist the outcome and moves, then
 * apply trophy + gold deltas through the ledger (never by writing balances
 * directly). Ranked matches move trophies; every non-LOCAL win banks gold.
 */
async function settleMatch(io: IOServer, lm: LiveMatch): Promise<void> {
  if (lm.settled) return;
  const result = lm.state.result;
  if (!result) return;
  lm.settled = true;

  const isRanked = lm.mode === "RANKED";
  const goldPerWin =
    ECONOMY.goldPerWin[lm.mode as keyof typeof ECONOMY.goldPerWin] ?? 0;

  let redTrophyDelta = 0;
  let blueTrophyDelta = 0;
  let goldReward = 0;

  const winnerColor: PieceColor | null =
    result.winner === "draw" ? null : (result.winner as PieceColor);
  const winnerId = winnerColor ? userIdForColor(lm, winnerColor) : null;
  const loserId = winnerColor
    ? userIdForColor(lm, winnerColor === "red" ? "blue" : "red")
    : null;

  if (isRanked && winnerColor) {
    const winDelta = ECONOMY.rankedTrophyWin;
    const lossDelta = ECONOMY.rankedTrophyLoss;
    if (winnerColor === "red") {
      redTrophyDelta = winDelta;
      blueTrophyDelta = lossDelta;
    } else {
      blueTrophyDelta = winDelta;
      redTrophyDelta = lossDelta;
    }
  }
  if (winnerColor) goldReward = goldPerWin;

  // Persist the match record first so the ledger entries can reference it.
  try {
    await prisma.match.update({
      where: { id: lm.matchId },
      data: {
        winner: result.winner,
        reason: result.reason,
        moves: lm.state.history as unknown as object,
        redTrophyDelta: isRanked ? redTrophyDelta : null,
        blueTrophyDelta: isRanked ? blueTrophyDelta : null,
        goldReward,
        endedAt: new Date(),
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[match] failed to persist result", lm.matchId, e);
  }

  // Apply economy deltas. Each call is atomic + append-only; a failure on one
  // (e.g. a bot user or deleted account) must not block the others.
  const grants: Promise<unknown>[] = [];
  if (isRanked) {
    if (lm.redId && redTrophyDelta !== 0) {
      grants.push(
        applyLedger(prisma, {
          userId: lm.redId,
          currency: "TROPHIES",
          amount: redTrophyDelta,
          reason: "match-ranked",
          refType: "match",
          refId: lm.matchId,
        }).catch((e) => console.error("[match] trophy grant failed", e)),
      );
    }
    if (lm.blueId && blueTrophyDelta !== 0) {
      grants.push(
        applyLedger(prisma, {
          userId: lm.blueId,
          currency: "TROPHIES",
          amount: blueTrophyDelta,
          reason: "match-ranked",
          refType: "match",
          refId: lm.matchId,
        }).catch((e) => console.error("[match] trophy grant failed", e)),
      );
    }
  }
  if (winnerId && goldReward > 0) {
    grants.push(
      applyLedger(prisma, {
        userId: winnerId,
        currency: "GOLD",
        amount: goldReward,
        reason: "match-win",
        refType: "match",
        refId: lm.matchId,
      }).catch((e) => console.error("[match] gold grant failed", e)),
    );
  }
  await Promise.all(grants);

  io.to(lm.matchId).emit(EV.matchEnded, {
    matchId: lm.matchId,
    result,
    winnerId,
    loserId,
    redTrophyDelta: isRanked ? redTrophyDelta : 0,
    blueTrophyDelta: isRanked ? blueTrophyDelta : 0,
    goldReward,
    state: lm.state,
  });

  live.delete(lm.matchId);
}

export function registerMatch(io: IOServer, socket: Socket) {
  const userId = socket.data.userId as string;

  socket.on(EV.matchMove, async (payload: { matchId?: unknown; move?: unknown } = {}) => {
    const matchId = typeof payload?.matchId === "string" ? payload.matchId : null;
    const move = payload?.move as Move | undefined;
    if (!matchId || !move) {
      socket.emit(EV.matchIllegal, { reason: "bad-request" });
      return;
    }

    const lm = live.get(matchId);
    if (!lm) {
      socket.emit(EV.matchIllegal, { matchId, reason: "no-such-match" });
      return;
    }

    const myColor = colorOf(lm, userId);
    if (!myColor) {
      socket.emit(EV.matchIllegal, { matchId, reason: "not-a-player" });
      return;
    }
    if (lm.state.result) {
      socket.emit(EV.matchIllegal, { matchId, reason: "match-over" });
      return;
    }
    if (lm.state.turn !== myColor) {
      socket.emit(EV.matchIllegal, { matchId, reason: "not-your-turn" });
      return;
    }

    // Authoritative legality check — the client's opinion is irrelevant.
    if (!isLegal(lm.state, move)) {
      socket.emit(EV.matchIllegal, { matchId, reason: "illegal-move" });
      return;
    }

    let next: GameState;
    try {
      next = applyMove(lm.state, move);
    } catch {
      socket.emit(EV.matchIllegal, { matchId, reason: "illegal-move" });
      return;
    }
    lm.state = next;

    // Persist the running move list (best-effort; the in-memory state is the
    // source of truth during play, this keeps the row resync-able across crashes).
    prisma.match
      .update({
        where: { id: matchId },
        data: { moves: next.history as unknown as object },
      })
      .catch((e) => console.error("[match] move persist failed", matchId, e));

    io.to(matchId).emit(EV.matchMoved, { matchId, move, state: next });

    if (next.result) {
      await settleMatch(io, lm);
    }
  });

  socket.on(EV.matchResign, async (payload: { matchId?: unknown } = {}) => {
    const matchId = typeof payload?.matchId === "string" ? payload.matchId : null;
    if (!matchId) return;
    const lm = live.get(matchId);
    if (!lm || lm.settled) return;
    const myColor = colorOf(lm, userId);
    if (!myColor) return;
    if (lm.state.result) return;

    // The resigning side loses; the opponent is the winner.
    const winner: PieceColor = myColor === "red" ? "blue" : "red";
    lm.state = { ...lm.state, result: { winner, reason: "resign" } };
    await settleMatch(io, lm);
  });

  socket.on(EV.matchResync, (payload: { matchId?: unknown } = {}) => {
    const matchId = typeof payload?.matchId === "string" ? payload.matchId : null;
    if (!matchId) return;
    const lm = live.get(matchId);
    if (!lm) {
      socket.emit(EV.matchIllegal, { matchId, reason: "no-such-match" });
      return;
    }
    const myColor = colorOf(lm, userId);
    socket.emit(EV.matchState, {
      matchId,
      state: lm.state,
      yourColor: myColor,
      settings: lm.state.settings,
    });
  });
}
