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
 * In a vs-AI match the human plays RED (bottom), the AI plays BLUE (top). The
 * engine's initial state has RED to move first, so the human opens. In a LOCAL
 * (pass-and-play) match there is no AI: both colours are human-controlled on the
 * one device, RED still opens, and "Player 1" is RED, "Player 2" is BLUE.
 */
export const HUMAN_COLOR: PieceColor = "red";
export const AI_COLOR: PieceColor = "blue";

/** Match mode: "ai" = vs the computer, "local" = pass-and-play (two humans). */
export type GameMode = "ai" | "local";

/** Delay (ms) before the AI plays its move, so the "thinking" state is visible. */
// AI reply delay. Long enough for the human's move to visibly SLIDE and any
// captured piece to fade out (~320ms board animation) plus a short beat so the
// capture is clearly seen before the AI responds.
const AI_THINK_MS = 700;

type GameStatus = "playing" | "thinking" | "over";

export type GameStore = {
  /** live engine state (source of truth) */
  state: GameState;
  /** whether this is a vs-AI match or a local pass-and-play match */
  mode: GameMode;
  /** the AI strength for this match (unused in local mode) */
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
  /**
   * Board orientation. false = RED seat at the bottom (default). Swap Sides
   * toggles this so the local players / the human can flip perspective. Purely
   * a view concern — it never changes whose turn it is or the engine state.
   */
  flip: boolean;

  /** start a fresh vs-AI match at the given difficulty */
  newGame: (difficulty?: AiDifficulty) => void;
  /** start a fresh local (pass-and-play) match */
  newLocalGame: () => void;
  /** restart the current match keeping the same mode/difficulty */
  rematch: () => void;
  /** handle a tap on any board square */
  onSquareClick: (sq: Square) => void;
  /**
   * Revert the last human move (offline AI/local only). In AI mode this rolls
   * back two plies (the AI's reply + the human's move) so control returns to the
   * human; in local mode it rolls back a single ply. No-op once the game is over
   * or when there is nothing to undo — the caller keeps the button disabled.
   */
  undo: () => void;
  /**
   * Whether an undo is currently possible (used to enable/disable the button
   * honestly rather than showing a fake toast). True only offline, mid-game,
   * with enough plies to roll back to a human turn.
   */
  canUndo: () => boolean;
  /**
   * Flip the board orientation. In LOCAL mode this simply swaps which seat sits
   * at the bottom so pass-and-play players can face the board from their side.
   * View-only: the engine state and turn are untouched.
   */
  swapSides: () => void;
  /**
   * Resign the match. In vs-AI mode the human (RED) resigns → AI wins. In local
   * mode, pass the colour of the side that is resigning (defaults to the side to
   * move) so the OTHER player wins.
   */
  surrender: (who?: PieceColor) => void;
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
    const { state, mode, difficulty } = get();
    if (mode !== "ai" || state.result || state.turn !== AI_COLOR) return;
    set({ status: "thinking" });
    window.setTimeout(() => {
      const { state: cur, mode: curMode } = get();
      // Guard: the match may have been reset or switched to LOCAL mid-timeout.
      // The mode check is essential — in local mode blue is a HUMAN even though
      // blue === AI_COLOR, so without it a stale timeout would move for the human.
      if (curMode !== "ai" || cur.result || cur.turn !== AI_COLOR) {
        if (!cur.result && curMode === "ai") set({ status: "playing" });
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

  function start(mode: GameMode, difficulty: AiDifficulty) {
    const state = createInitialState(DEFAULT_SETTINGS);
    set({
      state,
      mode,
      difficulty,
      selected: null,
      status: "playing",
      flip: false,
      ...derive(state, null),
    });
    // RED always moves first — the human (ai mode) or Player 1 (local). No kickoff.
  }

  /**
   * Rebuild a live GameState by replaying the first `keep` plies of `history`
   * over a fresh initial position. Used by undo: it is the honest inverse of the
   * engine's forward-only applyMove (there is no engine unmake). Settings are
   * preserved so a timed/untimed match stays consistent after the rollback.
   */
  function rebuild(history: Move[], keep: number, settings = DEFAULT_SETTINGS): GameState {
    let s = createInitialState(settings);
    for (let i = 0; i < keep; i++) s = applyMove(s, history[i]);
    return s;
  }

  return {
    state: createInitialState(DEFAULT_SETTINGS),
    mode: "ai",
    difficulty: "normal",
    selected: null,
    moveTargets: [],
    captureTargets: [],
    mustCapture: false,
    status: "playing",
    redCaptured: 0,
    blueCaptured: 0,
    flip: false,

    newGame: (difficulty) => start("ai", difficulty ?? get().difficulty),
    newLocalGame: () => start("local", get().difficulty),
    rematch: () => start(get().mode, get().difficulty),

    surrender: (who) => {
      const { state, mode } = get();
      if (state.result) return;
      // The resigning side loses. In ai mode the human (RED) resigns → AI wins.
      // In local mode the given side (or the side to move) resigns → other wins.
      const resigning = mode === "local" ? (who ?? state.turn) : HUMAN_COLOR;
      const winner: PieceColor = resigning === "red" ? "blue" : "red";
      const resigned: GameState = {
        ...state,
        result: { winner, reason: "resign" },
      };
      set({
        state: resigned,
        selected: null,
        status: "over",
        moveTargets: [],
        captureTargets: [],
      });
    },

    canUndo: () => {
      const { state, mode, status } = get();
      // Online is server-authoritative and never routed here; undo is offline-only.
      // Never mid-AI-think (status "thinking") and never after the game is over.
      if (status !== "playing" || state.result) return false;
      // Local: one human ply is enough. AI: need a completed human+AI exchange
      // (two plies) so control can return to the human on RED's turn.
      return mode === "local" ? state.history.length >= 1 : state.history.length >= 2;
    },

    undo: () => {
      const { state, mode, status } = get();
      if (status !== "playing" || state.result) return;
      const n = state.history.length;
      // AI mode: drop the AI reply + the human move (2 plies) to hand RED the
      // turn again. Local mode: drop a single ply so the other seat replays.
      const drop = mode === "local" ? 1 : 2;
      if (n < drop) return;
      const rolled = rebuild(state.history, n - drop, state.settings);
      set({
        state: rolled,
        selected: null,
        status: "playing",
        ...derive(rolled, null),
      });
    },

    swapSides: () => {
      // View-only board flip (local perspective / human perspective). Does not
      // touch the engine state or whose turn it is. Online is server-authoritative
      // and disabled at the UI, so this only ever runs offline.
      set((s) => ({ flip: !s.flip }));
    },

    onSquareClick: (sq) => {
      const { state, selected, status, mode } = get();
      if (status !== "playing" || state.result) return;
      // vs-AI: only the human (RED) may act. Local: whoever is to move may act.
      if (mode === "ai" && state.turn !== HUMAN_COLOR) return;

      const mover = state.turn; // the side whose turn it is (RED or BLUE)

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
          // vs-AI: hand the turn to the AI. Local: the other human just plays next.
          if (!next.result && mode === "ai") scheduleAiMove();
          return;
        }
      }

      // Otherwise treat the tap as a (re)selection: only the mover's own pieces
      // that HAVE a legal move can be selected. Tapping elsewhere clears it.
      const piece = state.pieces.find((p) => sameSquare(p.square, sq));
      if (piece && piece.color === mover && movesFrom(state, sq).length > 0) {
        set({ selected: sq, ...derive(state, sq) });
      } else {
        set({ selected: null, ...derive(state, null) });
      }
    },
  };
});
