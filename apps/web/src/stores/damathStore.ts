import { create } from "zustand";
import type {
  AiDifficulty,
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
  bestDamathMove,
} from "@dama/game-engine";

/**
 * Damath store — parallel to gameStore, never merged. Covers LOCAL pass-and-play
 * and vs-AI (online = Phase 4). Red opens. In vs-AI the human plays RED and the
 * AI plays BLUE. The engine owns all rules/scoring/AI — this store only holds
 * selection + derived highlights and forwards taps.
 */

export type DamathMode = "local" | "ai" | "online";

type DamathStatus = "playing" | "thinking" | "over";

/** vs-AI seats: human plays RED (opens), AI plays BLUE. */
export const DAMATH_HUMAN: DamathPlayerId = "red";
export const DAMATH_AI: DamathPlayerId = "blue";

/** Delay before the AI plays, so its "thinking" state is visible and the
 *  human's move has time to slide + any capture to fade. */
const AI_THINK_MS = 700;

const sameCoord = (a: DamathCoord, b: DamathCoord) => a.x === b.x && a.y === b.y;
const landingOf = (m: DamathLegalMove) => m.path[m.path.length - 1];

export type DamathStore = {
  /** live engine state (source of truth) */
  state: DamathGameState;
  mode: DamathMode;
  variant: DamathVariant;
  /** AI strength (vs-AI mode only) */
  difficulty: AiDifficulty;
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
  newAiGame: (variant?: DamathVariant, difficulty?: AiDifficulty) => void;
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

/** Terminal check after a move: is the side to move out of moves/pieces? */
function terminalReason(next: DamathGameState): DamathEndReason | null {
  const noPieces = next.pieces.filter((p) => p.player === next.turn).length === 0;
  if (noPieces) return "no-pieces";
  if (getAllLegalDamathMoves(next).length === 0) return "no-moves";
  return null;
}

export const useDamathStore = create<DamathStore>((set, get) => {
  function start(mode: DamathMode, variant: DamathVariant, difficulty?: AiDifficulty) {
    const state = createInitialDamathState(variant);
    set({
      state,
      mode,
      variant,
      difficulty: difficulty ?? get().difficulty,
      selected: null,
      status: "playing",
      flip: false,
      ...derive(state, null),
    });
    // Red opens (human in ai mode / Player 1 in local); no AI kickoff needed.
  }

  /** Apply a chosen move, settle any game end, switch turn, and — in vs-AI mode
   *  when it becomes the AI's turn — schedule the AI's reply. */
  function commitMove(next: DamathGameState) {
    const reason = terminalReason(next);
    if (reason) {
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
    set({ state: next, selected: null, status: "playing", ...derive(next, null) });
    scheduleAiMove();
  }

  /** In vs-AI mode, if it is the AI's turn, play the engine's move after a beat. */
  function scheduleAiMove() {
    const { state, mode, difficulty } = get();
    if (mode !== "ai" || state.result || state.turn !== DAMATH_AI) return;
    set({ status: "thinking" });
    window.setTimeout(() => {
      const { state: cur, mode: curMode } = get();
      // Guard: the match may have been reset/switched to local mid-timeout. In
      // local mode BLUE is a human even though blue === DAMATH_AI, so this check
      // prevents a stale timeout from moving for a human.
      if (curMode !== "ai" || cur.result || cur.turn !== DAMATH_AI) {
        if (!cur.result && curMode === "ai") set({ status: "playing" });
        return;
      }
      const move = bestDamathMove(cur, difficulty);
      commitMove(applyDamathMove(cur, move));
    }, AI_THINK_MS);
  }

  const initial = createInitialDamathState("whole");
  return {
    state: initial,
    mode: "local",
    variant: "whole",
    difficulty: "normal",
    selected: null,
    moveTargets: [],
    captureTargets: [],
    mustCapture: false,
    status: "playing",
    flip: false,

    newLocalGame: (variant) => start("local", variant ?? get().variant),
    newAiGame: (variant, difficulty) =>
      start("ai", variant ?? get().variant, difficulty ?? get().difficulty),
    rematch: () => start(get().mode, get().variant, get().difficulty),

    swapSides: () => set((s) => ({ flip: !s.flip })),

    surrender: (who) => {
      const { state, mode } = get();
      if (state.result) return;
      // ai mode: the human (RED) resigns → AI wins. local: the given side (or
      // the side to move) resigns → the other wins.
      const resigning = mode === "ai" ? DAMATH_HUMAN : (who ?? state.turn);
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
      const { state, selected, status, mode } = get();
      if (status !== "playing" || state.result) return;
      // vs-AI: only the human (RED) may act. local: whoever is to move may act.
      if (mode === "ai" && state.turn !== DAMATH_HUMAN) return;
      const mover = state.turn;

      // If a piece is selected and the tap is a legal landing, play it.
      if (selected) {
        const options = movesFrom(state, selected);
        const chosen = options.find((m) => sameCoord(landingOf(m), sq));
        if (chosen) {
          commitMove(applyDamathMove(state, chosen));
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
