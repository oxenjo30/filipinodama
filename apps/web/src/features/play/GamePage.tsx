import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { AiDifficulty, Move, Square } from "@dama/shared";
import { Board, Button } from "../../components";
import { useGameStore, HUMAN_COLOR, AI_COLOR } from "../../stores/gameStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useAppStore } from "../../stores/appStore";
import { useAuthStore } from "../../stores/authStore";
import { useGameSounds } from "../../lib/useGameSounds";
import { PlayerPanel } from "./PlayerPanel";
import { Modal } from "../shared/Modal";
import { LoadingScreen } from "../shared/LoadingScreen";

/** How long the pre-match loader shows before the board appears (handoff: 3.4s). */
const LOADER_MS = 3400;

const DIFF_LABEL: Record<AiDifficulty, string> = {
  easy: "Easy",
  normal: "Normal",
  hard: "Hard",
};

/** AI opponent's display name per difficulty (short, single-line flavour). */
const AI_NAME: Record<AiDifficulty, string> = {
  easy: "Apprentice",
  normal: "Tactician",
  hard: "Master",
};

/** Board square → algebraic coordinate (col letter + row number, 8×8). */
function coord(sq: Square): string {
  return `${String.fromCharCode(97 + sq.c)}${8 - sq.r}`;
}

/** Compact notation for a move: `a3-b4` (quiet) or `a3xc5` (capture, multi-jump joined by x). */
function notation(m: Move): string {
  const sep = m.captures.length > 0 ? "x" : "-";
  const path = m.path.map(coord).join(sep);
  return `${coord(m.from)}${sep}${path}`;
}

/** A history row: move number + the blue/red plies that make it up (red opens). */
type HistoryRow = { n: number; red: string; blue: string };

/** Pair the flat move history into numbered rows. Red moves first, then blue. */
function toRows(history: Move[]): HistoryRow[] {
  const rows: HistoryRow[] = [];
  for (let i = 0; i < history.length; i += 2) {
    rows.push({
      n: i / 2 + 1,
      red: notation(history[i]),
      blue: history[i + 1] ? notation(history[i + 1]) : "",
    });
  }
  return rows;
}

