import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createInitialState, applyMove } from "@dama/game-engine";
import { DEFAULT_SETTINGS } from "@dama/shared";
import type { GameState, GameSettings, Move, PieceColor } from "@dama/shared";
import { Board } from "../../components";
import { useAppStore } from "../../stores/appStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { api, ApiError } from "../../lib/api";

/**
 * ReplayModal — the prototype Match-Replay overlay (lines 2377-2438), ported to
 * React and wired to LIVE data. Given a real persisted matchId it:
 *   1. GET /api/matches/:id  → { settings, moves[] } (server-stored Move[]).
 *   2. Reconstructs every position with the real engine — createInitialState(settings)
 *      then applyMove() through moves[], one ply at a time (a "board per ply").
 *   3. Renders the reconstructed GameState with the shared <Board> and reproduces
 *      the prototype control bar: step back/forward, play/pause with a speed
 *      toggle (1×/2×), jump-to-move, and flip board.
 *
 * openReplay (prototype line 3080) maps to opening this modal with a match id;
 * the step/play/speed/flip logic mirrors lines 3081-3090.
 */

// ── live match-detail DTO (server serializeMatch + moves) ──
type MatchPlayerDTO = {
  id: string;
  displayName: string;
  tag: string;
} | null;

type MatchDetail = {
  id: string;
  mode: "AI" | "CASUAL" | "RANKED" | "PRIVATE" | "LOCAL";
  settings: GameSettings;
  winner: "red" | "blue" | "draw" | null;
  reason: string | null;
  red: MatchPlayerDTO;
  blue: MatchPlayerDTO;
  redTrophyDelta: number | null;
  blueTrophyDelta: number | null;
  startedAt: string;
  endedAt: string | null;
  moves: Move[];
};

const MODE_LABEL: Record<string, string> = {
  AI: "vs AI",
  CASUAL: "Casual",
  RANKED: "Ranked",
  PRIVATE: "Private",
  LOCAL: "Local",
};

const notation = (r: number, c: number) => "abcdefgh"[c] + (8 - r);

/** Algebraic label for a Move, e.g. "c3×e5" (capture) or "c3-d4" (quiet). */
function moveLabel(mv: Move): string {
  const to = mv.path[mv.path.length - 1];
  const sep = mv.captures.length > 0 ? "×" : "-";
  return notation(mv.from.r, mv.from.c) + sep + notation(to.r, to.c);
}

// control-bar button chrome (matches the prototype's inline ghost buttons)
const ctrlBtn: React.CSSProperties = {
  height: 42,
  borderRadius: 9,
  border: "1px solid rgba(232,184,75,.3)",
  background: "rgba(15,8,32,.6)",
  color: "var(--gold-lt)",
  cursor: "pointer",
};

export type ReplayModalProps = {
  /** the persisted match to replay; null = closed */
  matchId: string | null;
  /** my user id — to decide which side "I" am and label win/loss */
  meId: string;
  onClose: () => void;
};

