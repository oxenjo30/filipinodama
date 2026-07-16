import type { Server as IOServer, Socket } from "socket.io";
import {
  EV,
  ECONOMY,
  DEFAULT_SETTINGS,
  type GameState,
  type GameSettings,
  type Move,
  type PieceColor,
} from "@dama/shared";
import { createInitialState, isLegal, applyMove, bestMove } from "@dama/game-engine";
import type { MatchMode as PrismaMatchMode } from "@prisma/client";
import { prisma } from "../db/client.js";
import { isMuted } from "../lib/mute.js";
import { applyLedger } from "../economy/ledger.js";
import { awardWarPointsTx } from "../lib/guild-wars.js";
import { allow } from "./rate-limit.js";
import { questAdvanceFor, type MatchQuestContext } from "../lib/quest-trigger.js";
import {
  type StoredMatch,
  getMatch,
  createMatch,
  saveMatch,
  removeMatch,
  matchIdsForUser,
  withLock,
  LOCK_BUSY,
  getJSON,
  setJSON,
  delKey,
  spectatorAdd,
  spectatorRemove,
  spectatorCount as storeSpectatorCount,
  spectatorClear,
  spectatorMatchesForSocket,
} from "./store.js";
import { scheduleJob, cancelJob } from "./jobs.js";

/**
 * SERVER-AUTHORITATIVE match loop (Redis-scaled).
 *
 * The one true GameState per live match lives in REDIS (rt:match:<id>), so any
 * instance in the cluster can serve any player. The client NEVER decides legality
 * or outcome: every EV.matchMove is validated with the game engine before it is
 * applied and broadcast. Every state change flows through `mutateMatch`
 * (withLock + versioned CAS) so two instances can never corrupt a match. When the
 * engine reports a result, the match is settled EXACTLY ONCE via a DB gate
 * (`match.updateMany({ where:{id, endedAt:null} })`): the instance whose write
 * lands (count===1) applies the ledger grants and broadcasts matchEnded; any
 * racer (count===0) returns before granting anything. The ledger's unique index
 * is the second wall behind that gate.
 *
 * NOTE: `StoredMatch.settled` no longer exists — the DB gate replaces the old
 * in-memory `settled` boolean cluster-wide.
 */

/**
 * mutateMatch — the ONE path for every match state change (move, resign, forfeit,
 * abandon, bot-move, rematch-driven). Serializes on a Redis lock, reads the
 * authoritative StoredMatch, runs `mutate` (which returns the NEXT GameState or
 * null to abort silently), CAS-writes it, then runs `afterSave` (broadcast +
 * settle) once the write landed. On a CAS conflict (a racer committed between our
 * GET and SET while our lock had expired) it retries ONCE with a fresh read.
 *
 * Returns:
 *   "ok"      — mutate produced a next state, the CAS write landed, afterSave ran
 *   "busy"    — lock never acquired, or CAS lost twice (caller should tell the
 *               client to retry; never a silent drop)
 *   "gone"    — no such match in Redis
 *   "aborted" — mutate returned null (validation failed / nothing to do)
 */
async function mutateMatch(
  io: IOServer,
  matchId: string,
  mutate: (lm: StoredMatch) => GameState | null,
  afterSave: (lm: StoredMatch) => Promise<void>,
): Promise<"ok" | "busy" | "gone" | "aborted"> {
  for (let round = 0; round < 2; round++) {
    const res = await withLock(`match:${matchId}`, async () => {
      const lm = await getMatch(matchId);
      if (!lm) return "gone" as const;
      const next = mutate(lm);
      if (!next) return "aborted" as const;
      const updated: StoredMatch = { ...lm, state: next };
      if (!(await saveMatch(updated))) return "conflict" as const;
      await afterSave(updated);
      return "ok" as const;
    });
    if (res === LOCK_BUSY) return "busy";
    if (res !== "conflict") return res;
  }
  return "busy";
}

/**
 * Real spectator counts are now cluster-wide, tracked in Redis via the store's
 * SET-based spectator wrappers (rt:spect:<matchId> of userIds + per-user socket
 * sets). Multi-tab safe (a user with two tabs still counts once) and instance-
 * agnostic: a viewer joined on instance A is counted by instance B. The count is
 * exactly the number of distinct users currently joined to the match's spectator
 * room, never seeded or bumped artificially. The store's add/remove Lua scripts
 * return the fresh unique-user SCARD, so we broadcast the value they hand back
 * (no separate re-read) — and only on a real membership change.
 */

/** The real number of distinct users currently spectating `matchId` (async — the
 *  authoritative set lives in Redis). */
export async function spectatorCount(matchId: string): Promise<number> {
  return storeSpectatorCount(matchId);
}

/** Broadcast a spectator count to everyone in the match room (players + spectators).
 *  Payload is byte-identical to the pre-Redis shape ({ matchId, viewers }). */
