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
import { allow } from "./rate-limit.js";
import { questAdvanceFor, type MatchQuestContext } from "../lib/quest-trigger.js";

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
  /**
   * When this match was filled with a BOT (empty-queue fallback), this is the
   * bot's colour. The server plays the bot's turns with the game engine via the
   * same authoritative apply/broadcast path as a human. undefined = all-human.
   */
  botColor?: PieceColor;
};

/** matchId -> authoritative live state. */
const live: Map<string, LiveMatch> = new Map();

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
  offeredBy: Set<string>;
  expires: number;
};
const rematchOffers: Map<string, RematchOffer> = new Map();
const REMATCH_TTL_MS = 60_000;
// Periodic sweep so abandoned end-of-match offers are reclaimed even if no new
// offer event ever fires (opportunistic pruning alone would leak them). unref()
// so this timer never keeps the process alive on shutdown.
const rematchSweep = setInterval(() => {
  const now = Date.now();
  for (const [id, o] of rematchOffers) if (o.expires < now) rematchOffers.delete(id);
}, 30_000);
rematchSweep.unref?.();

/**
 * Seed a live match. Called by matchmaking (and any room-start flow) the moment
 * two players are paired. The engine builds the opening position; the same
 * `settings` are persisted on the Match row so replays are exact.
 */
/**
 * Drop a live match's in-memory state without settling it (e.g. the private-room
 * host abandoned the lobby before/after start). Safe to call for an unknown id.
 */
export function endLiveMatch(matchId: string): void {
  live.delete(matchId);
}

/**
 * Forfeit a live match to `winnerColor` and settle it exactly once (persist +
 * ledger + broadcast matchEnded), then drop it from memory. Used when a
 * private-room host abandons a STARTED match: the guest's in-progress game must
 * settle as a WIN for the guest rather than being silently discarded. No-op for
 * an unknown/already-settled/already-finished match (so a normal endLiveMatch
 * path and this never double-settle).
 */
export async function forfeitLiveMatch(
  io: IOServer,
  matchId: string,
  winnerColor: PieceColor,
): Promise<void> {
  const lm = live.get(matchId);
  if (!lm || lm.settled || lm.state.result) return;
  lm.state = { ...lm.state, result: { winner: winnerColor, reason: "abandon" } };
  await settleMatch(io, lm);
}

export function createLiveMatch(
  matchId: string,
  redId: string | null,
  blueId: string | null,
  mode: PrismaMatchMode | string,
  settings: GameSettings,
  botColor?: PieceColor,
): LiveMatch {
  const state = createInitialState(settings, matchId);
  const lm: LiveMatch = {
    matchId,
    redId,
    blueId,
    mode: mode as PrismaMatchMode,
    state,
    settled: false,
    botColor,
  };
  live.set(matchId, lm);
  return lm;
}

/**
 * Drive the BOT's turn (empty-queue fill). If it's the bot's move and the game
 * isn't over, wait a human-like beat, compute a strong move with the engine, and
 * apply it through the SAME authoritative path as a human move (validate → apply
 * → persist → broadcast matchMoved → settle). Recurses so consecutive bot turns
 * (never happens in Dama, but safe) and post-move settlement are handled. No-op
 * for all-human matches.
 */
