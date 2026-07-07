import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "../../stores/appStore";

/**
 * SeasonPage (/season) — "Season Pass" / Ranked Season overview, ported from the
 * approved prototype (handoff/FilipinoDama Royal.dc.html lines 1549-1704).
 *
 * Sections reproduced from the prototype:
 *   • ← Home back button + "✦ RANKED SEASON ✦" eyebrow
 *   • Hero banner (season name, number, ends-in countdown, level progress, rank badge)
 *   • Reward Track tab (free + premium tiers, Royal Pass unlock footer)
 *   • Season Standings tab (ranked board)
 *
 * STALE-DATA RULE: we have no real per-user progression or backend, so every
 * claim about what THIS player owns / has earned is replaced with an honest
 * empty state:
 *   - Level progress reads Level 1 · 0 XP (honest zero, 2% min bar) — no fake XP.
 *   - Rank badge shows "Unranked / Play placement matches" instead of a fake rank.
 *   - The season-end "claim your rewards" banner is removed (nothing earned).
 *   - The "Royal Pass Active" banner and per-tier "Claim/Claimed" states are
 *     removed; every reward tile shows the reward with a disabled "Locked" button
 *     (like QuestsPage), and the Unlock-Pass footer routes through showToast.
 *   - "X ready to claim" pill is removed (nothing claimable).
 *   - The Standings board is KEPT populated — that is global discovery data, like
 *     the leaderboard, not a claim the player owns a spot. The prototype's "YOU"
 *     row (a fake personal placement) is replaced with an honest "not yet ranked"
 *     footer row.
 * Season DEFINITIONS (name, tier catalog, reward labels) come straight from the
 * prototype and are catalog data, not per-user data.
 */

const SEASON_NAME = "Season of the Rajah";
const SEASON_NUM = "Season 12";
const SEASON_ENDS = "18d 06h";

// ── Reward-track tiers (catalog data — reward labels from the prototype) ──
type RewardCell = { tag: string; icon: string; label: string };
type Tier = { lvl: number; free: RewardCell; prem: RewardCell };

const TIERS: Tier[] = [
  { lvl: 1, free: { tag: "FREE", icon: "🪙", label: "500 Gold" }, prem: { tag: "ROYAL", icon: "💎", label: "150 Diamonds" } },
  { lvl: 5, free: { tag: "FREE", icon: "📦", label: "Common Chest" }, prem: { tag: "ROYAL", icon: "🎴", label: "Rajah Frame" } },
  { lvl: 10, free: { tag: "FREE", icon: "🪙", label: "1,000 Gold" }, prem: { tag: "ROYAL", icon: "🎭", label: "Jade Piece Skin" } },
  { lvl: 15, free: { tag: "FREE", icon: "💎", label: "80 Diamonds" }, prem: { tag: "ROYAL", icon: "📦", label: "Royal Chest" } },
  { lvl: 20, free: { tag: "FREE", icon: "📦", label: "Rare Chest" }, prem: { tag: "ROYAL", icon: "🏵️", label: "Golden Emblem" } },
  { lvl: 25, free: { tag: "FREE", icon: "🪙", label: "2,000 Gold" }, prem: { tag: "ROYAL", icon: "👑", label: "Rajah Crown Skin" } },
];

// ── Season standings — global discovery data (like the leaderboard). Not "yours". ──
type BoardRow = { name: string; tier: string; tierColor: string; rating: number };
const BOARD: BoardRow[] = [
  { name: "RajahSupreme", tier: "Alamat · Legend", tierColor: "#ff5d73", rating: 2412 },
  { name: "DatuMaharlika", tier: "Alamat · Legend", tierColor: "#ff5d73", rating: 2388 },
  { name: "LapuLegend", tier: "Star Guardian · Ascendant", tierColor: "#a06bff", rating: 2301 },
  { name: "BayaniBlade", tier: "Star Guardian · Ascendant", tierColor: "#a06bff", rating: 2274 },
  { name: "DamaDiwata", tier: "Star Guardian · Ascendant", tierColor: "#a06bff", rating: 2240 },
  { name: "KingmakerKim", tier: "Datu · Warlord", tierColor: "#3fbf6f", rating: 2188 },
  { name: "TahoTactician", tier: "Datu · Warlord", tierColor: "#3fbf6f", rating: 2151 },
  { name: "SunoSultan", tier: "Datu · Warlord", tierColor: "#3fbf6f", rating: 2120 },
  { name: "MandirigmaMax", tier: "Bayani · Champion", tierColor: "#e8b84b", rating: 2077 },
  { name: "BanahawBoss", tier: "Bayani · Champion", tierColor: "#e8b84b", rating: 2044 },
];

