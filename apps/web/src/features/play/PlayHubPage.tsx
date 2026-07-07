import type { CSSProperties, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "../../stores/appStore";

/**
 * PlayHubPage — "/play" Choose-Mode hub, ported verbatim from the approved
 * prototype (handoff lines 295-344). Four mode cards (Quick Match, Ranked,
 * Play vs AI, Play with a Friend) beside a right rail with a Mode Overview
 * frame and a Guild Hall frame.
 *
 * Behaviours: only "Play vs AI" has a real destination (/play/ai). The three
 * online/multiplayer modes have no backend yet, so they raise an honest
 * "arrives with online play" toast rather than pretending to matchmake. The
 * Mode Overview numbers are ambient big-platform stats (allowed to stay
 * populated per the stale-data exception).
 */

const ASSET = "/assets";

/** MEDAL() — circular-masked opaque emblem crest (prototype line 2753). */
function Medal({ src, size }: { src: string; size: number }) {
  return (
    <img
      src={src}
      alt=""
      style={{
        width: size,
        height: size,
        objectFit: "cover",
        borderRadius: "50%",
        display: "block",
        boxShadow: "0 3px 10px rgba(0,0,0,.45)",
        // opaque (near-black bg) crest — brighten inside its circular mask
        filter: "brightness(1.25)",
      }}
    />
  );
}

/** IMG() — flat inline stat icon (prototype line 2752). */
function StatIcon({ src }: { src: string }) {
  return (
    <img
      src={src}
      alt=""
      style={{ width: 22, height: 22, objectFit: "contain", display: "block" }}
    />
  );
}

const CARD_STYLE: CSSProperties = {
  padding: 22,
  borderRadius: 16,
  cursor: "pointer",
  transition: ".15s",
  background: "rgba(15,8,32,.5)",
  border: "1.5px solid rgba(232,184,75,.16)",
};

function pmTag(color: string, bg: string): CSSProperties {
  return {
    font: "700 9px Inter",
    letterSpacing: 1,
    textTransform: "uppercase",
    color,
    background: bg,
    padding: "3px 8px",
    borderRadius: 100,
  };
}

type PlayMode = {
  title: string;
  tag: string;
  tagStyle: CSSProperties;
  desc: string;
  icon: ReactNode;
  onSelect: () => void;
};

type OverviewRow = { label: string; value: string; icon: ReactNode };

export function PlayHubPage() {
  const navigate = useNavigate();
  const showToast = useAppStore((s) => s.showToast);

  const playModes: PlayMode[] = [
    {
      title: "Quick Match",
      tag: "Casual",
      tagStyle: pmTag("#f0e2b8", "rgba(232,184,75,.15)"),
      desc: "Jump into an online game against a similar-skill player. Unrated.",
      icon: <Medal src={`${ASSET}/mode-quick.webp`} size={62} />,
      onSelect: () => showToast("Quick Match arrives with online play."),
    },
    {
      title: "Ranked Match",
      tag: "Rated",
      tagStyle: pmTag("#ff9aa6", "rgba(180,60,70,.18)"),
      desc: "Compete on the ladder. Win for +25 trophies to climb the rankings.",
      icon: <Medal src={`${ASSET}/mode-ranked.webp`} size={62} />,
      onSelect: () => showToast("Ranked matchmaking arrives with online play."),
    },
    {
      title: "Play vs AI",
      tag: "Offline",
      tagStyle: pmTag("#8ce0ad", "rgba(50,150,100,.18)"),
      desc: "Practice against the computer at Easy, Normal, or Hard difficulty.",
      icon: <Medal src={`${ASSET}/mode-vs-ai.webp`} size={62} />,
      onSelect: () => navigate("/play/ai"),
    },
    {
      title: "Play with a Friend",
      tag: "Private",
      tagStyle: pmTag("#c9a6ff", "rgba(140,90,210,.2)"),
      desc: "Create a private room and invite a friend with a shareable code.",
      icon: <Medal src={`${ASSET}/mode-friend.webp`} size={62} />,
      onSelect: () => showToast("Private rooms arrive with online play."),
    },
  ];

  const modeOverview: OverviewRow[] = [
    { label: "Total Modes", value: "4", icon: <StatIcon src={`${ASSET}/sb-modes.png`} /> },
    { label: "Active Players", value: "2,458", icon: <StatIcon src={`${ASSET}/sb-players.png`} /> },
    { label: "Matches Today", value: "56,230", icon: <StatIcon src={`${ASSET}/sb-matches.png`} /> },
    { label: "Total Victories", value: "4.2M", icon: <StatIcon src={`${ASSET}/sb-trophy.png`} /> },
  ];

  return (
    <div style={{ maxWidth: 1560, margin: "0 auto", padding: "36px 26px 60px" }}>
      <div style={{ textAlign: "center", marginBottom: 34 }}>
        <div style={{ font: "700 12px Inter", letterSpacing: 3, color: "var(--gold)" }}>
          ✦ CHOOSE YOUR BATTLE ✦
        </div>
        <h1 style={{ margin: "10px 0 6px", font: "800 clamp(30px,4.4vw,44px) Cinzel,serif" }}>
          <span
            style={{
              background: "linear-gradient(180deg,#f7e2a0,#d5a63a)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            Play Dama
          </span>
        </h1>
        <p style={{ font: "400 15px Inter", color: "var(--ink)", margin: 0 }}>
          Pick a game mode to begin. Win matches to earn 🏆 trophies you can spend in the Store.
        </p>
      </div>

      <div
        className="fd-hub-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0,1fr) 320px",
          gap: 24,
          alignItems: "start",
        }}
      >
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 18 }}>
            {playModes.map((pm) => (
              <button key={pm.title} onClick={pm.onSelect} style={CARD_STYLE}>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <div
                    style={{
                      width: 66,
                      height: 66,
                      flex: "none",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {pm.icon}
                  </div>
                  <div style={{ textAlign: "left", minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                      <span style={{ font: "800 20px Cinzel,serif", color: "var(--gold-lt)" }}>
                        {pm.title}
                      </span>
                      <span style={pm.tagStyle}>{pm.tag}</span>
                    </div>
                    <div style={{ font: "500 13px Inter", color: "var(--ink)", lineHeight: 1.5 }}>
                      {pm.desc}
                    </div>
                  </div>
                  <div
                    style={{ marginLeft: "auto", flex: "none", color: "var(--gold)", font: "700 20px Inter" }}
                  >
                    ›
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div style={{ display: "flex", justifyContent: "center", marginTop: 24 }}>
            <button
              onClick={() => navigate("/")}
              style={{
                padding: "13px 26px",
                borderRadius: 8,
                border: "1px solid rgba(232,184,75,.35)",
                background: "rgba(15,8,32,.5)",
                color: "var(--gold-lt)",
                font: "700 13px Inter",
                letterSpacing: 1,
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              ← Back to Home
            </button>
          </div>
        </div>

        {/* RIGHT RAIL */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div className="frame" style={{ padding: 20 }}>
            <div className="ptitle">Mode Overview</div>
            {modeOverview.map((o) => (
              <div
                key={o.label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "9px 0",
                  borderTop: "1px solid rgba(232,184,75,.12)",
                }}
              >
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    font: "500 13px Inter",
                    color: "var(--ink)",
                  }}
                >
                  <span style={{ color: "var(--gold)" }}>{o.icon}</span>
                  {o.label}
                </span>
                <span style={{ font: "700 14px 'JetBrains Mono',monospace", color: "var(--gold-lt)" }}>
                  {o.value}
                </span>
              </div>
            ))}
          </div>

          <div className="frame" style={{ padding: 20, textAlign: "center" }}>
            <div className="ptitle">Guild Hall</div>
            <img
              src={`${ASSET}/me-guild.png`}
              alt=""
              style={{
                width: 88,
                height: 88,
                objectFit: "contain",
                margin: "0 auto 6px",
                display: "block",
                filter: "drop-shadow(0 8px 16px rgba(0,0,0,.5))",
              }}
            />
            <div style={{ font: "700 17px Cinzel,serif", color: "#c9a4ff" }}>Guild Wars</div>
            <div style={{ font: "400 12px Inter", color: "var(--ink)", margin: "6px 0 14px" }}>
              Team up. Battle rivals. Defend your kingdom.
            </div>
            <button
              className="btn btn-purple"
              onClick={() => navigate("/guilds")}
              style={{ width: "100%" }}
            >
              Enter Guild Hall
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PlayHubPage;
