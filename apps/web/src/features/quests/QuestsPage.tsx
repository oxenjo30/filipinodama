import { useAppStore } from "../../stores/appStore";

/**
 * QuestsPage (/quests) — ported faithfully from the approved prototype
 * (handoff lines 1473-1548). Daily + seasonal quest definitions with progress
 * bars and gold rewards.
 *
 * STALE-DATA RULE: we have no real per-user match activity yet, so ALL quest
 * progress is honest ZERO (0 / goal). Every quest therefore renders in the
 * "not started" state — purple bar at 2% (matches prototype's min-2% rule),
 * a disabled "Locked" claim button, and the muted row styling. No quest is
 * ever shown as done/claimable, so Claim never fires against fake progress.
 * The quest DEFINITIONS (titles, goals, rewards) come straight from the JS.
 */

type Quest = {
  id: string;
  title: string;
  desc: string;
  goal: number;
  reward: number;
};

const dailyQuests: Quest[] = [
  { id: "d_play", title: "Into the Arena", desc: "Play 2 matches today", goal: 2, reward: 150 },
  { id: "d_win", title: "Taste of Victory", desc: "Win 2 matches today", goal: 2, reward: 300 },
  { id: "d_cap", title: "Aggressor", desc: "Capture 12 pieces today", goal: 12, reward: 250 },
];

const seasonQuests: Quest[] = [
  { id: "s_ranked", title: "Ranked Climber", desc: "Win 10 ranked matches", goal: 10, reward: 1000 },
  { id: "s_play", title: "Centurion", desc: "Play 25 matches", goal: 25, reward: 1200 },
  { id: "s_streak", title: "Unstoppable", desc: "Win 5 matches in a row", goal: 5, reward: 900 },
  { id: "s_cap", title: "Grand Capturer", desc: "Capture 100 pieces", goal: 100, reward: 1500 },
];

// ── "not started" state styling (verbatim from the prototype mkQ else-branch) ──
const ROW_BORDER = "rgba(232,184,75,.16)";
const ROW_BG = "rgba(255,255,255,.02)";
const BAR_FILL = "linear-gradient(90deg,#b98bff,#7a5bd6)";
const BTN_STYLE: React.CSSProperties = {
  flex: "none",
  padding: "8px 15px",
  borderRadius: 9,
  font: "800 12px Inter",
  letterSpacing: ".4px",
  whiteSpace: "nowrap",
  border: "1px solid rgba(232,184,75,.2)",
  background: "rgba(15,8,32,.5)",
  color: "var(--ink2)",
  cursor: "default",
};

function QuestRow({ q, onClaim }: { q: Quest; onClaim: () => void }) {
  const cur = 0; // honest zero — no real activity yet
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "14px 16px",
        borderRadius: 12,
        border: `1px solid ${ROW_BORDER}`,
        background: ROW_BG,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 9, flexWrap: "wrap" }}>
          <span style={{ font: "700 15px Inter", color: "#f2e9d2" }}>{q.title}</span>
          <span style={{ font: "500 12.5px Inter", color: "var(--ink2)" }}>{q.desc}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <div
            style={{
              flex: 1,
              height: 8,
              borderRadius: 6,
              background: "rgba(0,0,0,.4)",
              overflow: "hidden",
              border: "1px solid rgba(232,184,75,.12)",
            }}
          >
            <div style={{ height: "100%", width: "2%", background: BAR_FILL, borderRadius: 6 }} />
          </div>
          <span style={{ flex: "none", font: "700 12px 'JetBrains Mono',monospace", color: "var(--ink)" }}>
            {cur} / {q.goal}
          </span>
        </div>
      </div>
      <div
        style={{
          flex: "none",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 8,
          minWidth: 96,
        }}
      >
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            font: "800 14px 'JetBrains Mono',monospace",
            color: "#f2d493",
            whiteSpace: "nowrap",
          }}
        >
          +{q.reward} 🪙
        </span>
        <button type="button" disabled onClick={onClaim} style={BTN_STYLE}>
          Locked
        </button>
      </div>
    </div>
  );
}

export function QuestsPage() {
  const gold = useAppStore((s) => s.gold);
  const showToast = useAppStore((s) => s.showToast);

  const onClaim = () => showToast("Quest rewards arrive with online play.");

  return (
    <div
      data-screen-label="Quests"
      style={{
        maxWidth: 860,
        margin: "0 auto",
        padding: 26,
        display: "flex",
        flexDirection: "column",
        gap: 22,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ font: "700 12px Inter", letterSpacing: 3, color: "var(--gold)" }}>✦ PROGRESSION ✦</div>
          <h1 style={{ margin: "9px 0 5px", font: "800 clamp(26px,3.4vw,36px) Cinzel,serif", color: "var(--gold-lt)" }}>
            Quests &amp; Achievements
          </h1>
          <p style={{ margin: 0, maxWidth: 520, font: "400 14px Inter", color: "var(--ink)", lineHeight: 1.5 }}>
            Complete goals to earn 🪙 Gold you can spend in the Store. Daily quests refresh at midnight; seasonal goals
            last all season.
          </p>
        </div>
        <span className="pill" style={{ color: "#f2d493", whiteSpace: "nowrap" }}>
          <img
            src="/assets/ic-coin.png"
            alt=""
            style={{ width: 18, height: 18, display: "block" }}
          />
          {gold.toLocaleString()}
        </span>
      </div>

      {/* DAILY */}
      <div className="frame" style={{ padding: "22px 22px 8px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 16,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <span style={{ font: "800 19px Cinzel,serif", color: "var(--gold-lt)" }}>Daily Quests</span>
            <span
              style={{
                font: "700 10px 'JetBrains Mono',monospace",
                letterSpacing: ".5px",
                color: "var(--ink2)",
                border: "1px solid rgba(232,184,75,.22)",
                borderRadius: 100,
                padding: "3px 9px",
              }}
            >
              RESETS AT MIDNIGHT
            </span>
          </div>
          <span style={{ font: "700 12px Inter", color: "var(--ink2)" }}>0 / {dailyQuests.length} claimed</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingBottom: 14 }}>
          {dailyQuests.map((q) => (
            <QuestRow key={q.id} q={q} onClaim={onClaim} />
          ))}
        </div>
      </div>

      {/* SEASONAL */}
      <div className="frame" style={{ padding: "22px 22px 8px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 16,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <span style={{ font: "800 19px Cinzel,serif", color: "var(--gold-lt)" }}>Seasonal Goals</span>
            <span
              style={{
                font: "700 10px 'JetBrains Mono',monospace",
                letterSpacing: ".5px",
                color: "#d5a63a",
                border: "1px solid rgba(232,184,75,.35)",
                borderRadius: 100,
                padding: "3px 9px",
              }}
            >
              SEASON OF THE RAJAH
            </span>
          </div>
          <span style={{ font: "700 12px Inter", color: "var(--ink2)" }}>0 / {seasonQuests.length} claimed</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingBottom: 14 }}>
          {seasonQuests.map((q) => (
            <QuestRow key={q.id} q={q} onClaim={onClaim} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default QuestsPage;