const MEDALS = ["/assets/medal-1.png", "/assets/medal-2.png", "/assets/medal-3.png"];

// ── locked reward button (matches QuestsPage "not started" convention) ──
const LOCKED_BTN: React.CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  borderRadius: 8,
  font: "800 11px Inter",
  letterSpacing: ".3px",
  border: "1px solid rgba(232,184,75,.2)",
  background: "rgba(15,8,32,.5)",
  color: "var(--ink2)",
  cursor: "default",
};

function RewardTile({ cell, premium, onClaim }: { cell: RewardCell; premium: boolean; onClaim: () => void }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: 11,
        borderRadius: 12,
        border: premium ? "1px solid rgba(232,184,75,.35)" : "1px solid rgba(232,184,75,.14)",
        background: premium
          ? "linear-gradient(160deg,rgba(232,184,75,.12),rgba(15,8,32,.25))"
          : "rgba(0,0,0,.22)",
      }}
    >
      <span
        style={{
          alignSelf: "flex-start",
          padding: "2px 8px",
          borderRadius: 100,
          font: "800 9px Inter",
          letterSpacing: ".5px",
          color: premium ? "#2a1607" : "var(--ink2)",
          background: premium ? "linear-gradient(180deg,#f7e2a0,#d5a63a)" : "rgba(255,255,255,.06)",
          border: premium ? "none" : "1px solid rgba(232,184,75,.18)",
        }}
      >
        {cell.tag}
      </span>
      <div
        style={{
          width: 46,
          height: 46,
          margin: "2px auto",
          borderRadius: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 24,
          background: "rgba(0,0,0,.28)",
          border: "1px solid rgba(232,184,75,.16)",
        }}
      >
        {cell.icon}
      </div>
      <div
        style={{
          font: "700 12px Inter",
          color: "#f2e9d2",
          minHeight: 30,
          display: "flex",
          alignItems: "center",
          textAlign: "center",
          justifyContent: "center",
        }}
      >
        {cell.label}
      </div>
      <button type="button" disabled onClick={onClaim} style={LOCKED_BTN}>
        Locked
      </button>
    </div>
  );
}

