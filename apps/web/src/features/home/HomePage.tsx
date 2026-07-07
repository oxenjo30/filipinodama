import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { createInitialState, legalMoves, applyMove } from "@dama/game-engine";
import { DEFAULT_SETTINGS } from "@dama/shared";
import { Board } from "../../components";
import { useAppStore } from "../../stores/appStore";
import { useAuthStore } from "../../stores/authStore";
import { ICONS } from "../../lib/assets";

/**
 * HomePage — reproduced VERBATIM from the prototype's Home screen
 * (handoff/FilipinoDama Royal.dc.html, lines 186-293): hero (with the
 * "players online" pill), Featured Game Modes (4), Continue Playing + Recent
 * Updates, and the right rail (Daily Challenge / Quick Stats / Featured Match).
 */

const SB = (n: string) => `/assets/${n}`;

// Featured modes — prototype `modes` array (line 3808).
const MODES = [
  { title: "Classic Mode", desc: "Timeless Dama fun for everyone.", border: "rgba(60,110,200,.55)", btn: "btn-blue", icon: "mc-classic.png" },
  { title: "Ranked Mode", desc: "Climb the ladder, prove your skill.", border: "rgba(180,60,70,.55)", btn: "btn-red", icon: "mc-ranked.png" },
  { title: "Play vs AI", desc: "Practice offline against the computer.", border: "rgba(50,150,100,.55)", btn: "btn-green", icon: "mc-training.png" },
  { title: "Kingdom Mode", desc: "Conquer kingdoms, unlock rewards.", border: "rgba(140,90,210,.55)", btn: "btn-purple", icon: "mc-kingdom.png" },
];

// prototype `updates` (line 3816) & `quickStats` (line 3819).
const UPDATES = [
  { tag: "NEW", tagbg: "#2f8f5b", title: "Kingdom Mode is Here!", body: "Build your kingdom, conquer rivals, and earn exclusive rewards.", time: "2 days ago", bg: "rgba(74,45,122,.5)", glyph: "🏰" },
  { tag: "UPDATE", tagbg: "#2f5da8", title: "Ranked Season 12", body: "New season has begun! Climb the ranks and earn epic rewards.", time: "5 days ago", bg: "rgba(160,48,58,.4)", glyph: "🏆" },
];
const QUICK_STATS = [
  { value: "128,945", label: "Active Players", icon: "sb-players.png" },
  { value: "4.2M", label: "Matches Played", icon: "sb-matches.png" },
  { value: "56,230", label: "Ranked Wins", icon: "sb-trophy.png" },
  { value: "87", label: "Countries", icon: "sb-modes.png" },
];

