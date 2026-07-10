import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAdminMutation } from "../lib/ui";

type ConfigRow = { key: string; value: string; type: "bool" | "string" | "int"; category: string; label: string; locked?: boolean };

/** 2B. Settings — live feature flags over the Config model. SUPERADMIN-gated.
 *  No economy-constants panel this cycle (deferred, no runtime consumer). */
export function Settings() {
  const [items, setItems] = useState<ConfigRow[]>([]);
  const [locked, setLocked] = useState<ConfigRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api
      .get<{ items: ConfigRow[]; locked: ConfigRow[] }>("/api/admin/config")
      .then((d) => { setItems(d.items); setLocked(d.locked); })
      .catch(() => { setItems([]); setLocked([]); })
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  return (
    <>
      <div className="crumb">Platform · Settings</div>
      <h1 className="page">Feature flags</h1>

      <div className="panel">
        {loading ? (
          <div className="dim" style={{ textAlign: "center", padding: 24 }}>Loading…</div>
        ) : items.length === 0 && locked.length === 0 ? (
          <div className="dim" style={{ textAlign: "center", padding: 24 }}>No config rows.</div>
        ) : (
          <>
            {items.map((row) => <FlagRow key={row.key} row={row} onDone={load} />)}
            {locked.map((row) => <LockedFlagRow key={row.key} row={row} />)}
          </>
        )}
      </div>
    </>
  );
}

function FlagRow({ row, onDone }: { row: ConfigRow; onDone: () => void }) {
  const mutate = useAdminMutation();
  const [val, setVal] = useState(row.value);

  const dirty = val !== row.value;

  const save = () =>
    mutate({
      title: `Update ${row.label}`,
      body: `${row.key}: "${row.value}" → "${val}"`,
      requireReason: true,
      confirmLabel: "Save",
      method: "PATCH",
      path: `/api/admin/config/${row.key}`,
      payload: { value: val },
      successMsg: "Config updated.",
      onDone,
    });

  return (
    <div className="row" style={{ padding: "14px 18px", borderBottom: "1px solid rgba(232, 184, 75, 0.08)", justifyContent: "space-between", flexWrap: "wrap" }}>
      <div style={{ minWidth: 200 }}>
        <div style={{ fontWeight: 600 }}>{row.label}</div>
        <div className="dim mono" style={{ fontSize: 11 }}>{row.key} · {row.category}</div>
      </div>
      <div className="row" style={{ flexWrap: "nowrap" }}>
        {row.type === "bool" ? (
          <button className={`chip${val === "true" ? " on" : ""}`} onClick={() => setVal(val === "true" ? "false" : "true")}>
            {val === "true" ? "ON" : "OFF"}
          </button>
        ) : row.type === "int" ? (
          <input className="input" style={{ maxWidth: 140 }} type="number" value={val} onChange={(e) => setVal(e.target.value)} />
        ) : (
          <input className="input" style={{ maxWidth: 240 }} value={val} onChange={(e) => setVal(e.target.value)} />
        )}
        <button className="btn gold" disabled={!dirty} onClick={save}>Save</button>
      </div>
    </div>
  );
}

function LockedFlagRow({ row }: { row: ConfigRow }) {
  return (
    <div className="row" style={{ padding: "14px 18px", borderBottom: "1px solid rgba(232, 184, 75, 0.08)", justifyContent: "space-between", flexWrap: "wrap", opacity: 0.6 }}>
      <div style={{ minWidth: 200 }}>
        <div style={{ fontWeight: 600 }}>{row.label}</div>
        <div className="dim mono" style={{ fontSize: 11 }}>{row.key} · {row.category}</div>
        <div className="dim" style={{ fontSize: 11, marginTop: 4 }}>Disabled for legal compliance — real-money top-up is locked.</div>
      </div>
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <button className="chip" disabled>{row.value === "true" ? "ON" : "OFF"}</button>
        <button className="btn" disabled>Save</button>
      </div>
    </div>
  );
}
