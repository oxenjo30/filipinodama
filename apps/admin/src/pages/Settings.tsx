import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useAdminMutation } from "../lib/ui";

type ConfigRow = { key: string; value: string; type: "bool" | "string" | "int"; category: string; label: string; locked?: boolean };

type Tab = "config" | "api";

/** Static, honest read-only integration list — no fabricated keys/secrets.
 *  Mirrors what's actually wired: PayMongo (dormant per gold-only-economy),
 *  Resend for transactional email, Postgres + Redis as core infra. */
const INTEGRATIONS: { name: string; desc: string; status: "active" | "dormant" }[] = [
  { name: "PayMongo", desc: "Real-money top-up — disabled for legal compliance (gold-only economy).", status: "dormant" },
  { name: "Resend", desc: "Transactional email (password reset, receipts, notices).", status: "active" },
  { name: "Postgres", desc: "Primary datastore.", status: "active" },
  { name: "Redis", desc: "Cache + realtime session/presence backing.", status: "active" },
];

/** 2B. Settings — live feature flags + economy constants over the Config model.
 *  SUPERADMIN-gated; API keys tab is a read-only integrations list. */
export function Settings() {
  const { can } = useAuth();
  const isSuperadmin = can("SUPERADMIN");
  const [tab, setTab] = useState<Tab>("config");

  return (
    <>
      <div className="crumb">Platform · Settings</div>
      <h1 className="page">Settings</h1>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <button className="abtn btn-ghost btn-ghost-sm" style={tab === "config" ? { borderColor: "var(--gold)", color: "var(--gold-lt)" } : undefined} onClick={() => setTab("config")}>
          Config &amp; feature flags
        </button>
        <button className="abtn btn-ghost btn-ghost-sm" style={tab === "api" ? { borderColor: "var(--gold)", color: "var(--gold-lt)" } : undefined} onClick={() => setTab("api")}>
          API keys &amp; integrations
        </button>
      </div>

      {tab === "config" ? (
        isSuperadmin ? <ConfigPanel /> : <RestrictedPanel />
      ) : (
        <IntegrationsPanel />
      )}
    </>
  );
}

function RestrictedPanel() {
  return (
    <div className="acard" style={{ padding: 48, textAlign: "center" }}>
      <div style={{ font: "700 15px var(--serif)", color: "var(--red)" }}>Restricted</div>
      <div style={{ marginTop: 6, font: "500 13px var(--sans)", color: "var(--dim)" }}>
        Feature flags and economy config require the SUPERADMIN role.
      </div>
    </div>
  );
}

function ConfigPanel() {
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

  const flags = items.filter((r) => r.type === "bool");
  const constants = items.filter((r) => r.type !== "bool");

  return (
    <div className="fd-2col">
      <div className="acard">
        <div style={{ font: "700 14px var(--sans)", color: "var(--ink-2)" }}>Feature flags</div>
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 4 }}>
          {loading ? (
            <div className="dim" style={{ textAlign: "center", padding: 24 }}>Loading…</div>
          ) : flags.length === 0 && locked.length === 0 ? (
            <div className="dim" style={{ textAlign: "center", padding: 24 }}>No feature flags.</div>
          ) : (
            <>
              {flags.map((row) => <FlagRow key={row.key} row={row} onDone={load} />)}
              {locked.map((row) => <LockedFlagRow key={row.key} row={row} />)}
            </>
          )}
        </div>
      </div>

      <div className="acard">
        <div style={{ font: "700 14px var(--sans)", color: "var(--ink-2)" }}>Economy constants</div>
        <div style={{ marginTop: 6, font: "500 11px var(--sans)", color: "var(--dim)" }}>
          Read live by the server. Every change is audited.
        </div>
        {loading ? (
          <div className="dim" style={{ textAlign: "center", padding: "28px 0" }}>Loading…</div>
        ) : constants.length === 0 ? (
          <div className="dim" style={{ textAlign: "center", padding: "28px 0" }}>No economy constants configured.</div>
        ) : (
          <ConstantsForm rows={constants} onDone={load} />
        )}
      </div>
    </div>
  );
}

