import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useAdminMutation } from "../lib/ui";

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
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<(typeof SORTS)[number]["key"]>("points");
  const [rows, setRows] = useState<GuildRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selId, setSelId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    const qs = new URLSearchParams({ sort, limit: "50" });
    if (q.trim()) qs.set("q", q.trim());
    api
      .get<{ items: GuildRow[]; total: number }>(`/api/admin/guilds?${qs}`)
      .then((d) => { setRows(d.items); setTotal(d.total); })
      .catch(() => { setRows([]); setTotal(0); })
      .finally(() => setLoading(false));
  };
  useEffect(load, [sort]);

  return (
    <>
      <div className="crumb">Community · Guilds</div>
      <h1 className="page">Guilds</h1>

      <div className="row" style={{ marginBottom: 12 }}>
        <input
          className="input"
          style={{ maxWidth: 340 }}
          placeholder="Search guilds by name or tag…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
        />
        <button className="btn" onClick={load}>Search</button>
        <div style={{ marginLeft: "auto" }} className="dim">{total} guilds</div>
      </div>
      <div className="row" style={{ marginBottom: 14 }}>
        {SORTS.map((s) => (
          <button key={s.key} className={`chip${sort === s.key ? " on" : ""}`} onClick={() => setSort(s.key)}>{s.label}</button>
        ))}
      </div>

      <div className="panel">
        <table className="tbl">
          <thead>
            <tr>
              <th>Guild</th>
              <th>Leader</th>
              <th className="num">Members</th>
              <th className="num">Weekly pts</th>
              <th className="num">Min trophies</th>
              <th>Join policy</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="dim" style={{ textAlign: "center", padding: 24 }}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="dim" style={{ textAlign: "center", padding: 24 }}>No guilds match your search.</td></tr>
            ) : (
              rows.map((g) => (
                <tr key={g.id} className="click" onClick={() => setSelId(g.id)}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: crestFor(g.tag), display: "flex", alignItems: "center", justifyContent: "center", font: "800 11px var(--serif)", color: "#3a2405", flex: "none" }}>{g.tag}</div>
                      <div>
                        <div style={{ fontWeight: 600 }}>{g.name}</div>
                        <div className="dim mono" style={{ fontSize: 12 }}>{g.tag}</div>
                      </div>
                    </div>
                  </td>
                  <td>{g.leader ? <>{g.leader.username} <span className="dim mono" style={{ fontSize: 12 }}>{g.leader.tag}</span></> : <span className="dim">—</span>}</td>
                  <td className="num">{g.memberCount.toLocaleString()}</td>
                  <td className="num" style={{ color: "var(--gold-lt)" }}>{g.weeklyPoints.toLocaleString()}</td>
                  <td className="num">{g.minTrophies.toLocaleString()}</td>
                  <td className="dim mono">{g.joinPolicy}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selId && <GuildDrawer id={selId} onClose={() => setSelId(null)} onChanged={load} />}
    </>
  );
}

function RoleBadge({ role }: { role: RosterMember["role"] }) {
  const cls = role === "LEADER" ? "st-active" : role === "OFFICER" ? "st-muted" : "st-deleted";
  return <span className={`badge-st ${cls}`}>{role.toLowerCase()}</span>;
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
      successMsg: "Member removed.",
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
                <div style={{ width: 40, height: 40, borderRadius: 9, background: crestFor(d.tag), display: "flex", alignItems: "center", justifyContent: "center", font: "800 13px var(--serif)", color: "#3a2405", flex: "none" }}>{d.tag}</div>
                <div>
                  <div style={{ font: "800 20px var(--sans)" }}>{d.name}</div>
                  <div className="dim mono">{d.tag} · {d.joinPolicy}</div>
                </div>
              </div>
              <button className="btn" onClick={onClose}>Close</button>
            </div>

            <div className="kpi" style={{ margin: "18px 0" }}>
              <div className="card"><div className="v mono">{d.memberCount.toLocaleString()}</div><div className="l">Members</div></div>
              <div className="card"><div className="v mono">{d.weeklyPoints.toLocaleString()}</div><div className="l">Weekly points</div></div>
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
              {can("MODERATOR") && <button className="btn" onClick={edit}>Edit</button>}
              {can("MODERATOR") && <button className="btn danger" onClick={disband}>Disband</button>}
              {!can("MODERATOR") && <span className="dim">No actions available for your role.</span>}
            </div>

            {/* Member roster */}
            <div style={{ fontWeight: 700, margin: "22px 0 8px" }}>Member roster</div>
            <div className="panel">
              <table className="tbl">
                <thead>
                  <tr>
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
                      <tr key={m.userId}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{m.username} <span className="dim mono" style={{ fontSize: 12 }}>{m.tag}</span></div>
                          <div className="dim" style={{ fontSize: 12 }}>{m.trophies.toLocaleString()} 🏆</div>
                        </td>
                        <td><RoleBadge role={m.role} /></td>
                        <td className="num">{m.weeklyContribution.toLocaleString()}</td>
                        <td className="mono dim">{new Date(m.joinedAt).toLocaleDateString()}</td>
                        {can("MODERATOR") && (
                          <td>
                            {m.role !== "LEADER" && <button className="btn danger" onClick={() => kick(m)}>Kick</button>}
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
