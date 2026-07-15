import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useAdminMutation } from "../lib/ui";
import { Pagination, usePagination } from "../components/Pagination";

type GuildRow = {
  id: string;
  name: string;
  tag: string;
  minTrophies: number;
  joinPolicy: string;
  weeklyPoints: number;
  memberCount: number;
  leader: { username: string; tag: string } | null;
  createdAt: string;
};

type JoinRequestRow = {
  id: string;
  createdAt: string;
  player: { id: string; username: string; tag: string; displayName: string };
  guild: { id: string; name: string; tag: string };
};

type RosterMember = {
  userId: string;
  username: string;
  tag: string;
  displayName: string;
  trophies: number;
  role: "LEADER" | "OFFICER" | "MEMBER";
  weeklyContribution: number;
  joinedAt: string;
};

type GuildDetail = {
  id: string;
  name: string;
  tag: string;
  description: string | null;
  crestKey: string | null;
  minTrophies: number;
  joinPolicy: string;
  weeklyPoints: number;
  memberCount: number;
  pendingRequests: number;
  createdAt: string;
  roster: RosterMember[];
};

const SORTS = [
  { key: "points", label: "weekly pts" },
  { key: "members", label: "members" },
] as const;

/** A deterministic crest gradient from the guild tag (visual only). */
function crestFor(tag: string): string {
  let h = 0;
  for (const c of tag) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `linear-gradient(150deg, hsl(${h} 52% 46%), #c99a2e)`;
}

