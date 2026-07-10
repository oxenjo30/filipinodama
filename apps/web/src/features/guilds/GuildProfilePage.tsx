import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { useAuthStore } from "../../stores/authStore";
import { PlayerLink } from "../../components";

type RosterMember = {
  role: string;
  weeklyContribution: number;
  user: { id: string; displayName: string; tag: string; avatarUrl: string | null; frameId: string | null; trophies: number; rankTier: string };
};
type GuildDetail = {
  guild: { id: string; name: string; tag: string; description: string | null; crestKey: string | null; minTrophies: number; joinPolicy: string; weeklyPoints: number; createdAt: string; memberCount: number };
  roster: RosterMember[];
  myRole: string | null;
  joinState: "member" | "in-other-guild" | "requested" | "joinable" | "guest";
};

export function GuildProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const me = useAuthStore((s) => s.me);
  const [data, setData] = useState<GuildDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState(false);
  const [joinState, setJoinState] = useState<GuildDetail["joinState"] | null>(null);

  useEffect(() => {
    let alive = true;
    setData(null); setNotFound(false); setError(false); setJoinState(null);
    if (!id) return;
    api.get<GuildDetail>(`/api/guilds/${id}`)
      .then((res) => { if (alive) { setData(res); setJoinState(res.joinState); } })
      .catch((e) => {
        if (!alive) return;
        if (e instanceof ApiError && e.status === 404) setNotFound(true);
        else setError(true);
      });
    return () => { alive = false; };
  }, [id]);

  const wrap: React.CSSProperties = { maxWidth: 1100, margin: "0 auto", padding: 26 };

  if (notFound) return <div style={wrap}><div className="frame" style={{ padding: 40, textAlign: "center" }}><h1 style={{ font: "800 22px Cinzel,serif", color: "var(--gold-lt)" }}>Guild not found</h1><button className="btn btn-gold" style={{ marginTop: 16, padding: "10px 18px" }} onClick={() => navigate("/guilds")}>Browse Guilds</button></div></div>;
  if (error) return <div style={wrap}><div className="frame" style={{ padding: 40, textAlign: "center", color: "var(--ink2)" }}>Couldn't load this guild. <button className="btn btn-gold" style={{ marginLeft: 10, padding: "8px 14px" }} onClick={() => navigate(0)}>Retry</button></div></div>;
  if (!data || !joinState) return <div style={wrap}><div className="frame" style={{ padding: 40, textAlign: "center", color: "var(--ink2)" }}>Loading…</div></div>;

  const g = data.guild;

  async function onJoin() {
    if (joinState === "guest") { navigate(`/login?next=${encodeURIComponent(location.pathname)}`); return; }
    try {
      const res = await api.post<{ status: string }>(`/api/guilds/${g.id}/join`, {});
      setJoinState(res.status === "joined" ? "member" : "requested");
    } catch { /* server enforces the real guards; leave state */ }
  }

  const joinBtn = () => {
    switch (joinState) {
      case "guest": return <button className="btn btn-gold" style={jbtn} onClick={onJoin}>Sign in to Join</button>;
      case "member": return <button style={{ ...jbtn, opacity: 0.7, cursor: "default", background: "rgba(63,191,111,.15)", color: "#8ce0ad", border: "1px solid rgba(63,191,111,.5)" }} disabled>Member</button>;
      case "in-other-guild": return <button style={{ ...jbtn, opacity: 0.5, cursor: "default", background: "rgba(0,0,0,.3)", color: "var(--ink2)", border: "1px solid rgba(232,184,75,.2)" }} disabled>In another guild</button>;
      case "requested": return <button style={{ ...jbtn, opacity: 0.6, cursor: "default", background: "rgba(0,0,0,.3)", color: "var(--ink2)", border: "1px solid rgba(232,184,75,.2)" }} disabled>Requested</button>;
      case "joinable": return <button className="btn btn-gold" style={jbtn} onClick={onJoin}>{g.joinPolicy === "open" ? "Join Guild" : "Request to Join"}</button>;
    }
  };

  return (
    <div style={wrap}>
      <div className="frame" style={{ padding: 24, display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
        <div style={{ width: 72, height: 72, flex: "none", borderRadius: 12, border: "1px solid rgba(232,184,75,.35)", background: "rgba(15,8,32,.6)", display: "flex", alignItems: "center", justifyContent: "center", font: "800 22px Cinzel,serif", color: "var(--gold-lt)" }}>{g.tag.slice(0, 2).toUpperCase()}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: "800 26px Cinzel,serif", color: "#fff" }}>{g.name}</div>
          <div style={{ font: "700 12px 'JetBrains Mono',monospace", color: "var(--ink2)" }}>{g.tag}</div>
          <div style={{ font: "600 12px Inter", color: "var(--ink2)", marginTop: 4 }}>{g.memberCount} members · {g.weeklyPoints.toLocaleString()} weekly pts · min {g.minTrophies} 🏆</div>
        </div>
        <div>{joinBtn()}</div>
      </div>

      {g.description && (
        <div className="frame" style={{ padding: 20, marginTop: 16 }}>
          <div className="ptitle" style={{ textAlign: "left" }}>About</div>
          <p style={{ font: "400 14px/1.6 Inter", color: "var(--ink)", margin: 0 }}>{g.description}</p>
        </div>
      )}

      <div className="frame" style={{ padding: 20, marginTop: 16 }}>
        <div className="ptitle" style={{ textAlign: "left" }}>Roster ({data.roster.length})</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {data.roster.map((m) => (
            <div key={m.user.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <PlayerLink id={m.user.id} name={m.user.displayName} avatar={m.user.avatarUrl ?? "champion"} frame={m.user.frameId ?? undefined} subtitle={<span style={{ font: "600 11px Inter", color: "var(--ink2)" }}>{m.role}</span>} />
              <span style={{ font: "700 12px 'JetBrains Mono',monospace", color: "var(--gold-lt)" }}>🏆 {m.user.trophies.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const jbtn: React.CSSProperties = { padding: "10px 18px", borderRadius: 10, font: "700 13px Inter", cursor: "pointer", border: "1px solid var(--gold)" };

export default GuildProfilePage;
