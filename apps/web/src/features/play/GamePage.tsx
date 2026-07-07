import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { AiDifficulty, Move, Square } from "@dama/shared";
import { Board, Button, Divider } from "../../components";
import { useGameStore, HUMAN_COLOR, AI_COLOR } from "../../stores/gameStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useAppStore } from "../../stores/appStore";
import { PlayerPanel } from "./PlayerPanel";
import { Modal } from "../shared/Modal";
import { emblem } from "../../lib/emblems";

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

/** Quick-chat emotes from the prototype. */
const GAME_EMOTES = ["👋", "😄", "😮", "😢", "👍", "🔥"];

/** "Explore Game Modes" cards (prototype `modes`, line 3808). */
const EXPLORE_MODES = [
  { title: "Classic Mode", short: "Timeless fun", border: "rgba(60,110,200,.55)", btn: "blue", icon: "mc-classic.png" },
  { title: "Ranked Mode", short: "Prove your skill", border: "rgba(180,60,70,.55)", btn: "red", icon: "mc-ranked.png" },
  { title: "Play vs AI", short: "Beat the bot", border: "rgba(50,150,100,.55)", btn: "green", icon: "mc-training.png" },
  { title: "Kingdom Mode", short: "Conquer & win", border: "rgba(140,90,210,.55)", btn: "purple", icon: "mc-kingdom.png" },
] as const;

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

  const [chatDraft, setChatDraft] = useState("");

  // Start a fresh match for the chosen difficulty when the screen mounts.
  useEffect(() => {
    newGame(difficulty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const result = state.result;
  const humanTurn = !result && state.turn === HUMAN_COLOR && status === "playing";
  const aiThinking = status === "thinking";

  const rows = toRows(state.history);

  function sendChat() {
    const msg = chatDraft.trim();
    if (!msg) return;
    setChatDraft("");
    showToast("In-game chat arrives with online play.");
  }

  // "Explore Game Modes" cards → honest destinations (only Play vs AI is built).
  function onMode(title: string) {
    if (title === "Play vs AI" || title === "Classic Mode") navigate("/play/ai");
    else if (title === "Ranked Mode") showToast("Ranked matchmaking arrives with online play.");
    else showToast("Kingdom Mode is coming soon.");
  }

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
        gridTemplateColumns: "270px minmax(0,1fr) 300px",
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

        <Button variant="red" block onClick={() => showToast("Online play arrives soon.")}>
          🌐 Play Online
        </Button>
        <Button variant="purple" block onClick={() => rematch()}>
          🤖 VS AI
        </Button>
        <Button variant="purple" block onClick={() => showToast("Local match arrives soon.")}>
          👥 Local Match
        </Button>
        <Button variant="purple" block onClick={() => rematch()}>
          ↻ New Board
        </Button>
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
          <Button
            variant="purple"
            size="sm"
            onClick={() => showToast("Undo is coming soon.")}
          >
            ↶ Undo
          </Button>
          <Button
            variant="purple"
            size="sm"
            onClick={() => showToast("Swap sides arrives with online play.")}
          >
            ⇅ Swap Sides
          </Button>
          <Button variant="purple" size="sm" onClick={() => rematch()}>
            ↻ Restart
          </Button>
          <Button variant="red" size="sm" onClick={() => surrender()} disabled={!!result}>
            🏳 Surrender
          </Button>
        </div>

        <Divider style={{ width: "100%", marginTop: 8 }}>Explore Game Modes</Divider>
        <div
          className="fd-modes-grid"
          style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, width: "100%" }}
        >
          {EXPLORE_MODES.map((m) => (
            <div key={m.title} className="frame" style={{ padding: 14, textAlign: "center", borderColor: m.border }}>
              <img
                src={emblem(m.icon)}
                alt=""
                width={44}
                height={44}
                style={{ display: "block", margin: "0 auto 8px", borderRadius: 10, objectFit: "contain" }}
              />
              <div style={{ font: "700 13px Cinzel,serif", color: "var(--gold-lt)" }}>{m.title}</div>
              <div style={{ font: "400 11px Inter", color: "var(--ink)", margin: "3px 0 10px" }}>{m.short}</div>
              <Button variant={m.btn} block size="sm" onClick={() => onMode(m.title)}>
                Play Now
              </Button>
            </div>
          ))}
        </div>
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

        <div className="frame" style={{ padding: 16 }}>
          <div className="ptitle">Quick Chat</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center", marginBottom: 12 }}>
            {GAME_EMOTES.map((ch) => (
              <button
                key={ch}
                onClick={() => showToast("In-game chat arrives with online play.")}
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 9,
                  border: "1px solid rgba(232,184,75,.3)",
                  background: "rgba(15,8,32,.5)",
                  fontSize: 18,
                  cursor: "pointer",
                }}
              >
                {ch}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={chatDraft}
              onChange={(e) => setChatDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") sendChat();
              }}
              placeholder="Type a message..."
              style={{
                flex: 1,
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid rgba(232,184,75,.3)",
                background: "rgba(0,0,0,.3)",
                color: "#fff",
                font: "500 13px Inter",
              }}
            />
            <button onClick={sendChat} className="btn btn-gold" style={{ padding: "10px 12px" }}>
              ➤
            </button>
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
