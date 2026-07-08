import { useEffect, useState } from "react";
import { api } from "../lib/api";

type Row = {
  id: string;
  actor: { username: string; tag: string };
  action: string;
  targetType: string | null;
  targetId: string | null;
  reason: string | null;
  createdAt: string;
};

/** 1.1 Audit log viewer — the append-only record of every admin mutation. */
export function AuditPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [action, setAction] = useState("");
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api
      .get<{ items: Row[] }>(`/api/admin/audit?limit=100${action ? `&action=${encodeURIComponent(action)}` : ""}`)
      .then((d) => setRows(d.items))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  };
  useEffect(load, [action]);

  return (
    <>
      <div className="crumb">System · Audit</div>
      <h1 className="page">Audit Log</h1>
      <div className="row" style={{ marginBottom: 14 }}>
        <input className="input" style={{ maxWidth: 280 }} placeholder="Filter by action (e.g. user.ban)" value={action} onChange={(e) => setAction(e.target.value)} />
        <button className="btn" onClick={load}>Refresh</button>
      </div>
      <div className="panel">
        <table className="tbl">
          <thead>
            <tr><th>When</th><th>Actor</th><th>Action</th><th>Target</th><th>Reason</th></tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="dim" style={{ textAlign: "center", padding: 24 }}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={5} className="dim" style={{ textAlign: "center", padding: 24 }}>No audit entries.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td className="mono dim" style={{ whiteSpace: "nowrap" }}>{new Date(r.createdAt).toLocaleString()}</td>
                  <td>{r.actor.username} <span className="dim mono">{r.actor.tag}</span></td>
                  <td className="mono" style={{ color: "var(--gold)" }}>{r.action}</td>
                  <td className="dim mono">{r.targetType ?? ""} {r.targetId ? r.targetId.slice(0, 8) : ""}</td>
                  <td className="dim">{r.reason ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