function broadcastSpectatorCount(io: IOServer, matchId: string, viewers: number): void {
  io.to(matchId).emit(EV.spectateCount, { matchId, viewers });
}

/**
 * Register one socket as watching `matchId`. Exported so both the by-id
 * spectate path in this module (EV.spectateJoin) and the by-room-code path
 * (rooms.ts roomSpectate, when a late spectator joins a room whose match is
 * already live) count toward the same real cluster-wide total — a viewer is a
 * viewer regardless of which door they came in. The store add script returns the
 * fresh unique-user count; broadcast only when it actually changed (a repeat
 * socket for an already-watching user must not re-emit).
 */
export async function addSpectatorSocket(io: IOServer, matchId: string, userId: string, socketId: string): Promise<void> {
  const before = await storeSpectatorCount(matchId);
  const after = await spectatorAdd(matchId, userId, socketId);
  if (after !== before) broadcastSpectatorCount(io, matchId, after);
}

/** Remove one socket from a match's spectator set; only changes the count if
 *  that was the user's LAST socket watching this match. */
export async function removeSpectatorSocket(io: IOServer, matchId: string, userId: string, socketId: string): Promise<void> {
  const before = await storeSpectatorCount(matchId);
  const after = await spectatorRemove(matchId, userId, socketId);
  if (after !== before) broadcastSpectatorCount(io, matchId, after);
}

/** Drop ALL spectator tracking for a match (called on settlement/cleanup so a
 *  finished match never leaks a stale entry). No broadcast — the match room is
 *  going away (matchEnded already told everyone). */
async function clearSpectators(matchId: string): Promise<void> {
  await spectatorClear(matchId);
}

/**
 * Optional hooks fired once a match has fully SETTLED (result persisted + ledger
 * applied + matchEnded broadcast). Registered by other realtime modules that
 * keep state tied to a match's lifetime — e.g. rooms.ts keeps a private room
 * alive for spectators during play and reclaims it here. Kept as a callback list
 * (not an import) so match.ts has no dependency back on those modules (avoids an
 * import cycle). Each hook is best-effort — a throwing hook never breaks
 * settlement.
 */
const matchEndHooks: Array<(matchId: string) => void> = [];
export function onMatchEnd(hook: (matchId: string) => void): void {
  matchEndHooks.push(hook);
}

/**
 * Abandonment: if a human player's sockets all disconnect mid-match and they do
 * not reconnect within this window, the match is forfeited to their opponent so
 * it always settles (no phantom "endedAt:null" rows, no dodgeable ranked losses,
 * no opponent stuck forever). Keyed `matchId:userId`. Reconnecting (resync/join)
 * clears the timer. Bots never disconnect, so this only ever targets humans.
 *
 * The window is 90s (not a snappier 30–45s) deliberately: real mobile clients
 * drop routinely — a tunnel, an elevator, a backgrounded tab — and the socket.io
 * client retries reconnection indefinitely, so a player who comes back within
 * 90s has their live game fully restored (resync → matchState) with no loss. 90s
 * covers the vast majority of transient drops while still settling a genuinely
 * abandoned game before the waiting opponent gives up.
 */
const ABANDON_MS = 90_000;
const abandonKey = (matchId: string, userId: string) => `${matchId}:${userId}`;
/** Cancel a pending abandonment forfeit (the player reconnected/resynced). The
 *  job key mirrors the abandonKey used when arming it. */
function clearAbandon(matchId: string, userId: string): void {
  void cancelJob("abandon-forfeit", abandonKey(matchId, userId));
}

/**
 * Rematch offers keyed by the just-finished matchId. When a match ends, either
 * human player may offer a rematch; when BOTH have offered we seed a fresh match
 * (colors swapped) and notify both. Entries auto-expire so a stale offer can't
 * pair players who have wandered off.
 */
type RematchOffer = {
  redId: string;
  blueId: string;
  mode: PrismaMatchMode;
  settings: GameSettings;
  /** userIds who have offered a rematch (JSON-safe: a plain array, not a Set). */
  offeredBy: string[];
};
const REMATCH_TTL_SEC = 60;
const rematchKey = (matchId: string) => `rt:rematch:${matchId}`;
/** Read a rematch offer (null if none / expired — Redis TTL reclaims it). */
async function getRematchOffer(matchId: string): Promise<RematchOffer | null> {
  return getJSON<RematchOffer>(rematchKey(matchId));
}
/** Write/refresh a rematch offer with a native 60s TTL — no periodic sweep
 *  needed; a stale offer simply expires out of Redis. */
async function putRematchOffer(matchId: string, offer: RematchOffer): Promise<void> {
  await setJSON(rematchKey(matchId), offer, REMATCH_TTL_SEC);
}
async function delRematchOffer(matchId: string): Promise<void> {
  await delKey(rematchKey(matchId));
}

