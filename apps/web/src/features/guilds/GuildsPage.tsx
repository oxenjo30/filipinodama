import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "../../stores/appStore";

/**
 * GuildsPage — Guild Hall, ported from the prototype (handoff/FilipinoDama Royal.dc.html,
 * lines 1705-2025).
 *
 * STALE-DATA RULE: the player is NOT in a guild yet and we have no backend, so the
 * prototype's "my guild" banner, weekly war, perks, roster, roles/permissions and
 * join-requests sections (all of which imply a real membership/roster we don't have)
 * are replaced by an honest empty state: "You are not in a guild — browse or create
 * one." The "Discover Guilds" browse list IS kept populated — that is discovery data,
 * like the global leaderboard, not a claim the player owns any of it. Create / Join
 * actions have no backend, so they route through showToast.
 */

// Emblem token — a masked circular gradient badge (no per-guild portrait art exists).
function Emblem({ glyph, size = 56, tint }: { glyph: string; size?: number; tint: string }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 14,
        flex: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.5,
        background: `linear-gradient(135deg,${tint},rgba(15,8,32,.4))`,
        border: "1px solid rgba(232,184,75,.3)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,.08)",
      }}
    >
      {glyph}
    </div>
  );
}

// Discovery data — real-feeling browsable guilds (like the leaderboard). Not "yours".
type BrowseGuild = {
  name: string;
  tag: string;
  glyph: string;
  tint: string;
  levelLabel: string;
  members: string;
  pts: string;
  policy: "open" | "request";
};
const BROWSE_GUILDS: BrowseGuild[] = [
  { name: "Dama Kings", tag: "#DK", glyph: "👑", tint: "rgba(122,75,191,.35)", levelLabel: "Lv 24", members: "48 / 50", pts: "182,400", policy: "request" },
  { name: "Pinoy Warriors", tag: "#PW", glyph: "⚔️", tint: "rgba(160,48,58,.35)", levelLabel: "Lv 21", members: "50 / 50", pts: "168,920", policy: "request" },
  { name: "Bayanihan Board", tag: "#BYN", glyph: "🛡️", tint: "rgba(46,107,198,.35)", levelLabel: "Lv 17", members: "34 / 50", pts: "121,050", policy: "open" },
  { name: "Sundo Squad", tag: "#SND", glyph: "🌞", tint: "rgba(47,143,91,.35)", levelLabel: "Lv 12", members: "22 / 50", pts: "74,300", policy: "open" },
  { name: "Rookie Rangers", tag: "#RR", glyph: "🎯", tint: "rgba(201,154,46,.35)", levelLabel: "Lv 6", members: "11 / 50", pts: "28,140", policy: "open" },
];

// Create-guild emblem picker options.
const GC_EMBLEMS = ["👑", "⚔️", "🛡️", "🌞", "🔥", "🦅"];
const GC_POLICIES: { key: string; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "request", label: "Request" },
  { key: "invite", label: "Invite Only" },
];

