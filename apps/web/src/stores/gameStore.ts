import { create } from "zustand";
import type { GameState, Move, Square, PieceColor, AiDifficulty } from "@dama/shared";
import { DEFAULT_SETTINGS, sameSquare } from "@dama/shared";
import {
  createInitialState,
  legalMoves,
  applyMove,
  bestMove,
} from "@dama/game-engine";

/**
 * The human always plays RED (bottom of the board), the AI plays BLUE (top).
 * The engine's initial state has RED to move first, so the human opens.
 */
export const HUMAN_COLOR: PieceColor = "red";
export const AI_COLOR: PieceColor = "blue";

/** Delay (ms) before the AI plays its move, so the "thinking" state is visible. */
const AI_THINK_MS = 450;

type GameStatus = "playing" | "thinking" | "over";

export type GameStore = {
  /** live engine state (source of truth) */
  state: GameState;
  /** the AI strength for this match */
  difficulty: AiDifficulty;
  /** currently selected own piece square (null when nothing selected) */
  selected: Square | null;
  /** landing squares of legal QUIET moves from the selected piece */
  moveTargets: Square[];
  /** landing squares of legal CAPTURE moves from the selected piece */
  captureTargets: Square[];
  /** true when any legal move for the side to move is a capture (mandatory) */
  mustCapture: boolean;
  /** high-level status for UI (thinking shows the AI indicator) */
  status: GameStatus;
  /** captured-piece tallies for the player panels / result modal */
  redCaptured: number;
  blueCaptured: number;

  /** start a fresh match at the given difficulty */
  newGame: (difficulty?: AiDifficulty) => void;
  /** restart the current match keeping the same difficulty */
  rematch: () => void;
  /** handle a tap on any board square */
  onSquareClick: (sq: Square) => void;
  /** human resigns → AI wins */
  surrender: () => void;
};

/** All legal moves whose `from` is `sq` (the taps a selected piece enables). */
function movesFrom(state: GameState, sq: Square): Move[] {
  return legalMoves(state).filter((m) => sameSquare(m.from, sq));
}

/** Does the side to move have any legal capture this turn? */
function anyCapture(state: GameState): boolean {
  return legalMoves(state).some((m) => m.captures.length > 0);
}

/** Landing square of a move (last square of its path). */
function landing(m: Move): Square {
  return m.path[m.path.length - 1];
}

/** Count of pieces removed for a colour, derived from the whole history. */
function capturedCounts(state: GameState): { red: number; blue: number } {
  // Each move is made by the side that was to move BEFORE it. Captures in that
  // move remove the OTHER colour's pieces. Red starts, then alternates.
  let red = 0; // blue pieces captured BY red
  let blue = 0; // red pieces captured BY blue
  let mover: PieceColor = "red";
  for (const m of state.history) {
    if (mover === "red") red += m.captures.length;
    else blue += m.captures.length;
    mover = mover === "red" ? "blue" : "red";
  }
  return { red, blue };
}

/** Derive the highlight/selection slice for a freshly-set state + selection. */
function derive(state: GameState, selected: Square | null) {
  const mustCapture = anyCapture(state);
  const moveTargets: Square[] = [];
  const captureTargets: Square[] = [];
  if (selected) {
    for (const m of movesFrom(state, selected)) {
      if (m.captures.length > 0) captureTargets.push(landing(m));
      else moveTargets.push(landing(m));
    }
  }
  const { red, blue } = capturedCounts(state);
  return { mustCapture, moveTargets, captureTargets, redCaptured: red, blueCaptured: blue };
}

export const useGameStore = create<GameStore>((set, get) => {
  /** Schedule the AI's reply if it is the AI's turn and the game is live. */
  function scheduleAiMove() {
    const { state, difficulty } = get();
    if (state.result || state.turn !== AI_COLOR) return;
    set({ status: "thinking" });
    window.setTimeout(() => {
      const cur = get().state;
      // Guard: state may have been reset (new game / surrender) mid-timeout.
      if (cur.result || cur.turn !== AI_COLOR) {
        if (!cur.result) set({ status: "playing" });
        return;
      }
      const mv = bestMove(cur, difficulty);
      const next = applyMove(cur, mv);
      set({
        state: next,
        selected: null,
        status: next.result ? "over" : "playing",
        ...derive(next, null),
      });
      // A single AI turn is one Move; no chaining needed (multi-jumps are one Move).
    }, AI_THINK_MS);
  }

  function start(difficulty: AiDifficulty) {
    const state = createInitialState(DEFAULT_SETTINGS);
    set({
      state,
      difficulty,
      selected: null,
      status: "playing",
      ...derive(state, null),
    });
    // Human (red) always moves first, so no AI kickoff here.
  }

  return {
    state: createInitialState(DEFAULT_SETTINGS),
    difficulty: "normal",
    selected: null,
    moveTargets: [],
    captureTargets: [],
    mustCapture: false,
    status: "playing",
    redCaptured: 0,
    blueCaptured: 0,

    newGame: (difficulty) => start(difficulty ?? get().difficulty),
    rematch: () => start(get().difficulty),

    surrender: () => {
      const { state } = get();
      if (state.result) return;
      // Fabricate a resignation result without an illegal engine move.
      const resigned: GameState = {
        ...state,
        result: { winner: AI_COLOR, reason: "resign" },
      };
      set({
        state: resigned,
        selected: null,
        status: "over",
        moveTargets: [],
        captureTargets: [],
      });
    },

    onSquareClick: (sq) => {
      const { state, selected, status } = get();
      // Ignore taps while the AI is thinking, when the game is over, or when it
      // is not the human's turn.
      if (status !== "playing" || state.result || state.turn !== HUMAN_COLOR) return;

      // If a piece is already selected and the tap is a legal landing, play it.
      if (selected) {
        const options = movesFrom(state, selected);
        const chosen = options.find((m) => sameSquare(landing(m), sq));
        if (chosen) {
          const next = applyMove(state, chosen);
          set({
            state: next,
            selected: null,
            status: next.result ? "over" : "playing",
            ...derive(next, null),
          });
          if (!next.result) scheduleAiMove();
          return;
        }
      }

      // Otherwise treat the tap as a (re)selection: only own pieces that HAVE a
      // legal move can be selected. Tapping elsewhere clears the selection.
      const piece = state.pieces.find((p) => sameSquare(p.square, sq));
      if (piece && piece.color === HUMAN_COLOR && movesFrom(state, sq).length > 0) {
        set({ selected: sq, ...derive(state, sq) });
      } else {
        set({ selected: null, ...derive(state, null) });
      }
    },
  };
});
