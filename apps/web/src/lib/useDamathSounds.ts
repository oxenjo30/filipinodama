import { useEffect, useRef } from "react";
import type { DamathGameState, DamathPlayerId } from "@dama/shared";
import { playSfx } from "./sfx";

/**
 * useDamathSounds — the Damath counterpart of useGameSounds. Plays a sound on
 * each board-state transition by DIFFING the previous DamathGameState against the
 * current one, so callers don't thread sound calls through every move. Works for
 * local, vs-AI, online, and spectated matches — any surface rendering a live
 * DamathGameState.
 *
 * Priority per transition (one sound per change): game end > dama promotion >
 * capture > move. `myColor` (optional) picks win vs lose on end; a spectator
 * (null) hears the neutral "win" flourish, and a draw is "draw".
 */
export function useDamathSounds(state: DamathGameState | null | undefined, myColor?: DamathPlayerId | null) {
  const prev = useRef<DamathGameState | null>(null);

  useEffect(() => {
    const before = prev.current;
    prev.current = state ?? null;
    if (!state) return;

    // First state we ever see (load / resync) — baseline, no sound.
    if (!before) return;
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

    // ── Dama promotion ── a new dama appeared vs the previous position
    const damaBefore = before.pieces.filter((p) => p.dama).length;
    const damaNow = state.pieces.filter((p) => p.dama).length;
    if (damaNow > damaBefore) {
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
