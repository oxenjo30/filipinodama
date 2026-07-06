import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { createInitialState } from "@dama/game-engine";
import { Frame, Button, Board, Divider, SectionTitle } from "../../components";
import { emblem } from "../../lib/emblems";
import { useAppStore } from "../../stores/appStore";

/** Featured game modes shown on the home dashboard (prototype copy). */
type Mode = {
  title: string;
  desc: string;
  emblemKey: string;
  btn: "blue" | "red" | "green" | "purple";
  border: string;
  action: "ai" | "toast";
  toast?: string;
};

const MODES: Mode[] = [
  {
    title: "Classic Mode",
    desc: "Timeless Dama fun for everyone.",
    emblemKey: "mc-classic",
    btn: "blue",
    border: "rgba(60,110,200,.55)",
    action: "toast",
    toast: "Online Classic matches are coming soon — try Play vs AI!",
  },
  {
    title: "Ranked Mode",
    desc: "Climb the ladder, prove your skill.",
    emblemKey: "mc-ranked",
    btn: "red",
    border: "rgba(180,60,70,.55)",
    action: "toast",
    toast: "Ranked ladder is coming soon.",
  },
  {
    title: "Play vs AI",
    desc: "Practice offline against the computer.",
    emblemKey: "mc-training",
    btn: "green",
    border: "rgba(50,150,100,.55)",
    action: "ai",
  },
  {
    title: "Kingdom Mode",
    desc: "Conquer kingdoms, unlock rewards.",
    emblemKey: "mc-kingdom",
    btn: "purple",
    border: "rgba(140,90,210,.55)",
    action: "toast",
    toast: "Kingdom Mode is coming soon.",
  },
];

const QUICK_STATS: { value: string; label: string }[] = [
  { value: "24", label: "Matches Won" },
  { value: "68%", label: "Win Rate" },
  { value: "1250", label: "Trophies" },
  { value: "7", label: "Day Streak" },
];

export function HomePage() {
  const navigate = useNavigate();
  const showToast = useAppStore((s) => s.showToast);
  // A static full opening position for the decorative hero board.
  const heroState = useMemo(() => createInitialState(), []);

  return (
    <div
      style={{
        maxWidth: 1560,
        margin: "0 auto",
        padding: 26,
        display: "grid",
        gridTemplateColumns: "minmax(0,1fr) 340px",
        gap: 22,
        alignItems: "start",
      }}
      className="fd-home-grid"
    >
      {/* LEFT COLUMN */}
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        {/* HERO */}
        <Frame style={{ padding: 34, overflow: "hidden" }}>
          <div className="fd-hero-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, alignItems: "center" }}>
            <div>
              <div style={{ font: "700 12px Inter", letterSpacing: 3, color: "var(--gold)", marginBottom: 16 }}>
                ✦ STRATEGY · HERITAGE · VICTORY ✦
              </div>
              <h1 style={{ margin: 0, font: "800 clamp(28px,3vw,44px)/1.05 Cinzel,serif" }}>
                <span
                  style={{
                    background: "linear-gradient(180deg,#f7e2a0,#d5a63a)",
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    color: "transparent",
                  }}
                >
                  CLASSIC FILIPINO DAMA,
                </span>
                <br />
                <span style={{ color: "#efe7fb" }}>REIMAGINED FOR ONLINE PLAY</span>
              </h1>
              <p style={{ font: "400 15px/1.6 Inter", color: "var(--ink)", maxWidth: 440, margin: "18px 0 26px" }}>
                Challenge the AI, sharpen your strategy, and rise through the ranks in the timeless
                game of Filipino Dama.
              </p>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                <Button variant="red" onClick={() => navigate("/play")} style={{ fontSize: 15, padding: "15px 26px" }}>
                  ⚔ Play Now
                </Button>
                <Button variant="purple" onClick={() => navigate("/learn")} style={{ fontSize: 15, padding: "15px 26px" }}>
                  📖 Learn the Rules
                </Button>
                <button
                  onClick={() => showToast("Private rooms are coming soon.")}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 9,
                    padding: "15px 22px",
                    borderRadius: 8,
                    border: "1px solid rgba(232,184,75,.4)",
                    background: "rgba(15,8,32,.5)",
                    color: "var(--gold-lt)",
                    font: "700 13px Inter",
                    letterSpacing: 1,
                    textTransform: "uppercase",
                    cursor: "pointer",
                  }}
                >
                  👥 Private Room
                </button>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: "min(100%,360px)" }}>
                <Board state={heroState} />
              </div>
            </div>
          </div>
        </Frame>

        {/* FEATURED MODES */}
        <Divider>Featured Game Modes</Divider>
        <div className="fd-modes-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
          {MODES.map((m) => (
            <Frame key={m.title} style={{ padding: 18, display: "flex", flexDirection: "column", gap: 11, borderColor: m.border }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <img
                  src={emblem(m.emblemKey)}
                  alt=""
                  style={{ width: 48, height: 48, flex: "none", objectFit: "contain" }}
                />
                <div style={{ font: "700 16px Cinzel,serif", color: "var(--gold-lt)", lineHeight: 1.12 }}>
                  {m.title}
                </div>
              </div>
              <div style={{ font: "400 13px/1.45 Inter", color: "var(--ink)" }}>{m.desc}</div>
              <Button
                variant={m.btn}
                block
                style={{ marginTop: "auto" }}
                onClick={() => (m.action === "ai" ? navigate("/play/ai") : showToast(m.toast!))}
              >
                Play Now
              </Button>
            </Frame>
          ))}
        </div>
      </div>

      {/* RIGHT RAIL */}
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <Frame style={{ padding: 20, textAlign: "center" }}>
          <SectionTitle>Jump Back In</SectionTitle>
          <p style={{ font: "400 13px/1.5 Inter", color: "var(--ink)", margin: "8px 0 16px" }}>
            Sharpen your tactics against the computer at Easy, Normal, or Hard.
          </p>
          <Button variant="red" block onClick={() => navigate("/play/ai")}>
            ⚔ Play vs AI
          </Button>
        </Frame>

        <Frame style={{ padding: 20 }}>
          <SectionTitle>Quick Stats</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {QUICK_STATS.map((q) => (
              <div key={q.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ color: "var(--gold)" }}>✦</span>
                <div>
                  <div style={{ font: "700 16px 'JetBrains Mono',monospace" }}>{q.value}</div>
                  <div style={{ font: "500 11px Inter", color: "var(--ink2)" }}>{q.label}</div>
                </div>
              </div>
            ))}
          </div>
        </Frame>

        <Frame style={{ padding: 20, textAlign: "center" }}>
          <SectionTitle>Play with Friends</SectionTitle>
          <p style={{ font: "400 12px/1.5 Inter", color: "var(--ink)", margin: "6px 0 14px" }}>
            Team up, create private rooms, and battle rivals — arriving soon.
          </p>
          <Button variant="purple" block onClick={() => showToast("Friends & private rooms are coming soon.")}>
            Invite a Friend
          </Button>
        </Frame>
      </div>
    </div>
  );
}

export default HomePage;