/**
 * Drop a live match's state without settling it (e.g. the private-room host
 * abandoned the lobby before/after start). Safe to call for an unknown id.
 * Async now that the authoritative state lives in Redis. (No callers today; kept
 * as a public helper for room-abandon cleanup flows.)
 */
export async function endLiveMatch(matchId: string): Promise<void> {
  const lm = await getMatch(matchId);
  if (lm) await removeMatch(lm);
  await clearSpectators(matchId);
}

/**
 * Forfeit a live match to `winnerColor` and settle it exactly once (persist +
 * ledger + broadcast matchEnded), then drop it. Used when a private-room host
 * abandons a STARTED match: the guest's in-progress game must settle as a WIN for
 * the guest rather than being silently discarded. Routed through `mutateMatch` so
 * it is lock+CAS serialized and, via the DB-gated settle, can never double-settle
 * against a concurrent result/resign. No-op for an already-finished match (mutate
 * returns null → "aborted").
 */
export async function forfeitLiveMatch(
  io: IOServer,
  matchId: string,
  winnerColor: PieceColor,
): Promise<void> {
  await mutateMatch(
    io,
    matchId,
    (lm) => {
      if (lm.state.result) return null;
      return { ...lm.state, result: { winner: winnerColor, reason: "abandon" } };
    },
    async (lm) => {
      await settleMatch(io, lm);
    },
  );
}

/**
 * Seed a live match into Redis. Called by matchmaking (and any room-start flow)
 * the moment two players are paired. The engine builds the opening position; the
 * same `settings` are persisted on the Match row so replays are exact.
 *
 * ASYNC now (the authoritative state lives in Redis): callers must `await`.
 * Cross-file callers in matchmaking.ts (tryMatch/startBotMatch) and rooms.ts
 * (roomStart) are updated in Tasks 6/7.
 */
export async function createLiveMatch(
  matchId: string,
  redId: string | null,
  blueId: string | null,
  mode: PrismaMatchMode | string,
  settings: GameSettings,
  botColor?: PieceColor,
): Promise<StoredMatch> {
  const state = createInitialState(settings, matchId);
  const lm: Omit<StoredMatch, "version"> = {
    matchId,
    redId,
    blueId,
    mode: mode as string,
    state,
    botColor,
  };
  await createMatch(lm);
  return { ...lm, version: 0 };
}

/**
 * Drive the BOT's turn (empty-queue fill). If it's the bot's move and the game
 * isn't over, schedule a `bot-move` job so ANY instance in the cluster can play
 * the reply (the instance that owned the human move may not be the one that later
 * claims the job — jobs.ts guarantees exactly-one delivery). The actual move is
 * applied by `handleBotMove` through the SAME authoritative mutateMatch path as a
 * human move (validate → apply → CAS → broadcast matchMoved → settle). No-op for
 * all-human matches is enforced inside the handler (re-checks botColor).
 */
export function maybePlayBotMove(_io: IOServer, matchId: string): void {
  // Human-like think time was 700–1500ms; the brief fixes the job delay at 900ms.
  // The handler re-validates it is still the bot's turn, so a scheduled-but-stale
  // job is a safe no-op.
  void scheduleJob("bot-move", matchId, 900, { matchId });
}

/**
 * bot-move job handler (cluster-safe). Re-checks — under the match lock via
 * mutateMatch — that this is still a bot-filled match, it is the bot's turn, and
 * the game isn't over, then computes and applies the engine's best move. After a
 * successful apply: settle if the game ended, else re-schedule so a (theoretical)
 * consecutive bot turn continues. All the guards live inside `mutate` so a stale
 * job (turn already changed, match resigned/ended) aborts harmlessly.
 */
export async function handleBotMove(io: IOServer, payload: Record<string, unknown>): Promise<void> {
  const matchId = String(payload.matchId);
  let ended = false;
  const res = await mutateMatch(
    io,
    matchId,
    (lm) => {
      if (lm.botColor == null) return null; // all-human match — nothing to do
      if (lm.state.result || lm.state.turn !== lm.botColor) return null;
      let move: Move;
      try {
        move = bestMove(lm.state, "hard");
      } catch (e) {
        console.error("[match] bot bestMove failed", matchId, e);
        return null;
      }
      try {
        if (!isLegal(lm.state, move)) return null; // engine invariant; bail safely
        const next = applyMove(lm.state, move);
        // Stash the move on the state object for afterSave's broadcast (read back
        // by recomputing from history below to avoid a closure-mutation surprise).
        return next;
      } catch (e) {
        console.error("[match] bot applyMove failed", matchId, e);
        return null;
      }
    },
    async (lm) => {
      const last = lm.state.history[lm.state.history.length - 1];
      prisma.match
        .update({ where: { id: matchId }, data: { moves: lm.state.history as unknown as object } })
        .catch((e) => console.error("[match] bot move persist failed", matchId, e));
      io.to(matchId).emit(EV.matchMoved, { matchId, move: last, state: lm.state });
      if (lm.state.result) {
        ended = true;
        await settleMatch(io, lm);
      }
    },
  );
  // If the bot moved and the game continues, it may be the bot's turn again
  // (consecutive-turn safety net) — re-schedule outside the lock.
  if (res === "ok" && !ended) maybePlayBotMove(io, matchId);
}

