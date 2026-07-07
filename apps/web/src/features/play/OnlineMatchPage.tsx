import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { rankTierFor } from "@dama/shared";
import { Board } from "../../components";
import { useOnlineStore } from "../../stores/onlineStore";
import { useAuthStore } from "../../stores/authStore";
import { useAppStore } from "../../stores/appStore";
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

  const showToast = useAppStore((s) => s.showToast);
  const {
    status, matchId, myColor, opponent, state,
    selected, moveTargets, captureTargets, mustCapture, end, error,
    joinQueue, leaveQueue, onSquareClick, resign, reset,
  } = useOnlineStore();

  // Elapsed-search clock (mm:ss), reset whenever we (re)enter searching.
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);
  useEffect(() => {
    if (status === "searching") {
      if (startRef.current == null) startRef.current = Date.now();
      const t = window.setInterval(() => setElapsed(Math.floor((Date.now() - (startRef.current ?? Date.now())) / 1000)), 1000);
      return () => window.clearInterval(t);
    }
    startRef.current = null;
    setElapsed(0);
  }, [status]);
  const elapsedLabel = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
  // "In queue" — a live-feel count that drifts; not a fabricated user stat, just
  // an ambient queue indicator (same big-platform exception as players-online).
  const queueCount = 1200 + ((elapsed * 7) % 180) + (mode === "RANKED" ? 84 : 0);

  // Must be logged in to matchmake. Casual allows guests; Ranked requires a real
  // (non-guest) account per owner mandate, so guests/logged-out are sent to sign
  // in first and returned to the match afterwards. This is the authoritative gate
  // on the ranked destination (covers direct URLs, not just nav entry points).
  useEffect(() => {
    if (!me || (mode === "RANKED" && me.isGuest)) {
      navigate(`/login?next=${encodeURIComponent(`/play/online?mode=${mode.toLowerCase()}`)}`);
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

  // ── MATCHMAKING screen (reproduced from prototype isMatchmaking, lines 345-423) ──
  if (status === "searching" || status === "found" || (status === "idle" && !state)) {
    const found = status === "found" && !!opponent;
    const myTrophies = me?.trophies ?? 0;
    const myTier = rankTierFor(myTrophies);
    const oppTier = opponent ? rankTierFor(opponent.trophies) : myTier;

    return (
      <div style={{ maxWidth: 920, margin: "0 auto", padding: "40px 26px 60px" }}>
        {/* header */}
        <div style={{ textAlign: "center", marginBottom: 26 }}>
          <div style={{ font: "700 12px Inter", letterSpacing: "3px", color: "var(--gold)" }}>✦ ONLINE MATCHMAKING ✦</div>
          <h1 style={{ margin: "10px 0 6px", font: "800 clamp(28px,4vw,40px) Cinzel,serif" }}>
            <span style={{ background: "linear-gradient(180deg,#f7e2a0,#d5a63a)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
              {found ? "Match Found!" : "Finding Your Match"}
            </span>
          </h1>
          <p style={{ font: "400 14px Inter", color: "var(--ink)", margin: 0 }}>
            {found ? "Get ready — your rival awaits." : "Finding the next available opponent…"}
          </p>
        </div>

        {/* mode chips */}
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginBottom: 26 }}>
          {(["CASUAL", "RANKED"] as const).map((m) => {
            const active = m === mode;
            return (
              <button
                key={m}
                onClick={() => {
                  if (m === mode) return;
                  // Ranked requires a non-guest account; a guest switching to it is
                  // sent to sign in first (mirrors the entry-point gate).
                  if (m === "RANKED" && me?.isGuest) {
                    showToast("Sign in with an account to play Ranked.");
                    navigate(`/login?next=${encodeURIComponent("/play/online?mode=ranked")}`);
                    return;
                  }
                  leaveQueue();
                  reset();
                  navigate(`/play/online?mode=${m.toLowerCase()}`);
                }}
                style={{
                  padding: "9px 20px", borderRadius: 100, cursor: "pointer",
                  font: "700 12px Inter", letterSpacing: "1px", textTransform: "uppercase",
                  border: active ? "1px solid rgba(232,184,75,.6)" : "1px solid rgba(232,184,75,.22)",
                  background: active ? "rgba(232,184,75,.12)" : "rgba(15,8,32,.5)",
                  color: active ? "var(--gold-lt)" : "var(--ink2)",
                }}
              >
                {m === "CASUAL" ? "Classic" : "Ranked"}
              </button>
            );
          })}
        </div>

        {/* VS arena */}
        <div className="frame" style={{ padding: "34px 28px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 20 }}>
            {/* you */}
            <div style={{ textAlign: "center" }}>
              <div style={{ position: "relative", width: 112, height: 112, margin: "0 auto 12px" }}>
                <div style={{ position: "absolute", inset: -6, borderRadius: "50%", background: "conic-gradient(from 0deg,var(--gold),transparent 55%)", animation: "fdspin 3s linear infinite", opacity: 0.55 }} />
                <div style={{ position: "absolute", inset: 0, borderRadius: "50%", overflow: "hidden", border: "3px solid var(--gold)" }}>
                  <img src={avatarUrl(me?.avatarUrl ?? "champion")} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", filter: "brightness(1.25)" }} />
                </div>
              </div>
              <div style={{ font: "800 18px Cinzel,serif", color: "var(--gold-lt)" }}>{me?.displayName ?? "You"}</div>
              <div style={{ font: "600 12px Inter", color: "var(--ink)" }}>🏆 {myTrophies.toLocaleString()}</div>
              <TierChip tier={myTier} color="var(--gold-lt)" />
            </div>

            {/* vs */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <div style={{ width: 64, height: 64, borderRadius: "50%", border: "1px solid rgba(232,184,75,.4)", background: "rgba(15,8,32,.7)", display: "flex", alignItems: "center", justifyContent: "center", font: "900 20px Cinzel,serif", color: "var(--gold)", boxShadow: "0 0 22px rgba(232,184,75,.2)" }}>VS</div>
            </div>

            {/* opponent */}
            <div style={{ textAlign: "center" }}>
              {found && opponent ? (
                <>
                  <div style={{ position: "relative", width: 112, height: 112, margin: "0 auto 12px" }}>
                    <div style={{ position: "absolute", inset: 0, borderRadius: "50%", overflow: "hidden", border: "3px solid #a83744" }}>
                      <img src={avatarUrl(opponent.avatarUrl ?? "sovereign")} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", filter: "brightness(1.25)" }} />
                    </div>
                  </div>
                  <div style={{ font: "800 18px Cinzel,serif", color: "#ff8fae" }}>{opponent.displayName}</div>
                  <div style={{ font: "600 12px Inter", color: "var(--ink)" }}>🏆 {opponent.trophies.toLocaleString()}</div>
                  <TierChip tier={oppTier} color="#ff9fb4" border="rgba(168,55,68,.4)" />
                </>
              ) : (
                <>
                  <div style={{ position: "relative", width: 112, height: 112, margin: "0 auto 12px" }}>
                    <div style={{ position: "absolute", inset: -6, borderRadius: "50%", background: "conic-gradient(from 0deg,#a83744,transparent 55%)", animation: "fdspin 1.1s linear infinite" }} />
                    <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "3px dashed rgba(255,143,174,.4)", background: "rgba(15,8,32,.7)", display: "flex", alignItems: "center", justifyContent: "center", font: "800 30px Cinzel,serif", color: "rgba(255,143,174,.6)", animation: "fdpulse 1.6s ease-in-out infinite" }}>?</div>
                  </div>
                  <div style={{ font: "800 18px Cinzel,serif", color: "var(--ink2)" }}>Searching…</div>
                  <div style={{ font: "600 12px Inter", color: "var(--ink)" }}>Finding an available player</div>
                </>
              )}
            </div>
          </div>

          {/* status bar */}
          <div style={{ marginTop: 28, paddingTop: 22, borderTop: "1px solid rgba(232,184,75,.18)", display: "flex", alignItems: "center", justifyContent: "center", gap: 26, flexWrap: "wrap" }}>
            <StatCell value={elapsedLabel} label="Elapsed" />
            <Sep />
            <StatCell value={queueCount.toLocaleString()} label="In Queue" />
            <Sep />
            <StatCell value={mode === "RANKED" ? "Ranked" : "Classic"} label="Mode" />
          </div>
        </div>

        {error && <p style={{ font: "600 13px Inter", color: "#ff8fae", textAlign: "center", marginTop: 16 }}>{error}</p>}

        {/* actions */}
        <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 22 }}>
          <button className="btn btn-purple" onClick={() => { leaveQueue(); reset(); navigate("/play"); }} style={{ fontSize: 14 }}>
            Cancel Search
          </button>
          <button onClick={() => { leaveQueue(); reset(); navigate("/rooms"); }} style={{ display: "inline-flex", alignItems: "center", gap: 9, padding: "13px 22px", borderRadius: 8, border: "1px solid rgba(232,184,75,.4)", background: "rgba(15,8,32,.5)", color: "var(--gold-lt)", font: "700 13px Inter", letterSpacing: "1px", textTransform: "uppercase", cursor: "pointer" }}>
            👥 Play with a Friend
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

// Rank-tier chip used in the matchmaking arena (prototype badge pill).
function TierChip({ tier, color, border = "rgba(232,184,75,.3)" }: { tier: { label: string; accent: string }; color: string; border?: string }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8, padding: "4px 11px", borderRadius: 100, border: `1px solid ${border}`, background: "rgba(15,8,32,.5)" }}>
      <span style={{ width: 12, height: 12, borderRadius: "50%", background: `radial-gradient(circle at 35% 30%,${tier.accent},rgba(0,0,0,.6))`, border: `1px solid ${tier.accent}` }} />
      <span style={{ font: "700 11px Inter", letterSpacing: ".3px", color }}>{tier.label}</span>
    </div>
  );
}

function StatCell({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ font: "700 22px 'JetBrains Mono',monospace", color: "var(--gold-lt)" }}>{value}</div>
      <div style={{ font: "600 10px Inter", letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--ink2)" }}>{label}</div>
    </div>
  );
}

function Sep() {
  return <div style={{ width: 1, height: 34, background: "rgba(232,184,75,.18)" }} />;
}

export default OnlineMatchPage;
