import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { DamathPlayerId } from "@dama/shared";
import { Button } from "../../components";
import { Modal } from "../shared/Modal";
import { useDamathStore, DAMATH_HUMAN } from "../../stores/damathStore";
import { useAppStore } from "../../stores/appStore";
import { useDamathSounds } from "../../lib/useDamathSounds";
import { DamathBoard } from "./DamathBoard";
import { DamathScorePanel } from "./DamathScorePanel";
import { DamathMoveHistory } from "./DamathMoveHistory";
import { variantInfo } from "./variants";

/** AI opponent display name per difficulty. */
const AI_NAME = { easy: "Apprentice", normal: "Tactician", hard: "Master" } as const;

const show = (n: number) => {
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? String(r) : r.toFixed(2);
};

/** mm:ss from ms remaining. */
const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function DamathGamePage() {
  const navigate = useNavigate();
  const showToast = useAppStore((s) => s.showToast);

  const {
    state,
    mode,
    variant,
    difficulty,
    selected,
    moveTargets,
    captureTargets,
    mustCapture,
    status,
    flip,
    onSquareClick,
    rematch,
    swapSides,
    surrender,
    endByReason,
  } = useDamathStore();

  const isAi = mode === "ai";
  const result = state.result;
  const over = !!result;

  // Board SFX: move / capture / dama-promotion / win-lose-draw on each state
  // transition. vs-AI → the human is Red (real win/lose); local pass-and-play →
  // null so both seats get the neutral victory flourish.
  useDamathSounds(state, isAi ? DAMATH_HUMAN : null);
  const redToMove = !over && state.turn === "red";
  const blueToMove = !over && state.turn === "blue";
  const aiThinking = isAi && status === "thinking";

  // Seat names: vs-AI → You (Red) vs the difficulty-named bot (Blue).
  // Local → Player 1 (Red) vs Player 2 (Blue).
  const P1 = isAi ? "You" : "Player 1";
  const P2 = isAi ? AI_NAME[difficulty] : "Player 2";
  const youAre = isAi ? DAMATH_HUMAN : null;

  // ── Per-player game clock (view-authoritative for local play) ──
  // Each side's own 20-min budget ticks only on their turn. On flag, the game
  // ends and the winner is decided by score (endByReason "clock").
  const seed = state.options.gameClockSec * 1000;
  const [clocks, setClocks] = useState<{ red: number; blue: number }>({ red: seed, blue: seed });
  const flaggedRef = useRef(false);

  // reset clocks whenever a new game starts (history empties, no result).
  useEffect(() => {
    if (state.history.length === 0 && !over) {
      setClocks({ red: seed, blue: seed });
      flaggedRef.current = false;
    }
  }, [state.history.length, over, seed]);

  useEffect(() => {
    if (over || status !== "playing") return;
    const turn = state.turn;
    const id = window.setInterval(() => {
      setClocks((c) => {
        const next = { ...c, [turn]: Math.max(0, c[turn] - 1000) };
        if (next[turn] === 0 && !flaggedRef.current) {
          flaggedRef.current = true;
          // defer so we don't setState-in-render of another store
          window.setTimeout(() => endByReason("clock"), 0);
        }
        return next;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [state.turn, over, status, endByReason]);

  // ── Result modal wording ──
  let resultTitle = "";
  let resultReason = "";
  const humanWon = isAi && result?.winner === DAMATH_HUMAN;
  if (result) {
    if (result.winner === "draw") {
      resultTitle = "Draw";
      resultReason = "Both sides finished with the same score.";
    } else {
      const winnerName = result.winner === "red" ? P1 : P2;
      const loserName = result.winner === "red" ? P2 : P1;
      // vs-AI: frame as Victory/Defeat for the human; local: name the seat.
      resultTitle = isAi ? (humanWon ? "Victory" : "Defeat") : `${winnerName} Wins`;
      switch (result.reason) {
        case "resign":
          resultReason = isAi
            ? humanWon
              ? "The AI resigned."
              : "You resigned the match."
            : `${loserName} resigned the match.`;
          break;
        case "clock":
          resultReason = `Time ran out — ${winnerName} led on total score.`;
          break;
        case "no-moves":
          resultReason = `${loserName} had no legal move — ${winnerName} led on score.`;
          break;
        case "no-pieces":
          resultReason = `${loserName} lost their last chip — ${winnerName} led on score.`;
          break;
        default:
          resultReason = `${winnerName} finished with the higher score.`;
      }
    }
  }

  const winGrad =
    result?.winner === "draw"
      ? "linear-gradient(180deg,#6b6480,#3b3550)"
      : isAi && !humanWon
        ? "linear-gradient(180deg,#a83744,#6e1b24)"
        : "linear-gradient(180deg,#f0cf72,#c99a2e)";

  const info = variantInfo(variant);

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
      {/* LEFT: mode chip + scoreboard */}
      <div className="fd-game-left" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div
          className="frame"
          style={{ padding: 16, display: "flex", alignItems: "center", gap: 12, borderColor: "rgba(232,184,75,.4)" }}
        >
          <span style={{ fontSize: 22 }}>🧮</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: "700 15px Cinzel,serif", color: "var(--gold-lt)" }}>Math Dama</div>
            <div style={{ font: "500 11px Inter", color: "var(--ink2)" }}>
              {info?.label ?? "Whole"} · {isAi ? `vs AI · ${AI_NAME[difficulty]}` : "Pass & play"}
            </div>
          </div>
        </div>

        <DamathScorePanel state={state} redName={P1} blueName={P2} youAre={youAre} />
      </div>

      {/* CENTER: clocks + banner + board + controls */}
      <div className="fd-game-center" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        {/* Blue clock (top seat) */}
        <SeatClock name={P2} seat="blue" ms={clocks.blue} active={blueToMove} />

        {/* status banner slot (fixed height so the board never jumps) */}
        <div style={{ minHeight: 48, display: "flex", alignItems: "center", justifyContent: "center", width: "100%" }}>
          {aiThinking && (
            <Banner tone="think">
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
              {AI_NAME[difficulty]} is thinking…
            </Banner>
          )}
          {!over && !aiThinking && mustCapture && (
            <Banner tone="warn">
              ⚠ {isAi ? "You" : redToMove ? P1 : P2} must capture this turn.
            </Banner>
          )}
          {!over && !aiThinking && !mustCapture && (
            <Banner tone={redToMove ? "red" : "blue"}>
              {(redToMove ? P1 : P2)}&apos;s turn
            </Banner>
          )}
        </div>

        <div style={{ width: "min(92vw,600px)", maxWidth: "100%" }}>
          <DamathBoard
            state={state}
            legalTargets={moveTargets}
            captureTargets={captureTargets}
            selected={selected}
            mustCapture={mustCapture && !aiThinking}
            onSquareClick={onSquareClick}
            flip={flip}
          />
        </div>

        {/* Red clock (bottom seat) */}
        <SeatClock name={P1} seat="red" ms={clocks.red} active={redToMove} />

        <div
          className="fd-btn-grid-2"
          style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", width: "min(92vw,600px)", maxWidth: "100%" }}
        >
          <Button variant="purple" size="sm" onClick={() => { swapSides(); showToast("Board flipped."); }}>
            ⇅ Swap Sides
          </Button>
          <Button variant="purple" size="sm" onClick={() => rematch()}>
            ↻ Restart
          </Button>
          <Button variant="red" size="sm" onClick={() => surrender()} disabled={over}>
            🏳 Resign
          </Button>
        </div>
      </div>

      {/* RIGHT: scoring log + how-to */}
      <div className="fd-game-right" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <DamathMoveHistory state={state} />
        <div className="frame" style={{ padding: 16, display: "flex", gap: 12, alignItems: "flex-start" }}>
          <span style={{ color: "var(--gold)", flex: "none" }}>💡</span>
          <div>
            <div style={{ font: "700 12px Inter", letterSpacing: 1, color: "var(--gold-lt)", textTransform: "uppercase", marginBottom: 5 }}>
              How scoring works
            </div>
            <div style={{ font: "400 13px/1.5 Inter", color: "var(--ink)" }}>
              When you capture, the <b>landing square&apos;s operator</b> combines your chip
              and the captured chip. A dama doubles the score; dama-vs-dama quadruples it.
              Highest total at the end wins — remaining chips are added on, dama doubled.
            </div>
          </div>
        </div>
      </div>

      {/* RESULT MODAL */}
      <Modal open={over}>
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
          {result?.winner === "draw" ? "🤝" : "👑"}
        </div>
        <div style={{ font: "700 12px Inter", letterSpacing: 2, textTransform: "uppercase", color: "var(--gold)" }}>
          Match Complete
        </div>
        <h2 style={{ font: "800 28px Cinzel,serif", color: "var(--gold-lt)", margin: "8px 0 4px" }}>
          {resultTitle}
        </h2>
        <p style={{ font: "400 14px Inter", color: "var(--ink)", margin: "0 0 22px" }}>{resultReason}</p>

        <div className="fd-stat-3" style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10, marginBottom: 24 }}>
          <ResultStat value={show(result?.redScore ?? state.redScore)} label={`${P1} (Red)`} color="#f27a86" />
          <ResultStat value={show(result?.blueScore ?? state.blueScore)} label={`${P2} (Blue)`} color="#6fa8ff" />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          <Button variant="gold" block onClick={() => rematch()}>
            ↻ Rematch
          </Button>
          <div className="fd-btn-grid-2" style={{ display: "flex", gap: 9 }}>
            <Button variant="purple" style={{ flex: 1 }} onClick={() => navigate("/damath")}>
              Change Variant
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

function SeatClock({ name, seat, ms, active }: { name: string; seat: DamathPlayerId; ms: number; active: boolean }) {
  const dot = seat === "red"
    ? "radial-gradient(circle at 35% 30%,#e0555f,#8f1b28)"
    : "radial-gradient(circle at 35% 30%,#5f97e6,#1f4a92)";
  const low = ms <= 60_000;
  return (
    <div
      style={{
        width: "min(92vw,600px)",
        maxWidth: "100%",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 14px",
        borderRadius: 100,
        border: `1px solid ${active ? "rgba(245,215,131,.5)" : "rgba(232,184,75,.16)"}`,
        background: active ? "rgba(245,215,131,.08)" : "rgba(15,8,32,.55)",
        transition: "border-color .2s, background .2s",
      }}
    >
      <span style={{ width: 12, height: 12, borderRadius: "50%", background: dot, flex: "none" }} />
      <span style={{ font: "700 13px Cinzel,serif", color: active ? "var(--gold-lt)" : "var(--ink)" }}>{name}</span>
      <span
        style={{
          marginLeft: "auto",
          font: "700 15px 'JetBrains Mono',monospace",
          letterSpacing: 1,
          color: low ? "#f27a86" : active ? "var(--gold-lt)" : "var(--ink2)",
        }}
      >
        ⏱ {clock(ms)}
      </span>
    </div>
  );
}

function Banner({ tone, children }: { tone: "warn" | "red" | "blue" | "think"; children: React.ReactNode }) {
  const styles: Record<typeof tone, { border: string; bg: string; color: string; anim?: string }> = {
    warn: { border: "rgba(232,184,75,.5)", bg: "rgba(160,48,58,.25)", color: "var(--gold-lt)", anim: "fdglow 2s ease infinite" },
    red: { border: "rgba(200,70,80,.6)", bg: "rgba(160,48,58,.22)", color: "#fff" },
    blue: { border: "rgba(70,110,200,.6)", bg: "rgba(46,107,198,.2)", color: "#fff" },
    think: { border: "rgba(232,184,75,.4)", bg: "rgba(15,8,32,.6)", color: "var(--gold-lt)" },
  };
  const s = styles[tone];
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        padding: "10px 18px",
        borderRadius: 100,
        border: `1px solid ${s.border}`,
        background: s.bg,
        color: s.color,
        font: "700 13px Cinzel,serif",
        animation: s.anim,
      }}
    >
      {children}
    </div>
  );
}

function ResultStat({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <div style={{ padding: "14px 8px", borderRadius: 10, border: "1px solid rgba(232,184,75,.25)", background: "rgba(0,0,0,.25)" }}>
      <div style={{ font: "700 22px 'JetBrains Mono',monospace", color }}>{value}</div>
      <div style={{ font: "500 11px Inter", color: "var(--ink2)" }}>{label}</div>
    </div>
  );
}

export default DamathGamePage;