export function ReplayModal({ matchId, meId, onClose }: ReplayModalProps) {
  const showToast = useAppStore((s) => s.showToast);
  const boardTheme = useSettingsStore((s) => s.boardTheme);
  const skin = useSettingsStore((s) => s.skin);

  const [match, setMatch] = useState<MatchDetail | null>(null);
  const [states, setStates] = useState<GameState[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const [ply, setPly] = useState(0);
  const [flip, setFlip] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<1 | 2>(1);

  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = useCallback(() => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  }, []);

  // ── fetch + reconstruct on open (openReplay, line 3080) ──
  useEffect(() => {
    if (!matchId) return;
    let cancelled = false;
    stopTimer();
    setMatch(null);
    setStates(null);
    setLoadErr(null);
    setPly(0);
    setFlip(false);
    setPlaying(false);
    setSpeed(1);

    api
      .get<{ match: MatchDetail }>(`/api/matches/${matchId}`)
      .then(({ match: m }) => {
        if (cancelled) return;
        // Reconstruct board-per-ply with the real engine: initial position, then
        // one snapshot after each applied move (states[i] = position after i moves).
        const settings: GameSettings = m.settings ?? DEFAULT_SETTINGS;
        const snapshots: GameState[] = [createInitialState(settings)];
        try {
          for (const mv of m.moves ?? []) {
            snapshots.push(applyMove(snapshots[snapshots.length - 1], mv));
          }
        } catch {
          // A malformed/illegal stored move ends reconstruction; replay what is valid.
        }
        setMatch(m);
        setStates(snapshots);
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadErr(e instanceof ApiError ? e.message : "Could not load this replay.");
      });

    return () => {
      cancelled = true;
    };
  }, [matchId, stopTimer]);

  const maxPly = states ? states.length - 1 : 0;

  // ── auto-advance (replayTogglePlay / _startPlaying, lines 3087-3088) ──
  useEffect(() => {
    if (!playing || !states) return;
    stopTimer();
    timer.current = setInterval(() => {
      setPly((p) => {
        const next = p + 1;
        if (next >= maxPly) {
          setPlaying(false);
          return maxPly;
        }
        return next;
      });
    }, 900 / speed);
    return stopTimer;
  }, [playing, speed, states, maxPly, stopTimer]);

  // stop the clock when the modal unmounts / closes
  useEffect(() => stopTimer, [stopTimer]);

  const step = useCallback(
    (d: number) => {
      setPlaying(false);
      setPly((p) => Math.max(0, Math.min(maxPly, p + d)));
    },
    [maxPly],
  );

  const togglePlay = useCallback(() => {
    if (playing) {
      setPlaying(false);
      return;
    }
    // from the end, replay from the start (prototype: reset ply to 0 first)
    setPly((p) => (p >= maxPly ? 0 : p));
    setPlaying(true);
  }, [playing, maxPly]);

  // ── result / header labels from LIVE match ──
  const header = useMemo(() => {
    if (!match) return null;
    const iAmRed = match.red?.id === meId;
    const opp = iAmRed ? match.blue : match.red;
    const oppName = opp?.displayName ?? (match.mode === "AI" || match.mode === "LOCAL" ? "Computer" : "Opponent");
    const result: "win" | "loss" | "draw" =
      match.winner === "draw" || match.winner === null
        ? "draw"
        : (match.winner === "red") === iAmRed
          ? "win"
          : "loss";
    const resultLabel = result === "win" ? "Victory" : result === "loss" ? "Defeat" : "Draw";
    const resultColor =
      result === "win" ? "var(--green)" : result === "loss" ? "var(--red)" : "var(--gold-lt)";
    // red captures = blue pieces removed and vice-versa; count from the moves[].
    let redCap = 0;
    let blueCap = 0;
    let mover: PieceColor = "red";
    for (const mv of match.moves ?? []) {
      if (mover === "red") redCap += mv.captures.length;
      else blueCap += mv.captures.length;
      // a continuing multi-capture keeps the same mover; the engine encodes the
      // whole jump chain in one Move, so each recorded move flips the side.
      mover = mover === "red" ? "blue" : "red";
    }
    return { oppName, resultLabel, resultColor, redCap, blueCap };
  }, [match, meId]);

  // ── per-ply move buttons (replayMoveList, prototype line 4087) ──
  // Prototype prepends a "Start" chip that jumps to ply 0, then labels each move
  // "n. text" (1-based). ply is the jump target; color distinguishes the mover.
  const moveButtons = useMemo(() => {
    if (!match) return [];
    const rows: { ply: number; label: string; color: string }[] = [
      { ply: 0, label: "Start", color: "var(--ink2)" },
    ];
    let mover: PieceColor = "red";
    (match.moves ?? []).forEach((mv, i) => {
      const n = i + 1;
      const color = mover === "red" ? "#ff9aa2" : "#9ac4ff";
      mover = mover === "red" ? "blue" : "red";
      rows.push({ ply: n, label: `${n}. ${moveLabel(mv)}`, color });
    });
    return rows;
  }, [match]);

  const share = useCallback(() => {
    if (!match || !header) return;
    const d = new Date(match.startedAt);
    const txt =
      "Filipino Dama Royal — Match Replay\n" +
      `${header.resultLabel} vs ${header.oppName}\n` +
      `${MODE_LABEL[match.mode] ?? match.mode} · ${(match.moves ?? []).length} moves\n` +
      `Score ${header.redCap}–${header.blueCap} · ${d.toLocaleDateString()}`;
    try {
      if (navigator.clipboard) navigator.clipboard.writeText(txt);
    } catch {
      /* clipboard blocked — the toast still confirms intent */
    }
    showToast("Replay summary copied to clipboard");
  }, [match, header, showToast]);

  if (!matchId) return null;

  const board = states ? states[Math.max(0, Math.min(maxPly, ply))] : null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 85,
        background: "rgba(10,5,20,.78)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        animation: "fdrise .2s ease both",
      }}
    >
      <div
        className="frame"
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(96vw,880px)", maxHeight: "93vh", overflow: "auto", padding: 24, position: "relative" }}
      >
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            width: 32,
            height: 32,
            borderRadius: 8,
            border: "1px solid rgba(232,184,75,.3)",
            background: "rgba(15,8,32,.6)",
            color: "var(--ink)",
            cursor: "pointer",
            font: "700 15px Inter",
            zIndex: 2,
          }}
        >
          ✕
        </button>

        <div style={{ font: "700 12px Inter", letterSpacing: "2px", textTransform: "uppercase", color: "var(--gold)" }}>
          Match Replay
        </div>

        {loadErr ? (
          <div style={{ textAlign: "center", padding: "48px 12px", color: "var(--ink2)", font: "500 14px/1.6 Inter" }}>
            {loadErr}
          </div>
        ) : !match || !states || !header || !board ? (
          <div style={{ textAlign: "center", padding: "48px 12px", color: "var(--ink2)", font: "500 14px Inter" }}>
            Loading replay…
          </div>
        ) : (
          <>
            <h2 style={{ margin: "5px 0 2px", font: "800 24px Cinzel,serif", color: header.resultColor }}>
              {header.resultLabel} · vs {header.oppName}
            </h2>
            <div style={{ font: "500 12px Inter", color: "var(--ink2)", marginBottom: 18 }}>
              {MODE_LABEL[match.mode] ?? match.mode} · Score {header.redCap}–{header.blueCap}
            </div>

            <div style={{ display: "flex", gap: 22, flexWrap: "wrap", alignItems: "flex-start" }}>
              {/* ── board + transport ── */}
              <div style={{ flex: "1 1 320px", minWidth: 280, maxWidth: 400 }}>
                <Board state={board} boardTheme={boardTheme} skin={skin} flip={flip} />
                <div
                  style={{
                    textAlign: "center",
                    font: "700 13px 'JetBrains Mono',monospace",
                    color: "var(--gold-lt)",
                    marginTop: 12,
                  }}
                >
                  Move {ply} / {maxPly}
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    marginTop: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <button onClick={() => setPly(0)} title="Jump to start" style={{ ...ctrlBtn, width: 42, fontSize: 15 }}>
                    ⏮
                  </button>
                  <button onClick={() => step(-1)} title="Previous move" style={{ ...ctrlBtn, width: 42, fontSize: 15 }}>
                    ◀
                  </button>
                  <button
                    onClick={togglePlay}
                    className="btn btn-gold"
                    style={{ width: 52, height: 42, padding: 0, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}
                  >
                    {playing ? "⏸" : "▶"}
                  </button>
                  <button onClick={() => step(1)} title="Next move" style={{ ...ctrlBtn, width: 42, fontSize: 15 }}>
                    ▶
                  </button>
                  <button onClick={() => setPly(maxPly)} title="Jump to end" style={{ ...ctrlBtn, width: 42, fontSize: 15 }}>
                    ⏭
                  </button>
                  <button
                    onClick={() => setSpeed((s) => (s === 1 ? 2 : 1))}
                    title="Playback speed"
                    style={{ ...ctrlBtn, padding: "0 14px", font: "700 13px 'JetBrains Mono',monospace" }}
                  >
                    {speed}×
                  </button>
                  <button
                    onClick={() => setFlip((f) => !f)}
                    title="Flip board"
                    style={{ ...ctrlBtn, padding: "0 14px", font: "700 13px Inter" }}
                  >
                    ⇅ Flip
                  </button>
                </div>
              </div>

              {/* ── move list + share ── */}
              <div style={{ flex: "1 1 260px", minWidth: 220, display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <div
                    style={{
                      font: "700 11px Inter",
                      letterSpacing: "1.5px",
                      textTransform: "uppercase",
                      color: "var(--gold-lt)",
                      marginBottom: 8,
                    }}
                  >
                    Moves — tap to jump
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 230, overflow: "auto", padding: 2 }}>
                    {(match.moves ?? []).length === 0 ? (
                      <div style={{ color: "var(--ink2)", font: "500 12px Inter" }}>No moves recorded.</div>
                    ) : (
                      moveButtons.map((mv) => {
                        const active = ply === mv.ply;
                        return (
                          <button
                            key={mv.ply}
                            onClick={() => {
                              setPlaying(false);
                              setPly(mv.ply);
                            }}
                            style={{
                              padding: "5px 9px",
                              borderRadius: 7,
                              cursor: "pointer",
                              font: "600 11px 'JetBrains Mono',monospace",
                              border: active ? "1px solid rgba(245,215,131,.85)" : "1px solid rgba(232,184,75,.2)",
                              background: active ? "rgba(232,184,75,.18)" : "rgba(15,8,32,.5)",
                              color: mv.color,
                            }}
                          >
                            {mv.label}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
                <button className="btn btn-purple" onClick={share} style={{ width: "100%" }}>
                  ⤴ Share / Export Replay
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default ReplayModal;
