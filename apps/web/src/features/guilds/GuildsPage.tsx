import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { rankTierFor } from "@dama/shared";
import { api, ApiError } from "../../lib/api";
import { Avatar } from "../../components";
import { CRESTS, CREST_KEYS, guildCrest, ICONS, type CrestKey } from "../../lib/assets";
import { useAppStore } from "../../stores/appStore";
import { useAuthStore } from "../../stores/authStore";
import { GuildChatPanel } from "./GuildChatPanel";

/**
 * GuildsPage — Guild Hall, ported from the prototype (handoff/FilipinoDama Royal.dc.html,
 * lines 1705-2025) and wired to LIVE backend data.
 *
 * DATA FLOW (all real, no mocks):
 *  - GET /api/guilds?search=            → the "Discover Guilds" browse list.
 *  - GET /api/users/:meId               → my membership ({ guild:{id,tag,role} | null }).
 *  - GET /api/guilds/:id                → my guild banner, roster, myRole.
 *  - GET /api/guilds/:id/requests       → pending join requests (OFFICER+).
 *  - POST /api/guilds                   → create (creator becomes LEADER).
 *  - POST /api/guilds/:id/join          → join / request-to-join.
 *  - PATCH /api/guilds/:id              → edit name/description/minTrophies (OFFICER+).
 *  - PATCH /api/guilds/:id/members/:uid/role  → assign OFFICER/MEMBER (LEADER).
 *  - DELETE /api/guilds/:id/members/:uid       → kick (OFFICER+) or self-leave.
 *  - POST /api/guilds/:id/requests/:rid/accept|decline → review (OFFICER+).
 *
 * When the user is not in a guild we show an honest "not in a guild" banner and
 * the browse list. Logged-out visitors get a sign-in prompt. The prototype's
 * weekly-war opponent/countdown and guild "perks" have no backend fields, so the
 * war meter is driven from real weeklyPoints and the perks describe fixed guild
 * game-mechanics (identical for every guild) — never fabricated per-user stats.
 */

// ── real API shapes ─────────────────────────────────────────────────────────
type ApiGuildCard = {
  id: string;
  name: string;
  tag: string;
  description: string | null;
  crestKey: string | null;
  minTrophies: number;
  weeklyPoints: number;
  memberCount: number;
};

type ApiMember = {
  userId: string;
  role: "LEADER" | "OFFICER" | "MEMBER";
  weeklyContribution: number;
  joinedAt: string;
  user: {
    id: string;
    username: string;
    displayName: string;
    tag: string;
    avatarUrl: string | null;
    frameId: string | null;
    trophies: number;
    rankTier: string;
    lastSeenAt: string;
    presence: string;
  };
};

type ApiGuildDetail = {
  guild: {
    id: string;
    name: string;
    tag: string;
    description: string | null;
    crestKey: string | null;
    minTrophies: number;
    weeklyPoints: number;
    memberCount: number;
    createdAt: string;
  };
  roster: ApiMember[];
  myRole: "LEADER" | "OFFICER" | "MEMBER" | null;
};

type ApiJoinRequest = {
  id: string;
  createdAt: string;
  user: ApiMember["user"];
};

type Role = "LEADER" | "OFFICER" | "MEMBER";
const ROLE_RANK: Record<Role, number> = { MEMBER: 1, OFFICER: 2, LEADER: 3 };
const ROLE_LABEL: Record<Role, string> = { LEADER: "Leader", OFFICER: "Officer", MEMBER: "Member" };
const ROLE_COLOR: Record<Role, string> = { LEADER: "#f0c24b", OFFICER: "#c9a6ff", MEMBER: "var(--ink)" };

/**
 * Emblem — a guild's heraldic crest. Renders the real crest art (transparent PNG
 * render) so every guild shows its ornate emblem, matching the handoff — never an
 * emoji. Pass a guild's `crestKey` (+ `seed` = guild id for a stable fallback),
 * or a resolved `src` directly (for the live create/edit picker preview).
 */
function Emblem({
  crestKey,
  seed = "",
  src,
  size = 56,
}: {
  crestKey?: string | null;
  seed?: string;
  src?: string;
  size?: number;
}) {
  const url = src ?? guildCrest(crestKey, seed).src;
  return (
    <img
      src={url}
      alt=""
      width={size}
      height={size}
      style={{
        width: size,
        height: size,
        flex: "none",
        objectFit: "contain",
        filter: "drop-shadow(0 6px 14px rgba(0,0,0,.55))",
      }}
    />
  );
}

/**
 * Trophy — the real gold trophy icon image (ICONS.trophy). Used in place of the
 * 🏆 emoji so it always renders as the app's crest-gold trophy (the emoji does
 * not render consistently across platforms/headless).
 */
function Trophy({ size = 16 }: { size?: number }) {
  return (
    <img
      src={ICONS.trophy}
      alt="Trophies"
      width={size}
      height={size}
      style={{ width: size, height: size, objectFit: "contain", flex: "none", verticalAlign: "-2px" }}
    />
  );
}

const GC_POLICIES: { key: string; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "request", label: "Request" },
  { key: "invite", label: "Invite Only" },
];

// Fixed guild game-mechanics (identical for every guild — not per-user data).
const GUILD_PERKS: { icon: string; title: string; desc: string }[] = [
  { icon: "⚔️", title: "Weekly Guild War", desc: "Play ranked to add war points and climb the guild ladder together." },
  { icon: "🏆", title: "Shared Standing", desc: "Members' contributions roll up into one global guild rank." },
  { icon: "💬", title: "Guild Chat", desc: "A private channel to coordinate, spar, and rally your alliance." },
  { icon: "🛡️", title: "Roles & Command", desc: "Leaders and officers manage the roster and review who joins." },
];

// Permission matrix (fixed guild rules).
const PERM_MATRIX: { label: string; leader: boolean; officer: boolean; member: boolean }[] = [
  { label: "Play in guild wars", leader: true, officer: true, member: true },
  { label: "Use guild chat", leader: true, officer: true, member: true },
  { label: "Review join requests", leader: true, officer: true, member: false },
  { label: "Kick members", leader: true, officer: true, member: false },
  { label: "Assign officer role", leader: true, officer: false, member: false },
  { label: "Edit guild & crest", leader: true, officer: true, member: false },
];

function tierBadge(trophies: number) {
  const t = rankTierFor(trophies);
  return { label: t.label, color: t.accent, border: t.accent + "66" };
}

