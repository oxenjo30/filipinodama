import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "../../stores/appStore";

/**
 * LeaderboardPage — reproduced from the prototype's Leaderboard screen
 * (handoff/FilipinoDama Royal.dc.html, lines 770-886; data lines 3515-3536).
 *
 * The GLOBAL podium + ranked table stay populated (ambient big-platform data,
 * per the stale-data exception — this is the prototype's own leaderboard data).
 * The "Your Rank" surfaces are HONEST for a new player: unranked until they
 * play ranked matches (no fake #37 / Top 1.05%).
 */

const SB = (n: string) => `/assets/${n}`;
const AV = (n: string) => `/assets/avatars/${n}.png`;

// prototype DATA['12|Global'] (line 3517-3518)
const PODIUM = [
  { rank: 1, name: "Lakan", tier: "Grandmaster III", rating: 3215, av: "champion", accent: "#F5D783", medal: "medal-1.png" },
  { rank: 2, name: "Maganda", tier: "Grandmaster II", rating: 2845, av: "dayang", accent: "#c7d0dc", medal: "medal-2.png" },
  { rank: 3, name: "MasterLink", tier: "Grandmaster I", rating: 2510, av: "strategist", accent: "#c98a5a", medal: "medal-3.png" },
];
const ROWS = [
  { rank: 4, name: "DamiQueen", tier: "Grandmaster I", rating: 2450, wr: "64.3%", streak: 9, bg: "#c07a3a", tierColor: "#c07a3a" },
  { rank: 5, name: "Talkikero", tier: "Master I", rating: 2320, wr: "62.1%", streak: 7, bg: "#7a5da8", tierColor: "#a06bff" },
  { rank: 6, name: "MasterTrink", tier: "Master I", rating: 2250, wr: "60.8%", streak: 6, bg: "#3f79d6", tierColor: "#a06bff" },
  { rank: 7, name: "MagalingLang", tier: "Diamond III", rating: 2180, wr: "58.9%", streak: 10, bg: "#2f8f5b", tierColor: "#4bc4e8" },
  { rank: 8, name: "PinoyDamaPro", tier: "Diamond II", rating: 2120, wr: "57.2%", streak: 5, bg: "#a83744", tierColor: "#4bc4e8" },
  { rank: 9, name: "KingMove", tier: "Diamond II", rating: 2050, wr: "56.1%", streak: 6, bg: "#c99a2e", tierColor: "#4bc4e8" },
  { rank: 10, name: "StrategistPH", tier: "Diamond I", rating: 2010, wr: "55.3%", streak: 4, bg: "#5a3a9a", tierColor: "#4bc4e8" },
];

// prototype seasonStats / topGuilds / liveClimbers rails (ambient platform data)
const SEASON_STATS = [
  { k: "Total Players", v: "128,945" },
  { k: "Matches Today", v: "56,230" },
  { k: "Avg. Rating", v: "1,412" },
  { k: "Top Rating", v: "3,215" },
  { k: "Days Left", v: "18" },
];
const TOP_GUILDS = [
  { rank: 1, name: "Anak ng Araw", pts: "48,210" },
  { rank: 2, name: "Bayang Dama", pts: "44,905" },
  { rank: 3, name: "Mandirigma", pts: "41,330" },
];
const LIVE_CLIMBERS = [
  { rank: 1, name: "SharpDama", rating: 2190, up: 42 },
  { rank: 2, name: "RajahRun", rating: 1980, up: 31 },
  { rank: 3, name: "NewbieSlayer", rating: 1760, up: 28 },
  { rank: 4, name: "BoardBaron", rating: 1540, up: 19 },
  { rank: 5, name: "DamaProdigy", rating: 1320, up: 15 },
];

const SCOPES = ["Global", "Friends", "Guild"] as const;
type Scope = (typeof SCOPES)[number];

const GRID = "64px 1fr 96px 92px 96px";

