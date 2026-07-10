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
  status: "active" | "disabled";
};

const ROLES: AdminRole[] = ["SUPPORT", "MODERATOR", "ECONOMY", "SUPERADMIN"];
const ROLE_LABEL: Record<AdminRole, string> = { SUPPORT: "Support", MODERATOR: "Moderator", ECONOMY: "Economy admin", SUPERADMIN: "Superadmin" };
/** Per-role accent, mirrors the mockup's role-color vocabulary (gold = highest tier down to dim). */
const ROLE_TILE: Record<AdminRole, string> = { SUPERADMIN: "var(--gold-lt)", ECONOMY: "var(--blue)", MODERATOR: "var(--red-lt)", SUPPORT: "var(--dim-2)" };
/** Initials for the avatar chip, e.g. "Juan Dela Cruz" -> "JD". */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** 2A. Admins — role management over existing adminRole. SUPERADMIN-gated. */
export function Admins() {
  const auth = useAuth();
  const myId = auth.status === "ok" ? auth.me.id : null;
  const [rows, setRows] = useState<AdminRow[]>([]);
  const [stats, setStats] = useState<{ byRole: Record<string, number>; total: number; active: number; disabled: number } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api
      .get<{ items: AdminRow[]; stats: { byRole: Record<string, number>; total: number; active: number; disabled: number } }>("/api/admin/admins")
      .then((d) => { setRows(d.items); setStats(d.stats); })
      .catch(() => { setRows([]); setStats(null); })
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  return (
    <>
      <div className="crumb">Access Control · Admin users</div>
      <h1 className="page">Admin users</h1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 16 }}>
        <div className="fd-kpi pad-sm" style={{ ["--tile" as string]: "var(--green-lt)" }}>
          <div className="l">Active admins</div>
          <div className="v" style={{ fontSize: 22, fontWeight: 800 }}>{stats?.active ?? 0}</div>
        </div>
        <div className="fd-kpi pad-sm" style={{ ["--tile" as string]: "var(--gold-2)" }}>
          <div className="l">Disabled</div>
          <div className="v" style={{ fontSize: 22, fontWeight: 800 }}>{stats?.disabled ?? 0}</div>
        </div>
        <div className="fd-kpi pad-sm">
          <div className="l">Total admins</div>
          <div className="v" style={{ fontSize: 22, fontWeight: 800 }}>{stats?.total ?? 0}</div>
        </div>
      </div>

      <GrantCard onDone={load} />

      <div className="panel" style={{ marginTop: 16, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table className="tbl" style={{ minWidth: 820 }}>
            <thead>
              <tr className="thead-raised">
                <th>Admin</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last active</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="dim" style={{ textAlign: "center", padding: 24 }}>Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={5} className="dim" style={{ textAlign: "center", padding: 24 }}>No admins.</td></tr>
              ) : (
                rows.map((a) => <AdminRowView key={a.id} a={a} isMe={a.id === myId} onDone={load} />)
              )}
            </tbody>
          </table>
        </div>
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

  const isDisabled = a.status === "disabled";
  const toggle = () =>
    isDisabled
      ? mutate({
          title: `Re-enable admin access for ${a.username}${a.tag}`,
          body: "They regain console access immediately.",
          confirmLabel: "Enable",
          method: "POST",
          path: `/api/admin/admins/${a.id}/enable`,
          successMsg: "Admin access enabled.",
          onDone,
        })
      : mutate({
          title: `Disable admin access for ${a.username}${a.tag}`,
          body: "They lose console access immediately, but keep their assigned role.",
          requireReason: true,
          confirmLabel: "Disable",
          method: "POST",
          path: `/api/admin/admins/${a.id}/disable`,
          successMsg: "Admin access disabled.",
          onDone,
        });

  return (
    <tr className="arow">
      <td>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <div
            className="fd-avatar"
            style={{ background: "rgba(232,184,75,.12)", border: "1px solid rgba(232,184,75,.28)", font: "800 13px var(--sans)", color: "var(--gold-2)" }}
          >
            {initials(a.displayName || a.username)}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700 }}>
              {a.displayName} {isMe && <span className="badge-st st-active" style={{ marginLeft: 6 }}>You</span>}
            </div>
            <div className="dim" style={{ fontSize: 11 }}>{a.username} {a.tag}{a.email ? ` · ${a.email}` : ""}</div>
          </div>
        </div>
      </td>
      <td>
        <select
          className="select"
          style={{
            maxWidth: 170, color: ROLE_TILE[role],
            background: "#0f0720", border: "1px solid rgba(232,184,75,.24)", borderRadius: 8,
            padding: "7px 10px", font: "700 11.5px var(--sans)",
          }}
          value={role}
          disabled={isMe}
          onChange={(e) => changeRole(e.target.value as AdminRole)}
        >
          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
      </td>
      <td><span className={`badge-st ${isDisabled ? "st-muted" : "st-active"}`}>{isDisabled ? "Disabled" : "Active"}</span></td>
      <td className="mono dim" style={{ whiteSpace: "nowrap" }}>{new Date(a.lastSeenAt).toLocaleString()}</td>
      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
        <button
          className="abtn"
          disabled={isMe}
          onClick={toggle}
          style={{ border: "1px solid rgba(232,184,75,.28)", color: "#f0cf72", background: "transparent", padding: "7px 12px", font: "700 11px var(--sans)", borderRadius: 8 }}
        >
          {isDisabled ? "Enable" : "Disable"}
        </button>
        <button
          className="abtn"
          disabled={isMe}
          onClick={revoke}
          style={{ border: "1px solid rgba(255,143,174,.35)", color: "#ff8fae", background: "transparent", padding: "7px 12px", font: "700 11px var(--sans)", borderRadius: 8, marginLeft: 6 }}
        >
          Revoke
        </button>
      </td>
    </tr>
  );
}

/**
 * Grant admin — visually matches the mockup's green "Invite an admin" card
 * chrome, but the mockup's flow is an email invite (pending-invite state,
 * password set on first sign-in) which we deliberately do not have: the
 * approved scope is granting admin to an EXISTING user by email/username/id,
 * effective immediately. Copy below reflects the real behavior; only the
 * card's visual language (green-accented border, title/subtitle, inline
 * form, green pill button) is borrowed from the mockup.
 */
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
    <div className="panel panel-pad" style={{ borderColor: "rgba(126,224,192,.3)" }}>
      <div style={{ font: "800 15px var(--serif)", color: "var(--ink)" }}>Grant admin</div>
      <div className="dim" style={{ marginTop: 4, fontSize: 12 }}>
        Grants console access to an existing player immediately — no email invite, no password
        setup. Access is scoped to the assigned role right away.
      </div>
      <div className="row" style={{ marginTop: 14, alignItems: "flex-end" }}>
        <input
          className="input" style={{ maxWidth: 300 }}
          placeholder="email, username#tag, or user id"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select className="select" style={{ maxWidth: 170 }} value={role} onChange={(e) => setRole(e.target.value as AdminRole)}>
          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
        <button
          className="abtn"
          disabled={!query.trim()}
          onClick={submit}
          style={{
            font: "800 12px var(--sans)", borderRadius: 9, padding: "11px 18px",
            border: "1px solid rgba(126,224,192,.5)", color: "#06251c",
            background: "linear-gradient(180deg,#7fe0c0,#3ba98a)",
          }}
        >
          Grant
        </button>
      </div>
      <div className="dim" style={{ fontSize: 12, marginTop: 10 }}>Every grant/revoke/role change is recorded in the audit log.</div>
    </div>
  );
}