/** Guilds — oversight: list, search, detail drawer with roster, moderate. */
export function GuildsPage() {
  const { can } = useAuth();
  const mutate = useAdminMutation();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<(typeof SORTS)[number]["key"]>("points");
  const [rows, setRows] = useState<GuildRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selId, setSelId] = useState<string | null>(null);
  const [apps, setApps] = useState<JoinRequestRow[]>([]);
  // Client-side pagination of the (already fully fetched) guild list.
  const pg = usePagination(rows, 10);
  // Deep-link from the header global search (handoffv3 row 16): a guild
  // result routes to `?open=<id>`, which opens this same detail drawer.
  // Consumed once on mount, then stripped from the URL.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const openId = searchParams.get("open");
    if (openId) {
      setSelId(openId);
      setSearchParams((p) => { p.delete("open"); return p; }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = (query: string) => {
    setLoading(true);
    const qs = new URLSearchParams({ sort, limit: "50" });
    if (query.trim()) qs.set("q", query.trim());
    api
      .get<{ items: GuildRow[]; total: number }>(`/api/admin/guilds?${qs}`)
      .then((d) => { setRows(d.items); setTotal(d.total); })
      .catch(() => { setRows([]); setTotal(0); })
      .finally(() => setLoading(false));
  };

  // Live/debounced search — reload 300ms after the user stops typing, or
  // immediately when the sort changes.
  useEffect(() => {
    const t = setTimeout(() => load(q), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, sort]);

  // Join requests inbox (handoffv3 row 24) — panel above the table, hidden
  // when empty (hasGuildApps semantics). Loaded once on mount + refetched
  // after every approve/reject.
  const loadApps = () => {
    api
      .get<{ items: JoinRequestRow[] }>("/api/admin/guilds/requests")
      .then((d) => setApps(d.items))
      .catch(() => setApps([]));
  };
  useEffect(loadApps, []);

  const approveApp = (a: JoinRequestRow) =>
    mutate({
      title: `Approve ${a.player.username}'s request`,
      body: `Add ${a.player.username} to ${a.guild.name}?`,
      requireReason: true,
      confirmLabel: "Approve",
      method: "POST",
      path: `/api/admin/guilds/requests/${a.id}/approve`,
      successMsg: `${a.player.username} added to ${a.guild.name}.`,
      onDone: () => { loadApps(); load(q); },
    });

  const rejectApp = (a: JoinRequestRow) =>
    mutate({
      title: `Reject ${a.player.username}'s request`,
      requireReason: true,
      danger: true,
      confirmLabel: "Reject",
      method: "POST",
      path: `/api/admin/guilds/requests/${a.id}/reject`,
      successMsg: `Request from ${a.player.username} rejected.`,
      onDone: loadApps,
    });

  /** Row-level rename — same PATCH the drawer's Edit form uses, just a focused one-field prompt (mockup's inline "Rename" action). */
  const rename = (g: GuildRow) =>
    mutate({
      title: `Rename ${g.name}`,
      requireReason: true,
      confirmLabel: "Save",
      method: "PATCH",
      path: `/api/admin/guilds/${g.id}`,
      successMsg: "Guild renamed.",
      onDone: () => load(q),
      extra: (set, vals) => (
        <div className="field"><label>Name</label>
          <input className="input" autoFocus value={(vals.name as string) ?? g.name} onChange={(e) => set("name", e.target.value)} />
        </div>
      ),
    });

  const disbandRow = (g: GuildRow) =>
    mutate({
      title: `Disband ${g.name}`,
      body: "This removes the guild and all its members and join requests. This cannot be undone.",
      requireReason: true,
      danger: true,
      confirmLabel: "Disband",
      method: "DELETE",
      path: `/api/admin/guilds/${g.id}`,
      successMsg: "Guild disbanded.",
      onDone: () => load(q),
    });

  return (
    <>
      {apps.length > 0 && (
        <div className="panel" style={{ marginBottom: 16, overflow: "hidden" }}>
          <div className="card-header">
            <span className="t">Join requests</span>
            <span className="sub">Players applying to join a guild from the app.</span>
          </div>
          <div style={{ padding: 10 }}>
            {apps.map((a) => (
              <div key={a.id} className="arow" style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 6px", borderRadius: 8 }}>
                <div className="fd-avatar sm">{a.player.username.slice(0, 2).toUpperCase()}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 12.5 }}>
                    {a.player.username} <span className="dim mono" style={{ fontSize: 11 }}>{a.player.tag}</span>
                  </div>
                  <div className="dim" style={{ fontSize: 12 }}>
                    wants to join <b style={{ color: "var(--ink-2)" }}>{a.guild.name}</b>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="abtn btn-ghost btn-ghost-sm" disabled={!can("MODERATOR")} onClick={() => approveApp(a)}>Approve</button>
                  <button className="abtn btn-danger btn-danger-sm" disabled={!can("MODERATOR")} onClick={() => rejectApp(a)}>Reject</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="row" style={{ marginBottom: 12 }}>
        <input
          className="input"
          style={{ maxWidth: 340 }}
          placeholder="Search guilds by name or tag…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div style={{ marginLeft: "auto" }} className="dim">{total} guilds</div>
      </div>
      <div className="row" style={{ marginBottom: 14 }}>
        {SORTS.map((s) => (
          <button key={s.key} className={`chip${sort === s.key ? " on" : ""}`} onClick={() => setSort(s.key)}>{s.label}</button>
        ))}
      </div>

      <div className="panel" style={{ overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table className="tbl" style={{ minWidth: 720 }}>
            <thead>
              <tr className="thead-raised">
                <th>Guild</th>
                <th className="num">Members</th>
                <th className="num">Weekly pts</th>
                <th className="num">Min trophies</th>
                <th style={{ textAlign: "center" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="dim" style={{ textAlign: "center", padding: 24 }}>Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={5} className="dim" style={{ textAlign: "center", padding: 24 }}>No guilds match your search.</td></tr>
              ) : (
                pg.pageItems.map((g) => (
                  <tr key={g.id} className="arow" style={{ cursor: "pointer" }} onClick={() => setSelId(g.id)}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div className="fd-avatar" style={{ borderRadius: 8, background: crestFor(g.tag), font: "800 11px var(--serif)", color: "#3a2405" }}>{g.tag}</div>
                        <span style={{ fontWeight: 700, fontSize: 12.5 }}>{g.name}</span>
                      </div>
                    </td>
                    <td className="num">{g.memberCount.toLocaleString()}</td>
                    <td className="num" style={{ color: "var(--gold-lt)" }}>{g.weeklyPoints.toLocaleString()}</td>
                    <td className="num">{g.minTrophies.toLocaleString()}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
                        <button className="abtn btn-ghost btn-ghost-sm" onClick={() => setSelId(g.id)}>View</button>
                        <button className="abtn btn-ghost btn-ghost-sm" disabled={!can("MODERATOR")} onClick={() => rename(g)}>Rename</button>
                        <button className="abtn btn-danger btn-danger-sm" disabled={!can("MODERATOR")} onClick={() => disbandRow(g)}>Disband</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!loading && <Pagination {...pg} noun="guilds" />}
      </div>

      {selId && <GuildDrawer id={selId} onClose={() => setSelId(null)} onChanged={() => load(q)} />}
    </>
  );
}

// Role-colored per handoffv3 row 26: Leader gold / Officer purple / Member muted.
const ROLE_COLOR: Record<RosterMember["role"], string> = {
  LEADER: "var(--gold-lt)",
  OFFICER: "#b98cff",
  MEMBER: "var(--dim)",
};
function RoleBadge({ role }: { role: RosterMember["role"] }) {
  return <span style={{ fontWeight: 700, fontSize: 11.5, letterSpacing: 0.4, textTransform: "capitalize", color: ROLE_COLOR[role] }}>{role.toLowerCase()}</span>;
}

/** True if joined within the last 7 days (mockup's "New" pill on recent joiners). */
function isNewJoin(joinedAt: string): boolean {
  return Date.now() - new Date(joinedAt).getTime() < 7 * 24 * 60 * 60 * 1000;
}

// ── Detail drawer — roster + moderation ───────────────────────────────────────
function GuildDrawer({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { can } = useAuth();
  const mutate = useAdminMutation();
  const [d, setD] = useState<GuildDetail | null>(null);

  const load = () => {
    api.get<GuildDetail>(`/api/admin/guilds/${id}`).then(setD).catch(() => setD(null));
  };
  useEffect(load, [id]);

  const after = () => { load(); onChanged(); };
  const leader = d?.roster.find((m) => m.role === "LEADER") ?? null;

  const edit = () =>
    mutate({
      title: `Edit ${d?.name}`,
      requireReason: true,
      confirmLabel: "Save",
      method: "PATCH",
      path: `/api/admin/guilds/${id}`,
      successMsg: "Guild updated.",
      onDone: after,
      extra: (set, vals) => (
        <>
          <div className="field"><label>Name</label>
            <input className="input" value={(vals.name as string) ?? d?.name ?? ""} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div className="field"><label>Tag</label>
            <input className="input" value={(vals.tag as string) ?? d?.tag ?? ""} onChange={(e) => set("tag", e.target.value)} />
          </div>
          <div className="field"><label>Description</label>
            <textarea className="input" rows={2} value={(vals.description as string) ?? d?.description ?? ""} onChange={(e) => set("description", e.target.value)} />
          </div>
          <div className="field"><label>Min trophies</label>
            <input className="input" type="number" value={(vals.minTrophies as number) ?? d?.minTrophies ?? 0} onChange={(e) => set("minTrophies", Number(e.target.value))} />
          </div>
          <div className="field"><label>Join policy</label>
            <select className="select" value={(vals.joinPolicy as string) ?? d?.joinPolicy ?? "open"} onChange={(e) => set("joinPolicy", e.target.value)}>
              <option value="open">open</option>
              <option value="request">request</option>
              <option value="invite">invite</option>
            </select>
          </div>
        </>
      ),
    });

  const disband = () =>
    mutate({
      title: `Disband ${d?.name}`,
      body: "This removes the guild and all its members and join requests. This cannot be undone.",
      requireReason: true,
      danger: true,
      confirmLabel: "Disband",
      method: "DELETE",
      path: `/api/admin/guilds/${id}`,
      successMsg: "Guild disbanded.",
      onDone: () => { onChanged(); onClose(); },
    });

  const kick = (m: RosterMember) =>
    mutate({
      title: `Kick ${m.username} from ${d?.name}`,
      requireReason: true,
      danger: true,
      confirmLabel: "Kick",
      method: "DELETE",
      path: `/api/admin/guilds/${id}/kick/${m.userId}`,
      successMsg: `${m.username} removed from the guild.`,
      onDone: after,
    });

  return (
    <div className="drawer-wrap">
      <div className="drawer-bd" onClick={onClose} />
      <div className="drawer">
        {!d ? (
          <div className="dim">Loading…</div>
        ) : (
          <>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div className="fd-avatar lg" style={{ borderRadius: 9, background: crestFor(d.tag), font: "800 13px var(--serif)", color: "#3a2405" }}>{d.tag}</div>
                <div>
                  <div style={{ font: "800 20px var(--sans)" }}>{d.name}</div>
                  <div className="dim mono">
                    {d.tag} · {d.joinPolicy}
                    {leader ? ` · led by ${leader.username}${leader.tag}` : ""}
                  </div>
                </div>
              </div>
              <button className="abtn btn-ghost btn-ghost-sm" onClick={onClose}>Close</button>
            </div>

            <div className="kpi" style={{ margin: "18px 0" }}>
              <div className="card"><div className="v mono">{d.memberCount.toLocaleString()}</div><div className="l">Members</div></div>
              <div className="card"><div className="v mono">{d.weeklyPoints.toLocaleString()}</div><div className="l">Weekly pts</div></div>
              <div className="card"><div className="v mono">{d.minTrophies.toLocaleString()}</div><div className="l">Min trophies</div></div>
              <div className="card"><div className="v mono">{d.pendingRequests.toLocaleString()}</div><div className="l">Pending requests</div></div>
            </div>

            <div className="dim" style={{ fontSize: 12, marginBottom: 16 }}>
              Created {new Date(d.createdAt).toLocaleDateString()}
              {d.description ? ` · ${d.description}` : ""}
            </div>

            {/* Actions — role-gated (server enforces too) */}
            <div style={{ fontWeight: 700, margin: "10px 0 8px" }}>Actions</div>
            <div className="row">
              {can("MODERATOR") && <button className="abtn btn-ghost btn-ghost-sm" onClick={edit}>Edit</button>}
              {can("MODERATOR") && <button className="abtn btn-danger btn-danger-sm" onClick={disband}>Disband</button>}
              {!can("MODERATOR") && <span className="dim">No actions available for your role.</span>}
            </div>

            {/* Member roster */}
            <div style={{ fontWeight: 700, margin: "22px 0 8px", letterSpacing: 0.5 }}>MEMBERS</div>
            <div className="panel" style={{ overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <table className="tbl">
                  <thead>
                    <tr className="thead-raised">
                      <th>Member</th>
                      <th>Role</th>
                      <th className="num">Weekly</th>
                      <th>Joined</th>
                      {can("MODERATOR") && <th></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {d.roster.length === 0 ? (
                      <tr><td colSpan={can("MODERATOR") ? 5 : 4} className="dim" style={{ textAlign: "center", padding: 16 }}>No members.</td></tr>
                    ) : (
                      d.roster.map((m) => (
                        <tr key={m.userId} className="arow">
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                              <div className="fd-avatar sm">{m.username.slice(0, 2).toUpperCase()}</div>
                              <div>
                                <div style={{ fontWeight: 600 }}>
                                  {m.username} <span className="dim mono" style={{ fontSize: 12 }}>{m.tag}</span>
                                  {isNewJoin(m.joinedAt) && (
                                    <span className="badge-st st-active" style={{ marginLeft: 6, fontSize: 8.5 }}>New</span>
                                  )}
                                </div>
                                <div className="dim" style={{ fontSize: 12 }}>{m.trophies.toLocaleString()} 🏆</div>
                              </div>
                            </div>
                          </td>
                          <td><RoleBadge role={m.role} /></td>
                          <td className="num">{m.weeklyContribution.toLocaleString()}</td>
                          <td className="mono dim">{new Date(m.joinedAt).toLocaleDateString()}</td>
                          {can("MODERATOR") && (
                            <td>
                              {m.role !== "LEADER" && <button className="abtn btn-danger btn-danger-sm" title="Kick" onClick={() => kick(m)}>✕</button>}
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