export function LeaderboardPage() {
  const navigate = useNavigate();
  const showToast = useAppStore((s) => s.showToast);
  const displayName = useAppStore((s) => s.displayName);
  const [scope, setScope] = useState<Scope>("Global");

  // Friends/Guild scopes: honest empty (the user has no friends/guild yet).
  const populated = scope === "Global";

  return (
    <div className="fd-lb-grid" style={{ maxWidth: 1560, margin: "0 auto", padding: 26, display: "grid", gridTemplateColumns: "280px minmax(0,1fr) 300px", gap: 20, alignItems: "start" }}>
      {/* LEFT RAIL */}
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div className="frame" style={{ padding: 22, textAlign: "center" }}>
          <img src={SB("me-banner.png")} alt="" style={{ width: 110, height: 130, objectFit: "contain", margin: "0 auto", display: "block", filter: "drop-shadow(0 8px 18px rgba(0,0,0,.5))" }} />
          <div style={{ font: "800 22px Cinzel,serif", color: "var(--gold-lt)", marginTop: 10 }}>Season 12</div>
          <div style={{ font: "400 12px/1.5 Inter", color: "var(--ink)", margin: "8px 0 14px" }}>Conquer the board.<br />Earn glory. Be the legend.</div>
          <button className="btn btn-purple" onClick={() => navigate("/season")} style={{ width: "100%" }}>📖 Season Overview</button>
        </div>
        <div className="frame" style={{ padding: 20 }}>
          <div className="ptitle">Season Stats</div>
          {SEASON_STATS.map((st) => (
            <div key={st.k} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid rgba(232,184,75,.1)" }}>
              <span style={{ font: "500 13px Inter", color: "var(--ink)" }}>{st.k}</span>
              <span style={{ font: "700 14px 'JetBrains Mono',monospace", color: "var(--gold-lt)" }}>{st.v}</span>
            </div>
          ))}
        </div>
        <div className="frame" style={{ padding: 20 }}>
          <div className="ptitle">Top Guilds</div>
          {TOP_GUILDS.map((g) => (
            <div key={g.rank} style={{ display: "flex", alignItems: "center", gap: 11, padding: "9px 0", borderTop: "1px solid rgba(232,184,75,.1)" }}>
              <span style={{ font: "800 14px 'JetBrains Mono',monospace", color: "var(--gold)", width: 16 }}>{g.rank}</span>
              <span style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(232,184,75,.12)", border: "1px solid rgba(232,184,75,.3)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--gold-lt)" }}>🛡</span>
              <span style={{ flex: 1, font: "600 13px Inter" }}>{g.name}</span>
              <span style={{ font: "700 12px 'JetBrains Mono',monospace", color: "var(--gold)" }}>🏆 {g.pts}</span>
            </div>
          ))}
        </div>
      </div>

      {/* CENTER */}
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ flex: 1, display: "flex", gap: 8, minWidth: 260 }}>
            {SCOPES.map((t) => (
              <button
                key={t}
                onClick={() => setScope(t)}
                style={{
                  padding: "9px 16px", borderRadius: 8, cursor: "pointer",
                  font: "700 12px Inter", letterSpacing: ".5px", textTransform: "uppercase",
                  border: scope === t ? "1px solid rgba(232,184,75,.55)" : "1px solid rgba(232,184,75,.2)",
                  background: scope === t ? "linear-gradient(180deg,#3d2a6b,#241640)" : "rgba(15,8,32,.5)",
                  color: scope === t ? "var(--gold-lt)" : "var(--ink)",
                }}
              >
                {t}
              </button>
            ))}
          </div>
          <span className="pill" style={{ color: "var(--gold-lt)", border: "1px solid rgba(232,184,75,.4)", background: "rgba(232,184,75,.08)" }}>Season 12</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, font: "600 12px Inter", color: "var(--ink)" }}>⏳ Season ends in: 18d 04:12:33</span>
        </div>

        {populated ? (
          <>
            {/* PODIUM */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, marginTop: 58, alignItems: "start" }}>
              {[PODIUM[1], PODIUM[0], PODIUM[2]].map((p) => {
                const first = p.rank === 1;
                return (
                  <div key={p.rank} className="frame" style={{ position: "relative", padding: "20px 16px", textAlign: "center", borderColor: p.accent, paddingTop: first ? 34 : 24, marginTop: first ? -44 : 0, overflow: "visible" }}>
                    <img src={SB(p.medal)} alt="" style={{ position: "absolute", top: -26, left: "50%", transform: "translateX(-50%)", width: first ? 58 : 48, height: first ? 58 : 48, objectFit: "contain", filter: "drop-shadow(0 6px 14px rgba(0,0,0,.5))" }} />
                    <div style={{ width: first ? 84 : 70, height: first ? 84 : 70, margin: "6px auto 0", borderRadius: "50%", overflow: "hidden", border: `3px solid ${p.accent}` }}>
                      <img src={AV(p.av)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", filter: "brightness(1.25)" }} />
                    </div>
                    <div style={{ font: "700 17px Cinzel,serif", color: "var(--gold-lt)", marginTop: 9 }}>{p.name}</div>
                    <div style={{ font: "500 12px Inter", color: "var(--ink)", marginTop: 2 }}>{p.tier}</div>
                    <div style={{ font: "700 16px 'JetBrains Mono',monospace", color: "var(--gold)", marginTop: 7 }}>🏆 {p.rating.toLocaleString()}</div>
                  </div>
                );
              })}
            </div>

            {/* TABLE */}
            <div className="frame" style={{ padding: "10px 6px" }}>
              <div style={{ display: "grid", gridTemplateColumns: GRID, gap: 8, padding: "12px 16px", font: "700 11px Inter", letterSpacing: "1px", textTransform: "uppercase", color: "var(--ink2)" }}>
                <span>Rank</span><span>Player</span><span style={{ textAlign: "center" }}>🏆 Rating</span><span style={{ textAlign: "center" }}>Win Rate</span><span style={{ textAlign: "center" }}>Streak</span>
              </div>
              {ROWS.map((r) => (
                <div key={r.rank} style={{ display: "grid", gridTemplateColumns: GRID, gap: 8, alignItems: "center", padding: "11px 16px", borderTop: "1px solid rgba(232,184,75,.1)" }}>
                  <span style={{ font: "800 15px 'JetBrains Mono',monospace", color: "var(--ink)" }}>{r.rank}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 11 }}>
                    <span style={{ width: 34, height: 34, borderRadius: "50%", background: `radial-gradient(circle at 35% 30%,${r.bg},rgba(0,0,0,.5))`, border: "1px solid rgba(232,184,75,.3)" }} />
                    <span>
                      <span style={{ font: "600 14px Inter", display: "block" }}>{r.name}</span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 4, padding: "2px 8px", borderRadius: 100, border: "1px solid rgba(232,184,75,.2)", background: "rgba(15,8,32,.5)" }}>
                        <span style={{ width: 9, height: 9, borderRadius: "50%", background: `radial-gradient(circle at 35% 30%,${r.tierColor},rgba(0,0,0,.6))`, border: `1px solid ${r.tierColor}` }} />
                        <span style={{ font: "600 10px Inter", color: r.tierColor }}>{r.tier}</span>
                      </span>
                    </span>
                  </span>
                  <span style={{ textAlign: "center", font: "700 14px 'JetBrains Mono',monospace", color: "var(--gold-lt)" }}>{r.rating.toLocaleString()}</span>
                  <span style={{ textAlign: "center", font: "600 13px 'JetBrains Mono',monospace", color: "var(--ink)" }}>{r.wr}</span>
                  <span style={{ textAlign: "center", font: "600 13px Inter", color: "#ff9a5a" }}>🔥 {r.streak}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="frame" style={{ padding: "44px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 34, marginBottom: 10 }}>{scope === "Friends" ? "🤝" : "🛡"}</div>
            <div style={{ font: "700 16px Cinzel,serif", color: "var(--gold-lt)" }}>{scope === "Friends" ? "No friends on the ladder yet" : "You're not in a guild yet"}</div>
            <div style={{ font: "400 13px Inter", color: "var(--ink)", margin: "8px 0 18px" }}>
              {scope === "Friends" ? "Add friends to see how you stack up against them." : "Join or create a guild to see the guild ladder."}
            </div>
            <button className="btn btn-purple" onClick={() => navigate(scope === "Friends" ? "/friends" : "/guilds")}>
              {scope === "Friends" ? "Find Friends" : "Browse Guilds"}
            </button>
          </div>
        )}

        {/* YOUR RANK — honest: new player is unranked */}
        <div className="frame" style={{ padding: "4px 6px", borderColor: "var(--gold)", boxShadow: "inset 0 0 0 4px rgba(15,8,32,.55),inset 0 0 0 5px rgba(232,184,75,.4),0 0 26px rgba(232,184,75,.2)" }}>
          <div style={{ display: "grid", gridTemplateColumns: GRID, gap: 8, alignItems: "center", padding: "14px 16px" }}>
            <span style={{ font: "800 15px 'JetBrains Mono',monospace", color: "var(--gold-lt)" }}>—</span>
            <span style={{ display: "flex", alignItems: "center", gap: 11 }}>
              <span style={{ width: 34, height: 34, borderRadius: "50%", background: "radial-gradient(circle at 35% 30%,#5a3a9a,rgba(0,0,0,.5))", border: "1px solid rgba(232,184,75,.3)" }} />
              <span>
                <span style={{ font: "700 14px Inter", display: "block" }}>{displayName} <span style={{ color: "var(--gold)", fontWeight: 600 }}>(You)</span></span>
                <span style={{ font: "500 11px Inter", color: "var(--ink2)", marginTop: 3, display: "block" }}>Unranked — play ranked matches to earn a spot</span>
              </span>
            </span>
            <span style={{ textAlign: "center", font: "700 14px 'JetBrains Mono',monospace", color: "var(--ink2)" }}>—</span>
            <span style={{ textAlign: "center", font: "600 13px 'JetBrains Mono',monospace", color: "var(--ink2)" }}>—</span>
            <span style={{ textAlign: "center", font: "600 13px Inter", color: "var(--ink2)" }}>—</span>
          </div>
        </div>
      </div>

      {/* RIGHT RAIL */}
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div className="frame" style={{ padding: 22, textAlign: "center" }}>
          <div className="ptitle">Your Rank</div>
          <img src={SB("medal-3.png")} alt="" style={{ width: 72, height: 72, objectFit: "contain", margin: "0 auto", display: "block", opacity: 0.5, filter: "grayscale(.6)" }} />
          <div style={{ font: "800 22px 'JetBrains Mono',monospace", color: "var(--ink2)", marginTop: 6 }}>Unranked</div>
          <div style={{ font: "600 12px Inter", color: "var(--ink2)" }}>Play ranked to get placed</div>
          <button className="btn btn-red" onClick={() => showToast("Ranked matchmaking arrives with online play.")} style={{ width: "100%", marginTop: 14 }}>Play Ranked</button>
        </div>
        <div className="frame" style={{ padding: 20 }}>
          <div className="ptitle">Rank Progress</div>
          <div style={{ height: 14, borderRadius: 100, background: "rgba(0,0,0,.4)", border: "1px solid rgba(232,184,75,.25)", overflow: "hidden" }}>
            <div style={{ width: "0%", height: "100%", background: "linear-gradient(90deg,#c99a2e,#f5d88a)" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 7 }}>
            <span style={{ font: "700 12px 'JetBrains Mono',monospace", color: "var(--ink)" }}>0 / 100</span>
            <span style={{ font: "500 11px Inter", color: "var(--ink2)" }}>Win to earn Rank Points</span>
          </div>
        </div>
        <div className="frame" style={{ padding: 20 }}>
          <div className="ptitle">Live Climbers</div>
          {LIVE_CLIMBERS.map((c) => (
            <div key={c.rank} style={{ display: "flex", alignItems: "center", gap: 11, padding: "9px 0", borderTop: "1px solid rgba(232,184,75,.1)" }}>
              <span style={{ font: "800 13px 'JetBrains Mono',monospace", color: "var(--ink2)", width: 14 }}>{c.rank}</span>
              <span style={{ width: 30, height: 30, borderRadius: "50%", background: "radial-gradient(circle at 35% 30%,#5a3a9a,rgba(0,0,0,.5))", border: "1px solid rgba(232,184,75,.25)" }} />
              <span style={{ flex: 1, font: "600 13px Inter" }}>{c.name}</span>
              <span style={{ font: "700 12px 'JetBrains Mono',monospace", color: "var(--gold)" }}>🏆 {c.rating.toLocaleString()}</span>
              <span style={{ font: "700 12px Inter", color: "#3fbf6f" }}>▲{c.up}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default LeaderboardPage;
