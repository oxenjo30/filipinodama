import { useNavigate } from "react-router-dom";
import { Avatar } from "../../components";
import { useAppStore } from "../../stores/appStore";

/**
 * FriendsPage — social hub ported from the approved prototype (lines 2026-2109).
 *
 * STALE-DATA RULE: the user has no real social graph yet, so Friend Requests,
 * Online and Offline friend lists are rendered as HONEST EMPTY states rather
 * than fabricated rosters. The three summary tiles read 0. A "Suggested
 * players" list is kept populated — that is discovery data (people you could
 * add), not a claim that they are already your friends. Every add/message
 * control routes through showToast since online play is not wired yet.
 */

type Tier = { label: string; color: string };

type Suggested = {
  name: string;
  tag: string;
  avatar: string;
  tier: Tier;
  mutual: string;
};

const SUGGESTED: Suggested[] = [
  {
    name: "BaganiKing",
    tag: "#7F2A",
    avatar: "bagani",
    tier: { label: "Datu", color: "#f5d783" },
    mutual: "Popular this week",
  },
  {
    name: "DiwataStar",
    tag: "#3C9E",
    avatar: "diwata",
    tier: { label: "Bayani", color: "#7ea6ff" },
    mutual: "Climbing the ladder",
  },
  {
    name: "MandirigmaX",
    tag: "#A551",
    avatar: "mandirigma",
    tier: { label: "Kabalyero", color: "#7ee6a4" },
    mutual: "New challenger",
  },
];

const SUMMARY: { k: string; v: string; c: string }[] = [
  { k: "Friends", v: "0", c: "var(--gold-lt)" },
  { k: "Online Now", v: "0", c: "#7ee6a4" },
  { k: "Requests", v: "0", c: "#ff9aa6" },
];

/** Honest empty-state panel shared by Requests / Online / Offline sections. */
function EmptyPanel({ title, message }: { title: string; message: string }) {
  return (
    <div className="frame" style={{ padding: 22 }}>
      <div className="ptitle" style={{ textAlign: "left", marginBottom: 14 }}>
        {title}
      </div>
      <div
        style={{
          padding: "26px 16px",
          textAlign: "center",
          borderRadius: 12,
          border: "1px dashed rgba(232,184,75,.2)",
          background: "rgba(0,0,0,.18)",
          color: "var(--ink2)",
          font: "500 14px Inter",
        }}
      >
        {message}
      </div>
    </div>
  );
}

export function FriendsPage() {
  const navigate = useNavigate();
  const showToast = useAppStore((s) => s.showToast);

  return (
    <div
      style={{
        maxWidth: 900,
        margin: "0 auto",
        padding: 26,
        display: "flex",
        flexDirection: "column",
        gap: 20,
      }}
    >
      {/* Header */}
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
          <div
            style={{
              font: "700 12px Inter",
              letterSpacing: 2,
              textTransform: "uppercase",
              color: "var(--gold)",
            }}
          >
            Your Circle
          </div>
          <h1 style={{ margin: "6px 0 0", font: "800 32px Cinzel,serif", color: "var(--gold-lt)" }}>
            Friends
          </h1>
        </div>
        <button
          className="btn btn-gold"
          onClick={() => showToast("Add friend arrives with online play.")}
          style={{ padding: "12px 20px" }}
        >
          ＋ Add Friend
        </button>
      </div>

      {/* Summary tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
        {SUMMARY.map((c) => (
          <div key={c.k} className="frame" style={{ padding: 18, textAlign: "center" }}>
            <div style={{ font: "800 26px 'JetBrains Mono',monospace", color: c.c }}>{c.v}</div>
            <div style={{ font: "500 12px Inter", color: "var(--ink2)", marginTop: 3 }}>{c.k}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div
        className="frame"
        style={{ padding: "5px 10px", display: "flex", alignItems: "center", gap: 8 }}
      >
        <span style={{ paddingLeft: 8, fontSize: 15, color: "var(--ink2)" }}>🔍</span>
        <input
          placeholder="Search friends by name or tier…"
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            color: "#efe7fb",
            font: "500 14px Inter",
            padding: "13px 6px",
          }}
        />
      </div>

      {/* Friend Requests — honest empty */}
      <EmptyPanel title="Friend Requests · 0" message="No pending requests." />

      {/* Online — honest empty */}
      <EmptyPanel
        title="Online · 0"
        message="No friends yet — add some to play together."
      />

      {/* Suggested players — discovery data (not a fake roster) */}
      <div className="frame" style={{ padding: 22 }}>
        <div className="ptitle" style={{ textAlign: "left", marginBottom: 14 }}>
          Suggested Players
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {SUGGESTED.map((s) => (
            <div
              key={s.tag}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: 12,
                borderRadius: 12,
                border: "1px solid rgba(232,184,75,.16)",
                background: "rgba(0,0,0,.2)",
              }}
            >
              <Avatar src={s.avatar} size={44} />
              <div
                onClick={() => navigate("/leaderboard")}
                style={{ flex: 1, minWidth: 0, cursor: "pointer" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ font: "700 15px Inter", color: "#fff" }}>{s.name}</span>
                  <span style={{ font: "700 11px 'JetBrains Mono',monospace", color: "var(--ink2)" }}>
                    {s.tag}
                  </span>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "2px 8px",
                      borderRadius: 100,
                      border: "1px solid rgba(232,184,75,.2)",
                      background: "rgba(15,8,32,.5)",
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: s.tier.color,
                      }}
                    />
                    <span style={{ font: "600 10px Inter", color: s.tier.color }}>
                      {s.tier.label}
                    </span>
                  </span>
                </div>
                <div style={{ font: "500 12px Inter", color: "var(--ink2)", marginTop: 3 }}>
                  {s.mutual}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flex: "none", alignItems: "center" }}>
                <button
                  onClick={() => showToast("Add friend arrives with online play.")}
                  style={{
                    padding: "9px 16px",
                    borderRadius: 8,
                    border: "1px solid rgba(63,191,111,.55)",
                    background: "rgba(63,191,111,.16)",
                    color: "#7ee6a4",
                    font: "700 12px Inter",
                    cursor: "pointer",
                  }}
                >
                  ＋ Add
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Offline — honest empty */}
      <EmptyPanel title="Offline" message="No friends yet — add some to play together." />
    </div>
  );
}

export default FriendsPage;
