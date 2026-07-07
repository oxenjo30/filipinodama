import { useAuthStore } from "../../stores/authStore";
import type { Me } from "../../lib/api";

/**
 * AchievementsGrid — the profile's Achievements panel (proto 1424-1434).
 *
 * Faithful reproduction of the prototype's 2-column card grid (First Blood,
 * Royal Streak, Grandmaster, Kingmaker). Achievements are computed CLIENT-SIDE
 * from the real logged-in account (useAuthStore().me) — no mock data. Each card
 * renders unlocked (full gold) vs locked (dimmed) based on the real stat, so the
 * grid always reflects the player's actual progress.
 *
 * Icons ship under /assets (first-blood.png etc.); we render the real art.
 */

const BASE = "/assets";

type Achievement = {
  name: string;
  desc: string;
  img: string;
  unlocked: (me: Me) => boolean;
};

/**
 * The four prototype achievements with faithful client-side thresholds against
 * the real Me stats. (The prototype's flavor text — "Reach 3,000 rating",
 * "Promote 3 kings" — is kept verbatim; unlock logic uses the stats the account
 * actually exposes: wins, streak, trophies.)
 */
const ACHIEVEMENTS: Achievement[] = [
  {
    name: "First Blood",
    desc: "Win your first match",
    img: `${BASE}/first-blood.png`,
    unlocked: (me) => me.wins >= 1,
  },
  {
    name: "Royal Streak",
    desc: "Win 5 matches in a row",
    img: `${BASE}/royal-streak.png`,
    unlocked: (me) => me.streak >= 5,
  },
  {
    name: "Grandmaster",
    desc: "Reach 1,800 rating",
    img: `${BASE}/grandmaster.png`,
    unlocked: (me) => me.trophies >= 1800,
  },
  {
    name: "Kingmaker",
    desc: "Win 50 matches",
    img: `${BASE}/kingmaker.png`,
    unlocked: (me) => me.wins >= 50,
  },
];

export default function AchievementsGrid() {
  const me = useAuthStore((s) => s.me);
  if (!me) return null;

  return (
    <div className="frame fd-card-m" style={{ padding: 24 }}>
      <div className="ptitle">Achievements</div>
      <div
        className="fd-collapse-2"
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
      >
        {ACHIEVEMENTS.map((a) => {
          const unlocked = a.unlocked(me);
          return (
            <div
              key={a.name}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: 14,
                borderRadius: 12,
                border: unlocked
                  ? "1px solid rgba(232,184,75,.32)"
                  : "1px solid rgba(255,255,255,.08)",
                background: unlocked
                  ? "linear-gradient(135deg,rgba(232,184,75,.12),rgba(15,8,32,.35))"
                  : "linear-gradient(135deg,rgba(255,255,255,.03),rgba(15,8,32,.35))",
                opacity: unlocked ? 1 : 0.55,
              }}
            >
              <img
                src={a.img}
                alt={a.name}
                style={{
                  width: 56,
                  height: 56,
                  flex: "none",
                  objectFit: "contain",
                  filter: unlocked
                    ? "drop-shadow(0 5px 12px rgba(0,0,0,.55))"
                    : "grayscale(1) drop-shadow(0 5px 12px rgba(0,0,0,.55))",
                }}
              />
              <div>
                <div
                  style={{
                    font: "700 14px Inter",
                    color: unlocked ? "#efe7fb" : "var(--ink2)",
                  }}
                >
                  {a.name}
                </div>
                <div
                  style={{
                    font: "400 12px Inter",
                    color: "var(--ink2)",
                    marginTop: 2,
                  }}
                >
                  {a.desc}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div
        style={{
          textAlign: "center",
          font: "500 12px Inter",
          color: "var(--ink2)",
          marginTop: 14,
        }}
      >
        Keep climbing the ranks to unlock more achievements.
      </div>
    </div>
  );
}
