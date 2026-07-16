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
import { redis, getJSON, casJSON, delKey, withLock, LOCK_BUSY, RT_TTL } from "./store.js";

/**
 * SERVER-AUTHORITATIVE Math Dama match loop (Redis-scaled). Parallel to match.ts
 * but its OWN file so Classic is never destabilised, and deliberately SIMPLER:
 * Damath is unranked with no economy at launch (spec §7). No trophies/gold/ledger,
 * no quests, no rematch/chat. The one true DamathGameState per match lives in
 * REDIS (rt:d:match:<id>), so any instance in the cluster can serve any player.
 * The server validates every intent with the engine, broadcasts new state + scores,
 * and persists a DamathMatch row (scores + history) for replay/stats on settle.
 *
 * Every state change flows through `mutateDamath` (withLock + versioned CAS) so
 * two instances can never corrupt a match. Settlement is DB-gated
 * (`damathMatch.updateMany({ where:{id, endedAt:null} })`) so it happens exactly
 * once cluster-wide — the in-memory `settled` boolean is gone.
 */

// A version field is added for CAS (mirrors StoredMatch in match.ts). Damath is
// web-only product-wise, but shares this binary, so it must be replica-safe.
type StoredDamathMatch = {
  matchId: string;
  redId: string | null;
  blueId: string | null;
  variant: DamathVariant;
  state: DamathGameState;
  version: number;
};

const RD_TTL = RT_TTL;
const dMatchKey = (id: string) => `rt:d:match:${id}`;
// Per-user index of live Damath matchIds (mirrors classic rt:userMatch) so a
// disconnecting socket can find its matches without an in-memory scan.
const dUserMatchKey = (uid: string) => `rt:d:userMatch:${uid}`;

async function getDamathMatch(matchId: string): Promise<StoredDamathMatch | null> {
  return getJSON<StoredDamathMatch>(dMatchKey(matchId));
}
async function saveDamathMatch(m: StoredDamathMatch): Promise<boolean> {
  return casJSON(dMatchKey(m.matchId), m, RD_TTL);
}
async function removeDamathMatch(m: StoredDamathMatch | string): Promise<void> {
  // Accept a full match (so we can drop the per-user index) or a bare id.
  if (typeof m === "string") {
    await delKey(dMatchKey(m));
    return;
  }
  const p = redis.pipeline();
  p.del(dMatchKey(m.matchId));
  if (m.redId) p.srem(dUserMatchKey(m.redId), m.matchId);
  if (m.blueId) p.srem(dUserMatchKey(m.blueId), m.matchId);
  await p.exec();
}
async function damathMatchIdsForUser(userId: string): Promise<string[]> {
  return redis.smembers(dUserMatchKey(userId));
}

/**
 * mutateDamath — the ONE path for every Damath state change (move, resign,
 * abandon). Serializes on a Redis lock, reads the authoritative state, runs
 * `mutate` (returns the NEXT DamathGameState or null to abort), CAS-writes it,
 * then runs `afterSave` (broadcast + settle) once the write landed. Retries ONCE
 * on a CAS conflict with a fresh read. Returns "ok"/"busy"/"gone"/"aborted".
 */
async function mutateDamath(
  matchId: string,
  mutate: (lm: StoredDamathMatch) => DamathGameState | null,
  afterSave: (lm: StoredDamathMatch) => Promise<void>,
): Promise<"ok" | "busy" | "gone" | "aborted"> {
  for (let round = 0; round < 2; round++) {
    const res = await withLock(`d-match:${matchId}`, async () => {
      const lm = await getDamathMatch(matchId);
      if (!lm) return "gone" as const;
      const next = mutate(lm);
      if (!next) return "aborted" as const;
      const updated: StoredDamathMatch = { ...lm, state: next };
      if (!(await saveDamathMatch(updated))) return "conflict" as const;
      await afterSave(updated);
      return "ok" as const;
    });
    if (res === LOCK_BUSY) return "busy";
    if (res !== "conflict") return res;
  }
  return "busy";
}

/**
 * Abandonment: forfeit to the opponent if a player disconnects and does not
 * reconnect (resync) within the window. Kept as an in-process timer registry
 * (Damath has no durable job type of its own, and this is a best-effort forfeit
 * on an unranked/no-economy mode) whose CALLBACK is Redis-authoritative:
 * it re-checks presence cluster-wide and settles through the lock+CAS+DB-gated
 * path, so a reconnect anywhere cancels it and it can never double-settle. Keyed
 * `matchId:userId`. If the arming instance dies the forfeit won't fire from
 * another instance — acceptable for Damath (see T8 concern in the report).
 */
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

