import { create } from "zustand";
import type { GameState, Move, Square, PieceColor, GameResult } from "@dama/shared";
import { EV, sameSquare } from "@dama/shared";
import { legalMoves } from "@dama/game-engine";
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
} | null;

export type MMStatus = "idle" | "searching" | "found" | "playing" | "ended";

type EndInfo = {
  result: GameResult;
  winnerId: string | null;
  redTrophyDelta: number;
  blueTrophyDelta: number;
  goldReward: number;
} | null;

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

  joinQueue: (mode: "CASUAL" | "RANKED") => Promise<void>;
  leaveQueue: () => void;
  onSquareClick: (sq: Square) => void;
  resign: () => void;
  reset: () => void;
};

let wired = false;

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
      set({ status: "found", matchId: p.matchId, opponent: p.opponent, myColor: p.yourColor, end: null });
      // ask for the authoritative opening state
      s.emit(EV.matchResync, { matchId: p.matchId });
    });

    s.on(EV.mmCancelled, (p: { reason?: string }) => {
      set({ status: "idle", error: p?.reason === "left" ? null : p?.reason ?? "cancelled" });
    });

    s.on(EV.matchState, (p: { matchId: string; state: GameState; yourColor: PieceColor | null }) => {
      set((st) => ({
        status: "playing",
        state: p.state,
        myColor: p.yourColor ?? st.myColor,
        selected: null,
        ...derive(p.state, null, p.yourColor ?? st.myColor),
      }));
    });

    s.on(EV.matchMoved, (p: { matchId: string; move: Move; state: GameState }) => {
      set((st) => ({
        state: p.state,
        selected: null,
        ...derive(p.state, null, st.myColor),
      }));
    });

    s.on(EV.matchIllegal, (p: { reason?: string }) => {
      // Server rejected our intent — clear selection; keep the server's state.
      set((st) => ({ selected: null, ...derive(st.state, null, st.myColor), error: p?.reason ?? null }));
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

    joinQueue: async (mode) => {
      set({ status: "searching", error: null, end: null });
      try {
        await connectSocket();
        wire();
        getSocket().emit(EV.mmJoin, { mode });
      } catch {
        set({ status: "idle", error: "Could not connect. Are you logged in?" });
      }
    },

    leaveQueue: () => {
      try {
        getSocket().emit(EV.mmLeave);
      } catch {
        /* ignore */
      }
      set({ status: "idle" });
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
          getSocket().emit(EV.matchMove, { matchId, move: chosen });
          set({ selected: null, moveTargets: [], captureTargets: [] });
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

    reset: () =>
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
      }),
  };
});
