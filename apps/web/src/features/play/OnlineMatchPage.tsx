import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Board } from "../../components";
import { useOnlineStore } from "../../stores/onlineStore";
import { useAuthStore } from "../../stores/authStore";
import { Modal } from "../shared/Modal";
import { avatar as avatarUrl } from "../../lib/assets";

/**
 * OnlineMatchPage — real-time ranked/casual play against another human.
 * Matchmaking overlay → live board driven entirely by the server-authoritative
 * onlineStore (the client only sends move intents). Route: /play/online?mode=ranked
 */
export function OnlineMatchPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const me = useAuthStore((s) => s.me);
  const mode = (params.get("mode") === "ranked" ? "RANKED" : "CASUAL") as "RANKED" | "CASUAL";

  const {
    status, matchId, myColor, opponent, state,
    selected, moveTargets, captureTargets, mustCapture, end, error,
    joinQueue, leaveQueue, onSquareClick, resign, reset,
  } = useOnlineStore();

  // Must be logged in (guest is fine) to matchmake.
  useEffect(() => {
    if (!me) {
      navigate("/login?next=/play/online");
      return;
    }
    joinQueue(mode);
    return () => {
      leaveQueue();
      reset();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const myTurn = !!state && !state.result && state.turn === myColor && status === "playing";
  const flip = myColor === "blue"; // blue player views from their side

  // ── matchmaking overlay ──
  if (status === "searching" || status === "found" || (status === "idle" && !state)) {
    return (
      <div style={{ maxWidth: 620, margin: "0 auto", padding: "60px 26px", textAlign: "center" }}>
        <div className="frame" style={{ padding: 40 }}>
          <div style={{ font: "700 12px Inter", letterSpacing: "3px", color: "var(--gold)", marginBottom: 10 }}>
            ✦ {mode === "RANKED" ? "RANKED MATCH" : "QUICK MATCH"} ✦
          </div>
          <h1 style={{ font: "800 30px Cinzel,serif", color: "var(--gold-lt)", margin: "0 0 8px" }}>
            {status === "found" ? "Opponent Found!" : "Finding an Opponent…"}
          </h1>
          <div style={{ display: "flex", justifyContent: "center", margin: "26px 0" }}>
            <div style={{ width: 60, height: 60, borderRadius: "50%", border: "3px solid rgba(232,184,75,.25)", borderTopColor: "var(--gold)", animation: "fdspin .9s linear infinite" }} />
          </div>
          <p style={{ font: "400 14px Inter", color: "var(--ink)" }}>
            {status === "found" && opponent
              ? `Matched with ${opponent.displayName} (🏆 ${opponent.trophies}). Starting…`
              : "Searching the queue for a worthy rival. This can take a moment."}
          </p>
          {error && <p style={{ font: "600 13px Inter", color: "#ff8fae", marginTop: 12 }}>{error}</p>}
          <button className="btn btn-purple" onClick={() => { leaveQueue(); navigate("/play"); }} style={{ marginTop: 22 }}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (!state) return null;

  const redName = myColor === "red" ? me?.displayName ?? "You" : opponent?.displayName ?? "Opponent";
  const blueName = myColor === "blue" ? me?.displayName ?? "You" : opponent?.displayName ?? "Opponent";

  const won = end && myColor && end.result.winner === myColor;
  const draw = end && end.result.winner === "draw";

  return (
    <div className="fd-game-grid" style={{ maxWidth: 1200, margin: "0 auto", padding: "22px 26px", display: "grid", gridTemplateColumns: "300px minmax(0,1fr)", gap: 18, alignItems: "start" }}>
      {/* LEFT: players + controls */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="frame" style={{ padding: 16, textAlign: "center" }}>
          <div style={{ font: "700 13px Cinzel,serif", color: "#8ce0ad" }}>
            {mode === "RANKED" ? "Ranked Match" : "Quick Match"}
          </div>
          <div style={{ font: "500 11px Inter", color: "var(--ink2)" }}>Live · Online</div>
        </div>

        <OpponentPanel name={blueName === (me?.displayName ?? "You") ? redName : blueName} sub="Opponent"
          avatar={opponent?.avatarUrl ?? "champion"} active={!!state && state.turn !== myColor && !state.result} />

        <div style={{ textAlign: "center", font: "800 12px Cinzel,serif", color: "var(--ink2)" }}>VS</div>

        <OpponentPanel name={me?.displayName ?? "You"} sub={`You · ${myColor}`}
          avatar={me?.avatarUrl ?? "strategist"} active={myTurn} you />

        <button className="btn btn-red" onClick={resign} disabled={!!state.result} style={{ marginTop: 4 }}>
          🏳 Resign
        </button>
        <button className="btn btn-purple" onClick={() => navigate("/play")}>
          ← Leave
        </button>
        {error && <div style={{ font: "600 12px Inter", color: "#ff8fae", textAlign: "center" }}>{error}</div>}
      </div>

      {/* CENTER: board */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        <div style={{
          padding: "9px 18px", borderRadius: 100, border: "1px solid rgba(232,184,75,.5)",
          background: myTurn ? "rgba(50,150,100,.18)" : "rgba(15,8,32,.6)",
          color: myTurn ? "#8ce0ad" : "var(--ink)", font: "700 13px Inter",
        }}>
          {myTurn ? (mustCapture ? "⚠ You must capture" : "● Your move") : "Opponent's move…"}
        </div>

        <div style={{ width: "min(92vw,600px)", maxWidth: "100%" }}>
          <Board
            state={state}
            legalTargets={moveTargets}
            captureTargets={captureTargets}
            selected={selected}
            mustCapture={mustCapture && myTurn}
            onSquareClick={onSquareClick}
            flip={flip}
          />
        </div>
      </div>

      {/* RESULT MODAL */}
      <Modal open={!!end}>
        <div style={{ width: 76, height: 76, margin: "0 auto 16px", borderRadius: 20,
          background: draw ? "linear-gradient(180deg,#6b6480,#3b3550)" : won ? "linear-gradient(180deg,#f0cf72,#c99a2e)" : "linear-gradient(180deg,#a83744,#6e1b24)",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34 }}>
          {draw ? "🤝" : won ? "👑" : "⚔"}
        </div>
        <h2 style={{ font: "800 28px Cinzel,serif", color: "var(--gold-lt)", margin: "8px 0 4px" }}>
          {draw ? "Draw" : won ? "Victory" : "Defeat"}
        </h2>
        <p style={{ font: "400 14px Inter", color: "var(--ink)", margin: "0 0 18px" }}>
          {end?.result.reason === "resign" ? (won ? "Your opponent resigned." : "You resigned.")
            : end?.result.reason === "capture-all" ? (won ? "You captured every enemy piece." : "The enemy captured all your pieces.")
            : draw ? "A hard-fought draw." : won ? "Well played." : "Better luck next time."}
        </p>
        {end && (mode === "RANKED") && (
          <div style={{ display: "flex", justifyContent: "center", gap: 16, marginBottom: 20, font: "700 14px 'JetBrains Mono',monospace" }}>
            <span style={{ color: (myColor === "red" ? end.redTrophyDelta : end.blueTrophyDelta) >= 0 ? "#3fbf6f" : "#ff8fae" }}>
              🏆 {(myColor === "red" ? end.redTrophyDelta : end.blueTrophyDelta) >= 0 ? "+" : ""}{myColor === "red" ? end.redTrophyDelta : end.blueTrophyDelta}
            </span>
            {won && end.goldReward > 0 && <span style={{ color: "#f2d493" }}>🪙 +{end.goldReward}</span>}
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          <button className="btn btn-gold" onClick={() => { reset(); joinQueue(mode); }}>↻ Play Again</button>
          <button className="btn btn-purple" onClick={() => navigate("/")}>Home</button>
        </div>
      </Modal>
    </div>
  );
}

function OpponentPanel({ name, sub, avatar, active, you }: { name: string; sub: string; avatar: string; active: boolean; you?: boolean }) {
  return (
    <div className="frame" style={{ padding: 14, display: "flex", alignItems: "center", gap: 12, borderColor: active ? "rgba(50,150,100,.55)" : undefined }}>
      <div style={{ width: 48, height: 48, borderRadius: "50%", overflow: "hidden", border: `2px solid ${you ? "var(--gold)" : "rgba(232,184,75,.5)"}`, flex: "none" }}>
        <img src={avatarUrl(avatar)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", filter: "brightness(1.25)" }} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ font: "700 14px Inter", color: "#fff" }}>{name}</div>
        <div style={{ font: "500 11px Inter", color: "var(--ink2)" }}>{sub}</div>
      </div>
      {active && <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#3fbf6f", boxShadow: "0 0 8px #3fbf6f" }} />}
    </div>
  );
}

export default OnlineMatchPage;
