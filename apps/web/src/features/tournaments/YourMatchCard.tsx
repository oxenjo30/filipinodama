import { useEffect, useState } from "react";
import { Avatar } from "../../components";
import { formatCountdown, secondsUntil, type TournamentMyMatch } from "./types";

/**
 * YourMatchCard — the player's own slot, at the top of a running Cup.
 *
 * This is the surface that replaced "find your opponent in the bracket and go
 * arrange a game somewhere else". Both players press Ready; when the second one
 * does, the server creates the match and drops them both onto the board, so this
 * card never navigates by itself — it just reports state until EV.tournamentStart
 * arrives.
 *
 * READY IS A COMMITMENT. There is no un-ready button because there is no
 * un-ready: the first Ready starts the opponent's no-show clock, and letting a
 * player take it back would let them stall the bracket indefinitely. The button
 * says so before it is pressed.
 */

function ReadyPill({ label, ready }: { label: string; ready: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 11px",
        borderRadius: 100,
        font: "700 11px Inter",
        color: ready ? "#7ee6a4" : "var(--ink2)",
        background: ready ? "rgba(47,143,91,.16)" : "rgba(255,255,255,.04)",
        border: `1px solid ${ready ? "rgba(63,191,111,.4)" : "rgba(255,255,255,.09)"}`,
      }}
    >
      <span aria-hidden="true">{ready ? "✓" : "○"}</span>
      {label} {ready ? "ready" : "not ready"}
    </span>
  );
}

export function YourMatchCard({
  myMatch,
  pending,
  onReady,
  onRejoin,
}: {
  myMatch: TournamentMyMatch;
  pending: boolean;
  onReady: () => void;
  onRejoin: () => void;
}) {
  // Re-render once a second only while a deadline is actually running.
  const [, tick] = useState(0);
  const counting = !!myMatch.deadlineAt && !myMatch.matchId;
  useEffect(() => {
    if (!counting) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [counting]);

  const live = !!myMatch.matchId;
  const left = secondsUntil(myMatch.deadlineAt);
  const urgent = counting && left <= 60;

  return (
    <div
      className="frame"
      style={{
        padding: "18px 22px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        border: "1px solid var(--gold)",
        background: "linear-gradient(180deg,rgba(232,184,75,.07),rgba(232,184,75,.02))",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ font: "800 13px Inter", letterSpacing: ".6px", textTransform: "uppercase", color: "var(--gold)" }}>
          Your Match
        </div>
        <div style={{ font: "700 11.5px Inter", color: "var(--ink2)" }}>{myMatch.roundLabel}</div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Avatar src={myMatch.opponent?.avatarUrl ?? "champion"} size={44} ring={false} />
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ font: "500 11px Inter", color: "var(--ink2)" }}>You play</div>
          <div style={{ font: "800 15px Inter", color: "#f2e9d2" }}>
            {myMatch.opponent ? (
              <>
                {myMatch.opponent.username}{" "}
                <span style={{ color: "var(--ink2)", fontFamily: "'JetBrains Mono',monospace", fontWeight: 500, fontSize: 12 }}>
                  #{myMatch.opponent.tag}
                </span>
              </>
            ) : (
              "Waiting for an opponent"
            )}
          </div>
        </div>
        {counting && (
          <div style={{ textAlign: "right" }}>
            <div style={{ font: "500 10.5px Inter", color: "var(--ink2)" }}>
              {myMatch.iAmReady ? "Opponent must ready in" : "You must ready in"}
            </div>
            <div
              style={{
                font: "800 20px 'JetBrains Mono',monospace",
                color: urgent ? "#ff9aa8" : "var(--gold-lt)",
              }}
            >
              {formatCountdown(left)}
            </div>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <ReadyPill label="You" ready={myMatch.iAmReady} />
        <ReadyPill label={myMatch.opponent?.username ?? "Opponent"} ready={myMatch.opponentReady} />
      </div>

      {live ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-gold" onClick={onRejoin} style={{ padding: "10px 22px", font: "800 12px Inter" }}>
            Rejoin your match
          </button>
          <span style={{ font: "600 12px Inter", color: "var(--ink2)" }}>Your game is in progress.</span>
        </div>
      ) : myMatch.iAmReady ? (
        <div style={{ font: "700 12.5px Inter", color: "#7ee6a4" }}>
          You&rsquo;re ready — waiting for {myMatch.opponent?.username ?? "your opponent"}. The match starts by itself the
          moment they&rsquo;re ready too.
        </div>
      ) : !myMatch.opponent ? (
        <div style={{ font: "600 12.5px Inter", color: "var(--ink2)" }}>
          This slot is still waiting on the result of an earlier match.
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <button
            type="button"
            disabled={pending}
            onClick={onReady}
            style={{
              padding: "11px 26px",
              borderRadius: 9,
              font: "800 13px Inter",
              letterSpacing: ".4px",
              border: "1px solid var(--gold)",
              background: "linear-gradient(180deg,#f0c24b,#c98b2e)",
              color: "#2a1607",
              cursor: pending ? "default" : "pointer",
              opacity: pending ? 0.7 : 1,
            }}
          >
            {pending ? "…" : "I'm Ready"}
          </button>
          <span style={{ font: "500 11.5px Inter", color: "var(--ink2)", maxWidth: 380 }}>
            {myMatch.opponentReady
              ? "Your opponent is waiting — press Ready to start immediately."
              : "Readying up starts a countdown for your opponent. You can't undo it."}
          </span>
        </div>
      )}
    </div>
  );
}

export default YourMatchCard;