export function GuildsPage() {
  const navigate = useNavigate();
  const showToast = useAppStore((s) => s.showToast);

  const [createShow, setCreateShow] = useState(false);
  const [gcEmblem, setGcEmblem] = useState(GC_EMBLEMS[0]);
  const [gcName, setGcName] = useState("");
  const [gcTag, setGcTag] = useState("");
  const [gcDesc, setGcDesc] = useState("");
  const [gcPolicy, setGcPolicy] = useState("open");

  const gcReady = gcName.trim().length >= 3 && gcTag.trim().length >= 2;

  const onCreateSubmit = () => {
    if (!gcReady) return;
    setCreateShow(false);
    showToast("Creating a guild arrives with online play.");
  };

  const onJoin = (g: BrowseGuild) => {
    showToast(
      g.policy === "open"
        ? `Joining ${g.name} arrives with online play.`
        : `Requesting to join ${g.name} arrives with online play.`,
    );
  };

  return (
    <div style={{ maxWidth: 940, margin: "0 auto", padding: 26, display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ font: "700 12px Inter", letterSpacing: "2px", textTransform: "uppercase", color: "var(--gold)" }}>Alliances</div>
          <h1 style={{ margin: "6px 0 0", font: "800 32px Cinzel,serif", color: "var(--gold-lt)" }}>Guild Hall</h1>
        </div>
        <button className="btn btn-purple" onClick={() => navigate("/")} style={{ padding: "12px 20px" }}>← Home</button>
      </div>

      {/* Honest empty state — the player is not in a guild yet. */}
      <div
        className="frame"
        style={{
          padding: 30,
          display: "flex",
          gap: 22,
          alignItems: "center",
          flexWrap: "wrap",
          background: "linear-gradient(135deg,rgba(122,75,191,.22),rgba(15,8,32,.1))",
        }}
      >
        <div
          style={{
            width: 72,
            height: 72,
            flex: "none",
            borderRadius: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 34,
            background: "linear-gradient(135deg,rgba(122,75,191,.3),rgba(15,8,32,.3))",
            border: "1px solid rgba(232,184,75,.3)",
          }}
        >
          🛡️
        </div>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ font: "800 22px Cinzel,serif", color: "var(--gold-lt)" }}>You are not in a guild yet</div>
          <p style={{ margin: "8px 0 0", font: "500 13.5px/1.5 Inter", color: "var(--ink2)", maxWidth: 520 }}>
            Guilds are alliances of players who war together, share perks, and climb the ranks as one. Browse the guilds below to
            find your people — or found your own and lead the charge.
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 9, flex: "none" }}>
          <button
            onClick={() => setCreateShow(true)}
            style={{ padding: "12px 22px", borderRadius: 9, border: "1px solid rgba(232,184,75,.4)", background: "rgba(232,184,75,.1)", color: "var(--gold-lt)", font: "700 12px Inter", letterSpacing: ".3px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
          >
            ＋ Create Guild
          </button>
        </div>
      </div>

      {/* Discover / browse guilds (discovery data, like the leaderboard). */}
      <div className="frame" style={{ padding: 22 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div className="ptitle" style={{ textAlign: "left" }}>Discover Guilds</div>
          <button
            onClick={() => setCreateShow(true)}
            style={{ flex: "none", padding: "9px 16px", borderRadius: 8, border: "1px solid rgba(232,184,75,.4)", background: "rgba(232,184,75,.1)", color: "var(--gold-lt)", font: "700 12px Inter", letterSpacing: ".3px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
          >
            ＋ Create Guild
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {BROWSE_GUILDS.map((g) => {
            const joinStyle: React.CSSProperties =
              g.policy === "open"
                ? { flex: "none", padding: "9px 18px", borderRadius: 8, border: "1px solid rgba(95,212,138,.4)", background: "rgba(95,212,138,.12)", color: "#6ee0a0", font: "700 12px Inter", letterSpacing: ".3px", cursor: "pointer" }
                : { flex: "none", padding: "9px 18px", borderRadius: 8, border: "1px solid rgba(232,184,75,.35)", background: "rgba(232,184,75,.1)", color: "var(--gold-lt)", font: "700 12px Inter", letterSpacing: ".3px", cursor: "pointer" };
            return (
              <div key={g.tag} style={{ display: "flex", alignItems: "center", gap: 14, padding: 12, borderRadius: 12, border: "1px solid rgba(232,184,75,.12)", background: "rgba(0,0,0,.2)" }}>
                <Emblem glyph={g.glyph} tint={g.tint} size={48} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ font: "700 15px Inter", color: "#fff" }}>{g.name}</span>
                    <span style={{ font: "700 11px 'JetBrains Mono',monospace", color: "var(--ink2)" }}>{g.tag}</span>
                    <span style={{ padding: "2px 8px", borderRadius: 100, border: "1px solid rgba(232,184,75,.2)", background: "rgba(15,8,32,.5)", font: "600 10px Inter", color: "var(--gold)" }}>{g.levelLabel}</span>
                  </div>
                  <div style={{ font: "500 12px Inter", color: "var(--ink2)", marginTop: 3 }}>{g.members} members · {g.pts} pts</div>
                </div>
                <button onClick={() => onJoin(g)} style={joinStyle}>{g.policy === "open" ? "Join" : "Request"}</button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Create Guild modal */}
      {createShow && (
        <div
          onClick={() => setCreateShow(false)}
          style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(8,4,18,.72)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 440, maxHeight: "88vh", overflow: "auto", borderRadius: 18, border: "1px solid rgba(232,184,75,.35)", background: "linear-gradient(180deg,#1a0f30,#140a24)", boxShadow: "0 24px 70px rgba(0,0,0,.6)" }}
          >
            <div style={{ padding: "22px 24px", borderBottom: "1px solid rgba(232,184,75,.14)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ font: "800 18px Cinzel,serif", color: "var(--gold-lt)", letterSpacing: ".5px" }}>Create a Guild</div>
              <button onClick={() => setCreateShow(false)} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid rgba(232,184,75,.2)", background: "rgba(0,0,0,.25)", color: "var(--ink2)", font: "700 16px Inter", cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ padding: "22px 24px", display: "flex", flexDirection: "column", gap: 18 }}>
              {/* Emblem */}
              <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                <Emblem glyph={gcEmblem} tint="rgba(122,75,191,.35)" size={56} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: "700 12px Inter", color: "var(--ink)", marginBottom: 8 }}>Emblem</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {GC_EMBLEMS.map((e) => {
                      const on = e === gcEmblem;
                      return (
                        <button
                          key={e}
                          onClick={() => setGcEmblem(e)}
                          style={{ width: 42, height: 42, borderRadius: 10, fontSize: 20, cursor: "pointer", border: on ? "1px solid var(--gold)" : "1px solid rgba(232,184,75,.2)", background: on ? "rgba(232,184,75,.16)" : "rgba(0,0,0,.3)" }}
                        >
                          {e}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              {/* Name */}
              <div>
                <label style={{ display: "block", font: "700 11px Inter", letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--ink2)", marginBottom: 7 }}>Guild Name</label>
                <input
                  value={gcName}
                  onChange={(e) => setGcName(e.target.value)}
                  placeholder="e.g. Dama Legends"
                  maxLength={24}
                  style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 10, border: "1px solid rgba(232,184,75,.25)", background: "rgba(0,0,0,.3)", color: "#fff", font: "600 15px Inter", outline: "none" }}
                />
              </div>
              {/* Tag */}
              <div>
                <label style={{ display: "block", font: "700 11px Inter", letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--ink2)", marginBottom: 7 }}>
                  Tag <span style={{ color: "var(--ink2)", opacity: 0.6 }}>(2–4 letters)</span>
                </label>
                <input
                  value={gcTag}
                  onChange={(e) => setGcTag(e.target.value)}
                  placeholder="DL"
                  maxLength={5}
                  style={{ width: 120, boxSizing: "border-box", padding: "12px 14px", borderRadius: 10, border: "1px solid rgba(232,184,75,.25)", background: "rgba(0,0,0,.3)", color: "var(--gold-lt)", font: "700 15px 'JetBrains Mono',monospace", textTransform: "uppercase", outline: "none" }}
                />
              </div>
              {/* Description */}
              <div>
                <label style={{ display: "block", font: "700 11px Inter", letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--ink2)", marginBottom: 7 }}>Description</label>
                <textarea
                  value={gcDesc}
                  onChange={(e) => setGcDesc(e.target.value)}
                  placeholder="What's your guild about?"
                  rows={2}
                  style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 10, border: "1px solid rgba(232,184,75,.25)", background: "rgba(0,0,0,.3)", color: "#fff", font: "500 14px Inter", resize: "none", outline: "none" }}
                />
              </div>
              {/* Join policy */}
              <div>
                <label style={{ display: "block", font: "700 11px Inter", letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--ink2)", marginBottom: 9 }}>Join Policy</label>
                <div style={{ display: "flex", gap: 9 }}>
                  {GC_POLICIES.map((p) => {
                    const on = p.key === gcPolicy;
                    return (
                      <button
                        key={p.key}
                        onClick={() => setGcPolicy(p.key)}
                        style={{ flex: 1, padding: "10px 8px", borderRadius: 9, cursor: "pointer", font: "700 12px Inter", border: on ? "1px solid var(--gold)" : "1px solid rgba(232,184,75,.2)", background: on ? "rgba(232,184,75,.16)" : "rgba(0,0,0,.3)", color: on ? "var(--gold-lt)" : "var(--ink)" }}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              {/* Founding cost */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderRadius: 10, background: "rgba(63,191,111,.08)", border: "1px solid rgba(63,191,111,.22)" }}>
                <span style={{ font: "600 13px Inter", color: "var(--ink)" }}>Founding cost</span>
                <span style={{ display: "flex", alignItems: "center", gap: 7, font: "800 14px Inter", color: "#7ee6a4" }}>✦ Free</span>
              </div>
              <button
                onClick={onCreateSubmit}
                disabled={!gcReady}
                style={{ width: "100%", padding: 14, borderRadius: 11, border: "1px solid var(--gold)", background: gcReady ? "linear-gradient(180deg,#f0c24b,#c98b2e)" : "rgba(232,184,75,.12)", color: gcReady ? "#2a1607" : "var(--ink2)", font: "800 14px Inter", letterSpacing: ".4px", cursor: gcReady ? "pointer" : "not-allowed" }}
              >
                {gcReady ? "Found Guild" : "Name & tag required"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default GuildsPage;
