import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { AiDifficulty } from "@dama/shared";
import { Board, Button, Divider } from "../../components";
import { useGameStore, HUMAN_COLOR, AI_COLOR } from "../../stores/gameStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useAppStore } from "../../stores/appStore";
import { PlayerPanel } from "./PlayerPanel";
import { Modal } from "../shared/Modal";

const DIFF_LABEL: Record<AiDifficulty, string> = {
  easy: "Easy",
  normal: "Normal",
  hard: "Hard",
};

/** AI opponent's display name per difficulty (flavour). */
const AI_NAME: Record<AiDifficulty, string> = {
  easy: "Apprentice Bot",
  normal: "Tactician Bot",
  hard: "Grandmaster Bot",
};

export function GamePage() {
  const navigate = useNavigate();
  const difficulty = useSettingsStore((s) => s.difficulty);
  const boardTheme = useSettingsStore((s) => s.boardTheme);
  const skin = useSettingsStore((s) => s.skin);
  const displayName = useAppStore((s) => s.displayName);
  const trophies = useAppStore((s) => s.trophies);
  const avatar = useAppStore((s) => s.avatar);
  const showToast = useAppStore((s) => s.showToast);

  const {
    state,
    selected,
    moveTargets,
    captureTargets,
    mustCapture,
    status,
    redCaptured,
    blueCaptured,
    onSquareClick,
    newGame,
    rematch,
    surrender,
  } = useGameStore();

  // Start a fresh match for the chosen difficulty when the screen mounts.
  useEffect(() => {
    newGame(difficulty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const result = state.result;
  const humanTurn = !result && state.turn === HUMAN_COLOR && status === "playing";
  const aiThinking = status === "thinking";

  // ── Result modal wording (from the human's POV) ──
  let resultTitle = "";
  let resultReason = "";
  if (result) {
    if (result.winner === "draw") {
      resultTitle = "Draw";
      resultReason =
        result.reason === "repetition"
          ? "The same position repeated three times."
          : "Neither side could force a win.";
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

  const winGrad =
    result?.winner === "draw"
      ? "linear-gradient(180deg,#6b6480,#3b3550)"
      : result?.winner === HUMAN_COLOR
        ? "linear-gradient(180deg,#f0cf72,#c99a2e)"
        : "linear-gradient(180deg,#a83744,#6e1b24)";

  return (
    <div
      className="fd-game-grid"
      style={{
        maxWidth: 1560,
        margin: "0 auto",
        padding: "22px 26px",
        display: "grid",
        gridTemplateColumns: "300px minmax(0,1fr)",
        gap: 18,
        alignItems: "start",
      }}
    >
      {/* LEFT: mode + players + actions */}
      <div className="fd-game-left" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div
          className="frame"
          style={{ padding: 16, display: "flex", alignItems: "center", gap: 12, borderColor: "rgba(50,150,100,.55)" }}
        >
          <span style={{ fontSize: 22 }}>🤖</span>
          <div style={{ flex: 1 }}>
            <div style={{ font: "700 15px Cinzel,serif", color: "#8ce0ad" }}>Play vs AI</div>
            <div style={{ font: "500 11px Inter", color: "var(--ink2)" }}>Offline practice match</div>
          </div>
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
        </div>

        {/* AI panel (top / blue) */}
        <PlayerPanel
          name={AI_NAME[difficulty]}
          rating={difficulty === "hard" ? 1600 : difficulty === "normal" ? 1200 : 800}
          color={AI_COLOR}
          avatar="strategist"
          active={!result && state.turn === AI_COLOR}
          captured={blueCaptured}
          thinking={aiThinking}
        />

        <div style={{ display: "flex", justifyContent: "center", margin: "-6px 0" }}>
          <span
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: "rgba(15,8,32,.9)",
              border: "1px solid rgba(232,184,75,.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              font: "800 12px Cinzel,serif",
              color: "var(--gold)",
            }}
          >
            VS
          </span>
        </div>

        {/* Human panel (bottom / red) */}
        <PlayerPanel
          name={displayName}
          rating={trophies}
          color={HUMAN_COLOR}
          avatar={avatar}
          active={humanTurn}
          captured={redCaptured}
        />

        <Button variant="purple" block onClick={() => rematch()}>
          ↻ New Game
        </Button>
        <Button variant="red" block onClick={() => surrender()} disabled={!!result}>
          🏳 Surrender
        </Button>
        <Button variant="purple" block onClick={() => navigate("/play/ai")}>
          ⚙ Change Difficulty
        </Button>
      </div>

      {/* CENTER: board + controls */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
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
            ⚠ You must capture this turn.
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
            flip={false}
          />
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
          <Button variant="purple" size="sm" onClick={() => rematch()}>
            ↻ Restart
          </Button>
          <Button
            variant="purple"
            size="sm"
            onClick={() => showToast("Undo is coming soon.")}
          >
            ↶ Undo
          </Button>
          <Button variant="red" size="sm" onClick={() => surrender()} disabled={!!result}>
            🏳 Surrender
          </Button>
        </div>

        <Divider>Practice Makes a Datu</Divider>
        <p style={{ font: "400 13px/1.6 Inter", color: "var(--ink)", textAlign: "center", maxWidth: 520, margin: 0 }}>
          Tip: control the center. Pieces in the middle give you more options and a stronger
          defense. Captures are mandatory — the board highlights every forced jump.
        </p>
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
          {result?.winner === "draw" ? "🤝" : result?.winner === HUMAN_COLOR ? "👑" : "⚔"}
        </div>
        <div style={{ font: "700 12px Inter", letterSpacing: 2, textTransform: "uppercase", color: "var(--gold)" }}>
          Match Complete
        </div>
        <h2 style={{ font: "800 28px Cinzel,serif", color: "var(--gold-lt)", margin: "8px 0 4px" }}>
          {resultTitle}
        </h2>
        <p style={{ font: "400 14px Inter", color: "var(--ink)", margin: "0 0 22px" }}>{resultReason}</p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 24 }}>
          <ResultStat value={state.history.length} label="Moves" color="var(--gold-lt)" />
          <ResultStat value={redCaptured} label="You took" color="#f27a86" />
          <ResultStat value={blueCaptured} label="AI took" color="#6fa8ff" />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          <Button variant="gold" block onClick={() => rematch()}>
            ↻ Rematch
          </Button>
          <div style={{ display: "flex", gap: 9 }}>
            <Button variant="purple" style={{ flex: 1 }} onClick={() => navigate("/play/ai")}>
              Change Difficulty
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
