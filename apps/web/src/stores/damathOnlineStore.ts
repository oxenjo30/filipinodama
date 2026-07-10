import { create } from "zustand";
import type {
  DamathCoord,
  DamathGameState,
  DamathLegalMove,
  DamathPlayerId,
  DamathResult,
  DamathVariant,
} from "@dama/shared";
import { EV } from "@dama/shared";
import { getAllLegalDamathMoves } from "@dama/game-engine";
import { connectSocket, getSocket } from "../lib/socket";

/**
 * damathOnlineStore — client for a SERVER-AUTHORITATIVE Math Dama match. The
 * server owns the true DamathGameState; this store renders whatever the server
 * sends (damathState / damathMoved / damathEnded) and only emits move INTENTS
 * ({ pieceId, to }). The local engine is used solely to compute the human's
 * tappable highlights — never to decide legality (the server does that).
 * Unranked, no economy, no chat/rematch (spec §7) — deliberately simpler than
 * the Classic onlineStore.
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

export type DamathMMStatus = "idle" | "searching" | "found" | "playing" | "ended";

const sameCoord = (a: DamathCoord, b: DamathCoord) => a.x === b.x && a.y === b.y;
const landingOf = (m: DamathLegalMove) => m.path[m.path.length - 1];

export type DamathOnlineStore = {
  status: DamathMMStatus;
  matchId: string | null;
  variant: DamathVariant;
  myColor: DamathPlayerId | null;
  opponent: Opponent;
  state: DamathGameState | null;
  selected: DamathCoord | null;
  moveTargets: DamathCoord[];
  captureTargets: DamathCoord[];
  mustCapture: boolean;
  result: DamathResult | null;
  error: string | null;
  connectionLost: boolean;

  joinQueue: (variant?: DamathVariant) => Promise<void>;
  leaveQueue: () => void;
  resync: () => Promise<void>;
  onSquareClick: (sq: DamathCoord) => void;
  resign: () => void;
  reset: () => void;
};

let wired = false;

export const useDamathOnlineStore = create<DamathOnlineStore>((set, get) => {
  /** Highlights for the human, derived from the *server* state. */
  function derive(state: DamathGameState | null, selected: DamathCoord | null, myColor: DamathPlayerId | null) {
    if (!state || !myColor) return { moveTargets: [], captureTargets: [], mustCapture: false };
    const all = getAllLegalDamathMoves(state);
    const mustCapture = all.some((m) => m.capturedIds.length > 0);
    const mine = state.turn === myColor && !state.result;
    const moveTargets: DamathCoord[] = [];
    const captureTargets: DamathCoord[] = [];
    if (mine && selected) {
      const piece = state.pieces.find((p) => sameCoord(p.pos, selected));
      for (const m of all.filter((mv) => mv.pieceId === piece?.id)) {
        if (m.capturedIds.length > 0) captureTargets.push(landingOf(m));
        else moveTargets.push(landingOf(m));
      }
    }
    return { moveTargets, captureTargets, mustCapture };
  }

  function wire() {
    if (wired) return;
    wired = true;
    const s = getSocket();

    s.on(EV.damathMmSearching, () => set({ status: "searching", error: null }));

    s.on(
      EV.damathMmFound,
      (p: { matchId: string; opponent: Opponent; yourColor: DamathPlayerId; variant: DamathVariant }) => {
        set({
          status: "found",
          matchId: p.matchId,
          opponent: p.opponent,
          myColor: p.yourColor,
          variant: p.variant,
          result: null,
        });
        // pull the authoritative opening state (flips → playing, loads the board).
        if (get().matchId === p.matchId) s.emit(EV.damathResync, { matchId: p.matchId });
      },
    );

    s.on(EV.damathMmCancelled, (p: { reason?: string }) =>
      set({ status: "idle", error: p?.reason === "left" ? null : (p?.reason ?? "cancelled") }),
    );

    s.on(
      EV.damathState,
      (p: { matchId: string; state: DamathGameState; yourColor: DamathPlayerId | null; variant: DamathVariant }) => {
        set((st) => ({
          status: "playing",
          state: p.state,
          myColor: p.yourColor ?? st.myColor,
          variant: p.variant ?? st.variant,
          selected: null,
          connectionLost: false,
          ...derive(p.state, null, p.yourColor ?? st.myColor),
        }));
      },
    );

    s.on(EV.damathMoved, (p: { matchId: string; state: DamathGameState }) => {
      set((st) => ({ state: p.state, selected: null, ...derive(p.state, null, st.myColor) }));
    });

    s.on(EV.damathIllegal, (p: { reason?: string }) => {
      if (p?.reason === "no-such-match") {
        set((st) => ({ selected: null, connectionLost: false, error: null, status: "ended", ...derive(st.state, null, st.myColor) }));
        return;
      }
      set((st) => ({ selected: null, ...derive(st.state, null, st.myColor), error: p?.reason ?? null }));
    });

    s.on(EV.damathEnded, (p: { matchId: string; result: DamathResult; state: DamathGameState }) => {
      set({
        status: "ended",
        state: p.state,
        result: p.result,
        selected: null,
        moveTargets: [],
        captureTargets: [],
      });
    });

    s.on("disconnect", () => {
      const st = get();
      if (st.matchId && (st.status === "playing" || st.status === "found")) set({ connectionLost: true });
    });
    s.io.on("reconnect", () => {
      const st = get();
      if (st.matchId) s.emit(EV.damathResync, { matchId: st.matchId });
      set({ connectionLost: false });
    });
  }

  return {
    status: "idle",
    matchId: null,
    variant: "whole",
    myColor: null,
    opponent: null,
    state: null,
    selected: null,
    moveTargets: [],
    captureTargets: [],
    mustCapture: false,
    result: null,
    error: null,
    connectionLost: false,

    joinQueue: async (variant = "whole") => {
      set({ status: "searching", error: null, result: null, variant });
      try {
        await connectSocket();
        wire();
        getSocket().emit(EV.damathMmJoin, { variant });
      } catch {
        set({ status: "idle", error: "Could not connect. Are you logged in?" });
      }
    },

    leaveQueue: () => {
      try {
        getSocket().emit(EV.damathMmLeave);
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
        getSocket().emit(EV.damathResync, { matchId: id });
      } catch {
        /* server will resend damath:state */
      }
    },

    onSquareClick: (sq) => {
      const { state, selected, myColor, matchId } = get();
      if (!state || !myColor || state.result) return;
      if (state.turn !== myColor) return; // not your turn

      if (selected) {
        const piece = state.pieces.find((p) => sameCoord(p.pos, selected));
        const options = getAllLegalDamathMoves(state).filter((m) => m.pieceId === piece?.id);
        const chosen = options.find((m) => sameCoord(landingOf(m), sq));
        if (chosen) {
          getSocket().emit(EV.damathMove, { matchId, pieceId: chosen.pieceId, to: sq });
          set({ selected: null, moveTargets: [], captureTargets: [] });
          return;
        }
      }

      const piece = state.pieces.find((p) => sameCoord(p.pos, sq));
      const canSelect =
        piece &&
        piece.player === myColor &&
        getAllLegalDamathMoves(state).some((m) => m.pieceId === piece.id);
      if (canSelect) set({ selected: sq, ...derive(state, sq, myColor) });
      else set({ selected: null, ...derive(state, null, myColor) });
    },

    resign: () => {
      const { matchId } = get();
      if (matchId) getSocket().emit(EV.damathResign, { matchId });
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
        result: null,
        error: null,
        connectionLost: false,
      }),
  };
});
