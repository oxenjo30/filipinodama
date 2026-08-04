import { create } from "zustand";
import type { GameState, Move, Square, PieceColor, GameResult } from "@dama/shared";
import { EV, sameSquare } from "@dama/shared";
import { legalMoves, applyMove } from "@dama/game-engine";
import { connectSocket, getSocket } from "../lib/socket";

/**
 * onlineStore — client state for a SERVER-AUTHORITATIVE online match.
 *
 * The server owns the true GameState; this store renders whatever the server
 * sends (EV.matchState / EV.matchMoved / EV.matchEnded) and only ever emits move
 * INTENTS. We use the local engine solely to compute which squares are tappable
 * for the human (highlights) — never to decide legality (the server does that).
 */

type Opponent = {
  id: string;
  username: string;
  displayName: string;
  tag: string;
  avatarUrl: string | null;
  trophies: number;
  rankTier: string;
  /** opponent's equipped piece-skin art key (null = default discs) */
  skin?: string | null;
  /** opponent's equipped profile-frame item id (null = no frame) */
  frameId?: string | null;
  /** opponent's real device, UA-derived server-side (v3 delta Row 4-6). Drives
   *  the "Playing on {device}" line on the Match Found reveal. */
  device?: "mobile" | "web" | "tablet";
} | null;

export type MMStatus = "idle" | "searching" | "found" | "playing" | "ended";

/** How long the "Match Found!" VS reveal shows before the board loads. */
const MATCH_FOUND_REVEAL_MS = 1800;

type EndInfo = {
  result: GameResult;
  winnerId: string | null;
  redTrophyDelta: number;
  blueTrophyDelta: number;
  goldReward: number;
  /** true when the match ended because it became unreachable (connection lost /
   *  server dropped the in-memory match), not through a real result. */
  interrupted?: boolean;
} | null;

/**
 * A single in-match chat entry (message or emote), kept in the store so it
 * persists across re-renders for the duration of the match. `mine` is resolved
 * from the relay's `color` vs our myColor at receive time.
 */
export type ChatMsg = {
  id: string;
  mine: boolean;
  color: PieceColor;
  body: string | null;
  emote: string | null;
  at: number;
};

export type OnlineStore = {
  status: MMStatus;
  matchId: string | null;
  myColor: PieceColor | null;
  opponent: Opponent;
  state: GameState | null;
  selected: Square | null;
  moveTargets: Square[];
  captureTargets: Square[];
  mustCapture: boolean;
  end: EndInfo;
  error: string | null;

  /**
   * Optimistic move (latency fix): when YOU tap a legal move we apply it to
   * `state` immediately (so the board never freezes for the server round-trip)
   * and stash the pre-move state in `pendingBaseState` to roll back to if the
   * server rejects it. `pendingMove` is true while our own move is in flight
   * (echo not yet received) — drives a "sending…" hint. The server's authoritative
   * matchMoved/matchState always wins on arrival and clears both.
   */
  pendingBaseState: GameState | null;
  pendingMove: boolean;

  /**
   * Transient flag: the socket dropped mid-match and we're trying to reconnect.
   * Purely a UI hint (drives the "reconnecting…" banner); the authoritative
   * state is untouched. Cleared on reconnect/resync and on the next matchState.
   */
  connectionLost: boolean;

  /** In-match quick chat log (messages + emotes), live for the current match. */
  chat: ChatMsg[];
  /** Rematch UI state, driven by the rematch socket events. */
  offeredByMe: boolean;
  offeredByOpponent: boolean;
  rematchDeclined: boolean;

  /** Real live spectator count for the current match (EV.spectateCount), or
   *  null before the first count has arrived. Updated for BOTH players and
   *  spectators (the server broadcasts to the whole match room), but only the
   *  spectator view renders it — see OnlineMatchPage. Reset on reset(). */
  viewers: number | null;

  joinQueue: (mode: "CASUAL" | "RANKED", colorPref?: "red" | "blue" | "either") => Promise<void>;
  leaveQueue: () => void;
  /** Re-attach to the current matchId (used when arriving already in a match:
   *  a private-room start or a Continue-Playing resume) instead of re-queuing. */
  resync: () => Promise<void>;
  /** Join a live match BY ID as a read-only spectator (Watch / Live Matches page).
   *  Not a player action — never emits moves; the board just renders whatever the
   *  server broadcasts. */
  spectate: (matchId: string) => Promise<void>;
  onSquareClick: (sq: Square) => void;
  resign: () => void;
  reset: () => void;

  /** Send a text message to the opponent (relayed back to both by the server). */
  sendChat: (body: string) => void;
  /** Send an emote to the opponent. */
  sendEmote: (emote: string) => void;

  /** Offer / accept a rematch of the just-ended match (same opponent). */
  offerRematch: () => void;
  acceptRematch: () => void;
  /** Decline a pending rematch offer (or withdraw fallback to solo re-queue). */
  declineRematch: () => void;
};

