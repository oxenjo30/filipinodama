import { useEffect, useState } from "react";
import { useParams, useNavigate, Navigate } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { useAuthStore } from "../../stores/authStore";
import { useAppStore } from "../../stores/appStore";
import { useBlockedStore } from "../../stores/blockedStore";
import { Avatar, GuildLink } from "../../components";
import AchievementsGrid from "./AchievementsGrid";
import { FriendButton, type Relationship } from "./FriendButton";
import { ReportPlayerModal } from "../moderation/ReportPlayerModal";
import { ReplayModal } from "./ReplayModal";

type PublicUser = {
  id: string;
  username: string;
  displayName: string;
  tag: string;
  avatarUrl: string | null;
  frameId: string | null;
  bio: string | null;
  trophies: number;
  wins: number;
  losses: number;
  draws: number;
  streak: number;
  tier: { key: string; label: string; sub: string; accent: string; img: string };
  guild: { id: string; name: string; tag: string } | null;
  isBot: boolean;
  relationship: Relationship;
  requestId?: string;
};

// ── v3 delta: public profile enrichment (guild, favorite move, replays, openings) ──
type RecentMatch = {
  id: string;
  opponentName: string;
  result: "win" | "loss" | "draw";
  mode: "AI" | "CASUAL" | "RANKED" | "PRIVATE" | "LOCAL";
  trophyDelta: number | null;
  endedAt: string | null;
  hasReplay: boolean;
};

type Opening = { label: string; pct: number };

type ProfileExtras = {
  favoriteMove: string | null;
  openings: Opening[];
  recentMatches: RecentMatch[];
  badges: string[];
};

const MODE_LABEL: Record<string, string> = {
  AI: "vs AI",
  CASUAL: "Casual",
  RANKED: "Ranked",
  PRIVATE: "Private",
  LOCAL: "Local",
};

/** Human "x ago" from an ISO timestamp (mirrors ProfilePage's helper). */
function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