// A member is "online" if seen in the last 5 minutes.
function isOnline(lastSeenAt: string): boolean {
  const t = new Date(lastSeenAt).getTime();
  return Number.isFinite(t) && Date.now() - t < 5 * 60 * 1000;
}
function statusFor(lastSeenAt: string): { label: string; color: string } {
  if (isOnline(lastSeenAt)) return { label: "Online", color: "#5fd48a" };
  const t = new Date(lastSeenAt).getTime();
  if (!Number.isFinite(t)) return { label: "Offline", color: "var(--ink2)" };
  const mins = Math.floor((Date.now() - t) / 60000);
  if (mins < 60) return { label: `${mins}m ago`, color: "var(--ink2)" };
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return { label: `${hrs}h ago`, color: "var(--ink2)" };
  return { label: `${Math.floor(hrs / 24)}d ago`, color: "var(--ink2)" };
}

export function GuildsPage() {
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.me);
  const showToast = useAppStore((s) => s.showToast);

  // browse
  const [search, setSearch] = useState("");
  const [browse, setBrowse] = useState<ApiGuildCard[] | null>(null);

  // my guild
  const [membershipChecked, setMembershipChecked] = useState(false);
  const [myGuildId, setMyGuildId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ApiGuildDetail | null>(null);
  const [requests, setRequests] = useState<ApiJoinRequest[] | null>(null);
  const [busy, setBusy] = useState(false);

  // ── loaders ────────────────────────────────────────────────────────────────
  const loadBrowse = useCallback(async (q: string) => {
    try {
      const data = await api.get<{ guilds: ApiGuildCard[] }>(
        `/api/guilds${q.trim() ? `?search=${encodeURIComponent(q.trim())}` : ""}`,
      );
      setBrowse(data.guilds);
    } catch {
      setBrowse([]);
    }
  }, []);

  const loadDetail = useCallback(async (guildId: string, myRole?: Role | null) => {
    try {
      const d = await api.get<ApiGuildDetail>(`/api/guilds/${guildId}`);
      setDetail(d);
      const role = d.myRole ?? myRole ?? null;
      if (role && ROLE_RANK[role] >= ROLE_RANK.OFFICER) {
        try {
          const r = await api.get<{ requests: ApiJoinRequest[] }>(`/api/guilds/${guildId}/requests`);
          setRequests(r.requests);
        } catch {
          setRequests([]);
        }
      } else {
        setRequests(null);
      }
    } catch {
      setDetail(null);
    }
  }, []);

  // discover my membership from my public profile, then hydrate my guild.
  const loadMembership = useCallback(async () => {
    if (!me) {
      setMembershipChecked(true);
      setMyGuildId(null);
      setDetail(null);
      setRequests(null);
      return;
    }
    try {
      const { user } = await api.get<{ user: { guild: { id: string; role: Role } | null } }>(
        `/api/users/${me.id}`,
      );
      const gid = user.guild?.id ?? null;
      setMyGuildId(gid);
      if (gid) await loadDetail(gid, user.guild?.role ?? null);
      else {
        setDetail(null);
        setRequests(null);
      }
    } catch {
      setMyGuildId(null);
      setDetail(null);
    } finally {
      setMembershipChecked(true);
    }
  }, [me, loadDetail]);

  useEffect(() => {
    void loadBrowse("");
  }, [loadBrowse]);
  useEffect(() => {
    void loadMembership();
  }, [loadMembership]);

  const inGuild = !!myGuildId && !!detail;
  const myRole: Role | null = detail?.myRole ?? null;
  const canManage = myRole ? ROLE_RANK[myRole] >= ROLE_RANK.OFFICER : false;
  const isLeader = myRole === "LEADER";

  const myMember = useMemo(
    () => (me && detail ? detail.roster.find((m) => m.userId === me.id) ?? null : null),
    [me, detail],
  );
  const onlineCount = useMemo(
    () => (detail ? detail.roster.filter((m) => isOnline(m.user.lastSeenAt)).length : 0),
    [detail],
  );
  const myContribRank = useMemo(() => {
    if (!detail || !me) return null;
    const sorted = [...detail.roster].sort((a, b) => b.weeklyContribution - a.weeklyContribution);
    const idx = sorted.findIndex((m) => m.userId === me.id);
    return idx >= 0 ? idx + 1 : null;
  }, [detail, me]);

  // Honest war meter derived from real weeklyPoints toward a rolling weekly goal.
  const warPct = useMemo(() => {
    if (!detail) return 0;
    const pts = detail.guild.weeklyPoints;
    const goal = Math.max(1000, Math.ceil((pts + 1) / 1000) * 1000);
    return Math.min(100, Math.round((pts / goal) * 100));
  }, [detail]);

  // ── create modal ─────────────────────────────────────────────────────────
  const [createShow, setCreateShow] = useState(false);
  const [gcCrest, setGcCrest] = useState<CrestKey>(CREST_KEYS[0]);
  const [gcName, setGcName] = useState("");
  const [gcTag, setGcTag] = useState("");
  const [gcDesc, setGcDesc] = useState("");
  const [gcPolicy, setGcPolicy] = useState("open");
  const gcReady = gcName.trim().length >= 3 && gcTag.trim().length >= 2;

  const openCreate = () => {
    if (!me) {
      showToast("Sign in to create a guild.");
      return;
    }
    setCreateShow(true);
  };
  const submitCreate = async () => {
    if (!gcReady || busy || !me) return;
    setBusy(true);
    try {
      const { guild } = await api.post<{ guild: ApiGuildCard }>("/api/guilds", {
        name: gcName.trim(),
        tag: gcTag.trim().toUpperCase(),
        crestKey: gcCrest,
        ...(gcDesc.trim() ? { description: gcDesc.trim() } : {}),
      });
      setCreateShow(false);
      setGcName("");
      setGcTag("");
      setGcDesc("");
      showToast(`${guild.name} founded — you are the Leader.`);
      setMyGuildId(guild.id);
      await loadDetail(guild.id, "LEADER");
      await loadBrowse(search);
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : "Could not create guild.");
    } finally {
      setBusy(false);
    }
  };

  // ── join ─────────────────────────────────────────────────────────────────
  const onJoin = async (g: ApiGuildCard) => {
    if (!me) {
      showToast("Sign in to join a guild.");
      return;
    }
    if (myGuildId) {
      showToast("Leave your current guild before joining another.");
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      const res = await api.post<{ status: "joined" | "requested" }>(`/api/guilds/${g.id}/join`, {});
      if (res.status === "joined") {
        showToast(`Joined ${g.name}!`);
        setMyGuildId(g.id);
        await loadDetail(g.id, "MEMBER");
      } else {
        showToast(`Requested to join ${g.name}. An officer will review it.`);
      }
      await loadBrowse(search);
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : "Could not join guild.");
    } finally {
      setBusy(false);
    }
  };

  // ── leave ─────────────────────────────────────────────────────────────────
  const onLeave = async () => {
    if (!me || !myGuildId || busy) return;
    if (!window.confirm("Leave this guild? You'll lose your membership and role.")) return;
    setBusy(true);
    try {
      await api.del(`/api/guilds/${myGuildId}/members/${me.id}`);
      showToast("You left the guild.");
      setMyGuildId(null);
      setDetail(null);
      setRequests(null);
      await loadBrowse(search);
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : "Could not leave guild.");
    } finally {
      setBusy(false);
    }
  };

  // ── manage member modal ────────────────────────────────────────────────────
  const [manage, setManage] = useState<ApiMember | null>(null);
  const changeRole = async (target: ApiMember, role: "OFFICER" | "MEMBER") => {
    if (!myGuildId || busy) return;
    setBusy(true);
    try {
      await api.patch(`/api/guilds/${myGuildId}/members/${target.userId}/role`, { role });
      showToast(`${target.user.displayName} is now ${ROLE_LABEL[role]}.`);
      setManage(null);
      await loadDetail(myGuildId, myRole);
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : "Could not change role.");
    } finally {
      setBusy(false);
    }
  };
  const kickMember = async (target: ApiMember) => {
    if (!myGuildId || busy) return;
    if (!window.confirm(`Remove ${target.user.displayName} from the guild?`)) return;
    setBusy(true);
    try {
      await api.del(`/api/guilds/${myGuildId}/members/${target.userId}`);
      showToast(`${target.user.displayName} was removed from the guild.`);
      setManage(null);
      await loadDetail(myGuildId, myRole);
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : "Could not remove member.");
    } finally {
      setBusy(false);
    }
  };

  // ── join-request review ─────────────────────────────────────────────────────
  const reviewRequest = async (r: ApiJoinRequest, action: "accept" | "decline") => {
    if (!myGuildId || busy) return;
    setBusy(true);
    try {
      await api.post(`/api/guilds/${myGuildId}/requests/${r.id}/${action}`, {});
      showToast(action === "accept" ? `${r.user.displayName} joined the guild.` : "Request declined.");
      setRequests((prev) => (prev ? prev.filter((x) => x.id !== r.id) : prev));
      if (action === "accept") await loadDetail(myGuildId, myRole);
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : "Could not update request.");
    } finally {
      setBusy(false);
    }
  };

  // ── edit modal ─────────────────────────────────────────────────────────────
  const [editShow, setEditShow] = useState(false);
  const [geName, setGeName] = useState("");
  const [geDesc, setGeDesc] = useState("");
  const [geMin, setGeMin] = useState(0);
  const [geCrest, setGeCrest] = useState<CrestKey>(CREST_KEYS[0]);
  const openEdit = () => {
    if (!detail) return;
    setGeName(detail.guild.name);
    setGeDesc(detail.guild.description ?? "");
    setGeMin(detail.guild.minTrophies);
    setGeCrest(guildCrest(detail.guild.crestKey, detail.guild.id).key);
    setEditShow(true);
  };
  const saveEdit = async () => {
    if (!myGuildId || busy) return;
    setBusy(true);
    try {
      await api.patch(`/api/guilds/${myGuildId}`, {
        name: geName.trim(),
        description: geDesc.trim(),
        minTrophies: geMin,
        crestKey: geCrest,
      });
      showToast("Guild updated.");
      setEditShow(false);
      await loadDetail(myGuildId, myRole);
      await loadBrowse(search);
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : "Could not save changes.");
    } finally {
      setBusy(false);
    }
  };

  // ── contribute modal ────────────────────────────────────────────────────────
  const [contribShow, setContribShow] = useState(false);
  const [guildChatOpen, setGuildChatOpen] = useState(false);

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

      {/* Logged-out prompt */}
      {!me && (
        <div className="frame" style={{ padding: 30, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 34 }}>🛡️</div>
          <div style={{ font: "800 22px Cinzel,serif", color: "var(--gold-lt)" }}>Sign in to join the alliance</div>
          <p style={{ margin: 0, font: "500 13.5px/1.5 Inter", color: "var(--ink2)", maxWidth: 460 }}>
            Guilds war together, share perks, and climb the ranks as one. Sign in to found or join a guild.
          </p>
          <button className="btn btn-gold" onClick={() => navigate("/login")} style={{ padding: "12px 26px", marginTop: 4 }}>Sign In</button>
        </div>
      )}

      {/* ── MY GUILD (only when genuinely a member) ── */}
      {me && inGuild && detail && (
        <>
          {/* Banner */}
          <div className="frame" style={{ padding: 26, display: "flex", gap: 22, alignItems: "center", flexWrap: "wrap", background: "linear-gradient(135deg,rgba(122,75,191,.22),rgba(15,8,32,.1))" }}>
            <div style={{ flex: "none" }}>
              <Emblem crestKey={detail.guild.crestKey} seed={detail.guild.id} size={92} />
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ font: "800 26px Cinzel,serif", color: "var(--gold-lt)" }}>{detail.guild.name}</span>
                <span style={{ font: "700 13px 'JetBrains Mono',monospace", color: "var(--ink2)" }}>{detail.guild.tag}</span>
              </div>
              <div style={{ display: "flex", gap: 22, marginTop: 12, flexWrap: "wrap" }}>
                <div>
                  <div style={{ font: "800 18px 'JetBrains Mono',monospace", color: "#fff" }}>{detail.guild.memberCount}</div>
                  <div style={{ font: "500 11px Inter", color: "var(--ink2)" }}>Members</div>
                </div>
                <div>
                  <div style={{ font: "800 18px 'JetBrains Mono',monospace", color: "var(--gold-lt)" }}>{detail.guild.weeklyPoints.toLocaleString()}</div>
                  <div style={{ font: "500 11px Inter", color: "var(--ink2)" }}>Weekly Points</div>
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, font: "800 18px 'JetBrains Mono',monospace", color: "#fff" }}><Trophy size={18} /> {detail.guild.minTrophies.toLocaleString()}</div>
                  <div style={{ font: "500 11px Inter", color: "var(--ink2)" }}>Min. to Join</div>
                </div>
              </div>
              {detail.guild.description && (
                <p style={{ margin: "12px 0 0", font: "500 13.5px Inter", lineHeight: 1.5, color: "var(--ink2)", maxWidth: 560 }}>{detail.guild.description}</p>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 9, flex: "none" }}>
              <button className="btn btn-purple" onClick={() => setGuildChatOpen(true)} style={{ padding: "11px 20px" }}>💬 Guild Chat</button>
              {canManage && (
                <button onClick={openEdit} style={{ padding: "10px 20px", borderRadius: 9, border: "1px solid rgba(232,184,75,.4)", background: "rgba(232,184,75,.1)", color: "var(--gold-lt)", font: "700 12px Inter", cursor: "pointer" }}>✎ Edit Guild</button>
              )}
              <button onClick={onLeave} disabled={busy} style={{ padding: "10px 20px", borderRadius: 9, border: "1px solid rgba(232,184,75,.2)", background: "transparent", color: "var(--ink2)", font: "700 12px Inter", cursor: busy ? "not-allowed" : "pointer" }}>Leave Guild</button>
            </div>
          </div>

          {/* Weekly war + your contribution */}
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16 }}>
            <div className="frame" style={{ padding: 22 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <span className="ptitle" style={{ margin: 0 }}>Weekly Guild War</span>
                <span style={{ font: "700 12px Inter", color: "var(--gold)" }}>{warPct}% to goal</span>
              </div>
              <div style={{ height: 14, borderRadius: 100, background: "rgba(0,0,0,.35)", border: "1px solid rgba(232,184,75,.15)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${warPct}%`, background: "linear-gradient(90deg,#7a4bbf,#f0c24b)", borderRadius: 100 }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, font: "500 12px Inter", color: "var(--ink2)" }}>
                <span>{detail.guild.weeklyPoints.toLocaleString()} war points this week</span>
                <span>Play ranked to earn more</span>
              </div>
            </div>
            <div className="frame" style={{ padding: 22, textAlign: "center", display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <div style={{ font: "500 11px Inter", letterSpacing: "1px", textTransform: "uppercase", color: "var(--gold-lt)" }}>Your Contribution</div>
              <div style={{ font: "800 30px 'JetBrains Mono',monospace", color: "#fff", margin: "6px 0 2px" }}>{(myMember?.weeklyContribution ?? 0).toLocaleString()}</div>
              <div style={{ font: "500 12px Inter", color: "var(--ink2)", marginBottom: 14 }}>{myContribRank ? `Ranked #${myContribRank}` : "Not yet ranked"}</div>
              <button className="btn btn-gold" onClick={() => setContribShow(true)} style={{ width: "100%", padding: 10 }}>Contribute</button>
            </div>
          </div>

          {/* Perks (fixed guild game-mechanics) */}
          <div className="frame" style={{ padding: 22 }}>
            <div className="ptitle" style={{ textAlign: "left", marginBottom: 14 }}>Guild Perks</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {GUILD_PERKS.map((p) => (
                <div key={p.title} style={{ display: "flex", alignItems: "center", gap: 13, padding: 14, borderRadius: 12, border: "1px solid rgba(232,184,75,.14)", background: "rgba(0,0,0,.2)" }}>
                  <span style={{ fontSize: 26, flex: "none" }}>{p.icon}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ font: "700 14px Inter", color: "#fff" }}>{p.title}</div>
                    <div style={{ font: "500 12px Inter", color: "var(--ink2)", marginTop: 2 }}>{p.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Roster */}
          <div className="frame" style={{ padding: 22 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div className="ptitle" style={{ textAlign: "left" }}>Members · {detail.guild.memberCount}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#5fd48a", boxShadow: "0 0 6px #5fd48a" }} />
                <span style={{ font: "700 12px Inter", color: "#5fd48a" }}>{onlineCount} online</span>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[...detail.roster]
                .sort((a, b) => b.weeklyContribution - a.weeklyContribution)
                .map((m, i) => {
                  const status = statusFor(m.user.lastSeenAt);
                  const mine = me && m.userId === me.id;
                  // Can I manage this member? OFFICER+ and strictly higher rank than the target, not myself.
                  const manageable = !!canManage && !mine && ROLE_RANK[myRole ?? "MEMBER"] > ROLE_RANK[m.role];
                  return (
                    <div key={m.userId} style={{ display: "flex", alignItems: "center", gap: 13, padding: 12, borderRadius: 12, border: mine ? "1px solid rgba(232,184,75,.35)" : "1px solid rgba(232,184,75,.12)", background: mine ? "rgba(232,184,75,.06)" : "rgba(0,0,0,.2)" }}>
                      <span style={{ font: "800 14px 'JetBrains Mono',monospace", color: "var(--ink2)", width: 20, flex: "none", textAlign: "center" }}>{i + 1}</span>
                      <Avatar src={m.user.avatarUrl ?? "champion"} frame={m.user.frameId ?? undefined} size={40} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ font: "700 15px Inter", color: "#fff" }}>{m.user.displayName}{mine ? " (You)" : ""}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 2 }}>
                          <span style={{ font: "700 11px Inter", color: ROLE_COLOR[m.role] }}>{ROLE_LABEL[m.role]}</span>
                          <span style={{ font: "500 11px Inter", color: status.color }}>· {status.label}</span>
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flex: "none" }}>
                        <div style={{ font: "800 15px 'JetBrains Mono',monospace", color: "var(--gold-lt)" }}>{m.weeklyContribution.toLocaleString()}</div>
                        <div style={{ font: "500 10px Inter", color: "var(--ink2)" }}>points</div>
                      </div>
                      {manageable && (
                        <button onClick={() => setManage(m)} title="Manage member" style={{ flex: "none", width: 34, height: 34, borderRadius: 8, border: "1px solid rgba(232,184,75,.25)", background: "rgba(15,8,32,.5)", color: "var(--gold-lt)", font: "800 16px Inter", cursor: "pointer", lineHeight: 1 }}>⋯</button>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Roles & Permissions */}
          <div className="frame" style={{ padding: 22 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <div className="ptitle" style={{ textAlign: "left", margin: 0 }}>Roles &amp; Permissions</div>
              {myRole && (
                <span style={{ font: "600 11px Inter", color: "var(--ink2)" }}>Your role: <b style={{ color: ROLE_COLOR[myRole] }}>{ROLE_LABEL[myRole]}</b></span>
              )}
            </div>
            <div style={{ font: "500 12px Inter", color: "var(--ink2)", marginBottom: 16 }}>Each rank grants what a member can do in the guild. Leaders manage everyone; Officers manage Members.</div>
            <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1fr", gap: 0, border: "1px solid rgba(232,184,75,.14)", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "11px 14px", background: "rgba(15,8,32,.5)", font: "700 11px Inter", letterSpacing: ".5px", textTransform: "uppercase", color: "var(--ink2)" }}>Permission</div>
              <div style={{ padding: "11px 8px", background: "rgba(240,194,75,.1)", textAlign: "center", font: "800 12px Cinzel,serif", color: "#f0c24b" }}>Leader</div>
              <div style={{ padding: "11px 8px", background: "rgba(201,166,255,.1)", textAlign: "center", font: "800 12px Cinzel,serif", color: "#c9a6ff" }}>Officer</div>
              <div style={{ padding: "11px 8px", background: "rgba(0,0,0,.2)", textAlign: "center", font: "800 12px Cinzel,serif", color: "var(--ink)" }}>Member</div>
              {PERM_MATRIX.map((p, idx) => {
                const labelStyle: React.CSSProperties = { padding: "11px 14px", font: "600 12.5px Inter", color: "#fff", borderTop: idx === 0 ? "none" : "1px solid rgba(232,184,75,.08)", background: "rgba(0,0,0,.12)" };
                const cell = (on: boolean): React.CSSProperties => ({ padding: "11px 8px", textAlign: "center", font: "800 14px Inter", color: on ? "#6ee0a0" : "#6b6480", borderTop: idx === 0 ? "none" : "1px solid rgba(232,184,75,.08)" });
                return (
                  <Fragment key={p.label}>
                    <div style={labelStyle}>{p.label}</div>
                    <div style={cell(p.leader)}>{p.leader ? "✓" : "–"}</div>
                    <div style={cell(p.officer)}>{p.officer ? "✓" : "–"}</div>
                    <div style={cell(p.member)}>{p.member ? "✓" : "–"}</div>
                  </Fragment>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 16, marginTop: 14, flexWrap: "wrap" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6, font: "600 11px Inter", color: "var(--ink2)" }}><span style={{ color: "#6ee0a0", fontSize: 13 }}>✓</span> Allowed</span>
              <span style={{ display: "flex", alignItems: "center", gap: 6, font: "600 11px Inter", color: "var(--ink2)" }}><span style={{ color: "#6b6480", fontSize: 13 }}>–</span> Not allowed</span>
            </div>
          </div>

          {/* Join Requests (officer+) */}
          {canManage && (
            <div className="frame" style={{ padding: 22 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div className="ptitle" style={{ textAlign: "left", margin: 0 }}>Join Requests</div>
                  {requests && requests.length > 0 && (
                    <span style={{ minWidth: 22, height: 22, padding: "0 7px", borderRadius: 100, background: "linear-gradient(135deg,#e85d73,#c23a52)", color: "#fff", font: "800 12px 'JetBrains Mono',monospace", display: "inline-flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 10px rgba(232,93,115,.5)" }}>{requests.length}</span>
                  )}
                </div>
                <span style={{ font: "600 11px Inter", letterSpacing: ".4px", color: "var(--ink2)" }}>Officer review</span>
              </div>
              {requests === null ? (
                <div style={{ padding: "26px 16px", textAlign: "center", color: "var(--ink2)", font: "500 13px Inter" }}>Loading requests…</div>
              ) : requests.length === 0 ? (
                <div style={{ padding: "26px 16px", textAlign: "center", color: "var(--ink2)", font: "500 13px Inter" }}>No pending requests. New applicants will appear here for review.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {requests.map((r) => {
                    const tb = tierBadge(r.user.trophies);
                    return (
                      <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 13, padding: 13, borderRadius: 12, border: "1px solid rgba(232,184,75,.14)", background: "rgba(15,8,32,.4)" }}>
                        <Avatar src={r.user.avatarUrl ?? "champion"} size={44} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <span style={{ font: "700 15px Inter", color: "#fff" }}>{r.user.displayName}</span>
                            <span style={{ font: "700 10px 'JetBrains Mono',monospace", color: "var(--ink2)" }}>{r.user.tag}</span>
                            <span style={{ padding: "2px 8px", borderRadius: 100, border: `1px solid ${tb.border}`, font: "700 10px Inter", color: tb.color }}>{tb.label}</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 4, font: "500 10px Inter", color: "var(--ink2)", marginTop: 3 }}><Trophy size={12} /> {r.user.trophies.toLocaleString()} · applied {statusFor(r.createdAt).label}</div>
                        </div>
                        <div style={{ display: "flex", gap: 7, flex: "none" }}>
                          <button onClick={() => reviewRequest(r, "decline")} disabled={busy} style={{ width: 38, height: 38, borderRadius: 9, border: "1px solid rgba(232,93,115,.35)", background: "rgba(232,93,115,.1)", color: "#ff8398", font: "700 16px Inter", cursor: busy ? "not-allowed" : "pointer" }} title="Decline">✕</button>
                          <button onClick={() => reviewRequest(r, "accept")} disabled={busy} style={{ width: 38, height: 38, borderRadius: 9, border: "1px solid rgba(95,212,138,.4)", background: "rgba(95,212,138,.12)", color: "#6ee0a0", font: "700 16px Inter", cursor: busy ? "not-allowed" : "pointer" }} title="Approve">✓</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── NOT IN A GUILD (honest empty state) ── */}
      {me && membershipChecked && !inGuild && (
        <div className="frame" style={{ padding: 30, display: "flex", gap: 22, alignItems: "center", flexWrap: "wrap", background: "linear-gradient(135deg,rgba(122,75,191,.22),rgba(15,8,32,.1))" }}>
          <div style={{ width: 72, height: 72, flex: "none", borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34, background: "linear-gradient(135deg,rgba(122,75,191,.3),rgba(15,8,32,.3))", border: "1px solid rgba(232,184,75,.3)" }}>🛡️</div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ font: "800 22px Cinzel,serif", color: "var(--gold-lt)" }}>You are not in a guild yet</div>
            <p style={{ margin: "8px 0 0", font: "500 13.5px Inter", lineHeight: 1.5, color: "var(--ink2)", maxWidth: 520 }}>
              Guilds are alliances of players who war together, share perks, and climb the ranks as one. Browse the guilds below to find your people — or found your own and lead the charge.
            </p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 9, flex: "none" }}>
            <button onClick={openCreate} style={{ padding: "12px 22px", borderRadius: 9, border: "1px solid rgba(232,184,75,.4)", background: "rgba(232,184,75,.1)", color: "var(--gold-lt)", font: "700 12px Inter", letterSpacing: ".3px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>＋ Create Guild</button>
          </div>
        </div>
      )}

      {/* Loading membership */}
      {me && !membershipChecked && (
        <div className="frame" style={{ padding: 30, textAlign: "center", font: "500 13px Inter", color: "var(--ink2)" }}>Loading your guild…</div>
      )}

      {/* ── DISCOVER / BROWSE (always, unless not in guild is shown; hidden while in guild? prototype shows browse to members too) ── */}
      <div className="frame" style={{ padding: 22 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 12, flexWrap: "wrap" }}>
          <div className="ptitle" style={{ textAlign: "left" }}>Discover Guilds</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flex: "none" }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void loadBrowse(search); }}
              placeholder="Search guilds…"
              style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(232,184,75,.25)", background: "rgba(0,0,0,.3)", color: "#fff", font: "600 13px Inter", outline: "none", width: 160 }}
            />
            {!myGuildId && (
              <button onClick={openCreate} style={{ flex: "none", padding: "9px 16px", borderRadius: 8, border: "1px solid rgba(232,184,75,.4)", background: "rgba(232,184,75,.1)", color: "var(--gold-lt)", font: "700 12px Inter", letterSpacing: ".3px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>＋ Create Guild</button>
            )}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {browse === null ? (
            <div style={{ padding: "26px 12px", textAlign: "center", font: "500 13px Inter", color: "var(--ink2)" }}>Loading guilds…</div>
          ) : browse.length === 0 ? (
            <div style={{ padding: "26px 12px", textAlign: "center", font: "500 13px Inter", color: "var(--ink2)" }}>
              {search.trim() ? "No guilds match your search." : "No guilds yet — be the first to found one."}
            </div>
          ) : (
            browse.map((g) => {
              const open = g.minTrophies <= 0;
              const isMine = g.id === myGuildId;
              const joinStyle: React.CSSProperties = isMine
                ? { flex: "none", padding: "9px 18px", borderRadius: 8, border: "1px solid rgba(232,184,75,.2)", background: "rgba(15,8,32,.5)", color: "var(--ink2)", font: "700 12px Inter", cursor: "default" }
                : open
                  ? { flex: "none", padding: "9px 18px", borderRadius: 8, border: "1px solid rgba(95,212,138,.4)", background: "rgba(95,212,138,.12)", color: "#6ee0a0", font: "700 12px Inter", letterSpacing: ".3px", cursor: "pointer" }
                  : { flex: "none", padding: "9px 18px", borderRadius: 8, border: "1px solid rgba(232,184,75,.35)", background: "rgba(232,184,75,.1)", color: "var(--gold-lt)", font: "700 12px Inter", letterSpacing: ".3px", cursor: "pointer" };
              return (
                <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: 12, borderRadius: 12, border: "1px solid rgba(232,184,75,.12)", background: "rgba(0,0,0,.2)" }}>
                  <Emblem crestKey={g.crestKey} seed={g.id} size={52} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ font: "700 15px Inter", color: "#fff" }}>{g.name}</span>
                      <span style={{ font: "700 11px 'JetBrains Mono',monospace", color: "var(--ink2)" }}>{g.tag}</span>
                      {g.minTrophies > 0 && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 100, border: "1px solid rgba(232,184,75,.2)", background: "rgba(15,8,32,.5)", font: "600 10px Inter", color: "var(--gold)" }}><Trophy size={11} /> {g.minTrophies.toLocaleString()}+</span>
                      )}
                    </div>
                    <div style={{ font: "500 12px Inter", color: "var(--ink2)", marginTop: 3 }}>{g.memberCount} members · {g.weeklyPoints.toLocaleString()} pts</div>
                  </div>
                  <button onClick={() => { if (!isMine) void onJoin(g); }} disabled={isMine || busy} style={joinStyle}>{isMine ? "Your Guild" : open ? "Join" : "Request"}</button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Manage member modal ── */}
      {manage && (
        <div onClick={() => setManage(null)} style={{ position: "fixed", inset: 0, zIndex: 82, background: "rgba(8,4,18,.72)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 400, borderRadius: 18, border: "1px solid rgba(232,184,75,.35)", background: "linear-gradient(180deg,#1a0f30,#140a24)", boxShadow: "0 30px 80px rgba(0,0,0,.6)", overflow: "hidden" }}>
            <div style={{ padding: "22px 24px 18px", display: "flex", alignItems: "center", gap: 14, borderBottom: "1px solid rgba(232,184,75,.16)" }}>
              <Avatar src={manage.user.avatarUrl ?? "champion"} size={48} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ font: "800 19px Cinzel,serif", color: "var(--gold-lt)" }}>{manage.user.displayName}</div>
                <div style={{ font: "600 12px Inter", color: "var(--ink2)", marginTop: 2 }}>Current role · <b style={{ color: ROLE_COLOR[manage.role] }}>{ROLE_LABEL[manage.role]}</b></div>
              </div>
              <button onClick={() => setManage(null)} style={{ flex: "none", width: 34, height: 34, borderRadius: 9, border: "1px solid rgba(232,184,75,.2)", background: "transparent", color: "var(--ink2)", font: "700 17px Inter", cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ padding: "20px 24px" }}>
              {isLeader && (
                <>
                  <div style={{ font: "700 11px Inter", letterSpacing: "1.2px", textTransform: "uppercase", color: "var(--gold-lt)", marginBottom: 10 }}>Assign Role</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                    {(["OFFICER", "MEMBER"] as const).map((role) => {
                      const on = manage.role === role;
                      return (
                        <button
                          key={role}
                          onClick={() => { if (!on) void changeRole(manage, role); }}
                          disabled={busy}
                          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderRadius: 10, cursor: on || busy ? "default" : "pointer", border: on ? "1px solid var(--gold)" : "1px solid rgba(232,184,75,.18)", background: on ? "rgba(232,184,75,.12)" : "rgba(0,0,0,.25)" }}
                        >
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
                            <span style={{ font: "700 14px Inter", color: "#fff" }}>{ROLE_LABEL[role]}</span>
                            <span style={{ font: "500 11px Inter", color: "var(--ink2)" }}>{role === "OFFICER" ? "Can review requests and kick members" : "Can play wars and use guild chat"}</span>
                          </div>
                          <span style={{ font: "800 15px Inter", color: on ? "#6ee0a0" : "transparent" }}>✓</span>
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ height: 1, background: "rgba(232,184,75,.14)", margin: "18px 0" }} />
                </>
              )}
              <button onClick={() => void kickMember(manage)} disabled={busy} style={{ width: "100%", padding: 12, borderRadius: 10, border: "1px solid rgba(232,93,115,.4)", background: "rgba(232,93,115,.1)", color: "#ff8398", font: "700 13px Inter", letterSpacing: ".4px", cursor: busy ? "not-allowed" : "pointer" }}>Kick from Guild</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Create Guild modal ── */}
      {createShow && (
        <div onClick={() => setCreateShow(false)} style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(8,4,18,.72)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 440, maxHeight: "88vh", overflow: "auto", borderRadius: 18, border: "1px solid rgba(232,184,75,.35)", background: "linear-gradient(180deg,#1a0f30,#140a24)", boxShadow: "0 24px 70px rgba(0,0,0,.6)" }}>
            <div style={{ padding: "22px 24px", borderBottom: "1px solid rgba(232,184,75,.14)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ font: "800 18px Cinzel,serif", color: "var(--gold-lt)", letterSpacing: ".5px" }}>Create a Guild</div>
              <button onClick={() => setCreateShow(false)} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid rgba(232,184,75,.2)", background: "rgba(0,0,0,.25)", color: "var(--ink2)", font: "700 16px Inter", cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ padding: "22px 24px", display: "flex", flexDirection: "column", gap: 18 }}>
              <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                <Emblem src={CRESTS[gcCrest].src} size={62} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: "700 12px Inter", color: "var(--ink)", marginBottom: 2 }}>Guild Crest</div>
                  <div style={{ font: "700 13px Cinzel,serif", color: "var(--gold-lt)", marginBottom: 8 }}>{CRESTS[gcCrest].name}</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {CREST_KEYS.map((k) => {
                      const on = k === gcCrest;
                      return (
                        <button key={k} onClick={() => setGcCrest(k)} title={CRESTS[k].name} style={{ width: 48, height: 48, padding: 4, borderRadius: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", border: on ? "2px solid var(--gold)" : "2px solid rgba(232,184,75,.15)", background: on ? "rgba(232,184,75,.16)" : "rgba(0,0,0,.3)" }}>
                          <img src={CRESTS[k].src} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div>
                <label style={{ display: "block", font: "700 11px Inter", letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--ink2)", marginBottom: 7 }}>Guild Name</label>
                <input value={gcName} onChange={(e) => setGcName(e.target.value)} placeholder="e.g. Dama Legends" maxLength={24} style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 10, border: "1px solid rgba(232,184,75,.25)", background: "rgba(0,0,0,.3)", color: "#fff", font: "600 15px Inter", outline: "none" }} />
              </div>
              <div>
                <label style={{ display: "block", font: "700 11px Inter", letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--ink2)", marginBottom: 7 }}>Tag <span style={{ color: "var(--ink2)", opacity: 0.6 }}>(2–4 letters)</span></label>
                <input value={gcTag} onChange={(e) => setGcTag(e.target.value)} placeholder="DL" maxLength={5} style={{ width: 120, boxSizing: "border-box", padding: "12px 14px", borderRadius: 10, border: "1px solid rgba(232,184,75,.25)", background: "rgba(0,0,0,.3)", color: "var(--gold-lt)", font: "700 15px 'JetBrains Mono',monospace", textTransform: "uppercase", outline: "none" }} />
              </div>
              <div>
                <label style={{ display: "block", font: "700 11px Inter", letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--ink2)", marginBottom: 7 }}>Description</label>
                <textarea value={gcDesc} onChange={(e) => setGcDesc(e.target.value)} placeholder="What's your guild about?" rows={2} style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 10, border: "1px solid rgba(232,184,75,.25)", background: "rgba(0,0,0,.3)", color: "#fff", font: "500 14px Inter", resize: "none", outline: "none" }} />
              </div>
              <div>
                <label style={{ display: "block", font: "700 11px Inter", letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--ink2)", marginBottom: 9 }}>Join Policy</label>
                <div style={{ display: "flex", gap: 9 }}>
                  {GC_POLICIES.map((p) => {
                    const on = p.key === gcPolicy;
                    return (
                      <button key={p.key} onClick={() => setGcPolicy(p.key)} style={{ flex: 1, padding: "10px 8px", borderRadius: 9, cursor: "pointer", font: "700 12px Inter", border: on ? "1px solid var(--gold)" : "1px solid rgba(232,184,75,.2)", background: on ? "rgba(232,184,75,.16)" : "rgba(0,0,0,.3)", color: on ? "var(--gold-lt)" : "var(--ink)" }}>{p.label}</button>
                    );
                  })}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderRadius: 10, background: "rgba(63,191,111,.08)", border: "1px solid rgba(63,191,111,.22)" }}>
                <span style={{ font: "600 13px Inter", color: "var(--ink)" }}>Founding cost</span>
                <span style={{ display: "flex", alignItems: "center", gap: 7, font: "800 14px Inter", color: "#7ee6a4" }}>✦ Free</span>
              </div>
              <button onClick={() => void submitCreate()} disabled={!gcReady || busy} style={{ width: "100%", padding: 14, borderRadius: 11, border: "1px solid var(--gold)", background: gcReady ? "linear-gradient(180deg,#f0c24b,#c98b2e)" : "rgba(232,184,75,.12)", color: gcReady ? "#2a1607" : "var(--ink2)", font: "800 14px Inter", letterSpacing: ".4px", cursor: gcReady && !busy ? "pointer" : "not-allowed" }}>{gcReady ? "Found Guild" : "Name & tag required"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Guild modal ── */}
      {editShow && detail && (
        <div onClick={() => setEditShow(false)} style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(8,4,18,.72)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 460, maxHeight: "88vh", overflow: "auto", borderRadius: 18, border: "1px solid rgba(232,184,75,.35)", background: "linear-gradient(180deg,#1a0f30,#140a24)", boxShadow: "0 24px 70px rgba(0,0,0,.6)" }}>
            <div style={{ padding: "22px 24px", borderBottom: "1px solid rgba(232,184,75,.14)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ font: "800 18px Cinzel,serif", color: "var(--gold-lt)", letterSpacing: ".5px" }}>Edit Guild</div>
                <div style={{ font: "600 11px Inter", color: "var(--ink2)", marginTop: 3 }}>{ROLE_LABEL[myRole ?? "OFFICER"]} settings · {detail.guild.tag}</div>
              </div>
              <button onClick={() => setEditShow(false)} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid rgba(232,184,75,.2)", background: "rgba(0,0,0,.25)", color: "var(--ink2)", font: "700 16px Inter", cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ padding: "22px 24px", display: "flex", flexDirection: "column", gap: 18 }}>
              <div>
                <label style={{ display: "block", font: "700 11px Inter", letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--ink2)", marginBottom: 9 }}>Guild Crest</label>
                <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                  <Emblem src={CRESTS[geCrest].src} size={62} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ font: "700 13px Cinzel,serif", color: "var(--gold-lt)", marginBottom: 8 }}>{CRESTS[geCrest].name}</div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {CREST_KEYS.map((k) => {
                        const on = k === geCrest;
                        return (
                          <button key={k} onClick={() => setGeCrest(k)} title={CRESTS[k].name} style={{ width: 48, height: 48, padding: 4, borderRadius: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", border: on ? "2px solid var(--gold)" : "2px solid rgba(232,184,75,.15)", background: on ? "rgba(232,184,75,.16)" : "rgba(0,0,0,.3)" }}>
                            <img src={CRESTS[k].src} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
              <div>
                <label style={{ display: "block", font: "700 11px Inter", letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--ink2)", marginBottom: 7 }}>Guild Name</label>
                <input value={geName} onChange={(e) => setGeName(e.target.value)} maxLength={24} style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 10, border: "1px solid rgba(232,184,75,.25)", background: "rgba(0,0,0,.3)", color: "#fff", font: "600 15px Inter", outline: "none" }} />
              </div>
              <div>
                <label style={{ display: "block", font: "700 11px Inter", letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--ink2)", marginBottom: 7 }}>Description</label>
                <textarea value={geDesc} onChange={(e) => setGeDesc(e.target.value)} maxLength={160} placeholder="What's your guild about?" rows={3} style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 10, border: "1px solid rgba(232,184,75,.25)", background: "rgba(0,0,0,.3)", color: "#fff", font: "500 14px Inter", lineHeight: 1.5, resize: "none", outline: "none" }} />
                <div style={{ textAlign: "right", font: "600 11px Inter", color: "var(--ink2)", marginTop: 5 }}>{geDesc.length} / 160</div>
              </div>
              <div>
                <label style={{ display: "block", font: "700 11px Inter", letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--ink2)", marginBottom: 9 }}>Minimum Trophies to Join</label>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 7, font: "800 22px 'JetBrains Mono',monospace", color: "var(--gold-lt)", minWidth: 104 }}><Trophy size={22} /> {geMin.toLocaleString()}</span>
                  <input type="range" min={0} max={5000} step={100} value={geMin} onChange={(e) => setGeMin(Number(e.target.value))} style={{ flex: 1, accentColor: "#f0c24b" }} />
                </div>
                <div style={{ font: "500 11.5px Inter", color: "var(--ink2)", marginTop: 8 }}>Applicants below this trophy count can't request to join.</div>
              </div>
              <button onClick={() => void saveEdit()} disabled={busy || geName.trim().length < 3} style={{ width: "100%", padding: 14, borderRadius: 11, border: "1px solid var(--gold)", background: "linear-gradient(180deg,#f0c24b,#c98b2e)", color: "#2a1607", font: "800 14px Inter", letterSpacing: ".4px", cursor: busy || geName.trim().length < 3 ? "not-allowed" : "pointer", opacity: geName.trim().length < 3 ? 0.6 : 1 }}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Contribute modal ── */}
      {contribShow && detail && (
        <div onClick={() => setContribShow(false)} style={{ position: "fixed", inset: 0, zIndex: 82, background: "rgba(8,4,18,.74)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 420, borderRadius: 18, border: "1px solid rgba(232,184,75,.35)", background: "linear-gradient(180deg,#1a0f30,#140a24)", boxShadow: "0 30px 80px rgba(0,0,0,.6)", overflow: "hidden" }}>
            <div style={{ padding: "22px 26px 18px", borderBottom: "1px solid rgba(232,184,75,.16)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ font: "800 19px Cinzel,serif", color: "var(--gold-lt)" }}>Contribute to the War</div>
                <div style={{ font: "600 11px Inter", color: "var(--ink2)", marginTop: 3 }}>Add to {detail.guild.name}'s weekly points by playing</div>
              </div>
              <button onClick={() => setContribShow(false)} style={{ flex: "none", width: 34, height: 34, borderRadius: 9, border: "1px solid rgba(232,184,75,.2)", background: "transparent", color: "var(--ink2)", font: "700 17px Inter", cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ padding: "22px 26px", display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1, padding: 14, borderRadius: 12, background: "rgba(0,0,0,.25)", border: "1px solid rgba(232,184,75,.14)", textAlign: "center" }}>
                  <div style={{ font: "800 20px 'JetBrains Mono',monospace", color: "#fff" }}>{(myMember?.weeklyContribution ?? 0).toLocaleString()}</div>
                  <div style={{ font: "500 11px Inter", color: "var(--ink2)", marginTop: 2 }}>Your war points</div>
                </div>
                <div style={{ flex: 1, padding: 14, borderRadius: 12, background: "rgba(0,0,0,.25)", border: "1px solid rgba(232,184,75,.14)", textAlign: "center" }}>
                  <div style={{ font: "800 20px 'JetBrains Mono',monospace", color: "var(--gold-lt)" }}>{myContribRank ? `#${myContribRank}` : "—"}</div>
                  <div style={{ font: "500 11px Inter", color: "var(--ink2)", marginTop: 2 }}>Guild rank</div>
                </div>
              </div>
              <div style={{ padding: "14px 16px", borderRadius: 12, background: "rgba(63,191,111,.08)", border: "1px solid rgba(63,191,111,.22)" }}>
                <div style={{ font: "700 12px Inter", color: "#7ee6a4", marginBottom: 8 }}>You earn war points just by playing</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, font: "500 12.5px/1.5 Inter", color: "var(--ink)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span>Win a Ranked match</span><b style={{ color: "#7ee6a4" }}>+30 pts</b></div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span>Play a Ranked match</span><b style={{ color: "var(--gold-lt)" }}>+10 pts</b></div>
                </div>
              </div>
              <div style={{ font: "500 11.5px/1.55 Inter", color: "var(--ink2)", textAlign: "center" }}>No trophies spent — contribution is rewarded for playing, so it never competes with the Store. Points add to the guild's weekly total and your rank.</div>
              <button className="btn btn-gold" onClick={() => { setContribShow(false); navigate("/play"); }} style={{ width: "100%", padding: 14 }}>⚔ Play a Ranked Match</button>
            </div>
          </div>
        </div>
      )}

      {/* Guild Chat drawer — local optimistic chat until the socket lands */}
      {detail && (
        <GuildChatPanel
          open={guildChatOpen}
          onClose={() => setGuildChatOpen(false)}
          guildId={detail.guild.id}
          guildName={detail.guild.name}
          crestKey={detail.guild.crestKey}
        />
      )}
    </div>
  );
}

export default GuildsPage;
