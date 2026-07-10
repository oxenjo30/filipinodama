import { create } from "zustand";
import type {
  DamathCoord,
  DamathGameState,
  DamathLegalMove,
  DamathPlayerId,
  DamathVariant,
  DamathEndReason,
} from "@dama/shared";
import {
  createInitialDamathState,
  getAllLegalDamathMoves,
  applyDamathMove,
  checkDamathEnd,
} from "@dama/game-engine";

/**
 * Damath store — parallel to gameStore, never merged. Phase 2 covers LOCAL
 * pass-and-play only (vs-AI = Phase 3, online = Phase 4). Both players share the
 * one device; Red opens. The engine owns all rules/scoring — this store only
 * holds selection + derived highlights and forwards taps.
 */

export type DamathMode = "local" | "ai" | "online";

type DamathStatus = "playing" | "over";

const sameCoord = (a: DamathCoord, b: DamathCoord) => a.x === b.x && a.y === b.y;
const landingOf = (m: DamathLegalMove) => m.path[m.path.length - 1];

export type DamathStore = {
  /** live engine state (source of truth) */
  state: DamathGameState;
  mode: DamathMode;
  variant: DamathVariant;
  /** selected own piece square (null when nothing selected) */
  selected: DamathCoord | null;
  /** landing squares of legal QUIET moves from the selected piece */
  moveTargets: DamathCoord[];
  /** landing squares of legal CAPTURE moves from the selected piece */
  captureTargets: DamathCoord[];
  /** true when any legal move this turn is a capture (mandatory) */
  mustCapture: boolean;
  status: DamathStatus;
  /** view-only board flip (pass-and-play perspective) */
  flip: boolean;

  newLocalGame: (variant?: DamathVariant) => void;
  rematch: () => void;
  onSquareClick: (sq: DamathCoord) => void;
  swapSides: () => void;
  /** resign: the given side (or the side to move) loses outright */
  surrender: (who?: DamathPlayerId) => void;
  /** end the game by a non-resign reason (timer/manual) → winner by score */
  endByReason: (reason: DamathEndReason) => void;
};

/** All legal moves whose `from` is `sq`. */
function movesFrom(state: DamathGameState, sq: DamathCoord): DamathLegalMove[] {
  const piece = state.pieces.find((p) => sameCoord(p.pos, sq));
  if (!piece) return [];
  return getAllLegalDamathMoves(state).filter((m) => m.pieceId === piece.id);
}

/** Derive highlight/selection slice for a state + selection. */
function derive(state: DamathGameState, selected: DamathCoord | null) {
  const all = getAllLegalDamathMoves(state);
  const mustCapture = all.some((m) => m.capturedIds.length > 0);
  const moveTargets: DamathCoord[] = [];
  const captureTargets: DamathCoord[] = [];
  if (selected) {
    for (const m of movesFrom(state, selected)) {
      if (m.capturedIds.length > 0) captureTargets.push(landingOf(m));
      else moveTargets.push(landingOf(m));
    }
  }
  return { mustCapture, moveTargets, captureTargets };
}

export const useDamathStore = create<DamathStore>((set, get) => {
  function start(mode: DamathMode, variant: DamathVariant) {
    const state = createInitialDamathState(variant);
    set({
      state,
      mode,
      variant,
      selected: null,
      status: "playing",
      flip: false,
      ...derive(state, null),
    });
  }

  const initial = createInitialDamathState("whole");
  return {
    state: initial,
    mode: "local",
    variant: "whole",
    selected: null,
    moveTargets: [],
    captureTargets: [],
    mustCapture: false,
    status: "playing",
    flip: false,

    newLocalGame: (variant) => start("local", variant ?? get().variant),
    rematch: () => start(get().mode, get().variant),

    swapSides: () => set((s) => ({ flip: !s.flip })),

    surrender: (who) => {
      const { state } = get();
      if (state.result) return;
      const resigning = who ?? state.turn;
      const result = checkDamathEnd({ ...state, turn: resigning }, "resign");
      set({
        state: { ...state, result },
        selected: null,
        status: "over",
        moveTargets: [],
        captureTargets: [],
      });
    },

    endByReason: (reason) => {
      const { state } = get();
      if (state.result) return;
      const result = checkDamathEnd(state, reason);
      set({
        state: { ...state, result },
        selected: null,
        status: "over",
        moveTargets: [],
        captureTargets: [],
      });
    },

    onSquareClick: (sq) => {
      const { state, selected, status } = get();
      if (status !== "playing" || state.result) return;
      const mover = state.turn;

      // If a piece is selected and the tap is a legal landing, play it.
      if (selected) {
        const options = movesFrom(state, selected);
        const chosen = options.find((m) => sameCoord(landingOf(m), sq));
        if (chosen) {
          const next = applyDamathMove(state, chosen);
          // after a move: has the side to move any legal reply? if not, the game
          // ends (no-moves) and the winner is decided by score (+chip bonus).
          const replies = getAllLegalDamathMoves(next);
          const noPieces = next.pieces.filter((p) => p.player === next.turn).length === 0;
          if (replies.length === 0 || noPieces) {
            const reason: DamathEndReason = noPieces ? "no-pieces" : "no-moves";
            const result = checkDamathEnd(next, reason);
            set({
              state: { ...next, result },
              selected: null,
              status: "over",
              moveTargets: [],
              captureTargets: [],
            });
            return;
          }
          set({
            state: next,
            selected: null,
            status: "playing",
            ...derive(next, null),
          });
          return;
        }
      }

      // Otherwise (re)select: only the mover's own pieces that HAVE a legal move.
      const piece = state.pieces.find((p) => sameCoord(p.pos, sq));
      if (piece && piece.player === mover && movesFrom(state, sq).length > 0) {
        set({ selected: sq, ...derive(state, sq) });
      } else {
        set({ selected: null, ...derive(state, null) });
      }
    },
  };
});
