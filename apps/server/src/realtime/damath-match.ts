import type { Server as IOServer, Socket } from "socket.io";
import {
  EV,
  type DamathCoord,
  type DamathGameState,
  type DamathPlayerId,
  type DamathVariant,
} from "@dama/shared";
import {
  createInitialDamathState,
  getAllLegalDamathMoves,
  applyDamathMove,
  checkDamathEnd,
} from "@dama/game-engine";
import { prisma } from "../db/client.js";
import { allow } from "./rate-limit.js";

/**
 * SERVER-AUTHORITATIVE Math Dama match loop. Parallel to match.ts but its OWN
 * file so Classic is never destabilised, and deliberately SIMPLER: Damath is
 * unranked with no economy at launch (spec §7). No trophies/gold/ledger, no
 * quests, no rematch/chat. The server holds the one true DamathGameState per
 * match, validates every intent with the engine, broadcasts new state + scores,
 * and persists a DamathMatch row (scores + history) for replay/stats on settle.
 */

type LiveDamathMatch = {
  matchId: string;
  redId: string | null;
  blueId: string | null;
  variant: DamathVariant;
  state: DamathGameState;
  settled: boolean;
};

/** matchId -> authoritative live state. */
const live: Map<string, LiveDamathMatch> = new Map();

/** Abandonment: forfeit to the opponent if a player disconnects and does not
 *  reconnect (resync) within the window. Keyed `matchId:userId`. */
const ABANDON_MS = 45_000;
const abandonTimers: Map<string, NodeJS.Timeout> = new Map();
const abandonKey = (matchId: string, userId: string) => `${matchId}:${userId}`;
function clearAbandon(matchId: string, userId: string): void {
  const k = abandonKey(matchId, userId);
  const t = abandonTimers.get(k);
  if (t) {
    clearTimeout(t);
    abandonTimers.delete(k);
  }
}

/** Seed a live Damath match. Called by damath matchmaking on pairing. */
export function createLiveDamathMatch(
  matchId: string,
  redId: string | null,
  blueId: string | null,
  variant: DamathVariant,
): LiveDamathMatch {
  const state = createInitialDamathState(variant, matchId);
  const lm: LiveDamathMatch = { matchId, redId, blueId, variant, state, settled: false };
  live.set(matchId, lm);
  return lm;
}

/** Drop a live match's state without settling (e.g. never started). */
export function endLiveDamathMatch(matchId: string): void {
  live.delete(matchId);
}

const colorOf = (lm: LiveDamathMatch, userId: string): DamathPlayerId | null =>
  lm.redId === userId ? "red" : lm.blueId === userId ? "blue" : null;

/** Has the side to move any legal reply / any pieces? */
function terminalReason(next: DamathGameState) {
  const noPieces = next.pieces.filter((p) => p.player === next.turn).length === 0;
  if (noPieces) return "no-pieces" as const;
  if (getAllLegalDamathMoves(next).length === 0) return "no-moves" as const;
  return null;
}

/**
 * Settle a finished Damath match exactly once: persist the DamathMatch row
 * (final scores incl. chip bonus, score events, move history) and broadcast
 * damathEnded. No economy. Then drop from memory.
 */
async function settleDamathMatch(io: IOServer, lm: LiveDamathMatch): Promise<void> {
  if (lm.settled) return;
  const result = lm.state.result;
  if (!result) return;
  lm.settled = true;

  const scoreHistory = lm.state.history.flatMap((r) => r.scoreEvents);
  try {
    await prisma.damathMatch.update({
      where: { id: lm.matchId },
      data: {
        redScore: result.redScore,
        blueScore: result.blueScore,
        winner: result.winner,
        reason: result.reason,
        scoreHistory: scoreHistory as unknown as object,
        moveHistory: lm.state.history as unknown as object,
        endedAt: new Date(),
      },
    });
  } catch (e) {
    console.error("[damath-match] failed to persist result", lm.matchId, e);
  }

  io.to(lm.matchId).emit(EV.damathEnded, { matchId: lm.matchId, result, state: lm.state });
  live.delete(lm.matchId);
}

/** Apply a validated move, persist running history, broadcast, settle if over. */
async function commitDamathMove(io: IOServer, lm: LiveDamathMatch, next: DamathGameState) {
  const reason = terminalReason(next);
  if (reason) {
    lm.state = { ...next, result: checkDamathEnd(next, reason) };
    io.to(lm.matchId).emit(EV.damathMoved, { matchId: lm.matchId, state: lm.state });
    await settleDamathMatch(io, lm);
    return;
  }
  lm.state = next;
  prisma.damathMatch
    .update({
      where: { id: lm.matchId },
      data: { moveHistory: next.history as unknown as object },
    })
    .catch((e) => console.error("[damath-match] move persist failed", lm.matchId, e));
  io.to(lm.matchId).emit(EV.damathMoved, { matchId: lm.matchId, state: next });
}

