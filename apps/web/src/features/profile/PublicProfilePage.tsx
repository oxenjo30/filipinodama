import { useEffect, useState } from "react";
import { useParams, useNavigate, Navigate } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { useAuthStore } from "../../stores/authStore";
import { Avatar, GuildLink } from "../../components";
import AchievementsGrid from "./AchievementsGrid";
import { FriendButton, type Relationship } from "./FriendButton";
import { ReportPlayerModal } from "../moderation/ReportPlayerModal";

type PublicUser = {
  id: string;
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

export function PublicProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.me);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState(false);

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
            <ReportButton userId={user.id} />
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

export default PublicProfilePage;