export function maybePlayBotMove(io: IOServer, matchId: string): void {
  const lm = live.get(matchId);
  if (!lm || lm.settled || !lm.botColor) return;
  if (lm.state.result || lm.state.turn !== lm.botColor) return;

  // Human-like think time (700–1500ms) so it doesn't feel robotic.
  const delay = 700 + Math.floor(Math.random() * 800);
  setTimeout(() => {
    void (async () => {
      const cur = live.get(matchId);
      // Re-check: the match may have ended / resigned / turn changed mid-timeout.
      if (!cur || cur.settled || cur.botColor == null) return;
      if (cur.state.result || cur.state.turn !== cur.botColor) return;

      let move: Move;
      try {
        move = bestMove(cur.state, "hard");
      } catch (e) {
        console.error("[match] bot bestMove failed", matchId, e);
        return;
      }
      let next: GameState;
      try {
        if (!isLegal(cur.state, move)) return; // engine invariant; bail safely
        next = applyMove(cur.state, move);
      } catch (e) {
        console.error("[match] bot applyMove failed", matchId, e);
        return;
      }
      cur.state = next;

      prisma.match
        .update({ where: { id: matchId }, data: { moves: next.history as unknown as object } })
        .catch((e) => console.error("[match] bot move persist failed", matchId, e));

      io.to(matchId).emit(EV.matchMoved, { matchId, move, state: next });

      if (next.result) {
        await settleMatch(io, cur);
      } else {
        // If, after the bot's move, it's somehow the bot's turn again, continue.
        maybePlayBotMove(io, matchId);
      }
    })();
  }, delay);
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

async function settleMatch(io: IOServer, lm: LiveMatch): Promise<void> {
  if (lm.settled) return;
  const result = lm.state.result;
  if (!result) return;
  lm.settled = true;

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

  // Persist the match record first so the ledger entries can reference it.
  try {
    await prisma.match.update({
      where: { id: lm.matchId },
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
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[match] failed to persist result", lm.matchId, e);
  }

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
  if (lm.redId && lm.blueId) {
    rematchOffers.set(lm.matchId, {
      redId: lm.redId,
      blueId: lm.blueId,
      mode: lm.mode,
      settings: { ...lm.state.settings },
      offeredBy: new Set(),
      expires: Date.now() + REMATCH_TTL_MS,
    });
  }

  live.delete(lm.matchId);

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

/** Prune expired rematch offers (called opportunistically on each offer). */
function pruneRematchOffers() {
  const now = Date.now();
  for (const [id, o] of rematchOffers) if (o.expires < now) rematchOffers.delete(id);
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
    } else {
      // If this is a bot-filled match and it's now the bot's turn, let the server
      // play the bot's reply (no-op for all-human matches).
      maybePlayBotMove(io, matchId);
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
  socket.on(EV.spectateJoin, (payload: { matchId?: unknown } = {}) => {
    const matchId = typeof payload?.matchId === "string" ? payload.matchId : null;
    if (!matchId) return;
    const lm = live.get(matchId);
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
    socket.emit(EV.matchState, {
      matchId,
      state: lm.state,
      yourColor: null, // spectator → client renders read-only
      settings: lm.state.settings,
    });
  });

  socket.on(EV.spectateLeave, (payload: { matchId?: unknown } = {}) => {
    const matchId = typeof payload?.matchId === "string" ? payload.matchId : null;
    if (!matchId) return;
    // Only a non-player may be removed this way — never accidentally evict a
    // real player's socket from their own live match room.
    const lm = live.get(matchId);
    if (lm && colorOf(lm, userId)) return;
    void socket.leave(matchId);
  });

  // ── In-match quick chat / emote — relay to the match room (persisted lightly
  // via the match room; no separate channel needed for ephemeral match chat). ──
  socket.on(EV.matchChat, async (payload: { matchId?: unknown; body?: unknown; emote?: unknown } = {}) => {
    if (!allow(socket, "match:chat", 8, 4000)) return; // anti-flood
    const matchId = typeof payload?.matchId === "string" ? payload.matchId : null;
    if (!matchId) return;
    const lm = live.get(matchId);
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
    pruneRematchOffers();
    const matchId = typeof payload?.matchId === "string" ? payload.matchId : null;
    if (!matchId) return;
    const offer = rematchOffers.get(matchId);
    if (!offer || (userId !== offer.redId && userId !== offer.blueId)) return;

    offer.offeredBy.add(userId);
    // Tell the opponent an offer is pending.
    io.to(`presence:${userId === offer.redId ? offer.blueId : offer.redId}`).emit(EV.matchRematchOffer, {
      fromMatchId: matchId,
      by: userId,
    });

    // Both agreed → seed a fresh match with colors swapped and pair them.
    if (offer.offeredBy.has(offer.redId) && offer.offeredBy.has(offer.blueId)) {
      rematchOffers.delete(matchId);
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
        createLiveMatch(match.id, newRed, newBlue, offer.mode, offer.settings);
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
    }
  });

  socket.on(EV.matchRematchDecline, (payload: { matchId?: unknown } = {}) => {
    const matchId = typeof payload?.matchId === "string" ? payload.matchId : null;
    if (!matchId) return;
    const offer = rematchOffers.get(matchId);
    if (!offer) return;
    rematchOffers.delete(matchId);
    const other = userId === offer.redId ? offer.blueId : offer.redId;
    io.to(`presence:${other}`).emit(EV.matchRematchDecline, { fromMatchId: matchId, by: userId });
  });

  // ── Abandonment forfeit ── if this was the user's LAST socket, arm a timer on
  // every live match they're still playing: if they don't reconnect (resync)
  // within ABANDON_MS, forfeit them so the match always settles. Deferred a tick
  // so the socket has fully left its presence room before we check for others.
  socket.on("disconnect", () => {
    setTimeout(() => {
      // Still have another connected socket (multi-tab / quick reconnect)? then
      // they haven't abandoned anything.
      const room = io.sockets.adapter.rooms.get(`presence:${userId}`);
      if (room && room.size > 0) return;
      for (const lm of live.values()) {
        if (lm.settled || lm.state.result) continue;
        const color = colorOf(lm, userId);
        if (!color) continue; // not a player in this match
        const k = abandonKey(lm.matchId, userId);
        if (abandonTimers.has(k)) continue; // already armed
        const t = setTimeout(() => {
          abandonTimers.delete(k);
          const cur = live.get(lm.matchId);
          if (!cur || cur.settled || cur.state.result) return;
          // Still gone → opponent wins by abandonment.
          const winner: PieceColor = color === "red" ? "blue" : "red";
          cur.state = { ...cur.state, result: { winner, reason: "abandon" } };
          void settleMatch(io, cur).catch((e) => console.error("[match] abandon settle failed", e));
        }, ABANDON_MS);
        abandonTimers.set(k, t);
      }
    }, 500);
  });
}