export function GamePage({ mode = "ai" }: { mode?: "ai" | "local" }) {
  const isLocal = mode === "local";
  const navigate = useNavigate();
  const difficulty = useSettingsStore((s) => s.difficulty);
  const boardTheme = useSettingsStore((s) => s.boardTheme);
  const skin = useSettingsStore((s) => s.skin);
  const showToast = useAppStore((s) => s.showToast);

  // Human panel reflects the REAL signed-in account (or guest session) — never a
  // fake identity. Falls back to a neutral "Guest" with a zeroed rating when
  // nobody is logged in, matching the nav's convention (see AppLayout).
  const me = useAuthStore((s) => s.me);
  const displayName = me?.displayName ?? "Guest";
  const trophies = me?.trophies ?? 0;
  const avatar = me?.avatarUrl ?? "champion";

  const {
    state,
    selected,
    moveTargets,
    captureTargets,
    mustCapture,
    status,
    redCaptured,
    blueCaptured,
    flip,
    onSquareClick,
    newGame,
    newLocalGame,
    rematch,
    surrender,
    undo,
    canUndo,
    swapSides,
  } = useGameStore();

  // Pre-match loader (handoff `playWithLoader`): show the themed loading screen,
  // then start a fresh match. Offline vs-AI / local both use the "default" ctx.
  const [loading, setLoading] = useState(true);

  // Start (or RE-start) the match whenever the mode changes. This effect MUST
  // depend on `mode`: react-router renders both /play/ai/game and /play/local
  // with the same GamePage component, so navigating between them REUSES the
  // instance — a run-once []-effect would leave the store in its previous mode
  // (e.g. still "ai"), and the AI would keep playing during a Local Match. Keying
  // on `mode` re-seeds the correct game (local = two humans, no AI) on every
  // switch. `difficulty` is read fresh inside so it isn't a dependency.
  useEffect(() => {
    setLoading(true);
    const t = window.setTimeout(() => {
      if (isLocal) newLocalGame();
      else newGame(difficulty);
      setLoading(false);
    }, LOADER_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Board SFX: play move/capture/king/win/lose/draw on each state transition. In
  // vs-AI the human is HUMAN_COLOR (real win/lose); local is pass-and-play so we
  // pass null → both sides just get the neutral victory flourish.
  useGameSounds(state, isLocal ? null : HUMAN_COLOR);

  const result = state.result;
  // "Thinking" only exists in vs-AI mode — a local (pass-and-play) match has no AI,
  // so it must never show the AI-thinking banner or the avatar spinner.
  const aiThinking = !isLocal && status === "thinking";
  // In local mode BOTH sides accept taps; the "active" side is just whoever is to
  // move. In vs-AI mode only the human (RED) is interactive.
  const redToMove = !result && state.turn === "red" && status === "playing";
  const blueToMove = !result && state.turn === "blue" && status === "playing";
  const humanTurn = isLocal ? redToMove || blueToMove : redToMove;

  const rows = toRows(state.history);

  // Player names for the two seats. Local: Player 1 (red) vs Player 2 (blue).
  // vs-AI: the human (red) vs the difficulty-named bot (blue).
  const P1_NAME = "Player 1";
  const P2_NAME = "Player 2";
  const redName = isLocal ? P1_NAME : displayName;
  const blueName = isLocal ? P2_NAME : AI_NAME[difficulty];

  // ── Result modal wording ──
  let resultTitle = "";
  let resultReason = "";
  if (result) {
    if (result.winner === "draw") {
      resultTitle = "Draw";
      resultReason =
        result.reason === "repetition"
          ? "The same position repeated three times."
          : "Neither side could force a win.";
    } else if (isLocal) {
      // Local: name the winning seat, no "you/AI".
      const winnerName = result.winner === "red" ? P1_NAME : P2_NAME;
      resultTitle = `${winnerName} Wins`;
      switch (result.reason) {
        case "capture-all":
          resultReason = `${winnerName} captured every enemy piece.`;
          break;
        case "no-moves":
          resultReason = `${result.winner === "red" ? P2_NAME : P1_NAME} has no legal moves left.`;
          break;
        case "resign":
          resultReason = `${result.winner === "red" ? P2_NAME : P1_NAME} surrendered the match.`;
          break;
        default:
          resultReason = `${winnerName} won the match.`;
      }
    } else {
      const humanWon = result.winner === HUMAN_COLOR;
      resultTitle = humanWon ? "Victory" : "Defeat";
      switch (result.reason) {
        case "capture-all":
          resultReason = humanWon
            ? "You captured every enemy piece."
            : "The AI captured all of your pieces.";
          break;
        case "no-moves":
          resultReason = humanWon
            ? "The AI has no legal moves left."
            : "You have no legal moves left.";
          break;
        case "resign":
          resultReason = "You surrendered the match.";
          break;
        default:
          resultReason = humanWon ? "You won the match." : "The AI won the match.";
      }
    }
  }

  // Result icon gradient. Local: always the neutral/gold "win" gradient (both are
  // human winners). vs-AI: gold for human win, red for defeat.
  const winGrad =
    result?.winner === "draw"
      ? "linear-gradient(180deg,#6b6480,#3b3550)"
      : isLocal || result?.winner === HUMAN_COLOR
        ? "linear-gradient(180deg,#f0cf72,#c99a2e)"
        : "linear-gradient(180deg,#a83744,#6e1b24)";

  // Themed pre-match loader (offline vs-AI → "default" context). The background
  // art mirrors the equipped piece skin so the loader previews your cosmetics.
  if (loading) return <LoadingScreen context="default" skin={skin} />;

  return (
    <div
      className="fd-game-grid fd-page-pad"
      style={{
        maxWidth: 1560,
        margin: "0 auto",
        padding: "22px 26px",
        display: "grid",
        gridTemplateColumns: "300px minmax(0,1fr) 300px",
        gap: 18,
        alignItems: "start",
      }}
    >
      {/* LEFT: mode chip + more-actions nav + players-online.
          The two PlayerPanels moved into the CENTER column so they bracket the
          board (opponent above, human below) — this keeps the board leading on
          mobile while the nav cluster sinks below via the fd-game-left order. */}
      <div className="fd-game-left" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div
          className="frame"
          style={{ padding: 16, display: "flex", alignItems: "center", gap: 12, borderColor: isLocal ? "rgba(140,90,210,.55)" : "rgba(50,150,100,.55)" }}
        >
          <span style={{ fontSize: 22 }}>{isLocal ? "👥" : "🤖"}</span>
          <div style={{ flex: 1 }}>
            <div style={{ font: "700 15px Cinzel,serif", color: isLocal ? "#c9a6ff" : "#8ce0ad" }}>
              {isLocal ? "Local Match" : "Play vs AI"}
            </div>
            <div style={{ font: "500 11px Inter", color: "var(--ink2)" }}>
              {isLocal ? "Pass & play · one device" : "Offline practice match"}
            </div>
          </div>
          {!isLocal && (
            <span
              style={{
                font: "700 10px Inter",
                letterSpacing: ".5px",
                textTransform: "uppercase",
                padding: "4px 9px",
                borderRadius: 100,
                border: "1px solid rgba(50,150,100,.55)",
                color: "#8ce0ad",
              }}
            >
              {DIFF_LABEL[difficulty]}
            </span>
          )}
        </div>

        {/* The mode-switching buttons that used to live here (Play Online / VS AI
            / Local Match) were removed: mid-game they only abandon the current
            match, and on mobile they crowded the screen above the board. The
            "Explore Game Modes" grid below the board already covers "play something
            else" intentionally, once you've finished. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            justifyContent: "center",
            font: "600 12px Inter",
            color: "var(--ink)",
          }}
        >
          <span style={{ color: "#3fbf6f" }}>📶</span> 2,458 players online
        </div>
      </div>

      {/* CENTER: opponent panel + board + controls + human panel */}
      <div className="fd-game-center" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        {/* Opponent panel (blue): AI in vs-AI, Player 2 in local. Sits directly
            above the turn banner so the opponent is always visible over the board. */}
        <div style={{ width: "min(92vw,600px)", maxWidth: "100%" }}>
          <PlayerPanel
            name={blueName}
            rating={isLocal ? "—" : difficulty === "hard" ? 1600 : difficulty === "normal" ? 1200 : 800}
            color={AI_COLOR}
            avatar={isLocal ? "sovereign" : "strategist"}
            active={blueToMove}
            captured={blueCaptured}
            thinking={aiThinking}
          />
        </div>
        {/* Transient status banner slot. The must-capture / AI-thinking / turn
            banners appear on your turn and vanish on the AI's — which was jerking
            the board up and down. We reserve a FIXED height here (tall enough for
            a two-line banner) so whichever banner shows sits INSIDE the reserved
            space and the board never moves. */}
        <div style={{ minHeight: 52, display: "flex", alignItems: "center", justifyContent: "center", width: "100%" }}>
          {/* must-capture takes priority over the plain turn banner, so at most one
              banner ever shows in this fixed-height slot. */}
          {isLocal && !result && !(mustCapture && humanTurn) && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 20px",
                borderRadius: 100,
                border: `1px solid ${redToMove ? "rgba(200,70,80,.6)" : "rgba(70,110,200,.6)"}`,
                background: redToMove ? "rgba(160,48,58,.22)" : "rgba(46,107,198,.2)",
                color: "#fff",
                font: "800 14px Cinzel,serif",
              }}
            >
              <span
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  background: redToMove
                    ? "radial-gradient(circle at 35% 30%,#e0555f,#8f1b28)"
                    : "radial-gradient(circle at 35% 30%,#5f97e6,#1f4a92)",
                  boxShadow: "0 0 8px rgba(232,184,75,.4)",
                }}
              />
              {(redToMove ? P1_NAME : P2_NAME)}'s turn
            </div>
          )}
          {mustCapture && humanTurn && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                padding: "10px 18px",
                borderRadius: 100,
                border: "1px solid rgba(232,184,75,.5)",
                background: "rgba(160,48,58,.25)",
                color: "var(--gold-lt)",
                font: "700 13px Inter",
                animation: "fdglow 2s ease infinite",
              }}
            >
              ⚠ {isLocal ? `${redToMove ? P1_NAME : P2_NAME} must capture this turn.` : "You must capture this turn."}
            </div>
          )}
          {aiThinking && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                padding: "10px 18px",
                borderRadius: 100,
                border: "1px solid rgba(232,184,75,.4)",
                background: "rgba(15,8,32,.6)",
                color: "var(--gold-lt)",
                font: "700 13px Inter",
              }}
            >
              <span
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  border: "2px solid rgba(232,184,75,.3)",
                  borderTopColor: "var(--gold)",
                  display: "inline-block",
                  animation: "fdspin .8s linear infinite",
                }}
              />
              The AI is thinking…
            </div>
          )}
        </div>

        {/* Untimed pill. Offline AI/local matches have no clock, but rather than
            omit it entirely we show a static "Untimed" chip for parity with the
            timed online layout. This never fabricates a running timer. */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 14px",
            borderRadius: 999,
            border: "1px solid rgba(232,184,75,.3)",
            background: "rgba(15,8,32,.6)",
            font: "700 12px 'JetBrains Mono',monospace",
            color: "var(--ink2)",
          }}
        >
          <span aria-hidden>⏱</span>
          <span style={{ letterSpacing: 1 }}>—:—</span>
          <span style={{ font: "600 11px Inter", letterSpacing: ".5px", textTransform: "uppercase" }}>
            Untimed
          </span>
        </div>

        <div style={{ width: "min(92vw,600px)", maxWidth: "100%" }}>
          <Board
            state={state}
            legalTargets={moveTargets}
            captureTargets={captureTargets}
            selected={selected}
            mustCapture={mustCapture && humanTurn}
            onSquareClick={onSquareClick}
            boardTheme={boardTheme}
            skin={skin}
            flip={flip}
          />
        </div>

        <div
          className="fd-btn-grid-2"
          style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", width: "min(92vw,600px)", maxWidth: "100%" }}
        >
          <Button
            variant="purple"
            size="sm"
            onClick={() => undo()}
            disabled={!canUndo()}
          >
            ↶ Undo
          </Button>
          <Button
            variant="purple"
            size="sm"
            onClick={() => {
              swapSides();
              // Report the perspective AFTER the toggle. `flip` here is the
              // pre-toggle value, so the new orientation is its inverse.
              const nowFlipped = !flip;
              showToast(
                isLocal
                  ? nowFlipped
                    ? `${P2_NAME} now sits at the bottom — board flipped.`
                    : `${P1_NAME} now sits at the bottom — board flipped.`
                  : nowFlipped
                    ? "Board flipped — you now view from Blue's side."
                    : "Board flipped — you now view from Red's side.",
              );
            }}
          >
            ⇅ Swap Sides
          </Button>
          <Button variant="purple" size="sm" onClick={() => rematch()}>
            ↻ Restart
          </Button>
          <Button variant="red" size="sm" onClick={() => surrender()} disabled={!!result}>
            🏳 {isLocal ? "Resign" : "Surrender"}
          </Button>
        </div>

        {/* Human panel (red): human in vs-AI, Player 1 in local. Sits directly
            below the board + controls so YOUR seat is right under the action. */}
        <div style={{ width: "min(92vw,600px)", maxWidth: "100%" }}>
          <PlayerPanel
            name={redName}
            rating={isLocal ? "—" : trophies}
            color={HUMAN_COLOR}
            avatar={isLocal ? "champion" : avatar}
            frame={isLocal ? undefined : me?.frameId ?? undefined}
            active={redToMove}
            captured={redCaptured}
          />
        </div>

        {/* The "Explore Game Modes" grid used to sit here, below the board — but
            mid-game it's out of place (switching modes abandons the current game)
            and it dangled awkwardly on desktop. Removed; use the nav to change
            modes. Leave / Surrender already offer a clean exit. */}
      </div>

      {/* RIGHT: history + chat + tip */}
      <div
        className="fd-game-right"
        style={{ display: "flex", flexDirection: "column", gap: 16 }}
      >
        <div className="frame" style={{ padding: 16 }}>
          <div className="ptitle">Move History</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 190, overflowY: "auto" }}>
            {rows.length === 0 ? (
              <div
                style={{
                  font: "500 12px Inter",
                  color: "var(--ink2)",
                  textAlign: "center",
                  padding: "18px 0",
                }}
              >
                No moves yet. Red opens.
              </div>
            ) : (
              rows.map((h) => (
                <div
                  key={h.n}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "26px 1fr 1fr",
                    gap: 6,
                    alignItems: "center",
                    padding: "5px 8px",
                    borderRadius: 6,
                    background: h.n % 2 === 0 ? "rgba(0,0,0,.25)" : "rgba(232,184,75,.06)",
                  }}
                >
                  <span style={{ font: "700 11px 'JetBrains Mono',monospace", color: "var(--ink2)" }}>{h.n}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, font: "600 12px 'JetBrains Mono',monospace" }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--red)" }} />
                    {h.red}
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, font: "600 12px 'JetBrains Mono',monospace" }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--blue)" }} />
                    {h.blue}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="frame" style={{ padding: 16, display: "flex", gap: 12, alignItems: "flex-start" }}>
          <span style={{ color: "var(--gold)", flex: "none" }}>💡</span>
          <div>
            <div
              style={{
                font: "700 12px Inter",
                letterSpacing: 1,
                color: "var(--gold-lt)",
                textTransform: "uppercase",
                marginBottom: 5,
              }}
            >
              Tip of the Day
            </div>
            <div style={{ font: "400 13px/1.5 Inter", color: "var(--ink)" }}>
              Control the center. Pieces in the middle give you more options and stronger defense.
            </div>
          </div>
        </div>
      </div>

      {/* RESULT MODAL */}
      <Modal open={!!result}>
        <div
          style={{
            width: 76,
            height: 76,
            margin: "0 auto 16px",
            borderRadius: 20,
            background: winGrad,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 34,
            boxShadow: "0 12px 30px rgba(0,0,0,.5)",
          }}
        >
          {result?.winner === "draw" ? "🤝" : isLocal || result?.winner === HUMAN_COLOR ? "👑" : "⚔"}
        </div>
        <div style={{ font: "700 12px Inter", letterSpacing: 2, textTransform: "uppercase", color: "var(--gold)" }}>
          Match Complete
        </div>
        <h2 style={{ font: "800 28px Cinzel,serif", color: "var(--gold-lt)", margin: "8px 0 4px" }}>
          {resultTitle}
        </h2>
        <p style={{ font: "400 14px Inter", color: "var(--ink)", margin: "0 0 22px" }}>{resultReason}</p>

        <div className="fd-stat-3" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 24 }}>
          <ResultStat value={state.history.length} label="Moves" color="var(--gold-lt)" />
          <ResultStat value={redCaptured} label={isLocal ? `${P1_NAME} took` : "You took"} color="#f27a86" />
          <ResultStat value={blueCaptured} label={isLocal ? `${P2_NAME} took` : "AI took"} color="#6fa8ff" />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          <Button variant="gold" block onClick={() => rematch()}>
            ↻ Rematch
          </Button>
          <div className="fd-btn-grid-2" style={{ display: "flex", gap: 9 }}>
            <Button variant="purple" style={{ flex: 1 }} onClick={() => navigate(isLocal ? "/play" : "/play/ai")}>
              {isLocal ? "Game Modes" : "Change Difficulty"}
            </Button>
            <Button variant="purple" style={{ flex: 1 }} onClick={() => navigate("/")}>
              Home
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function ResultStat({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div style={{ padding: "14px 8px", borderRadius: 10, border: "1px solid rgba(232,184,75,.25)", background: "rgba(0,0,0,.25)" }}>
      <div style={{ font: "700 22px 'JetBrains Mono',monospace", color }}>{value}</div>
      <div style={{ font: "500 11px Inter", color: "var(--ink2)" }}>{label}</div>
    </div>
  );
}

export default GamePage;