export function registerDamathMatch(io: IOServer, socket: Socket) {
  const userId = socket.data.userId as string;

  // ── Move intent: client sends { matchId, pieceId, to }. The server recomputes
  //    the legal moves and matches one — it NEVER trusts a client-built path. ──
  socket.on(
    EV.damathMove,
    async (payload: { matchId?: unknown; pieceId?: unknown; to?: unknown } = {}) => {
      const matchId = typeof payload?.matchId === "string" ? payload.matchId : null;
      const pieceId = typeof payload?.pieceId === "string" ? payload.pieceId : null;
      const to = payload?.to as DamathCoord | undefined;
      if (!matchId || !pieceId || !to || typeof to.x !== "number" || typeof to.y !== "number") {
        socket.emit(EV.damathIllegal, { reason: "bad-request" });
        return;
      }

      const lm = live.get(matchId);
      if (!lm) {
        socket.emit(EV.damathIllegal, { matchId, reason: "no-such-match" });
        return;
      }
      const myColor = colorOf(lm, userId);
      if (!myColor) {
        socket.emit(EV.damathIllegal, { matchId, reason: "not-a-player" });
        return;
      }
      if (lm.state.result) {
        socket.emit(EV.damathIllegal, { matchId, reason: "match-over" });
        return;
      }
      if (lm.state.turn !== myColor) {
        socket.emit(EV.damathIllegal, { matchId, reason: "not-your-turn" });
        return;
      }

      // Authoritative: find the legal move for this piece landing on `to`.
      const legal = getAllLegalDamathMoves(lm.state).find((m) => {
        if (m.pieceId !== pieceId) return false;
        const landing = m.path[m.path.length - 1];
        return landing.x === to.x && landing.y === to.y;
      });
      if (!legal) {
        socket.emit(EV.damathIllegal, { matchId, reason: "illegal-move" });
        return;
      }

      let next: DamathGameState;
      try {
        next = applyDamathMove(lm.state, legal);
      } catch {
        socket.emit(EV.damathIllegal, { matchId, reason: "illegal-move" });
        return;
      }
      await commitDamathMove(io, lm, next);
    },
  );

  socket.on(EV.damathResign, async (payload: { matchId?: unknown } = {}) => {
    const matchId = typeof payload?.matchId === "string" ? payload.matchId : null;
    if (!matchId) return;
    const lm = live.get(matchId);
    if (!lm || lm.settled || lm.state.result) return;
    const myColor = colorOf(lm, userId);
    if (!myColor) return;
    // Resign: the resigning side loses outright, no chip bonus.
    lm.state = { ...lm.state, result: checkDamathEnd({ ...lm.state, turn: myColor }, "resign") };
    await settleDamathMatch(io, lm);
  });

  socket.on(EV.damathResync, (payload: { matchId?: unknown } = {}) => {
    const matchId = typeof payload?.matchId === "string" ? payload.matchId : null;
    if (!matchId) return;
    const lm = live.get(matchId);
    if (!lm) {
      socket.emit(EV.damathIllegal, { matchId, reason: "no-such-match" });
      return;
    }
    const myColor = colorOf(lm, userId);
    if (!myColor) {
      socket.emit(EV.damathIllegal, { matchId, reason: "not-a-player" });
      return;
    }
    // Reconnected → cancel any pending abandonment forfeit and re-join the room.
    clearAbandon(matchId, userId);
    void socket.join(matchId);
    socket.emit(EV.damathState, {
      matchId,
      state: lm.state,
      yourColor: myColor,
      variant: lm.variant,
    });
  });

  // ── Abandonment forfeit: if this was the user's last socket and they don't
  //    reconnect within ABANDON_MS, the opponent wins by abandonment. ──
  socket.on("disconnect", () => {
    setTimeout(() => {
      const room = io.sockets.adapter.rooms.get(`presence:${userId}`);
      if (room && room.size > 0) return; // reconnected on another socket
      for (const lm of live.values()) {
        if (lm.settled || lm.state.result) continue;
        const color = colorOf(lm, userId);
        if (!color) continue;
        const k = abandonKey(lm.matchId, userId);
        if (abandonTimers.has(k)) continue;
        const t = setTimeout(() => {
          abandonTimers.delete(k);
          const cur = live.get(lm.matchId);
          if (!cur || cur.settled || cur.state.result) return;
          // Abandonment settles as a resign-style loss for the absent side, so
          // the present opponent wins outright.
          cur.state = { ...cur.state, result: checkDamathEnd({ ...cur.state, turn: color }, "resign") };
          void settleDamathMatch(io, cur).catch((e) =>
            console.error("[damath-match] abandon settle failed", e),
          );
        }, ABANDON_MS);
        abandonTimers.set(k, t);
      }
    }, 500);
  });

  // anti-flood guard is available for any future Damath chat; unused for now.
  void allow;
}