/** The color this user plays in a match, or null if they are not a player. */
function colorOf(lm: StoredMatch, userId: string): PieceColor | null {
  if (lm.redId === userId) return "red";
  if (lm.blueId === userId) return "blue";
  return null;
}

function userIdForColor(lm: StoredMatch, color: PieceColor): string | null {
  return color === "red" ? lm.redId : lm.blueId;
}

/**
 * Settle a finished match exactly once: persist the outcome and moves, then
 * apply trophy + gold deltas through the ledger (never by writing balances
 * directly). Ranked matches move trophies; every non-LOCAL win banks gold.
 */
/** Daily quest period key (must match modules/quests.ts periodKeyFor). */
function questPeriodKey(scope: "daily" | "seasonal"): string {
  return scope === "daily" ? `daily:${new Date().toISOString().slice(0, 10)}` : "seasonal:current";
}

/**
 * Advance a quest's progress, capped at the quest goal, without ever touching an
 * already-claimed row. Two modes:
 *   - default (setTo=false): value += by  — for counting quests (played/won/caps)
 *   - setTo=true:            value = max(value, by)  — for "reach N" quests where
 *     `by` is an absolute measure (e.g. a win streak), so a later smaller value
 *     never lowers the best-so-far and the goal, once hit, stays hit.
 */
async function advanceQuest(userId: string, questId: string, scope: "daily" | "seasonal", by: number, setTo = false) {
  if (by <= 0) return;
  const quest = await prisma.quest.findUnique({ where: { id: questId } });
  if (!quest || !quest.active) return;
  const periodKey = questPeriodKey(scope);
  const existing = await prisma.questProgress.findUnique({
    where: { userId_questId_periodKey: { userId, questId, periodKey } },
  });
  if (existing?.claimed) return; // don't reset/relift a claimed reward
  const prev = existing?.value ?? 0;
  const value = Math.min(quest.goal, setTo ? Math.max(prev, by) : prev + by);
  await prisma.questProgress.upsert({
    where: { userId_questId_periodKey: { userId, questId, periodKey } },
    update: { value },
    create: { userId, questId, periodKey, value },
  });
}

/**
 * Advance every ACTIVE quest whose `trigger` matches this match outcome. Pure
 * evaluation lives in questAdvanceFor (lib/quest-trigger.ts) so this loop is a
 * thin DB-driving shell: load active quests once, ask the pure fn whether/how
 * much each one advances, then call the existing advanceQuest (unchanged —
 * still atomic, per-period, capped at goal). A quest with no/invalid trigger
 * evaluates to null and is skipped, so a bad admin-authored row can never
 * break settlement. Exported so both recordPlayerOutcome and tests (which
 * seed a custom quest + trigger and assert progress) can drive it directly
 * without needing a live socket match.
 */
export async function advanceQuestsFor(userId: string, ctx: MatchQuestContext): Promise<void> {
  const activeQuests = await prisma.quest.findMany({
    where: { active: true },
    select: { id: true, scope: true, trigger: true },
  });
  await Promise.allSettled(
    activeQuests.map((q) => {
      const adv = questAdvanceFor(q.trigger, ctx);
      if (!adv) return Promise.resolve();
      const scope: "daily" | "seasonal" = q.scope === "daily" ? "daily" : "seasonal";
      return advanceQuest(userId, q.id, scope, adv.by, adv.setTo);
    }),
  );
}

/**
 * Post-settlement side effects for a real (non-bot) player: win/loss/draw
 * record, win streak, and quest progress. Best-effort — a failure here must not
 * break match settlement, so each player is wrapped independently by the caller.
 */
async function recordPlayerOutcome(
  userId: string,
  won: boolean,
  drew: boolean,
  captures: number,
  isRanked: boolean,
): Promise<void> {
  // Stats: increment the right counter and maintain the streak (reset on a
  // non-win). Done as a single atomic update.
  await prisma.user.update({
    where: { id: userId },
    data: won
      ? { wins: { increment: 1 }, streak: { increment: 1 } }
      : drew
        ? { draws: { increment: 1 }, streak: 0 }
        : { losses: { increment: 1 }, streak: 0 },
  });

  // Read the freshly-updated streak so the streak quest reflects the new value.
  const fresh = await prisma.user.findUnique({ where: { id: userId }, select: { streak: true } });
  const streak = fresh?.streak ?? 0;

  // Quests: dynamic — every ACTIVE quest advances purely from its own
  // `trigger` (see advanceQuestsFor above). This replaces the old hardcoded
  // 11-call list, so any admin-created quest tracks automatically.
  await advanceQuestsFor(userId, { won, drew, captures, isRanked, streak });
}