export function HomePage() {
  const navigate = useNavigate();
  const showToast = useAppStore((s) => s.showToast);
  const me = useAuthStore((s) => s.me);

  // hero board — a real GameState after a few opening moves, for a lived-in look.
  const heroState = useMemo(() => {
    let s = createInitialState(DEFAULT_SETTINGS, "hero");
    for (let i = 0; i < 4; i++) {
      const mv = legalMoves(s);
      if (!mv.length || s.result) break;
      s = applyMove(s, mv[Math.floor(mv.length / 2)]);
    }
    return s;
  }, []);

  const onMode = (title: string) => {
    if (title === "Play vs AI" || title === "Classic Mode") navigate("/play/ai");
    else if (title === "Ranked Mode") {
      if (me && !me.isGuest) navigate("/play/online?mode=ranked");
      else navigate(`/login?next=${encodeURIComponent("/play/online?mode=ranked")}`);
    } else showToast("Kingdom Mode is coming soon.");
  };

  return (
    <div className="fd-home-grid" style={{ maxWidth: 1560, margin: "0 auto", padding: 26, display: "grid", gridTemplateColumns: "minmax(0,1fr) 340px", gap: 22, alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        {/* HERO */}
        <div className="frame" style={{ padding: 34, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, alignItems: "center", overflow: "hidden" }}>
          <div>
            <div style={{ font: "700 12px Inter", letterSpacing: "3px", color: "var(--gold)", marginBottom: 16 }}>✦ STRATEGY · HERITAGE · VICTORY ✦</div>
            <h1 style={{ margin: 0, font: "800 clamp(28px,3vw,44px)/1.05 Cinzel,serif" }}>
              <span style={{ background: "linear-gradient(180deg,#f7e2a0,#d5a63a)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>CLASSIC FILIPINO DAMA,</span>
              <br />
              <span style={{ color: "#efe7fb" }}>REIMAGINED FOR ONLINE PLAY</span>
            </h1>
            <p style={{ font: "400 15px/1.6 Inter", color: "var(--ink)", maxWidth: 440, margin: "18px 0 26px" }}>
              Challenge real players, sharpen your strategy, and rise through the ranks in the timeless game of Filipino Dama.
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <button className="btn btn-red" onClick={() => navigate("/play/ai")} style={{ fontSize: 15, padding: "15px 26px" }}>🌐 Play Now</button>
              <button className="btn btn-purple" onClick={() => navigate("/learn")} style={{ fontSize: 15, padding: "15px 26px" }}>📖 Learn the Rules</button>
              <button onClick={() => navigate("/rooms")} style={{ display: "inline-flex", alignItems: "center", gap: 9, padding: "15px 22px", borderRadius: 8, border: "1px solid rgba(232,184,75,.4)", background: "rgba(15,8,32,.5)", color: "var(--gold-lt)", font: "700 13px Inter", letterSpacing: "1px", textTransform: "uppercase", cursor: "pointer" }}>👥 Private Room</button>
            </div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginTop: 22, padding: "8px 14px", borderRadius: 100, border: "1px solid rgba(232,184,75,.25)", background: "rgba(15,8,32,.5)" }}>
              <div style={{ display: "flex" }}>
                <span style={{ width: 26, height: 26, borderRadius: "50%", background: "linear-gradient(160deg,#c98,#843)", border: "2px solid #1c1030" }} />
                <span style={{ width: 26, height: 26, borderRadius: "50%", background: "linear-gradient(160deg,#89c,#358)", border: "2px solid #1c1030", marginLeft: -9 }} />
              </div>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#3fbf6f", boxShadow: "0 0 8px #3fbf6f" }} />
              <span style={{ font: "600 13px Inter", color: "var(--ink)" }}><b style={{ color: "#fff" }}>2,458</b> players online</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ position: "relative", width: "min(100%,380px)", padding: "4%", borderRadius: 14, background: "linear-gradient(145deg,#f5d88a 0%,#d3a63c 45%,#8a5a1e 100%)", boxShadow: "0 0 0 1px rgba(0,0,0,.55),inset 0 2px 3px rgba(255,245,210,.55),inset 0 -4px 7px rgba(0,0,0,.4),0 20px 40px rgba(0,0,0,.55)" }}>
              <Board state={heroState} boardTheme="marble" />
            </div>
          </div>
        </div>

        {/* FEATURED MODES */}
        <div className="divider"><i /><span>✦ Featured Game Modes ✦</span><i /></div>
        <div className="fd-modes-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
          {MODES.map((m) => (
            <div key={m.title} className="frame" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 11, borderColor: m.border }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <img src={SB(m.icon)} alt="" width={48} height={48} style={{ objectFit: "contain", flex: "none" }} />
                <div style={{ font: "700 16px Cinzel,serif", color: "var(--gold-lt)", lineHeight: 1.12 }}>{m.title}</div>
              </div>
              <div style={{ font: "400 13px/1.45 Inter", color: "var(--ink)" }}>{m.desc}</div>
              <button className={`btn ${m.btn}`} onClick={() => onMode(m.title)} style={{ marginTop: "auto", width: "100%" }}>Play Now</button>
            </div>
          ))}
        </div>

        {/* RECENT UPDATES (platform news — full width; "Continue Playing" removed:
            no real saved match exists yet, so no fake resume card) */}
        <div className="frame" style={{ padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <span className="ptitle" style={{ border: "none", padding: 0, margin: 0, textAlign: "left" }}>Recent Updates</span>
            <span onClick={() => showToast("Full changelog is coming soon.")} style={{ font: "600 11px Inter", color: "var(--gold)", cursor: "pointer" }}>View All</span>
          </div>
          {UPDATES.map((u) => (
            <div key={u.title} style={{ display: "flex", gap: 12, padding: "10px 0", borderTop: "1px solid rgba(232,184,75,.12)" }}>
              <div style={{ width: 44, height: 44, flex: "none", borderRadius: 8, background: u.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>{u.glyph}</div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ font: "700 9px Inter", letterSpacing: "1px", padding: "2px 6px", borderRadius: 4, background: u.tagbg, color: "#fff" }}>{u.tag}</span>
                  <span style={{ font: "700 13px Inter" }}>{u.title}</span>
                </div>
                <div style={{ font: "400 12px Inter", color: "var(--ink)", marginTop: 3 }}>{u.body}</div>
                <div style={{ font: "500 11px Inter", color: "var(--ink2)", marginTop: 3 }}>{u.time}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT RAIL */}
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div className="frame" style={{ padding: 20, textAlign: "center" }}>
          <div className="ptitle">Daily Challenge</div>
          <div style={{ display: "flex", justifyContent: "center", margin: "4px 0" }}>
            <img src={ICONS.chest} alt="Chest" width={92} height={92} style={{ objectFit: "contain" }} />
          </div>
          <div style={{ font: "600 13px Inter", color: "var(--ink)", margin: "12px 0 8px" }}>Win 3 matches today</div>
          <div style={{ height: 12, borderRadius: 100, background: "rgba(0,0,0,.4)", border: "1px solid rgba(232,184,75,.25)", overflow: "hidden" }}>
            <div style={{ width: "0%", height: "100%", background: "linear-gradient(90deg,#3f79d6,#6fa8ff)" }} />
          </div>
          <div style={{ font: "700 12px 'JetBrains Mono',monospace", color: "var(--ink)", marginTop: 6 }}>0 / 3</div>
          <div className="pill" style={{ margin: "14px auto 8px", color: "#f2d493" }}>
            <img src={ICONS.coin} alt="" width={16} height={16} style={{ objectFit: "contain" }} /> 500
          </div>
          <div style={{ font: "500 11px Inter", color: "var(--ink2)" }}>Reward on completion</div>
        </div>

        <div className="frame" style={{ padding: 20 }}>
          <div className="ptitle">Quick Stats</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {QUICK_STATS.map((q) => (
              <div key={q.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <img src={SB(q.icon)} alt="" width={24} height={24} style={{ objectFit: "contain" }} />
                <div>
                  <div style={{ font: "700 16px 'JetBrains Mono',monospace" }}>{q.value}</div>
                  <div style={{ font: "500 11px Inter", color: "var(--ink2)" }}>{q.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* FEATURED MATCH — a real feature slot: shows a live community match.
            Sample match for now (ambient big-platform data, like Quick Stats);
            wires to real live-match data once match history is available. */}
        <div className="frame" style={{ padding: 20 }}>
          <div className="ptitle">Featured Match</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <div style={{ textAlign: "center", flex: 1 }}><PlayerChip name="MasterLink" trophies="1680" av="strategist" size={56} /></div>
            <div style={{ textAlign: "center" }}>
              <div style={{ font: "800 20px Cinzel,serif", color: "var(--gold)" }}>VS</div>
              <div style={{ font: "600 10px Inter", color: "#ff6b6b" }}>● Live Match</div>
            </div>
            <div style={{ textAlign: "center", flex: 1 }}><PlayerChip name="Taktikero" trophies="1720" av="sovereign" size={56} /></div>
          </div>
          <button className="btn btn-red" onClick={() => navigate("/spectate")} style={{ width: "100%", marginTop: 16 }}>Watch Live</button>
        </div>
      </div>
    </div>
  );
}

function PlayerChip({ name, trophies, av, size = 58 }: { name: string; trophies: string; av: string; size?: number }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ width: size, height: size, margin: "0 auto", borderRadius: "50%", overflow: "hidden", border: "2px solid var(--gold)" }}>
        <img src={`/assets/avatars/${av}.png`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", filter: "brightness(1.25)" }} />
      </div>
      <div style={{ font: "700 13px Inter", marginTop: 7 }}>{name}</div>
      <div style={{ font: "600 11px 'JetBrains Mono',monospace", color: "var(--gold)" }}>🏆 {trophies}</div>
    </div>
  );
}

export default HomePage;