/**
 * Seed a live Damath match into Redis. Called by damath matchmaking / rooms on
 * pairing. ASYNC now (state lives in Redis): callers must `await`.
 */
export async function createLiveDamathMatch(
  matchId: string,
  redId: string | null,
  blueId: string | null,
  variant: DamathVariant,
): Promise<StoredDamathMatch> {
  const state = createInitialDamathState(variant, matchId);
  const lm: StoredDamathMatch = { matchId, redId, blueId, variant, state, version: 0 };
  await casJSON(dMatchKey(matchId), lm, RD_TTL);
  const p = redis.pipeline();
  if (redId) { p.sadd(dUserMatchKey(redId), matchId); p.expire(dUserMatchKey(redId), RD_TTL); }
  if (blueId) { p.sadd(dUserMatchKey(blueId), matchId); p.expire(dUserMatchKey(blueId), RD_TTL); }
  await p.exec();
  return { ...lm, version: 1 };
}

/** Drop a live match's state without settling (e.g. never started). */
export async function endLiveDamathMatch(matchId: string): Promise<void> {
  const lm = await getDamathMatch(matchId);
  if (lm) await removeDamathMatch(lm);
  else await removeDamathMatch(matchId);
}

const colorOf = (lm: StoredDamathMatch, userId: string): DamathPlayerId | null =>
  lm.redId === userId ? "red" : lm.blueId === userId ? "blue" : null;

/** Has the side to move any legal reply / any pieces? */
function terminalReason(next: DamathGameState) {
  const noPieces = next.pieces.filter((p) => p.player === next.turn).length === 0;
  if (noPieces) return "no-pieces" as const;
  if (getAllLegalDamathMoves(next).length === 0) return "no-moves" as const;
  return null;
}

/**
 * Settle a finished Damath match exactly once, cluster-wide: a DB gate
 * (`updateMany({ where:{id, endedAt:null} })`) means only the instance whose
 * write lands persists scores/history + broadcasts damathEnded; any racer sees
 * count===0 and returns. Then drop from Redis. No economy. Expects `lm.state`
 * to already carry `.result`.
 */