async function settleMatch(io: IOServer, lm: StoredMatch): Promise<void> {
  const result = lm.state.result;
  if (!result) return;

  // Ranked trophies move in any RANKED match. `botColor` is set iff a seat is a
  // bot (empty-queue fallback). Two amounts apply:
  //   • human vs human  → full win/loss (+25 / -18)
  //   • bot-filled       → only the HUMAN seat moves, win-only (+10 / 0); the
  //     bot seat never moves. Small & win-only so the ladder can fill on a
  //     low-population game without being farmable or punishing a bot-fill.
  const isRankedMode = lm.mode === "RANKED";
  const isBotFilled = lm.botColor != null;
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

  if (isRankedMode && winnerColor) {
    const winDelta = isBotFilled ? ECONOMY.rankedBotTrophyWin : ECONOMY.rankedTrophyWin;
    const lossDelta = isBotFilled ? ECONOMY.rankedBotTrophyLoss : ECONOMY.rankedTrophyLoss;
    if (winnerColor === "red") {
      redTrophyDelta = winDelta;
      blueTrophyDelta = lossDelta;
    } else {
      blueTrophyDelta = winDelta;
      redTrophyDelta = lossDelta;
    }
    // In a bot-filled match, the bot seat must never move trophies — zero out
    // whichever colour is the bot so only the human's delta stands.
    if (isBotFilled && lm.botColor === "red") redTrophyDelta = 0;
    if (isBotFilled && lm.botColor === "blue") blueTrophyDelta = 0;
  }
  if (winnerColor) goldReward = goldPerWin;

  // ── SETTLE GATE (money-critical) ──────────────────────────────────────────
  // Persist the outcome as a CONDITIONAL write: only rows still open (endedAt
  // NULL) are updated. `updateMany` returns how many rows it touched. Exactly one
  // instance in the cluster can flip endedAt from NULL to a date; any racer (a
  // concurrent result + resign, an abandon-forfeit firing as the last move lands,
  // or a second instance replaying the same job) sees `count === 0` and RETURNS
  // here — before any grant, broadcast, or cleanup. This makes double-award
  // impossible cluster-wide; the ledger's unique index (refType+refId+userId) is
  // the second wall. The delta computation above is pure and side-effect-free, so
  // running it on a losing racer is harmless.
  let gateCount = 0;
  try {
    const gate = await prisma.match.updateMany({
      where: { id: lm.matchId, endedAt: null },
      data: {
        winner: result.winner,
        reason: result.reason,
        moves: lm.state.history as unknown as object,
        redTrophyDelta: isRankedMode ? redTrophyDelta : null,
        blueTrophyDelta: isRankedMode ? blueTrophyDelta : null,
        goldReward,
        endedAt: new Date(),
      },
    });
    gateCount = gate.count;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[match] failed to persist result", lm.matchId, e);
    // A DB failure means we did NOT win the gate — do not grant/broadcast on an
    // unpersisted settlement (the row could still be settled by a healthy racer).
    return;
  }
  if (gateCount === 0) return; // another instance already settled this match.

  // Apply economy deltas. Each call is atomic + append-only; a failure on one
  // (e.g. a bot user or deleted account) must not block the others.
  const grants: Promise<unknown>[] = [];
  if (isRankedMode) {
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
  // Guild Wars: a RANKED win adds war points to the winner's guild + the
  // member's contribution (no-op if they aren't in a guild). Guarded so a war
  // hiccup never blocks match settlement. Only real ranked human wins count —
  // a bot-filled seat has no user id, so a bot "win" can't award points.
  if (isRankedMode && winnerId) {
    grants.push(
      prisma
        .$transaction((tx) => awardWarPointsTx(tx, winnerId, new Date()))
        .catch((e) => console.error("[match] guild-war award failed", e)),
    );
  }
  await Promise.all(grants);

  // Player records + quest progress for each REAL player (skip bot/null seats).
  // Captures are attributed by move parity: red opens the game (even indices),
  // blue replies (odd indices).
  let redCaptures = 0;
  let blueCaptures = 0;
  lm.state.history.forEach((mv, i) => {
    const n = mv.captures.length;
    if (i % 2 === 0) redCaptures += n;
    else blueCaptures += n;
  });
  const drew = winnerColor === null;
  const outcomes: Promise<unknown>[] = [];
  if (lm.redId) {
    outcomes.push(
      recordPlayerOutcome(lm.redId, winnerColor === "red", drew, redCaptures, isRankedMode).catch((e) =>
        console.error("[match] red outcome failed", e),
      ),
    );
  }
  if (lm.blueId) {
    outcomes.push(
      recordPlayerOutcome(lm.blueId, winnerColor === "blue", drew, blueCaptures, isRankedMode).catch((e) =>
        console.error("[match] blue outcome failed", e),
      ),
    );
  }
  await Promise.all(outcomes);

  io.to(lm.matchId).emit(EV.matchEnded, {
    matchId: lm.matchId,
    result,
    winnerId,
    loserId,
    redTrophyDelta: isRankedMode ? redTrophyDelta : 0,
    blueTrophyDelta: isRankedMode ? blueTrophyDelta : 0,
    goldReward,
    state: lm.state,
  });

  // Remember this pairing so either player can offer a rematch (both-human only).
  // Carry the FINISHED match's real settings into the rematch (not DEFAULT).
  // Stored in Redis with a native 60s TTL (rt:rematch:<matchId>).
  if (lm.redId && lm.blueId) {
    await putRematchOffer(lm.matchId, {
      redId: lm.redId,
      blueId: lm.blueId,
      mode: lm.mode as PrismaMatchMode,
      settings: { ...lm.state.settings },
      offeredBy: [],
    });
  }

  await removeMatch(lm);
  await clearSpectators(lm.matchId);

  // Notify lifetime-bound listeners (e.g. rooms.ts reclaims a private room kept
  // alive for spectators). Best-effort — a throwing hook must not break anything.
  for (const hook of matchEndHooks) {
    try {
      hook(lm.matchId);
    } catch (e) {
      console.error("[match] onMatchEnd hook failed", lm.matchId, e);
    }
  }
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

    // The validation order + emitted events are byte-identical to the pre-Redis
    // handler; only the storage/serialization boundary moved to mutateMatch.
    let applied: StoredMatch | null = null;
    const res = await mutateMatch(
      io,
      matchId,
      (lm) => {
        const myColor = colorOf(lm, userId);
        if (!myColor) {
          socket.emit(EV.matchIllegal, { matchId, reason: "not-a-player" });
          return null;
        }
        if (lm.state.result) {
          socket.emit(EV.matchIllegal, { matchId, reason: "match-over" });
          return null;
        }
        if (lm.state.turn !== myColor) {
          socket.emit(EV.matchIllegal, { matchId, reason: "not-your-turn" });
          return null;
        }
        // Authoritative legality check — the client's opinion is irrelevant.
        if (!isLegal(lm.state, move)) {
          socket.emit(EV.matchIllegal, { matchId, reason: "illegal-move" });
          return null;
        }
        try {
          return applyMove(lm.state, move);
        } catch {
          socket.emit(EV.matchIllegal, { matchId, reason: "illegal-move" });
          return null;
        }
      },
      async (lm) => {
        applied = lm;
        // Persist the running move list (best-effort; Redis is the source of truth
        // during play, this keeps the row resync-able across crashes).
        prisma.match
          .update({ where: { id: matchId }, data: { moves: lm.state.history as unknown as object } })
          .catch((e) => console.error("[match] move persist failed", matchId, e));
        io.to(matchId).emit(EV.matchMoved, { matchId, move, state: lm.state });
      },
    );

    if (res === "gone") {
      socket.emit(EV.matchIllegal, { matchId, reason: "no-such-match" });
      return;
    }
    if (res === "busy") {
      socket.emit(EV.matchIllegal, { matchId, reason: "busy" });
      return;
    }
    if (res !== "ok" || !applied) return; // "aborted" → the mutate already emitted
    const lm = applied as StoredMatch;
    if (lm.state.result) await settleMatch(io, lm);
    else maybePlayBotMove(io, matchId);
  });

  socket.on(EV.matchResign, async (payload: { matchId?: unknown } = {}) => {
    const matchId = typeof payload?.matchId === "string" ? payload.matchId : null;
    if (!matchId) return;
    let resigned: StoredMatch | null = null;
    const res = await mutateMatch(
      io,
      matchId,
      (lm) => {
        const myColor = colorOf(lm, userId);
        if (!myColor) return null;
        if (lm.state.result) return null;
        // The resigning side loses; the opponent is the winner.
        const winner: PieceColor = myColor === "red" ? "blue" : "red";
        return { ...lm.state, result: { winner, reason: "resign" } };
      },
      async (lm) => {
        resigned = lm;
      },
    );
    if (res === "ok" && resigned) await settleMatch(io, resigned);
  });

  socket.on(EV.matchResync, async (payload: { matchId?: unknown } = {}) => {
    const matchId = typeof payload?.matchId === "string" ? payload.matchId : null;
    if (!matchId) return;
    const lm = await getMatch(matchId);
    if (!lm) {
      socket.emit(EV.matchIllegal, { matchId, reason: "no-such-match" });
      return;
    }
    const myColor = colorOf(lm, userId);
    // A non-player may only receive read-only state if their socket is ALREADY in
    // the match room — which only happens through the legitimate rooms.ts spectate
    // path (join by room code → server joins them to the match channel). This stops
    // a random user from watching any match just by guessing its id.
    const isSpectator = !myColor && socket.rooms.has(matchId);
    if (!myColor && !isSpectator) {
      socket.emit(EV.matchIllegal, { matchId, reason: "not-a-player" });
      return;
    }
    // Reconnected into the match → cancel any pending abandonment forfeit and
    // re-join the match room so live events reach this socket again. (Spectators
    // are already joined; re-joining is a harmless no-op.)
    if (myColor) {
      clearAbandon(matchId, userId);
      void socket.join(matchId);
    }
    socket.emit(EV.matchState, {
      matchId,
      state: lm.state,
      yourColor: myColor, // null for spectators → client renders read-only
      settings: lm.state.settings,
    });
  });

  // ── Spectate-by-id — the Watch / Live Matches page (GET /matches/live) lists
  // live matches by id; this lets an authenticated viewer join one directly as a
  // read-only spectator, without going through a private-room code. Mirrors the
  // exact join-then-matchState pattern rooms.ts already uses for room spectators
  // (roomSpectate → socket.join(matchId) → matchResync-style read-only state):
  // any player is refused (they belong in the normal match flow, not this one),
  // and only a genuinely LIVE match can be joined — no fabricated/replay state.
  socket.on(EV.spectateJoin, async (payload: { matchId?: unknown } = {}) => {
    const matchId = typeof payload?.matchId === "string" ? payload.matchId : null;
    if (!matchId) return;
    const lm = await getMatch(matchId);
    if (!lm) {
      socket.emit(EV.matchIllegal, { matchId, reason: "no-such-match" });
      return;
    }
    if (colorOf(lm, userId)) {
      // A player in the match tried to "spectate" it — refuse; they should use
      // the normal resync path instead.
      socket.emit(EV.matchIllegal, { matchId, reason: "not-a-player" });
      return;
    }
    void socket.join(matchId);
    await addSpectatorSocket(io, matchId, userId, socket.id);
    socket.emit(EV.matchState, {
      matchId,
      state: lm.state,
      yourColor: null, // spectator → client renders read-only
      settings: lm.state.settings,
    });
  });

  socket.on(EV.spectateLeave, async (payload: { matchId?: unknown } = {}) => {
    const matchId = typeof payload?.matchId === "string" ? payload.matchId : null;
    if (!matchId) return;
    // Only a non-player may be removed this way — never accidentally evict a
    // real player's socket from their own live match room.
    const lm = await getMatch(matchId);
    if (lm && colorOf(lm, userId)) return;
    void socket.leave(matchId);
    await removeSpectatorSocket(io, matchId, userId, socket.id);
  });

  // ── In-match quick chat / emote — relay to the match room (persisted lightly
  // via the match room; no separate channel needed for ephemeral match chat). ──
  socket.on(EV.matchChat, async (payload: { matchId?: unknown; body?: unknown; emote?: unknown } = {}) => {
    if (!allow(socket, "match:chat", 8, 4000)) return; // anti-flood
    const matchId = typeof payload?.matchId === "string" ? payload.matchId : null;
    if (!matchId) return;
    const lm = await getMatch(matchId);
    // Only the two players may chat, and only in a live match.
    if (!lm || !colorOf(lm, userId)) return;
    const emote = typeof payload?.emote === "string" ? payload.emote.slice(0, 8) : null;
    let body = typeof payload?.body === "string" ? payload.body.trim().slice(0, 200) : "";
    if (!emote && !body) return;
    // Muted players can still send emotes, but not text.
    if (body && (await isMuted(userId))) body = "";
    if (!emote && !body) return;
    io.to(matchId).emit(EV.matchChat, {
      matchId,
      from: userId,
      color: colorOf(lm, userId),
      body: body || null,
      emote,
      at: Date.now(),
    });
  });

  // ── Rematch: either finished-match player offers; both offers → new match. ──
  socket.on(EV.matchRematchOffer, async (payload: { matchId?: unknown } = {}) => {
    if (!allow(socket, "rematch", 5, 5000)) return; // anti-flood
    const matchId = typeof payload?.matchId === "string" ? payload.matchId : null;
    if (!matchId) return;
    const offer = await getRematchOffer(matchId);
    if (!offer || (userId !== offer.redId && userId !== offer.blueId)) return;

    if (!offer.offeredBy.includes(userId)) offer.offeredBy.push(userId);
    // Tell the opponent an offer is pending.
    io.to(`presence:${userId === offer.redId ? offer.blueId : offer.redId}`).emit(EV.matchRematchOffer, {
      fromMatchId: matchId,
      by: userId,
    });

    // Both agreed → seed a fresh match with colors swapped and pair them.
    if (offer.offeredBy.includes(offer.redId) && offer.offeredBy.includes(offer.blueId)) {
      await delRematchOffer(matchId);
      const newRed = offer.blueId; // swap seats
      const newBlue = offer.redId;
      try {
        const match = await prisma.match.create({
          data: {
            mode: offer.mode,
            redId: newRed,
            blueId: newBlue,
            settings: offer.settings as unknown as object,
            moves: [] as unknown as object,
          },
          select: { id: true },
        });
        await createLiveMatch(match.id, newRed, newBlue, offer.mode, offer.settings);
        // Join both players' current sockets to the new match room and notify.
        for (const uid of [newRed, newBlue]) {
          const room = io.sockets.adapter.rooms.get(`presence:${uid}`);
          if (room) for (const sid of room) io.sockets.sockets.get(sid)?.join(match.id);
        }
        io.to(`presence:${newRed}`).emit(EV.matchRematchReady, { matchId: match.id, yourColor: "red" });
        io.to(`presence:${newBlue}`).emit(EV.matchRematchReady, { matchId: match.id, yourColor: "blue" });
      } catch (e) {
        console.error("[match] rematch create failed", e);
      }
    } else {
      // First offer of the pair — persist the added offerer (refreshing the 60s
      // TTL) so the opponent's later offer sees ours and completes the match.
      await putRematchOffer(matchId, offer);
    }
  });

  socket.on(EV.matchRematchDecline, async (payload: { matchId?: unknown } = {}) => {
    const matchId = typeof payload?.matchId === "string" ? payload.matchId : null;
    if (!matchId) return;
    const offer = await getRematchOffer(matchId);
    if (!offer) return;
    await delRematchOffer(matchId);
    const other = userId === offer.redId ? offer.blueId : offer.redId;
    io.to(`presence:${other}`).emit(EV.matchRematchDecline, { fromMatchId: matchId, by: userId });
  });

  // ── Spectator cleanup — unlike the abandon-forfeit timer below (players get a
  // reconnect grace window), a dropped spectator socket is removed immediately:
  // there's no "forfeit" concept for watching, just an accurate live count. The
  // cluster-wide index rt:spectByUser:<userId> lists exactly the matches this
  // user is spectating, so we drop this socket from each without scanning every
  // live match.
  socket.on("disconnect", () => {
    void (async () => {
      for (const matchId of await spectatorMatchesForSocket(userId)) {
        await removeSpectatorSocket(io, matchId, userId, socket.id);
      }
    })().catch((e) => console.error("[match] spectator disconnect cleanup failed", e));
  });

  // ── Abandonment forfeit ── if this was the user's LAST socket cluster-wide,
  // schedule an abandon-forfeit job on every live match they're still playing:
  // if they don't reconnect (resync) within ABANDON_MS, the job forfeits them so
  // the match always settles. Deferred a tick so the socket has fully left its
  // presence room before we check for others. The presence check + the actual
  // forfeit are BOTH re-done inside handleAbandonForfeit when the job fires, so a
  // reconnect anywhere in the cluster in the meantime cancels the outcome.
  socket.on("disconnect", () => {
    setTimeout(() => {
      void (async () => {
        // Still connected somewhere in the cluster (multi-tab / quick reconnect on
        // any instance)? then they haven't abandoned anything. fetchSockets() spans
        // all instances via the Redis adapter.
        const socks = await io.in(`presence:${userId}`).fetchSockets();
        if (socks.length > 0) return;
        for (const matchId of await matchIdsForUser(userId)) {
          const lm = await getMatch(matchId);
          if (!lm || lm.state.result) continue;
          if (!colorOf(lm, userId)) continue; // not a player in this match
          // scheduleJob replaces any existing job for this key (see jobs.ts), so
          // re-arming is idempotent — no double-forfeit.
          void scheduleJob("abandon-forfeit", abandonKey(matchId, userId), ABANDON_MS, { matchId, userId });
        }
      })().catch((e) => console.error("[match] abandon schedule failed", e));
    }, 500);
  });
}

/**
 * abandon-forfeit job handler (cluster-safe). Fires ABANDON_MS after a player's
 * last socket dropped. Re-checks presence across the whole cluster first — a
 * reconnect on ANY instance in the grace window cancels the forfeit. If still
 * gone, forfeits the match to the opponent through the same lock+CAS+DB-gated
 * settle path as every other outcome, so it can never double-settle against a
 * concurrent final move/resign.
 */
export async function handleAbandonForfeit(io: IOServer, payload: Record<string, unknown>): Promise<void> {
  const matchId = String(payload.matchId);
  const userId = String(payload.userId);
  const socks = await io.in(`presence:${userId}`).fetchSockets();
  if (socks.length > 0) return; // reconnected somewhere in the cluster
  await mutateMatch(
    io,
    matchId,
    (lm) => {
      if (lm.state.result) return null;
      const color = colorOf(lm, userId);
      if (!color) return null;
      const winner: PieceColor = color === "red" ? "blue" : "red";
      return { ...lm.state, result: { winner, reason: "abandon" } };
    },
    async (lm) => {
      await settleMatch(io, lm);
    },
  );
}
