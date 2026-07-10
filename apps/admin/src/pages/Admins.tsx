import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth, type AdminRole } from "../lib/auth";
import { useAdminMutation } from "../lib/ui";

type AdminRow = {
  id: string;
  username: string;
  tag: string;
  email: string | null;
  displayName: string;
  avatarUrl: string | null;
  adminRole: AdminRole;
  lastSeenAt: string;
};

const ROLES: AdminRole[] = ["SUPPORT", "MODERATOR", "ECONOMY", "SUPERADMIN"];
const ROLE_LABEL: Record<AdminRole, string> = { SUPPORT: "Support", MODERATOR: "Moderator", ECONOMY: "Economy admin", SUPERADMIN: "Superadmin" };

/** 2A. Admins — role management over existing adminRole. SUPERADMIN-gated. */
export function Admins() {
  const auth = useAuth();
  const myId = auth.status === "ok" ? auth.me.id : null;
  const [rows, setRows] = useState<AdminRow[]>([]);
  const [stats, setStats] = useState<{ byRole: Record<string, number>; total: number } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api
      .get<{ items: AdminRow[]; stats: { byRole: Record<string, number>; total: number } }>("/api/admin/admins")
      .then((d) => { setRows(d.items); setStats(d.stats); })
      .catch(() => { setRows([]); setStats(null); })
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  return (
    <>
      <div className="crumb">Access Control · Admin users</div>
      <h1 className="page">Admin users</h1>

      <div className="kpi" style={{ marginBottom: 22 }}>
        {ROLES.map((r) => (
          <div className="card" key={r}>
            <div className="v mono">{stats?.byRole[r] ?? 0}</div>
            <div className="l">{ROLE_LABEL[r]}</div>
          </div>
        ))}
        <div className="card">
          <div className="v mono">{stats?.total ?? 0}</div>
          <div className="l">Total admins</div>
        </div>
      </div>

      <GrantCard onDone={load} />

      <div className="panel" style={{ marginTop: 22 }}>
        <table className="tbl">
          <thead>
            <tr><th>Admin</th><th>Role</th><th>Last seen</th><th></th></tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="dim" style={{ textAlign: "center", padding: 24 }}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={4} className="dim" style={{ textAlign: "center", padding: 24 }}>No admins.</td></tr>
            ) : (
              rows.map((a) => <AdminRowView key={a.id} a={a} isMe={a.id === myId} onDone={load} />)
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function AdminRowView({ a, isMe, onDone }: { a: AdminRow; isMe: boolean; onDone: () => void }) {
  const mutate = useAdminMutation();
  const [role, setRole] = useState<AdminRole>(a.adminRole);

  const changeRole = (next: AdminRole) => {
    setRole(next);
    mutate({
      title: `Change ${a.username}${a.tag} to ${ROLE_LABEL[next]}`,
      body: "This changes their console access immediately.",
      confirmLabel: "Change role",
      method: "PATCH",
      path: `/api/admin/admins/${a.id}/role`,
      payload: { role: next },
      successMsg: "Role updated.",
      onDone,
    }).then((success) => { if (!success) setRole(a.adminRole); });
  };

  const revoke = () =>
    mutate({
      title: `Revoke admin access for ${a.username}${a.tag}`,
      body: "They will lose console access immediately.",
      requireReason: true,
      danger: true,
      confirmLabel: "Revoke",
      method: "POST",
      path: `/api/admin/admins/${a.id}/revoke`,
      successMsg: "Admin access revoked.",
      onDone,
    });

  return (
    <tr>
      <td>
        <div style={{ fontWeight: 600 }}>
          {a.displayName} {isMe && <span className="badge-st st-active" style={{ marginLeft: 6 }}>You</span>}
        </div>
        <div className="dim mono" style={{ fontSize: 12 }}>{a.username} {a.tag}{a.email ? ` · ${a.email}` : ""}</div>
      </td>
      <td>
        <select
          className="select"
          style={{ maxWidth: 170 }}
          value={role}
          disabled={isMe}
          onChange={(e) => changeRole(e.target.value as AdminRole)}
        >
          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
      </td>
      <td className="mono dim" style={{ whiteSpace: "nowrap" }}>{new Date(a.lastSeenAt).toLocaleString()}</td>
      <td className="num">
        <button className="btn danger" disabled={isMe} onClick={revoke}>Revoke</button>
      </td>
    </tr>
  );
}

/** Grant admin — query by email / username#tag / id, then pick a role. */
function GrantCard({ onDone }: { onDone: () => void }) {
  const mutate = useAdminMutation();
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<AdminRole>("SUPPORT");

  const submit = () =>
    mutate({
      title: `Grant ${ROLE_LABEL[role]} to "${query}"`,
      body: "The user gains console access immediately (no re-login needed).",
      confirmLabel: "Grant",
      method: "POST",
      path: "/api/admin/admins/grant",
      payload: { query, role },
      successMsg: "Admin access granted.",
      onDone: () => { setQuery(""); onDone(); },
    });

  return (
    <div className="panel panel-pad">
      <div style={{ fontWeight: 700, marginBottom: 12 }}>Grant admin</div>
      <div className="row">
        <input
          className="input" style={{ maxWidth: 300 }}
          placeholder="email, username#tag, or user id"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select className="select" style={{ maxWidth: 170 }} value={role} onChange={(e) => setRole(e.target.value as AdminRole)}>
          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
        <button className="btn gold" disabled={!query.trim()} onClick={submit}>Grant</button>
      </div>
      <div className="dim" style={{ fontSize: 12, marginTop: 8 }}>Every grant/revoke/role change is recorded in the audit log.</div>
    </div>
  );
}