async function settleDamathMatch(io: IOServer, lm: StoredDamathMatch): Promise<void> {
  const result = lm.state.result;
  if (!result) return;

  const scoreHistory = lm.state.history.flatMap((r) => r.scoreEvents);
  let gateCount = 0;
  try {
    const gate = await prisma.damathMatch.updateMany({
      where: { id: lm.matchId, endedAt: null },
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
    gateCount = gate.count;
  } catch (e) {
    console.error("[damath-match] failed to persist result", lm.matchId, e);
    return; // DB failure ⇒ we did NOT win the gate — don't broadcast an unpersisted settle
  }
  if (gateCount === 0) {
    // Another instance already settled — still drop our Redis copy defensively.
    await removeDamathMatch(lm);
    return;
  }

  io.to(lm.matchId).emit(EV.damathEnded, { matchId: lm.matchId, result, state: lm.state });
  await removeDamathMatch(lm);
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

      // settle-if-terminal is decided inside mutate and carried out in afterSave.
      let settled: StoredDamathMatch | null = null;
      const res = await mutateDamath(
        matchId,
        (lm) => {
          const myColor = colorOf(lm, userId);
          if (!myColor) {
            socket.emit(EV.damathIllegal, { matchId, reason: "not-a-player" });
            return null;
          }
          if (lm.state.result) {
            socket.emit(EV.damathIllegal, { matchId, reason: "match-over" });
            return null;
          }
          if (lm.state.turn !== myColor) {
            socket.emit(EV.damathIllegal, { matchId, reason: "not-your-turn" });
            return null;
          }
          // Authoritative: find the legal move for this piece landing on `to`.
          const legal = getAllLegalDamathMoves(lm.state).find((m) => {
            if (m.pieceId !== pieceId) return false;
            const landing = m.path[m.path.length - 1];
            return landing.x === to.x && landing.y === to.y;
          });
          if (!legal) {
            socket.emit(EV.damathIllegal, { matchId, reason: "illegal-move" });
            return null;
          }
          let next: DamathGameState;
          try {
            next = applyDamathMove(lm.state, legal);
          } catch {
            socket.emit(EV.damathIllegal, { matchId, reason: "illegal-move" });
            return null;
          }
          // If the move ends the game, fold the result into the state we store so
          // afterSave broadcasts the final board and settles.
          const reason = terminalReason(next);
          return reason ? { ...next, result: checkDamathEnd(next, reason) } : next;
        },
        async (lm) => {
          io.to(matchId).emit(EV.damathMoved, { matchId, state: lm.state });
          if (lm.state.result) {
            settled = lm;
          } else {
            prisma.damathMatch
              .update({ where: { id: matchId }, data: { moveHistory: lm.state.history as unknown as object } })
              .catch((e) => console.error("[damath-match] move persist failed", matchId, e));
          }
        },
      );
      if (res === "gone") {
        socket.emit(EV.damathIllegal, { matchId, reason: "no-such-match" });
        return;
      }
      if (res === "busy") {
        socket.emit(EV.damathIllegal, { matchId, reason: "busy" });
        return;
      }
      if (settled) await settleDamathMatch(io, settled);
    },
  );

  socket.on(EV.damathResign, async (payload: { matchId?: unknown } = {}) => {
    const matchId = typeof payload?.matchId === "string" ? payload.matchId : null;
    if (!matchId) return;
    let resigned: StoredDamathMatch | null = null;
    await mutateDamath(
      matchId,
      (lm) => {
        if (lm.state.result) return null;
        const myColor = colorOf(lm, userId);
        if (!myColor) return null;
        // Resign: the resigning side loses outright, no chip bonus.
        return { ...lm.state, result: checkDamathEnd({ ...lm.state, turn: myColor }, "resign") };
      },
      async (lm) => {
        resigned = lm;
      },
    );
    if (resigned) await settleDamathMatch(io, resigned);
  });

  socket.on(EV.damathResync, async (payload: { matchId?: unknown } = {}) => {
    const matchId = typeof payload?.matchId === "string" ? payload.matchId : null;
    if (!matchId) return;
    const lm = await getDamathMatch(matchId);
    if (!lm) {
      socket.emit(EV.damathIllegal, { matchId, reason: "no-such-match" });
      return;
    }
    const myColor = colorOf(lm, userId);
    // A non-player may only receive read-only state if their socket is ALREADY
    // in the match room — which only happens via the legitimate room-spectate
    // path (join by code → server joins them to the match channel). This stops a
    // random user from watching any match by guessing its id.
    const isSpectator = !myColor && socket.rooms.has(matchId);
    if (!myColor && !isSpectator) {
      socket.emit(EV.damathIllegal, { matchId, reason: "not-a-player" });
      return;
    }
    // A player reconnecting cancels any pending abandonment forfeit and re-joins
    // the room; a spectator is already joined (harmless re-join).
    if (myColor) {
      clearAbandon(matchId, userId);
      void socket.join(matchId);
    }
    socket.emit(EV.damathState, {
      matchId,
      state: lm.state,
      yourColor: myColor, // null for spectators → client renders read-only
      variant: lm.variant,
    });
  });

  // ── Abandonment forfeit: if this was the user's last socket and they don't
  //    reconnect within ABANDON_MS, the opponent wins by abandonment. Presence is
  //    checked cluster-wide (fetchSockets) and the forfeit is applied via the
  //    lock+CAS+DB-gated settle path. ──
  socket.on("disconnect", () => {
    setTimeout(() => {
      void (async () => {
        const socks = await io.in(`presence:${userId}`).fetchSockets();
        if (socks.length > 0) return; // reconnected somewhere in the cluster
        // Find the live Damath matches this user is still playing via the
        // per-user index (rt:d:userMatch:<uid>) — socket.rooms is already cleared
        // by the time this deferred handler runs.
        for (const matchId of await damathMatchIdsForUser(userId)) {
          const lm = await getDamathMatch(matchId);
          if (!lm || lm.state.result) continue;
          if (!colorOf(lm, userId)) continue; // not a player in this match
          const k = abandonKey(matchId, userId);
          if (abandonTimers.has(k)) continue;
          const t = setTimeout(() => {
            abandonTimers.delete(k);
            void (async () => {
              // Re-check presence cluster-wide at fire time (a reconnect in the
              // grace window cancels the forfeit).
              const still = await io.in(`presence:${userId}`).fetchSockets();
              if (still.length > 0) return;
              let settled: StoredDamathMatch | null = null;
              await mutateDamath(
                matchId,
                (cur) => {
                  if (cur.state.result) return null;
                  const color = colorOf(cur, userId);
                  if (!color) return null;
                  // Abandonment settles as a resign-style loss for the absent side.
                  return { ...cur.state, result: checkDamathEnd({ ...cur.state, turn: color }, "resign") };
                },
                async (cur) => {
                  settled = cur;
                },
              );
              if (settled) await settleDamathMatch(io, settled);
            })().catch((e) => console.error("[damath-match] abandon settle failed", e));
          }, ABANDON_MS);
          abandonTimers.set(k, t);
        }
      })().catch((e) => console.error("[damath-match] abandon schedule failed", e));
    }, 500);
  });

  // anti-flood guard is available for any future Damath chat; unused for now.
  void allow;
}