let wired = false;

/**
 * The queue we are currently searching in, remembered so a socket reconnect can
 * RE-JOIN it. The server drops a player's queue entry (and cancels their pending
 * bot-fill job) once their last socket goes — correct on its own, but the client
 * previously never re-queued, so a routine reconnect while searching left the
 * player spinning on "Finding opponent" forever with nothing queued server-side.
 * Set on joinQueue, cleared once we're matched or we stop searching.
 */
let searchingIn: { mode: "CASUAL" | "RANKED"; colorPref: "red" | "blue" | "either" } | null = null;

function landing(m: Move): Square {
  return m.path[m.path.length - 1];
}

export const useOnlineStore = create<OnlineStore>((set, get) => {
  /** Attach the socket event listeners exactly once. */
  function wire() {
    if (wired) return;
    wired = true;
    const s = getSocket();

    s.on(EV.mmSearching, () => set({ status: "searching", error: null }));

    s.on(EV.mmFound, (p: { matchId: string; opponent: Opponent; yourColor: PieceColor; settings: unknown }) => {
      searchingIn = null; // matched — a later reconnect must resync, not re-queue
      set({
        status: "found",
        matchId: p.matchId,
        opponent: p.opponent,
        myColor: p.yourColor,
        end: null,
        chat: [],
        offeredByMe: false,
        offeredByOpponent: false,
        rematchDeclined: false,
      });
      // Hold on the "Match Found!" VS reveal for a beat so the player actually
      // sees who they're facing, THEN request the authoritative opening state
      // (which flips status → "playing" and loads the board). Without this the
      // board loads instantly and the reveal flashes by.
      window.setTimeout(() => {
        // Only proceed if we're still on this found match (not cancelled/left).
        if (useOnlineStore.getState().matchId === p.matchId) {
          s.emit(EV.matchResync, { matchId: p.matchId });
        }
      }, MATCH_FOUND_REVEAL_MS);
    });

    s.on(EV.mmCancelled, (p: { reason?: string }) => {
      searchingIn = null; // no longer queued — don't re-join on the next reconnect
      set({ status: "idle", error: p?.reason === "left" ? null : p?.reason ?? "cancelled" });
    });

    s.on(EV.matchState, (p: { matchId: string; state: GameState; yourColor: PieceColor | null }) => {
      set((st) => ({
        status: "playing",
        state: p.state,
        // Adopt the match this state belongs to. Without it a store that learned
        // about a match some other way (a recovered mm:found whose reveal was
        // interrupted) could render a live board with matchId still null, and
        // every move would then emit against a null id.
        matchId: p.matchId ?? st.matchId,
        myColor: p.yourColor ?? st.myColor,
        selected: null,
        // A full resync is authoritative — discard any in-flight optimistic move.
        pendingBaseState: null,
        pendingMove: false,
        // A fresh authoritative state means we're back in sync — drop the banner.
        connectionLost: false,
        ...derive(p.state, null, p.yourColor ?? st.myColor),
      }));
    });

    // ── Mid-match reconnect handling ───────────────────────────────────────
    // Mobile sockets drop routinely. On disconnect, if a match is in progress,
    // raise a transient banner (connectionLost) without touching the board —
    // the authoritative state stays put so nothing freezes visibly beyond the
    // hint. On reconnect, re-attach to the current match by re-emitting
    // matchResync; the resulting matchState clears the flag.
    s.on("disconnect", () => {
      const st = useOnlineStore.getState();
      if (st.matchId && (st.status === "playing" || st.status === "found")) {
        set({ connectionLost: true });
      }
    });

    s.io.on("reconnect", () => {
      const st = useOnlineStore.getState();
      if (st.matchId) {
        s.emit(EV.matchResync, { matchId: st.matchId });
      } else if (st.status === "searching" && searchingIn) {
        // We were in a queue when the socket dropped. The server dequeued us the
        // moment our last socket went (and cancelled the pending bot-fill), so
        // without this we'd sit on "Finding opponent" forever against an empty
        // server-side queue. Re-join the SAME queue we were searching in.
        s.emit(EV.mmJoin, searchingIn);
      }
      set({ connectionLost: false });
    });

    s.on(EV.matchMoved, (p: { matchId: string; move: Move; state: GameState }) => {
      // Authoritative server state ALWAYS wins — reconciles our optimistic apply
      // (identical for our own move; the only update for the opponent's). Clear
      // the pending markers: the move is now confirmed.
      set((st) => ({
        state: p.state,
        selected: null,
        pendingBaseState: null,
        pendingMove: false,
        ...derive(p.state, null, st.myColor),
      }));
    });

    s.on(EV.matchIllegal, (p: { reason?: string }) => {
      // "no-such-match" is not a move rejection — the match is GONE from the
      // server (a bot match after a server restart, or an expired session). Don't
      // leave the player staring at a frozen board with cryptic red text: end the
      // game cleanly with an honest, friendly message so they can move on.
      if (p?.reason === "no-such-match") {
        set((st) => ({
          selected: null,
          connectionLost: false,
          error: null,
          ...derive(st.state, null, st.myColor),
          status: "ended",
          end: st.end ?? {
            result: { winner: "draw", reason: "abandon" },
            winnerId: null,
            redTrophyDelta: 0,
            blueTrophyDelta: 0,
            goldReward: 0,
            interrupted: true, // marks a connection-lost end (no win/lose claim)
          },
        }));
        return;
      }
      // Any other rejection (e.g. an illegal move, or a race where the opponent
      // moved / the match ended between our tap and the server seeing it) — ROLL
      // BACK our optimistic apply to the pre-move state, then let the next
      // authoritative event (matchMoved/matchState) reconcile.
      set((st) => {
        const rolledBack = st.pendingBaseState ?? st.state;
        return {
          state: rolledBack,
          selected: null,
          pendingBaseState: null,
          pendingMove: false,
          ...derive(rolledBack, null, st.myColor),
          error: p?.reason ?? null,
        };
      });
    });

    s.on(EV.matchEnded, (p: { result: GameResult; winnerId: string | null; redTrophyDelta: number; blueTrophyDelta: number; goldReward: number; state: GameState }) => {
      set({
        status: "ended",
        state: p.state,
        end: {
          result: p.result,
          winnerId: p.winnerId,
          redTrophyDelta: p.redTrophyDelta,
          blueTrophyDelta: p.blueTrophyDelta,
          goldReward: p.goldReward,
        },
        selected: null,
        moveTargets: [],
        captureTargets: [],
      });
    });

    // ── In-match quick chat / emote relayed by the server to both players. ──
    s.on(
      EV.matchChat,
      (p: { matchId: string; from: string; color: PieceColor; body: string | null; emote: string | null; at: number }) => {
        set((st) => {
          // Ignore chat that isn't for the match we're currently in.
          if (st.matchId && p.matchId !== st.matchId) return {};
          const msg: ChatMsg = {
            id: `${p.at}-${p.from}-${st.chat.length}`,
            mine: st.myColor != null && p.color === st.myColor,
            color: p.color,
            body: p.body ?? null,
            emote: p.emote ?? null,
            at: p.at,
          };
          return { chat: [...st.chat, msg] };
        });
      },
    );

    // ── Real spectator count for the current match — server broadcasts to the
    // whole match room (both players AND spectators) whenever it changes. Only
    // applied if it's for the match we're currently in (guards a stale event
    // arriving just after we've moved on to a different match). ──
    s.on(EV.spectateCount, (p: { matchId: string; viewers: number }) => {
      set((st) => (st.matchId && p.matchId === st.matchId ? { viewers: p.viewers } : {}));
    });

    // ── Rematch: opponent offered a rematch of the just-ended match. ──
    s.on(EV.matchRematchOffer, (p: { fromMatchId: string; by: string }) => {
      set((st) => (st.matchId && p.fromMatchId !== st.matchId ? {} : { offeredByOpponent: true, rematchDeclined: false }));
    });

    // ── Rematch: both agreed → a NEW match has been seeded. Reset into it. ──
    s.on(EV.matchRematchReady, (p: { matchId: string; yourColor: PieceColor }) => {
      set({
        status: "playing",
        matchId: p.matchId,
        myColor: p.yourColor,
        state: null,
        selected: null,
        moveTargets: [],
        captureTargets: [],
        mustCapture: false,
        end: null,
        error: null,
        chat: [],
        offeredByMe: false,
        offeredByOpponent: false,
        rematchDeclined: false,
      });
      // The server already joined our socket to the new room; pull the opening state.
      s.emit(EV.matchResync, { matchId: p.matchId });
    });

    // ── Rematch: opponent declined our offer. Fall back to solo re-queue. ──
    s.on(EV.matchRematchDecline, (p: { fromMatchId: string; by: string }) => {
      set((st) =>
        st.matchId && p.fromMatchId !== st.matchId
          ? {}
          : { offeredByMe: false, offeredByOpponent: false, rematchDeclined: true },
      );
    });
  }

  /** Compute the human's tappable highlights from the *server* state. */
  function derive(state: GameState | null, selected: Square | null, myColor: PieceColor | null) {
    if (!state || !myColor) return { moveTargets: [], captureTargets: [], mustCapture: false };
    const mine = state.turn === myColor && !state.result;
    const all = legalMoves(state);
    const mustCapture = all.some((m) => m.captures.length > 0);
    const moveTargets: Square[] = [];
    const captureTargets: Square[] = [];
    if (mine && selected) {
      for (const m of all.filter((mv) => sameSquare(mv.from, selected))) {
        if (m.captures.length > 0) captureTargets.push(landing(m));
        else moveTargets.push(landing(m));
      }
    }
    return { moveTargets, captureTargets, mustCapture };
  }

  return {
    status: "idle",
    matchId: null,
    myColor: null,
    opponent: null,
    state: null,
    selected: null,
    moveTargets: [],
    captureTargets: [],
    mustCapture: false,
    end: null,
    error: null,
    pendingBaseState: null,
    pendingMove: false,
    connectionLost: false,
    chat: [],
    offeredByMe: false,
    offeredByOpponent: false,
    rematchDeclined: false,
    viewers: null,

    joinQueue: async (mode, colorPref = "either") => {
      set({ status: "searching", error: null, end: null });
      searchingIn = { mode, colorPref }; // so a reconnect can re-join this queue
      try {
        await connectSocket();
        wire();
        getSocket().emit(EV.mmJoin, { mode, colorPref });
      } catch {
        searchingIn = null;
        set({ status: "idle", error: "Could not connect. Are you logged in?" });
      }
    },

    leaveQueue: () => {
      searchingIn = null;
      try {
        getSocket().emit(EV.mmLeave);
      } catch {
        /* ignore */
      }
      set({ status: "idle" });
    },

    resync: async () => {
      const id = get().matchId;
      if (!id) return;
      try {
        await connectSocket();
        wire();
        getSocket().emit(EV.matchResync, { matchId: id });
      } catch {
        /* the server will resend match:state; if offline the board stays as-is */
      }
    },

    spectate: async (matchId) => {
      set({
        status: "playing",
        matchId,
        myColor: null,
        opponent: null,
        state: null,
        selected: null,
        moveTargets: [],
        captureTargets: [],
        mustCapture: false,
        end: null,
        error: null,
        connectionLost: false,
        chat: [],
        offeredByMe: false,
        offeredByOpponent: false,
        rematchDeclined: false,
        viewers: null,
      });
      try {
        await connectSocket();
        wire();
        getSocket().emit(EV.spectateJoin, { matchId });
      } catch {
        set({ error: "Could not connect. Are you logged in?" });
      }
    },

    onSquareClick: (sq) => {
      const { state, selected, myColor, matchId } = get();
      if (!state || !myColor || state.result) return;
      if (state.turn !== myColor) return; // not your turn

      // If a piece is selected and this is a legal landing, emit the move intent.
      if (selected) {
        const options = legalMoves(state).filter((m) => sameSquare(m.from, selected));
        const chosen = options.find((m) => sameSquare(landing(m), sq));
        if (chosen) {
          // Don't stack a second optimistic move while one is still in flight.
          if (get().pendingMove) return;
          // Optimistic apply (latency fix): render OUR move immediately with the
          // same engine the server uses, so the board never freezes for the
          // round-trip. Stash the pre-move state to roll back to on rejection;
          // the server's matchMoved echo replaces it with the authoritative state.
          let optimistic: GameState | null = null;
          try {
            optimistic = applyMove(state, chosen);
          } catch {
            optimistic = null;
          }
          getSocket().emit(EV.matchMove, { matchId, move: chosen });
          if (optimistic) {
            set((st) => ({
              state: optimistic!,
              pendingBaseState: state,
              pendingMove: true,
              selected: null,
              ...derive(optimistic!, null, st.myColor),
            }));
          } else {
            set({ selected: null, moveTargets: [], captureTargets: [] });
          }
          return;
        }
      }

      // Otherwise (re)select an own piece that has a legal move.
      const piece = state.pieces.find((p) => sameSquare(p.square, sq));
      const canSelect = piece && piece.color === myColor && legalMoves(state).some((m) => sameSquare(m.from, sq));
      if (canSelect) set({ selected: sq, ...derive(state, sq, myColor) });
      else set({ selected: null, ...derive(state, null, myColor) });
    },

    resign: () => {
      const { matchId } = get();
      if (matchId) getSocket().emit(EV.matchResign, { matchId });
    },

    reset: () => {
      searchingIn = null;
      // Leaving a spectated match — tell the server to drop us from its room
      // (never sent for a real player: their match room membership is theirs).
      const cur = get();
      if (cur.matchId && cur.myColor === null) {
        try {
          getSocket().emit(EV.spectateLeave, { matchId: cur.matchId });
        } catch {
          /* ignore */
        }
      }
      set({
        status: "idle",
        matchId: null,
        myColor: null,
        opponent: null,
        state: null,
        selected: null,
        moveTargets: [],
        captureTargets: [],
        mustCapture: false,
        end: null,
        error: null,
        connectionLost: false,
        chat: [],
        offeredByMe: false,
        offeredByOpponent: false,
        rematchDeclined: false,
        viewers: null,
      });
    },

    sendChat: (body) => {
      const text = body.trim();
      const { matchId } = get();
      if (!text || !matchId) return;
      try {
        getSocket().emit(EV.matchChat, { matchId, body: text });
      } catch {
        /* socket unavailable — nothing to append; the server echoes real messages */
      }
    },

    sendEmote: (emote) => {
      const { matchId } = get();
      if (!emote || !matchId) return;
      try {
        getSocket().emit(EV.matchChat, { matchId, emote });
      } catch {
        /* ignore */
      }
    },

    // The rematch offer is keyed by the JUST-ENDED matchId, which onlineStore
    // still holds (matchEnded does not clear it). Emitting marks us as offered;
    // if the opponent had already offered, the server seeds the new match and we
    // receive matchRematchReady.
    offerRematch: () => {
      const { matchId } = get();
      if (!matchId) return;
      try {
        getSocket().emit(EV.matchRematchOffer, { matchId });
        set({ offeredByMe: true, rematchDeclined: false });
      } catch {
        set({ error: "Couldn't reach the server." });
      }
    },

    // Accepting an opponent's pending offer is the same emit — once both sides
    // have offered, the server pairs them and emits matchRematchReady.
    acceptRematch: () => {
      const { matchId } = get();
      if (!matchId) return;
      try {
        getSocket().emit(EV.matchRematchOffer, { matchId });
        set({ offeredByMe: true });
      } catch {
        set({ error: "Couldn't reach the server." });
      }
    },

    declineRematch: () => {
      const { matchId } = get();
      if (matchId) {
        try {
          getSocket().emit(EV.matchRematchDecline, { matchId });
        } catch {
          /* ignore */
        }
      }
      set({ offeredByMe: false, offeredByOpponent: false });
    },
  };
});
