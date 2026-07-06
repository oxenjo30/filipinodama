import { useNavigate } from "react-router-dom";
import { Frame, SectionTitle } from "../../components";
import { emblem } from "../../lib/emblems";
import { useAppStore } from "../../stores/appStore";

type PlayMode = {
  title: string;
  tag: string;
  tagColor: string;
  tagBg: string;
  desc: string;
  emblemKey: string;
  action: "ai" | "toast";
  toast?: string;
};

const PLAY_MODES: PlayMode[] = [
  {
    title: "Quick Match",
    tag: "Casual",
    tagColor: "#f0e2b8",
    tagBg: "rgba(232,184,75,.15)",
    desc: "Jump into an online game against a similar-skill player. Unrated.",
    emblemKey: "mode-quick",
    action: "toast",
    toast: "Online Quick Match is coming soon — try Play vs AI!",
  },
  {
    title: "Ranked Match",
    tag: "Rated",
    tagColor: "#ff9aa6",
    tagBg: "rgba(180,60,70,.18)",
    desc: "Compete on the ladder. Win for +25 trophies to climb the rankings.",
    emblemKey: "mode-ranked",
    action: "toast",
    toast: "Ranked matchmaking is coming soon.",
  },
  {
    title: "Play vs AI",
    tag: "Offline",
    tagColor: "#8ce0ad",
    tagBg: "rgba(50,150,100,.18)",
    desc: "Practice against the computer at Easy, Normal, or Hard difficulty.",
    emblemKey: "mode-vs-ai",
    action: "ai",
  },
  {
    title: "Play with a Friend",
    tag: "Private",
    tagColor: "#c9a6ff",
    tagBg: "rgba(140,90,210,.2)",
    desc: "Create a private room and invite a friend with a shareable code.",
    emblemKey: "mode-friend",
    action: "toast",
    toast: "Private rooms are coming soon.",
  },
];

const MODE_OVERVIEW: { label: string; value: string }[] = [
  { label: "Total Modes", value: "4" },
  { label: "Available Now", value: "1" },
  { label: "AI Difficulties", value: "3" },
  { label: "Players Online", value: "2,458" },
];

export function PlayHubPage() {
  const navigate = useNavigate();
  const showToast = useAppStore((s) => s.showToast);

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

      <div className="fd-hub-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 320px", gap: 24, alignItems: "start" }}>
        <div>
          <div className="fd-hub-modes" style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 18 }}>
            {PLAY_MODES.map((pm) => (
              <button
                key={pm.title}
                onClick={() => (pm.action === "ai" ? navigate("/play/ai") : showToast(pm.toast!))}
                style={{
                  padding: 22,
                  borderRadius: 16,
                  cursor: "pointer",
                  transition: ".15s",
                  background: "rgba(15,8,32,.5)",
                  border: "1.5px solid rgba(232,184,75,.16)",
                  textAlign: "left",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <img
                    src={emblem(pm.emblemKey)}
                    alt=""
                    style={{ width: 66, height: 66, flex: "none", objectFit: "contain" }}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3, flexWrap: "wrap" }}>
                      <span style={{ font: "800 20px Cinzel,serif", color: "var(--gold-lt)" }}>{pm.title}</span>
                      <span
                        style={{
                          font: "700 9px Inter",
                          letterSpacing: 1,
                          textTransform: "uppercase",
                          color: pm.tagColor,
                          background: pm.tagBg,
                          padding: "3px 8px",
                          borderRadius: 100,
                        }}
                      >
                        {pm.tag}
                      </span>
                    </div>
                    <div style={{ font: "500 13px/1.5 Inter", color: "var(--ink)" }}>{pm.desc}</div>
                  </div>
                  <div style={{ marginLeft: "auto", flex: "none", color: "var(--gold)", font: "700 20px Inter" }}>
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
          <Frame style={{ padding: 20 }}>
            <SectionTitle>Mode Overview</SectionTitle>
            {MODE_OVERVIEW.map((o) => (
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
                <span style={{ display: "flex", alignItems: "center", gap: 10, font: "500 13px Inter", color: "var(--ink)" }}>
                  <span style={{ color: "var(--gold)" }}>✦</span>
                  {o.label}
                </span>
                <span style={{ font: "700 14px 'JetBrains Mono',monospace", color: "var(--gold-lt)" }}>{o.value}</span>
              </div>
            ))}
          </Frame>
        </div>
      </div>
    </div>
  );
}

export default PlayHubPage;
