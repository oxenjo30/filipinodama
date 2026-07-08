import { useEffect, useRef } from "react";
import type { GameState, PieceColor } from "@dama/shared";
import { playSfx } from "./sfx";

/**
 * useGameSounds — plays a sound on each board-state transition by DIFFING the
 * previous state against the current one, so callers don't have to thread sound
 * calls through every move handler. Works for vs-AI, local, online, and
 * spectated matches — any surface that renders a live GameState.
 *
 * Priority per transition (only one sound per change): game end > king promotion
 * > capture > move. `myColor` (optional) picks win vs lose on end; a spectator
 * (null) always hears the neutral "win" flourish, and a draw is "draw".
 */
export function useGameSounds(state: GameState | null | undefined, myColor?: PieceColor | null) {
  const prev = useRef<GameState | null>(null);

  useEffect(() => {
    const before = prev.current;
    prev.current = state ?? null;
    if (!state) return;

    // First state we ever see (match load / resync) — establish a baseline, no sound.
    if (!before) return;
    // Same position (re-render with identical history + result) — nothing happened.
    const grew = state.history.length > before.history.length;
    const endedNow = !!state.result && !before.result;
    if (!grew && !endedNow) return;

    // ── End of match ── (highest priority)
    if (endedNow && state.result) {
      if (state.result.winner === "draw") playSfx("draw");
      else if (myColor && state.result.winner === myColor) playSfx("win");
      else if (myColor) playSfx("lose");
      else playSfx("win"); // spectator: neutral flourish
      return;
    }

    if (!grew) return;

    // ── King promotion ── new king appeared vs the previous position
    const kingsBefore = before.pieces.filter((p) => p.king).length;
    const kingsNow = state.pieces.filter((p) => p.king).length;
    if (kingsNow > kingsBefore) {
      playSfx("king");
      return;
    }

    // ── Capture ── fewer pieces than before
    if (state.pieces.length < before.pieces.length) {
      playSfx("capture");
      return;
    }

    // ── Plain move ──
    playSfx("move");
  }, [state, myColor]);
}
