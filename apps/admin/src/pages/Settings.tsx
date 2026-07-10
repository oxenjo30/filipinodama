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

      <div className="fd-2col">
        <div className="acard">
          <div style={{ font: "700 14px var(--sans)", color: "var(--ink-2)" }}>Feature flags</div>
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 4 }}>
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
        </div>

        <div className="acard">
          <div style={{ font: "700 14px var(--sans)", color: "var(--ink-2)" }}>Economy constants</div>
          <div style={{ marginTop: 6, font: "500 11px var(--sans)", color: "var(--dim)" }}>
            Deferred — no runtime consumer reads these yet.
          </div>
          <div className="dim" style={{ textAlign: "center", padding: "28px 0" }}>—</div>
        </div>
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
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", borderBottom: "1px solid rgba(232, 184, 75, .07)", flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ font: "700 12.5px var(--sans)", color: "var(--ink-2)" }}>{row.label}</div>
        <div className="dim mono" style={{ fontSize: 10.5 }}>{row.key} · {row.category}</div>
      </div>
      <div className="row" style={{ flexWrap: "nowrap" }}>
        {row.type === "bool" ? (
          <button className={`abtn fd-switch${val === "true" ? " on" : ""}`} onClick={() => setVal(val === "true" ? "false" : "true")}>
            <span className="knob" />
          </button>
        ) : row.type === "int" ? (
          <input className="input" style={{ maxWidth: 140 }} type="number" value={val} onChange={(e) => setVal(e.target.value)} />
        ) : (
          <input className="input" style={{ maxWidth: 240 }} value={val} onChange={(e) => setVal(e.target.value)} />
        )}
        <button className="abtn btn-gold-pill btn-gold-pill-sm" disabled={!dirty} onClick={save} style={dirty ? undefined : { opacity: 0.45, cursor: "not-allowed" }}>Save</button>
      </div>
    </div>
  );
}

function LockedFlagRow({ row }: { row: ConfigRow }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", borderBottom: "1px solid rgba(232, 184, 75, .07)", flexWrap: "wrap", opacity: 0.6 }}>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ font: "700 12.5px var(--sans)", color: "var(--ink-2)" }}>{row.label}</div>
        <div className="dim mono" style={{ fontSize: 10.5 }}>{row.key} · {row.category}</div>
        <div className="dim" style={{ fontSize: 11, marginTop: 4 }}>Disabled for legal compliance — real-money top-up is locked.</div>
      </div>
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <button className={`abtn fd-switch${row.value === "true" ? " on" : ""}`} disabled style={{ cursor: "not-allowed" }}>
          <span className="knob" />
        </button>
        <button className="abtn btn-gold-pill btn-gold-pill-sm" disabled style={{ opacity: 0.45, cursor: "not-allowed" }}>Save</button>
      </div>
    </div>
  );
}