export function PublicProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.me);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState(false);
  const [extras, setExtras] = useState<ProfileExtras | null>(null);
  const [replayId, setReplayId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setUser(null); setNotFound(false); setError(false);
    if (!id) return;
    api
      .get<{ user: PublicUser }>(`/api/users/${id}`)
      .then((res) => { if (alive) setUser(res.user); })
      .catch((e) => {
        if (!alive) return;
        if (e instanceof ApiError && e.status === 404) setNotFound(true);
        else setError(true);
      });
    return () => { alive = false; };
  }, [id]);

  // profile-extras is a separate, best-effort fetch — its absence never blocks
  // the rest of the page (identity/stats/achievements already render without it).
  useEffect(() => {
    let alive = true;
    setExtras(null);
    if (!id) return;
    api
      .get<ProfileExtras>(`/api/users/${id}/profile-extras`)
      .then((res) => { if (alive) setExtras(res); })
      .catch(() => {
        // A failed/unauthorized fetch (e.g. a logged-out viewer — the endpoint
        // needs a session) must NOT leave `extras` null forever: null renders the
        // Match Replays panel's "Loading…" state. Fall to honest empties instead.
        if (alive) setExtras({ favoriteMove: null, openings: [], recentMatches: [], badges: [] });
      });
    return () => { alive = false; };
  }, [id]);

  // Your own link → go to the editable self profile.
  if (me && id && me.id === id) return <Navigate to="/profile" replace />;

  const wrap: React.CSSProperties = { maxWidth: 1100, margin: "0 auto", padding: 26 };

  if (notFound) {
    return <div style={wrap}><div className="frame" style={{ padding: 40, textAlign: "center" }}>
      <h1 style={{ font: "800 22px Cinzel,serif", color: "var(--gold-lt)" }}>Player not found</h1>
      <p style={{ color: "var(--ink2)", marginTop: 8 }}>This player doesn't exist or has left the realm.</p>
      <button className="btn btn-gold" style={{ marginTop: 16, padding: "10px 18px" }} onClick={() => navigate("/leaderboard")}>Back to Leaderboard</button>
    </div></div>;
  }
  if (error) {
    return <div style={wrap}><div className="frame" style={{ padding: 40, textAlign: "center" }}>
      <p style={{ color: "var(--ink2)" }}>Couldn't load this profile.</p>
      <button className="btn btn-gold" style={{ marginTop: 12, padding: "10px 18px" }} onClick={() => { setError(false); setUser(null); navigate(0); }}>Retry</button>
    </div></div>;
  }
  if (!user) return <div style={wrap}><div className="frame" style={{ padding: 40, textAlign: "center", color: "var(--ink2)" }}>Loading…</div></div>;

  const total = user.wins + user.losses + user.draws;
  const winRate = total > 0 ? Math.round((user.wins / total) * 100) : 0;
  const stat = (label: string, value: string | number) => (
    <div className="frame" style={{ padding: 16, textAlign: "center" }}>
      <div style={{ font: "800 22px 'JetBrains Mono',monospace", color: "var(--gold-lt)" }}>{value}</div>
      <div style={{ font: "600 11px Inter", color: "var(--ink2)", marginTop: 3 }}>{label}</div>
    </div>
  );

  return (
    <div style={wrap}>
      {/* identity header */}
      <div className="frame" style={{ padding: 24, display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
        <Avatar src={user.avatarUrl ?? "champion"} size={84} frame={user.frameId ?? undefined} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: "800 26px Cinzel,serif", color: "#fff" }}>{user.displayName}</div>
          <div style={{ font: "700 12px 'JetBrains Mono',monospace", color: "var(--ink2)" }}>{user.tag}</div>
          <div style={{ font: "700 12px Inter", color: "var(--gold)", marginTop: 4 }}>{user.tier.label}</div>
          {user.guild && (
            <div style={{ marginTop: 8 }}>
              <GuildLink id={user.guild.id} name={user.guild.name} tag={user.guild.tag} />
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <FriendButton userId={user.id} relationship={user.relationship} requestId={user.requestId} isBot={user.isBot} signedIn={!!me && !me.isGuest} />
          {!user.isBot && me && !me.isGuest && me.id !== user.id && (
            <>
              <BlockButton user={user} />
              <ReportButton userId={user.id} />
            </>
          )}
        </div>
      </div>

      {user.bio && (
        <div className="frame" style={{ padding: 20, marginTop: 16 }}>
          <div className="ptitle" style={{ textAlign: "left" }}>Bio</div>
          <p style={{ font: "400 14px/1.6 Inter", color: "var(--ink)", margin: 0 }}>{user.bio}</p>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginTop: 16 }}>
        {stat("Trophies", user.trophies.toLocaleString())}
        {stat("Wins", user.wins)}
        {stat("Losses", user.losses)}
        {stat("Win Rate", `${winRate}%`)}
      </div>

      <div style={{ marginTop: 16 }}>
        <AchievementsGrid stats={{ wins: user.wins, streak: user.streak, trophies: user.trophies }} />
      </div>

      {/* ── v3 delta: Guild + Favorite Move (2-up stat tile row) ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 16 }}>
        <div className="frame" style={{ padding: 16, textAlign: "center" }}>
          <div style={{ font: "600 11px Inter", color: "var(--ink2)", marginBottom: 6 }}>Guild</div>
          {user.guild ? (
            <div style={{ display: "flex", justifyContent: "center" }}>
              <GuildLink id={user.guild.id} name={user.guild.name} tag={user.guild.tag} size={28} />
            </div>
          ) : (
            <div style={{ font: "700 14px Inter", color: "var(--ink2)" }}>No guild</div>
          )}
        </div>
        <div className="frame" style={{ padding: 16, textAlign: "center" }}>
          <div style={{ font: "600 11px Inter", color: "var(--ink2)", marginBottom: 6 }}>Favorite Move</div>
          <div style={{ font: "800 16px 'JetBrains Mono',monospace", color: "var(--gold-lt)" }}>
            {extras?.favoriteMove ?? "—"}
          </div>
        </div>
      </div>

      {/* ── v3 delta: Match Replays ── */}
      <div className="frame" style={{ padding: 20, marginTop: 16 }}>
        <div className="ptitle" style={{ textAlign: "left" }}>Match Replays</div>
        {extras === null ? (
          <div style={{ textAlign: "center", padding: "24px 12px", color: "var(--ink2)", font: "500 13px Inter" }}>Loading…</div>
        ) : extras.recentMatches.length === 0 ? (
          <div style={{ textAlign: "center", padding: "24px 12px", color: "var(--ink2)", font: "500 13px Inter" }}>No matches yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {extras.recentMatches.map((m) => {
              const rc = m.result === "win" ? "var(--green)" : m.result === "loss" ? "var(--red)" : "var(--ink2)";
              const tint = m.result === "win" ? "rgba(47,143,91,.14)" : m.result === "loss" ? "rgba(199,58,58,.14)" : "rgba(0,0,0,.25)";
              const ring = m.result === "win" ? "rgba(47,143,91,.4)" : m.result === "loss" ? "rgba(199,58,58,.4)" : "rgba(232,184,75,.2)";
              const deltaStr = m.trophyDelta === null ? "—" : `${m.trophyDelta > 0 ? "+" : ""}${m.trophyDelta}`;
              return (
                <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 0", borderTop: "1px solid rgba(232,184,75,.1)" }}>
                  <span style={{ width: 52, flex: "none", textAlign: "center", font: "800 12px Inter", letterSpacing: ".5px", padding: "5px 0", borderRadius: 7, color: rc, background: tint, border: `1px solid ${ring}` }}>
                    {m.result.toUpperCase()}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ font: "700 14px Inter", color: "#efe7fb" }}>vs {m.opponentName}</div>
                    <div style={{ font: "400 12px Inter", color: "var(--ink2)", marginTop: 2 }}>
                      {MODE_LABEL[m.mode] ?? m.mode} · {timeAgo(m.endedAt)}
                    </div>
                  </div>
                  <span style={{ font: "700 13px 'JetBrains Mono',monospace", color: rc, flex: "none" }}>{deltaStr}</span>
                  <button
                    className="btn btn-gold"
                    disabled={!m.hasReplay}
                    onClick={() => setReplayId(m.id)}
                    style={{ padding: "8px 14px", flex: "none", opacity: m.hasReplay ? 1 : 0.4, cursor: m.hasReplay ? "pointer" : "not-allowed" }}
                  >
                    ▶ Replay
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── v3 delta: Badges & Achievements (pill chips) ── */}
      <div className="frame" style={{ padding: 20, marginTop: 16 }}>
        <div className="ptitle" style={{ textAlign: "left" }}>Badges & Achievements</div>
        {extras && extras.badges.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {extras.badges.map((b) => (
              <span
                key={b}
                style={{
                  padding: "6px 14px",
                  borderRadius: 100,
                  border: "1px solid rgba(232,184,75,.35)",
                  background: "rgba(232,184,75,.12)",
                  font: "700 12px Inter",
                  color: "var(--gold-lt)",
                }}
              >
                {b}
              </span>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: "16px 12px", color: "var(--ink2)", font: "500 13px Inter" }}>No badges yet</div>
        )}
      </div>

      {/* ── v3 delta: Favorite Openings (progress-bar list) — needs >=1 opening; "not enough" only when zero ── */}
      <div className="frame" style={{ padding: 20, marginTop: 16 }}>
        <div className="ptitle" style={{ textAlign: "left" }}>Favorite Openings</div>
        {extras && extras.openings.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {extras.openings.map((o) => (
              <div key={o.label}>
                <div style={{ display: "flex", justifyContent: "space-between", font: "600 12px Inter", color: "var(--ink)", marginBottom: 5 }}>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace" }}>{o.label}</span>
                  <span style={{ color: "var(--gold-lt)" }}>{o.pct}%</span>
                </div>
                <div style={{ height: 8, borderRadius: 100, background: "rgba(0,0,0,.4)", border: "1px solid rgba(232,184,75,.2)", overflow: "hidden" }}>
                  <div style={{ width: `${o.pct}%`, height: "100%", background: "linear-gradient(90deg,#c98b2e,#f7e2a0)" }} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: "16px 12px", color: "var(--ink2)", font: "500 13px Inter" }}>
            Not enough games yet
          </div>
        )}
      </div>

      <ReplayModal matchId={replayId} meId={me?.id ?? ""} onClose={() => setReplayId(null)} />
    </div>
  );
}

function ReportButton({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" style={{ padding: "10px 16px", borderRadius: 10, border: "1px solid rgba(224,85,95,.5)", background: "rgba(224,85,95,.12)", color: "#ff9aa8", font: "700 13px Inter", cursor: "pointer" }} onClick={() => setOpen(true)}>
        Report
      </button>
      <ReportPlayerModal open={open} accusedId={userId} context="profile" onClose={() => setOpen(false)} />
    </>
  );
}

/** Block/Unblock — reflects the shared blockedStore, loaded lazily on first use. */
function BlockButton({ user }: { user: PublicUser }) {
  const showToast = useAppStore((s) => s.showToast);
  const load = useBlockedStore((s) => s.load);
  const blockFn = useBlockedStore((s) => s.block);
  const unblockFn = useBlockedStore((s) => s.unblock);
  const blocked = useBlockedStore((s) => s.isBlocked(user.id));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async () => {
    setBusy(true);
    try {
      if (blocked) {
        await unblockFn(user.id);
        showToast(`Unblocked ${user.displayName}.`);
      } else {
        await blockFn({
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          tag: user.tag,
          avatarUrl: user.avatarUrl,
          blockedAt: new Date().toISOString(),
        });
        showToast(`Blocked ${user.displayName}.`);
      }
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : "Couldn't update block status.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void toggle()}
      style={{
        padding: "10px 16px",
        borderRadius: 10,
        border: blocked ? "1px solid rgba(232,184,75,.4)" : "1px solid rgba(224,85,95,.5)",
        background: blocked ? "rgba(232,184,75,.12)" : "rgba(224,85,95,.12)",
        color: blocked ? "var(--gold-lt)" : "#ff9aa8",
        font: "700 13px Inter",
        cursor: busy ? "not-allowed" : "pointer",
        opacity: busy ? 0.6 : 1,
      }}
    >
      {blocked ? "Unblock" : "Block"}
    </button>
  );
}

export default PublicProfilePage;