export function SeasonPage() {
  const navigate = useNavigate();
  const showToast = useAppStore((s) => s.showToast);
  const [tab, setTab] = useState<"rewards" | "ranking">("rewards");

  const onLockedClaim = () => showToast("Reward-track rewards unlock with online play.");
  const onUnlockPass = () => showToast("The Royal Season Pass arrives with online play.");

  const tabStyle = (on: boolean): React.CSSProperties => ({
    padding: "10px 20px",
    borderRadius: 10,
    font: "800 13px Inter",
    letterSpacing: ".3px",
    cursor: "pointer",
    border: on ? "1px solid var(--gold)" : "1px solid rgba(232,184,75,.2)",
    background: on ? "rgba(232,184,75,.16)" : "rgba(15,8,32,.5)",
    color: on ? "var(--gold-lt)" : "var(--ink)",
  });

  return (
    <div
      data-screen-label="Season Pass"
      style={{ maxWidth: 1080, margin: "0 auto", padding: 26, display: "flex", flexDirection: "column", gap: 20 }}
    >
      {/* Back + eyebrow */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={() => navigate("/")}
          style={{
            padding: "9px 16px",
            borderRadius: 9,
            border: "1px solid rgba(232,184,75,.25)",
            background: "rgba(15,8,32,.5)",
            color: "var(--ink)",
            font: "700 12px Inter",
            cursor: "pointer",
          }}
        >
          ← Home
        </button>
        <span style={{ font: "700 12px Inter", letterSpacing: "3px", color: "var(--gold)" }}>✦ RANKED SEASON ✦</span>
      </div>

      {/* Hero banner */}
      <div className="frame" style={{ padding: 0, overflow: "hidden", position: "relative" }}>
        <div
          style={{
            padding: "28px 30px",
            display: "flex",
            gap: 26,
            alignItems: "center",
            flexWrap: "wrap",
            background: "linear-gradient(135deg,rgba(122,75,191,.32),rgba(15,8,32,.15))",
          }}
        >
          <img
            src="/assets/me-banner.png"
            alt="Season banner"
            style={{ width: 96, height: 114, objectFit: "contain", flex: "none", filter: "drop-shadow(0 8px 20px rgba(0,0,0,.55))" }}
          />
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h1 style={{ margin: 0, font: "800 clamp(26px,3.4vw,38px) Cinzel,serif", color: "var(--gold-lt)" }}>
                {SEASON_NAME}
              </h1>
              <span
                style={{
                  padding: "4px 11px",
                  borderRadius: 100,
                  border: "1px solid rgba(232,184,75,.3)",
                  background: "rgba(15,8,32,.5)",
                  font: "700 11px Inter",
                  color: "var(--gold)",
                }}
              >
                {SEASON_NUM}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, font: "600 13px Inter", color: "var(--ink)" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#ff8fae", boxShadow: "0 0 8px #ff8fae" }} />
              Ends in <b style={{ color: "#ffd0d8", fontFamily: "'JetBrains Mono',monospace" }}>{SEASON_ENDS}</b>
            </div>
            {/* level progress — honest zero (no fake XP earned yet) */}
            <div style={{ marginTop: 16, maxWidth: 460 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 7 }}>
                <span style={{ font: "800 15px Cinzel,serif", color: "#fff" }}>
                  Level 1 <span style={{ font: "600 12px Inter", color: "var(--ink2)" }}>/ 50</span>
                </span>
                <span style={{ font: "600 12px Inter", color: "var(--gold-lt)" }}>0 XP</span>
              </div>
              <div
                style={{
                  height: 12,
                  borderRadius: 100,
                  background: "rgba(0,0,0,.4)",
                  border: "1px solid rgba(232,184,75,.2)",
                  overflow: "hidden",
                }}
              >
                <div style={{ height: "100%", width: "2%", background: "linear-gradient(90deg,#c98b2e,#f7e2a0)", borderRadius: 100 }} />
              </div>
            </div>
          </div>
          {/* rank badge — honest "unranked" (no fake placement) */}
          <div
            style={{
              flex: "none",
              textAlign: "center",
              padding: "14px 20px",
              borderRadius: 16,
              background: "rgba(0,0,0,.28)",
              border: "1px solid rgba(232,184,75,.18)",
            }}
          >
            <div style={{ font: "600 10px Inter", letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--ink2)", marginBottom: 8 }}>
              Your Rank
            </div>
            <div style={{ fontSize: 34, lineHeight: 1 }}>❔</div>
            <div style={{ font: "800 15px Cinzel,serif", color: "var(--gold-lt)", marginTop: 6 }}>Unranked</div>
            <div style={{ font: "500 11px Inter", color: "var(--ink2)" }}>Play placement matches</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={() => setTab("rewards")} style={tabStyle(tab === "rewards")}>
          Reward Track
        </button>
        <button onClick={() => setTab("ranking")} style={tabStyle(tab === "ranking")}>
          Season Standings
        </button>
      </div>

      {/* REWARD TRACK TAB */}
      {tab === "rewards" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Reward track */}
          <div className="frame" style={{ padding: 22 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
              <span style={{ font: "800 19px Cinzel,serif", color: "var(--gold-lt)" }}>Reward Track</span>
            </div>
            <div style={{ display: "flex", gap: 14, overflowX: "auto", padding: "4px 2px 12px" }}>
              {TIERS.map((t) => (
                <div key={t.lvl} style={{ flex: "none", width: 138, display: "flex", flexDirection: "column", gap: 11 }}>
                  <div
                    style={{
                      textAlign: "center",
                      font: "800 13px 'JetBrains Mono',monospace",
                      color: "var(--gold-lt)",
                      padding: "6px 0",
                      borderRadius: 8,
                      background: "rgba(0,0,0,.28)",
                      border: "1px solid rgba(232,184,75,.16)",
                    }}
                  >
                    LV {t.lvl}
                  </div>
                  <RewardTile cell={t.free} premium={false} onClaim={onLockedClaim} />
                  <RewardTile cell={t.prem} premium onClaim={onLockedClaim} />
                </div>
              ))}
            </div>
            <div style={{ font: "500 12px Inter", color: "var(--ink2)", marginTop: 6 }}>
              Free rewards unlock as you level up. <b style={{ color: "var(--gold-lt)" }}>Royal Pass</b> unlocks the premium reward on every level.
            </div>
          </div>

          {/* Unlock pass footer — not owned (honest: no fake "Active" banner) */}
          <div
            className="frame"
            style={{
              padding: "22px 24px",
              display: "flex",
              alignItems: "center",
              gap: 18,
              flexWrap: "wrap",
              background: "linear-gradient(135deg,rgba(122,75,191,.24),rgba(15,8,32,.1))",
              borderColor: "rgba(232,184,75,.35)",
            }}
          >
            <span style={{ font: "800 34px", lineHeight: 1 }}>👑</span>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ font: "800 18px Cinzel,serif", color: "var(--gold-lt)" }}>Unlock the Royal Season Pass</div>
              <div style={{ font: "500 13px Inter", color: "var(--ink)", lineHeight: 1.5, marginTop: 4 }}>
                Claim the premium reward on every level — exclusive skins, frames, and bonus Diamonds all season long.
              </div>
            </div>
            <button
              onClick={onUnlockPass}
              style={{
                flex: "none",
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "13px 24px",
                borderRadius: 11,
                border: "1px solid var(--gold)",
                background: "linear-gradient(180deg,#f0c24b,#c98b2e)",
                color: "#2a1607",
                font: "800 14px Inter",
                cursor: "pointer",
              }}
            >
              <img src="/assets/ic-gem.png" alt="" style={{ width: 18, height: 18, objectFit: "contain" }} />
              900 · Unlock
            </button>
          </div>
        </div>
      )}

      {/* SEASON STANDINGS TAB */}
      {tab === "ranking" && (
        <div className="frame" style={{ padding: 22 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <span style={{ font: "800 19px Cinzel,serif", color: "var(--gold-lt)" }}>Season Standings</span>
            <span style={{ font: "600 12px Inter", color: "var(--ink2)" }}>Ranked by rating</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {BOARD.map((r, i) => {
              const top3 = i < 3;
              return (
                <div
                  key={r.name}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 13,
                    padding: "12px 14px",
                    borderRadius: 12,
                    border: "1px solid rgba(232,184,75,.1)",
                    background: top3 ? "rgba(232,184,75,.06)" : "rgba(0,0,0,.2)",
                  }}
                >
                  <div style={{ width: 34, flex: "none", display: "flex", justifyContent: "center", alignItems: "center" }}>
                    {top3 ? (
                      <img src={MEDALS[i]} alt={`Rank ${i + 1}`} style={{ width: 26, height: 26, objectFit: "contain" }} />
                    ) : (
                      <span style={{ font: "800 15px 'JetBrains Mono',monospace", color: "var(--ink2)" }}>{i + 1}</span>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ font: "700 15px Inter", color: "#f2e9d2" }}>{r.name}</div>
                    <div style={{ font: "600 12px Inter", color: r.tierColor }}>{r.tier}</div>
                  </div>
                  <div style={{ font: "800 15px 'JetBrains Mono',monospace", color: "#f2d493", flex: "none" }}>{r.rating}</div>
                </div>
              );
            })}
          </div>
          {/* Honest "you" row — not yet ranked (no fake personal placement) */}
          <div
            style={{
              marginTop: 14,
              display: "flex",
              alignItems: "center",
              gap: 13,
              padding: "14px 16px",
              borderRadius: 12,
              background: "linear-gradient(135deg,rgba(232,184,75,.12),rgba(15,8,32,.1))",
              border: "1px solid rgba(232,184,75,.35)",
            }}
          >
            <div style={{ width: 34, flex: "none", textAlign: "center", font: "800 15px 'JetBrains Mono',monospace", color: "var(--ink2)" }}>—</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ font: "800 15px Inter", color: "var(--gold-lt)" }}>You are not yet ranked</span>
                <span
                  style={{
                    font: "800 9px Inter",
                    letterSpacing: ".5px",
                    color: "#1a0f2e",
                    background: "linear-gradient(180deg,#f7e2a0,#d5a63a)",
                    padding: "2px 8px",
                    borderRadius: 100,
                  }}
                >
                  YOU
                </span>
              </div>
              <div style={{ font: "600 12px Inter", color: "var(--ink2)" }}>Play placement matches to earn your season rank.</div>
            </div>
            <button
              onClick={() => navigate("/play")}
              style={{
                flex: "none",
                padding: "9px 16px",
                borderRadius: 8,
                border: "1px solid rgba(232,184,75,.4)",
                background: "rgba(232,184,75,.1)",
                color: "var(--gold-lt)",
                font: "700 12px Inter",
                cursor: "pointer",
              }}
            >
              Play
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default SeasonPage;
