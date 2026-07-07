import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "../../stores/appStore";
import { useAuthStore } from "../../stores/authStore";

/**
 * ProfilePage — /profile
 *
 * Faithful port of the prototype Profile screen (lines 1359-1472). Overview and
 * History tabs. Per the owner stale-data rule, all per-user stats are REAL (from
 * the logged-in account) — zero only when the account is genuinely at zero.
 * Trophy History and Match History still show honest empty states (no match
 * history endpoint wired here). Identity (avatar, name, tier, trophy balance)
 * comes from the real auth session (useAuthStore().me); when logged out we fall
 * back to the appStore placeholder so the screen still renders sensibly.
 */

// ── rank-tier ladder (art /assets/tier-*.png, floors from screen notes) ──
type Tier = { key: string; name: string; sub: string; floor: number; img: string };

const TIERS: Tier[] = [
  { key: "squire", name: "Squire", sub: "The first rung", floor: 0, img: "/assets/tier-squire.png" },
  { key: "mandirigma", name: "Mandirigma", sub: "Warrior", floor: 300, img: "/assets/tier-mandirigma.png" },
  { key: "kabalyero", name: "Kabalyero", sub: "Knight", floor: 600, img: "/assets/tier-kabalyero.png" },
  { key: "bayani", name: "Bayani", sub: "Hero", floor: 900, img: "/assets/tier-bayani.png" },
  { key: "datu", name: "Datu", sub: "Chieftain", floor: 1100, img: "/assets/tier-datu.png" },
  { key: "star-guardian", name: "Star Guardian", sub: "Bantay Bituin", floor: 1200, img: "/assets/tier-star-guardian.png" },
  { key: "alamat", name: "Alamat", sub: "Legend", floor: 1800, img: "/assets/tier-alamat.png" },
];

// ── real stats derived from the account (zero only when genuinely zero) ──
function statsFor(wins: number, losses: number, draws: number): { k: string; v: string; c: string }[] {
  const total = wins + losses + draws;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
  return [
    { k: "Wins", v: wins.toLocaleString(), c: "var(--green)" },
    { k: "Losses", v: losses.toLocaleString(), c: "var(--red)" },
    { k: "Draws", v: draws.toLocaleString(), c: "var(--ink)" },
    { k: "Win Rate", v: `${winRate}%`, c: "var(--gold-lt)" },
  ];
}

/** Masked circular portrait — opaque pngs need the mask + brightness lift. */
function Portrait({ src, size, alt }: { src: string; size: number; alt: string }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        overflow: "hidden",
        flex: "none",
        border: "3px solid rgba(232,184,75,.55)",
        boxShadow: "0 6px 18px rgba(0,0,0,.5)",
      }}
    >
      <img
        src={src}
        alt={alt}
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", filter: "brightness(1.25)" }}
      />
    </div>
  );
}