function ConstantsForm({ rows, onDone }: { rows: ConfigRow[]; onDone: () => void }) {
  const mutate = useAdminMutation();
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((r) => [r.key, r.value])));

  const dirty = rows.filter((r) => vals[r.key] !== r.value);

  const save = async () => {
    for (const row of dirty) {
      const ok = await mutate({
        title: `Update ${row.label}`,
        body: `${row.key}: "${row.value}" → "${vals[row.key]}"`,
        requireReason: true,
        confirmLabel: "Save",
        method: "PATCH",
        path: `/api/admin/config/${row.key}`,
        payload: { value: vals[row.key] },
        successMsg: `${row.label} updated.`,
      });
      if (!ok) return;
    }
    onDone();
  };

  return (
    <>
      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 11 }}>
        {rows.map((row) => (
          <div key={row.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ font: "700 12px var(--sans)", color: "var(--ink)" }}>{row.label}</div>
              <div className="dim mono" style={{ fontSize: 10 }}>{row.key}</div>
            </div>
            <input
              className="mono"
              value={vals[row.key]}
              onChange={(e) => setVals((v) => ({ ...v, [row.key]: e.target.value }))}
              style={{ width: 90, background: "#0f0720", border: "1px solid rgba(232, 184, 75, .2)", borderRadius: 7, padding: "8px 10px", color: "var(--gold-lt)", fontWeight: 700, fontSize: 12, textAlign: "right" }}
            />
          </div>
        ))}
      </div>
      <button className="abtn btn-gold-pill full" style={{ marginTop: 16 }} disabled={dirty.length === 0} onClick={save}>
        Save constants
      </button>
    </>
  );
}

function FlagRow({ row, onDone }: { row: ConfigRow; onDone: () => void }) {
  const mutate = useAdminMutation();

  const toggle = () => {
    const next = row.value === "true" ? "false" : "true";
    void mutate({
      title: `Update ${row.label}`,
      body: `${row.key}: "${row.value}" → "${next}"`,
      requireReason: true,
      confirmLabel: "Save",
      method: "PATCH",
      path: `/api/admin/config/${row.key}`,
      payload: { value: next },
      successMsg: "Config updated.",
      onDone,
    });
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", borderBottom: "1px solid rgba(232, 184, 75, .07)" }}>
      <div style={{ flex: 1 }}>
        <div style={{ font: "700 12.5px var(--sans)", color: "var(--ink-2)" }}>{row.label}</div>
        <div className="dim" style={{ font: "500 10.5px var(--sans)" }}>{row.category}</div>
      </div>
      <button className={`abtn fd-switch${row.value === "true" ? " on" : ""}`} onClick={toggle}>
        <span className="knob" />
      </button>
    </div>
  );
}

function LockedFlagRow({ row }: { row: ConfigRow }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", borderBottom: "1px solid rgba(232, 184, 75, .07)", opacity: 0.6 }}>
      <div style={{ flex: 1 }}>
        <div style={{ font: "700 12.5px var(--sans)", color: "var(--ink-2)" }}>{row.label}</div>
        <div className="dim" style={{ font: "500 10.5px var(--sans)" }}>Disabled for legal compliance — real-money top-up is locked.</div>
      </div>
      <button className={`abtn fd-switch${row.value === "true" ? " on" : ""}`} disabled style={{ cursor: "not-allowed" }}>
        <span className="knob" />
      </button>
    </div>
  );
}

function IntegrationsPanel() {
  return (
    <div className="acard">
      <div style={{ font: "700 14px var(--sans)", color: "var(--ink-2)" }}>Integrations</div>
      <div style={{ marginTop: 6, font: "500 11px var(--sans)", color: "var(--dim)" }}>
        Read-only. No keys or secrets are ever shown here.
      </div>
      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 4 }}>
        {INTEGRATIONS.map((it) => (
          <div key={it.name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", borderBottom: "1px solid rgba(232, 184, 75, .07)" }}>
            <div style={{ flex: 1 }}>
              <div style={{ font: "700 12.5px var(--sans)", color: "var(--ink-2)" }}>{it.name}</div>
              <div className="dim" style={{ font: "500 10.5px var(--sans)" }}>{it.desc}</div>
            </div>
            <span className={`badge-st ${it.status === "active" ? "st-active" : "st-muted"}`}>{it.status === "active" ? "Active" : "Dormant"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
