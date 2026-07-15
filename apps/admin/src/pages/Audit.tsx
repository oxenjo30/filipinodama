import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { Pagination, usePagination } from "../components/Pagination";

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
  // Client-side pagination of the (already fully fetched) audit list.
  const pg = usePagination(rows, 10);
  // "My activity log" (account menu, handoffv3 row 17) deep-links here with
  // `?actor=<adminId>` — filter to just that admin's own audit rows.
  const [searchParams, setSearchParams] = useSearchParams();
  const actor = searchParams.get("actor") ?? "";

  const load = () => {
    setLoading(true);
    const qs = new URLSearchParams({ limit: "100" });
    if (action) qs.set("action", action);
    if (actor) qs.set("actor", actor);
    api
      .get<{ items: Row[] }>(`/api/admin/audit?${qs}`)
      .then((d) => setRows(d.items))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  };
  useEffect(load, [action, actor]);

  const clearActor = () => setSearchParams((p) => { p.delete("actor"); return p; }, { replace: true });

  return (
    <>
      <div className="row" style={{ marginBottom: 14 }}>
        <input className="input" style={{ maxWidth: 280 }} placeholder="Filter by action (e.g. user.ban)" value={action} onChange={(e) => setAction(e.target.value)} />
        {actor && (
          <button className="chip on" onClick={clearActor} title="Clear the my-activity filter">
            My activity ✕
          </button>
        )}
        <button className="btn" onClick={load}>Refresh</button>
      </div>
      <div className="panel">
        <div className="card-header">
          <span className="t">Audit log</span>
          <span className="sub">append-only · {rows.length} entries</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="tbl" style={{ minWidth: 680 }}>
            <thead>
              <tr className="thead-raised"><th>When</th><th>Actor</th><th>Action</th><th>Target</th><th>Reason</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="dim" style={{ textAlign: "center", padding: 24 }}>Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={5} className="dim" style={{ textAlign: "center", padding: 24 }}>No audit entries.</td></tr>
              ) : (
                pg.pageItems.map((r) => (
                  <tr key={r.id} className="arow">
                    <td className="mono dim" style={{ whiteSpace: "nowrap", fontSize: 11, fontWeight: 500 }}>{new Date(r.createdAt).toLocaleString()}</td>
                    <td><span style={{ color: "var(--ink-3)" }}>{r.actor.username}</span> <span className="dim mono">{r.actor.tag}</span></td>
                    <td className="mono" style={{ color: "var(--gold-lt)", fontWeight: 700, fontSize: 11 }}>{r.action}</td>
                    <td className="mono" style={{ color: "#a996c9" }}>{r.targetType ?? ""} {r.targetId ? r.targetId.slice(0, 8) : ""}</td>
                    <td className="dim">{r.reason ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!loading && <Pagination {...pg} noun="entries" />}
      </div>
    </>
  );
}