export function ProfilePage() {
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.me);
  const phName = useAppStore((s) => s.displayName);
  const phTag = useAppStore((s) => s.playerTag);
  const phAvatar = useAppStore((s) => s.avatar);
  const phTrophies = useAppStore((s) => s.trophies);
  const showToast = useAppStore((s) => s.showToast);

  const [tab, setTab] = useState<"overview" | "history">("overview");

  // Real account takes precedence; fall back to the appStore placeholder when
  // logged out so the screen never crashes or renders blank.
  const displayName = me?.displayName ?? phName;
  const playerTag = me?.tag ?? phTag;
  const trophies = me?.trophies ?? phTrophies;
  const STATS = statsFor(me?.wins ?? 0, me?.losses ?? 0, me?.draws ?? 0);

  // me.avatarUrl may be a bare key ("champion"), a "/assets/..." path, or an
  // uploaded URL — resolve all three to a renderable src.
  const avatarSrc = me?.avatarUrl
    ? me.avatarUrl.startsWith("/") || me.avatarUrl.startsWith("http")
      ? me.avatarUrl
      : `/assets/avatars/${me.avatarUrl}.png`
    : `/assets/avatars/${phAvatar}.png`;

  // ── derive current tier + progress toward next from trophy balance ──
  let curIdx = 0;
  for (let i = 0; i < TIERS.length; i++) {
    if (trophies >= TIERS[i].floor) curIdx = i;
  }
  const tierNow = TIERS[curIdx];
  const nextTier = TIERS[curIdx + 1];
  const span = nextTier ? nextTier.floor - tierNow.floor : 1;
  const into = trophies - tierNow.floor;
  const pct = nextTier ? Math.max(0, Math.min(100, Math.round((into / span) * 100))) : 100;
  const toNextLabel = nextTier ? `${Math.max(0, nextTier.floor - trophies)} trophies to next tier` : "Top tier reached";

  const tabStyle = (active: boolean): React.CSSProperties => ({
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: "12px 18px",
    font: "700 13px Inter",
    letterSpacing: "1.2px",
    textTransform: "uppercase",
    color: active ? "var(--gold-lt)" : "var(--ink2)",
    borderBottom: active ? "2px solid var(--gold)" : "2px solid transparent",
    marginBottom: "-1px",
  });

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 26, display: "flex", flexDirection: "column", gap: 20 }}>
      {/* ── identity header ── */}
      <div className="frame" style={{ padding: 28, display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "none" }}>
          <Portrait src={avatarSrc} size={92} alt={displayName} />
          <button
            onClick={() => showToast("Avatar customization arrives with online play.")}
            title="Change avatar"
            style={{
              position: "absolute",
              right: -2,
              bottom: -2,
              width: 36,
              height: 36,
              borderRadius: "50%",
              border: "2px solid #1e1134",
              background: "linear-gradient(180deg,#f7e2a0,#d5a63a)",
              color: "#1a0f2e",
              cursor: "pointer",
              fontSize: 15,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 4px 12px rgba(0,0,0,.5)",
            }}
          >
            ✎
          </button>
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1 style={{ margin: 0, font: "800 30px Cinzel,serif", color: "var(--gold-lt)" }}>
            {displayName}{" "}
            <span style={{ font: "800 18px 'JetBrains Mono',monospace", color: "var(--ink2)", verticalAlign: "middle" }}>
              {playerTag}
            </span>
          </h1>
          <div style={{ font: "600 13px Inter", color: "var(--gold)", margin: "4px 0 12px" }}>
            {tierNow.name} · 🏆 {trophies.toLocaleString()}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", width: "100%", justifyContent: "flex-end" }}>
          <button
            className="btn btn-gold"
            onClick={() => showToast("Profile editing arrives with online play.")}
            style={{ padding: "12px 22px" }}
          >
            Edit Profile
          </button>
          <button className="btn btn-purple" onClick={() => navigate("/friends")} style={{ padding: "12px 22px" }}>
            👥 Friends
          </button>
          <button className="btn btn-purple" onClick={() => navigate("/store")} style={{ padding: "12px 22px" }}>
            🎒 Locker
          </button>
          <button className="btn btn-purple" onClick={() => navigate("/settings")} style={{ padding: "12px 22px" }}>
            ⚙ Settings
          </button>
        </div>
      </div>

      {/* ── tabs ── */}
      <div style={{ display: "flex", alignItems: "center", borderBottom: "1px solid rgba(232,184,75,.18)" }}>
        <button onClick={() => setTab("overview")} style={tabStyle(tab === "overview")}>
          Overview
        </button>
        <button onClick={() => setTab("history")} style={tabStyle(tab === "history")}>
          Match History
        </button>
      </div>

      {/* ── OVERVIEW ── */}
      {tab === "overview" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* stat grid — real/zero */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
            {STATS.map((p) => (
              <div key={p.k} className="frame" style={{ padding: "20px 12px", textAlign: "center" }}>
                <div style={{ font: "800 28px 'JetBrains Mono',monospace", color: p.c }}>{p.v}</div>
                <div style={{ font: "500 12px Inter", color: "var(--ink2)", marginTop: 4 }}>{p.k}</div>
              </div>
            ))}
          </div>

          {/* rank tiers */}
          <div className="frame" style={{ padding: 24 }}>
            <div className="ptitle">Rank Tiers</div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                padding: 16,
                borderRadius: 14,
                border: "1px solid rgba(232,184,75,.35)",
                background: "linear-gradient(135deg,rgba(232,184,75,.14),rgba(15,8,32,.4))",
              }}
            >
              <img
                src={tierNow.img}
                alt={tierNow.name}
                style={{ width: 56, height: 56, objectFit: "contain", flex: "none" }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ font: "800 20px Cinzel,serif", color: "var(--gold-lt)" }}>{tierNow.name}</div>
                <div style={{ font: "500 12px Inter", color: "var(--ink2)" }}>
                  {tierNow.sub} · 🏆 {trophies.toLocaleString()}
                </div>
              </div>
            </div>
            <div
              style={{
                height: 12,
                borderRadius: 100,
                background: "rgba(0,0,0,.4)",
                border: "1px solid rgba(232,184,75,.25)",
                overflow: "hidden",
                margin: "14px 0 6px",
              }}
            >
              <div
                style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg,#c98b2e,#f7e2a0)" }}
              />
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                font: "500 12px Inter",
                color: "var(--ink2)",
                marginBottom: 16,
              }}
            >
              <span>{toNextLabel}</span>
              <span>Next: {nextTier ? nextTier.name : "—"}</span>
            </div>
            {TIERS.map((t, i) => {
              const isCurrent = i === curIdx;
              const reached = trophies >= t.floor;
              const badge = isCurrent ? "CURRENT" : reached ? "REACHED" : "LOCKED";
              const badgeStyle: React.CSSProperties = {
                flex: "none",
                font: "700 10px Inter",
                letterSpacing: ".5px",
                padding: "4px 9px",
                borderRadius: 7,
                color: isCurrent ? "#1a0f2e" : "var(--ink2)",
                background: isCurrent
                  ? "linear-gradient(180deg,#f7e2a0,#d5a63a)"
                  : reached
                    ? "rgba(47,143,91,.16)"
                    : "rgba(0,0,0,.3)",
                border: isCurrent
                  ? "1px solid rgba(255,240,200,.7)"
                  : reached
                    ? "1px solid rgba(47,143,91,.4)"
                    : "1px solid rgba(232,184,75,.18)",
              };
              return (
                <div
                  key={t.key}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 0",
                    borderTop: i === 0 ? "none" : "1px solid rgba(232,184,75,.1)",
                    opacity: reached ? 1 : 0.55,
                  }}
                >
                  <img src={t.img} alt={t.name} style={{ width: 34, height: 34, objectFit: "contain", flex: "none" }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ font: "700 14px Cinzel,serif", color: isCurrent ? "var(--gold-lt)" : "var(--ink)" }}>
                      {t.name}
                    </span>{" "}
                    <span style={{ font: "400 12px Inter", color: "var(--ink2)" }}>{t.sub}</span>
                  </div>
                  <span style={{ font: "700 12px 'JetBrains Mono',monospace", color: "var(--ink)" }}>🏆 {t.floor}+</span>
                  <span style={badgeStyle}>{badge}</span>
                </div>
              );
            })}
          </div>

          {/* trophy history — honest empty */}
          <div className="frame" style={{ padding: 24 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <div className="ptitle" style={{ marginBottom: 0 }}>
                Trophy History
              </div>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  font: "700 15px 'JetBrains Mono',monospace",
                  color: "var(--gold-lt)",
                }}
              >
                <img src="/assets/ic-coin.png" alt="" style={{ width: 18, height: 18, objectFit: "contain" }} />
                {trophies.toLocaleString()}
              </span>
            </div>
            <div style={{ font: "400 12px Inter", color: "var(--ink2)", marginBottom: 14 }}>
              Trophies change only in Ranked — win +25, loss −5.
            </div>
            <div
              style={{
                textAlign: "center",
                padding: "38px 12px",
                color: "var(--ink2)",
                font: "500 13px/1.6 Inter",
                borderTop: "1px solid rgba(232,184,75,.1)",
              }}
            >
              No ranked matches yet.
              <br />
              Play a Ranked game and your trophy changes will appear here.
            </div>
          </div>

          {/* achievements — honest empty (no fabricated unlocks) */}
          <div className="frame" style={{ padding: 24 }}>
            <div className="ptitle">Achievements</div>
            <div
              style={{
                textAlign: "center",
                padding: "34px 12px",
                color: "var(--ink2)",
                font: "500 13px/1.6 Inter",
              }}
            >
              No achievements unlocked yet.
              <br />
              Keep climbing the ranks to unlock more achievements.
            </div>
          </div>
        </div>
      )}

      {/* ── MATCH HISTORY — honest empty ── */}
      {tab === "history" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div className="frame" style={{ padding: 24 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 12,
                marginBottom: 10,
              }}
            >
              <div className="ptitle" style={{ marginBottom: 0 }}>
                Match History
              </div>
            </div>
            <div style={{ font: "400 12px Inter", color: "var(--ink2)", marginBottom: 2 }}>0 matches</div>
            <div
              style={{
                textAlign: "center",
                padding: "38px 12px",
                color: "var(--ink2)",
                font: "500 13px/1.6 Inter",
              }}
            >
              No matches here yet.
              <br />
              Finish a game and it will appear in your history automatically.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProfilePage;
