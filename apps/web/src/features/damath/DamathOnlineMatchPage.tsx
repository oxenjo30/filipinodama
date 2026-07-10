import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { DamathVariant } from "@dama/shared";
import { Button } from "../../components";
import { Modal } from "../shared/Modal";
import { useDamathOnlineStore } from "../../stores/damathOnlineStore";
import { DamathBoard } from "./DamathBoard";
import { DamathScorePanel } from "./DamathScorePanel";
import { DamathMoveHistory } from "./DamathMoveHistory";
import { variantInfo } from "./variants";

const show = (n: number) => {
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? String(r) : r.toFixed(2);
};

export function DamathOnlineMatchPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const variant = (params.get("variant") as DamathVariant) || "whole";
  // Arriving from a private room: the room already attached us to a seeded
  // match (attachMatch), so we must NOT re-join the public matchmaking queue.
  const fromRoom = params.get("from") === "room";

  const {
    status,
    variant: liveVariant,
    myColor,
    opponent,
    state,
    selected,
    moveTargets,
    captureTargets,
    mustCapture,
    result,
    error,
    connectionLost,
    joinQueue,
    resync,
    leaveQueue,
    onSquareClick,
    resign,
    reset,
  } = useDamathOnlineStore();

  // On mount: from a room → resync into the already-seeded match; otherwise join
  // the public queue. Leave/reset on unmount.
  useEffect(() => {
    if (fromRoom) void resync();
    else void joinQueue(variant);
    return () => {
      leaveQueue();
      reset();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const over = status === "ended";
  // Spectator: arrived via a room but the server gave us no colour (read-only).
  const spectating = fromRoom && !!state && myColor === null;
  const flip = myColor === "blue"; // players view from their own side; spectators from Red's

  // ── searching / found reveal ──
  if (status === "searching" || status === "found") {
    return (
      <div style={{ maxWidth: 620, margin: "0 auto", padding: "60px 26px", textAlign: "center" }}>
        <div style={{ font: "700 12px Inter", letterSpacing: 3, color: "var(--gold)" }}>✦ MATH DAMA · ONLINE ✦</div>
        <h1 style={{ margin: "12px 0 8px", font: "800 clamp(26px,4vw,36px) Cinzel,serif", color: "var(--gold-lt)" }}>
          {status === "found" ? "Opponent found" : "Finding an opponent…"}
        </h1>
        <p style={{ font: "400 14px Inter", color: "var(--ink)", marginBottom: 26 }}>
          {status === "found"
            ? `Facing ${opponent?.displayName ?? "your opponent"} — loading the board…`
            : "You'll be matched with the next player who queues. Unranked."}
        </p>
        <div
          style={{
            width: 46,
            height: 46,
            margin: "0 auto 26px",
            borderRadius: "50%",
            border: "3px solid rgba(232,184,75,.25)",
            borderTopColor: "var(--gold)",
            animation: "fdspin .9s linear infinite",
          }}
        />
        {error && <p style={{ color: "#f27a86", font: "500 13px Inter", marginBottom: 16 }}>{error}</p>}
        <Button variant="purple" onClick={() => { leaveQueue(); navigate("/damath"); }}>
          Cancel
        </Button>
      </div>
    );
  }

  if (!state) {
    return (
      <div style={{ maxWidth: 620, margin: "0 auto", padding: "60px 26px", textAlign: "center" }}>
        <p style={{ font: "500 14px Inter", color: "var(--ink)" }}>Connecting to the match…</p>
        <div style={{ marginTop: 20 }}>
          <Button variant="purple" onClick={() => navigate("/damath")}>Back</Button>
        </div>
      </div>
    );
  }

  const myTurn = !over && !!myColor && state.turn === myColor;
  const info = variantInfo(liveVariant);
  const meName = "You";
  const oppName = opponent?.displayName ?? "Opponent";
  // Spectators have no "You": name both seats Red/Blue.
  const redName = spectating ? "Red" : myColor === "red" ? meName : oppName;
  const blueName = spectating ? "Blue" : myColor === "blue" ? meName : oppName;

  const humanWon = over && result?.winner === myColor;
  let resultTitle = "";
  let resultReason = "";
  if (result) {
    if (result.winner === "draw") {
      resultTitle = "Draw";
      resultReason = "Both sides finished with the same score.";
    } else {
      resultTitle = humanWon ? "Victory" : "Defeat";
      resultReason =
        result.reason === "resign"
          ? humanWon ? "Your opponent resigned." : "You resigned the match."
          : `Final score decided it — ${show(result.redScore)} vs ${show(result.blueScore)}.`;
    }
  }
  const winGrad =
    result?.winner === "draw"
      ? "linear-gradient(180deg,#6b6480,#3b3550)"
      : humanWon
        ? "linear-gradient(180deg,#f0cf72,#c99a2e)"
        : "linear-gradient(180deg,#a83744,#6e1b24)";

  return (
    <div
      className="fd-game-grid fd-page-pad"
      style={{ maxWidth: 1560, margin: "0 auto", padding: "22px 26px", display: "grid", gridTemplateColumns: "300px minmax(0,1fr) 300px", gap: 18, alignItems: "start" }}
    >
      <div className="fd-game-left" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="frame" style={{ padding: 16, display: "flex", alignItems: "center", gap: 12, borderColor: "rgba(232,184,75,.4)" }}>
          <span style={{ fontSize: 22 }}>🌐</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: "700 15px Cinzel,serif", color: "var(--gold-lt)" }}>Math Dama · {spectating ? "Spectating" : "Online"}</div>
            <div style={{ font: "500 11px Inter", color: "var(--ink2)" }}>{info?.label ?? "Whole"} · Unranked</div>
          </div>
        </div>
        <DamathScorePanel state={state} redName={redName} blueName={blueName} youAre={spectating ? null : myColor} />
      </div>

      <div className="fd-game-center" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        {connectionLost && (
          <div style={{ padding: "8px 16px", borderRadius: 100, border: "1px solid rgba(232,184,75,.4)", background: "rgba(15,8,32,.6)", color: "var(--gold-lt)", font: "700 12px Inter" }}>
            Reconnecting…
          </div>
        )}
        <div style={{ minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {!over && (
            <div
              style={{
                padding: "10px 18px",
                borderRadius: 100,
                border: `1px solid ${myTurn ? "rgba(245,215,131,.5)" : "rgba(70,110,200,.5)"}`,
                background: myTurn ? "rgba(245,215,131,.1)" : "rgba(46,107,198,.18)",
                color: myTurn ? "var(--gold-lt)" : "#cfe0ff",
                font: "700 13px Cinzel,serif",
              }}
            >
              {spectating
                ? `👁 Watching — ${state.turn === "red" ? redName : blueName}'s turn`
                : mustCapture && myTurn
                  ? "⚠ You must capture this turn."
                  : myTurn
                    ? "Your turn"
                    : `${oppName}'s turn`}
            </div>
          )}
        </div>

        <div style={{ width: "min(92vw,600px)", maxWidth: "100%" }}>
          <DamathBoard
            state={state}
            legalTargets={spectating ? [] : moveTargets}
            captureTargets={spectating ? [] : captureTargets}
            selected={spectating ? null : selected}
            mustCapture={!spectating && mustCapture && myTurn}
            onSquareClick={spectating || !myTurn ? undefined : onSquareClick}
            flip={flip}
          />
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          {spectating ? (
            <Button variant="purple" size="sm" onClick={() => navigate("/damath")}>
              ← Leave
            </Button>
          ) : (
            <Button variant="red" size="sm" onClick={() => resign()} disabled={over}>
              🏳 Resign
            </Button>
          )}
        </div>
      </div>

      <div className="fd-game-right" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <DamathMoveHistory state={state} />
      </div>

      <Modal open={over}>
        <div style={{ width: 76, height: 76, margin: "0 auto 16px", borderRadius: 20, background: winGrad, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34, boxShadow: "0 12px 30px rgba(0,0,0,.5)" }}>
          {result?.winner === "draw" ? "🤝" : humanWon ? "👑" : "⚔"}
        </div>
        <div style={{ font: "700 12px Inter", letterSpacing: 2, textTransform: "uppercase", color: "var(--gold)" }}>Match Complete</div>
        <h2 style={{ font: "800 28px Cinzel,serif", color: "var(--gold-lt)", margin: "8px 0 4px" }}>{resultTitle}</h2>
        <p style={{ font: "400 14px Inter", color: "var(--ink)", margin: "0 0 22px" }}>{resultReason}</p>
        <div className="fd-stat-3" style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10, marginBottom: 24 }}>
          <ResultStat value={show(result?.redScore ?? state.redScore)} label={`${redName} (Red)`} color="#f27a86" />
          <ResultStat value={show(result?.blueScore ?? state.blueScore)} label={`${blueName} (Blue)`} color="#6fa8ff" />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          <Button variant="gold" block onClick={() => { reset(); navigate("/damath"); }}>
            Play again
          </Button>
          <Button variant="purple" block onClick={() => navigate("/")}>
            Home
          </Button>
        </div>
      </Modal>
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

export default DamathOnlineMatchPage;
