import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useAdminMutation, useToast } from "../lib/ui";

type ConfigRow = { key: string; value: string; type: "bool" | "string" | "int"; category: string; label: string; locked?: boolean };

type Tab = "config" | "payments" | "api";

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
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <button
          className={tab === "config" ? "abtn btn-gold-pill sm" : "abtn btn-ghost btn-ghost-sm"}
          onClick={() => setTab("config")}
        >
          Config &amp; feature flags
        </button>
        {isSuperadmin && (
          <button
            className={tab === "payments" ? "abtn btn-gold-pill sm" : "abtn btn-ghost btn-ghost-sm"}
            onClick={() => setTab("payments")}
          >
            Payment gateways
          </button>
        )}
        <button
          className={tab === "api" ? "abtn btn-gold-pill sm" : "abtn btn-ghost btn-ghost-sm"}
          onClick={() => setTab("api")}
        >
          API keys &amp; integrations
        </button>
      </div>

      {tab === "config" ? (
        isSuperadmin ? <ConfigPanel /> : <RestrictedPanel />
      ) : tab === "payments" ? (
        isSuperadmin ? <PaymentGatewaysPanel /> : <RestrictedPanel />
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
      <div className="acard" style={{ padding: 20 }}>
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

      <div className="acard" style={{ padding: 20 }}>
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

// ── Payment gateways (v3 delta Cluster A1) ─────────────────────────────────
// SUPERADMIN-only. Money-inert: has no effect on real money flows while
// DIAMOND_TOPUP_ENABLED=false. Config persists to the server; "Test
// connection" is a REAL check (PayMongo pings the live API when a key is
// configured; the other three gateways have no server integration and always
// report "Not configured" — never a fabricated success).

type GatewayId = "paypal" | "stripe" | "paymongo" | "xendit";
type GatewayRow = { id: GatewayId; name: string; enabled: boolean; feePct: number };
type CredentialField = Record<string, boolean>;
type CredentialInfo = { configured: boolean; fields: CredentialField; webhookUrl: string };
type GatewaysResponse = {
  gateways: GatewayRow[];
  environment: "live" | "sandbox";
  credentials: Record<GatewayId, CredentialInfo>;
  diamondPacks: { id: string; label: string; diamonds: number; bonus: number; priceCents: number; currencyCode: string }[];
  moneyInert: boolean;
  moneyInertNote: string;
};

const FIELD_LABELS: Record<string, string> = {
  clientId: "Client ID",
  secret: "Secret",
  webhookId: "Webhook ID",
  publishableKey: "Publishable key",
  secretKey: "Secret key",
  webhookSecret: "Webhook secret",
  publicKey: "Public key",
  webhookToken: "Webhook token",
};

function money(cents: number, currency = "PHP"): string {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency, minimumFractionDigits: 2 }).format(cents / 100);
}

function PaymentGatewaysPanel() {
  const [data, setData] = useState<GatewaysResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  const load = () => {
    setLoading(true);
    api
      .get<GatewaysResponse>("/api/admin/gateways")
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast("ok", "Copied.");
    } catch {
      toast("err", "Could not copy.");
    }
  };

  if (loading) return <div className="acard dim" style={{ padding: 24, textAlign: "center" }}>Loading…</div>;
  if (!data) return <div className="acard dim" style={{ padding: 24, textAlign: "center" }}>Could not load payment gateways.</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="acard" style={{ padding: "12px 16px", background: "rgba(240, 207, 114, .08)", border: "1px solid rgba(240, 207, 114, .25)" }}>
        <div style={{ font: "600 12px var(--sans)", color: "var(--amber, #f0cf72)" }}>{data.moneyInertNote}</div>
      </div>

      <GatewayStatusCard data={data} onDone={load} />
      <EnvironmentCard environment={data.environment} onDone={load} />

      {(["paypal", "stripe", "paymongo", "xendit"] as GatewayId[]).map((id) => (
        <CredentialCard key={id} id={id} name={data.gateways.find((g) => g.id === id)!.name} info={data.credentials[id]} onCopy={copy} />
      ))}

      <DiamondPacksCard packs={data.diamondPacks} />
    </div>
  );
}

function GatewayStatusCard({ data, onDone }: { data: GatewaysResponse; onDone: () => void }) {
  const mutate = useAdminMutation();
  const toast = useToast();
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [testResult, setTestResult] = useState<Record<string, "ok" | "fail">>({});
  const [fees, setFees] = useState<Record<string, string>>(() => Object.fromEntries(data.gateways.map((g) => [g.id, String(g.feePct)])));

  useEffect(() => {
    setFees(Object.fromEntries(data.gateways.map((g) => [g.id, String(g.feePct)])));
  }, [data]);

  const saveFee = async (g: GatewayRow, feePct: number) => {
    const gateways = Object.fromEntries(data.gateways.map((row) => [row.id, row.id === g.id ? { enabled: row.enabled, feePct } : { enabled: row.enabled, feePct: row.feePct }]));
    const ok = await mutate({
      title: `Update ${g.name} fee`,
      body: `Set the processing fee for ${g.name} to ${feePct}%.`,
      requireReason: true,
      confirmLabel: "Save fee",
      method: "POST",
      path: "/api/admin/gateways",
      payload: { gateways, environment: data.environment },
      successMsg: `${g.name} fee updated.`,
      onDone,
    });
    if (!ok) setFees((f) => ({ ...f, [g.id]: String(g.feePct) }));
  };

  const toggleGateway = async (g: GatewayRow) => {
    const nextEnabled = !g.enabled;
    const gateways = Object.fromEntries(data.gateways.map((row) => [row.id, row.id === g.id ? { enabled: nextEnabled, feePct: row.feePct } : { enabled: row.enabled, feePct: row.feePct }]));
    await mutate({
      title: nextEnabled ? `Enable ${g.name}` : `Disable ${g.name}`,
      body: nextEnabled ? `Enable ${g.name} for gateway routing?` : `Disable ${g.name}?`,
      requireReason: true,
      confirmLabel: nextEnabled ? "Enable" : "Disable",
      method: "POST",
      path: "/api/admin/gateways",
      payload: { gateways, environment: data.environment },
      successMsg: nextEnabled ? `${g.name} enabled.` : `${g.name} disabled.`,
      onDone,
    });
  };

  const testGateway = async (g: GatewayRow) => {
    if (!g.enabled) {
      toast("err", `${g.name} is disabled — enable it first.`);
      return;
    }
    setTesting((t) => ({ ...t, [g.id]: true }));
    setTestResult((r) => { const n = { ...r }; delete n[g.id]; return n; });
    try {
      const res = await api.post<{ status: "ok" | "fail" | "not_configured"; latencyMs?: number; detail?: string }>(`/api/admin/gateways/${g.id}/test`);
      if (res.status === "ok") {
        setTestResult((r) => ({ ...r, [g.id]: "ok" }));
        toast("ok", `✓ ${g.name} connection OK${res.latencyMs != null ? ` (${res.latencyMs}ms)` : ""}.`);
      } else if (res.status === "not_configured") {
        setTestResult((r) => ({ ...r, [g.id]: "fail" }));
        toast("err", `${g.name}: Not configured.`);
      } else {
        setTestResult((r) => ({ ...r, [g.id]: "fail" }));
        toast("err", `${g.name}: ${res.detail ?? "Connection failed."}`);
      }
    } catch (e) {
      setTestResult((r) => ({ ...r, [g.id]: "fail" }));
      toast("err", e instanceof ApiError ? e.message : `${g.name} is disabled — enable it first.`);
    } finally {
      setTesting((t) => ({ ...t, [g.id]: false }));
    }
  };

  return (
    <div className="acard" style={{ padding: 20 }}>
      <div style={{ font: "700 14px var(--sans)", color: "var(--ink-2)" }}>Gateway status &amp; fees</div>
      <div style={{ marginTop: 6, font: "500 11px var(--sans)", color: "var(--dim)" }}>
        Toggle providers, set the processing fee, and test connectivity.
      </div>
      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        {data.gateways.map((g) => {
          const isTesting = !!testing[g.id];
          const result = testResult[g.id];
          const testLabel = isTesting ? "Testing…" : result === "ok" ? "✓ Connected" : "Test connection";
          return (
            <div
              key={g.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
                padding: "12px 14px",
                borderRadius: 10,
                border: `1px solid ${g.enabled ? "rgba(75, 214, 160, .35)" : "rgba(240, 207, 114, .2)"}`,
                background: g.enabled ? "rgba(75, 214, 160, .05)" : "rgba(139, 120, 173, .05)",
              }}
            >
              <div style={{ minWidth: 130 }}>
                <div style={{ font: "700 13px var(--sans)", color: "var(--ink)" }}>{g.name}</div>
                <div style={{ font: "600 10.5px var(--sans)", color: g.enabled ? "#4bd6a0" : "#8b78ad", marginTop: 2 }}>
                  {g.enabled ? "● Enabled" : "○ Disabled"}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  className="mono"
                  value={fees[g.id] ?? String(g.feePct)}
                  onChange={(e) => setFees((f) => ({ ...f, [g.id]: e.target.value }))}
                  onBlur={() => {
                    const n = Number(fees[g.id]);
                    if (Number.isFinite(n) && n >= 0 && n <= 100 && n !== g.feePct) void saveFee(g, n);
                    else setFees((f) => ({ ...f, [g.id]: String(g.feePct) }));
                  }}
                  style={{ width: 64, background: "#0f0720", border: "1px solid rgba(232, 184, 75, .2)", borderRadius: 7, padding: "6px 8px", color: "var(--gold-lt)", fontWeight: 700, fontSize: 12, textAlign: "right" }}
                />
                <span className="dim" style={{ fontSize: 12 }}>%</span>
              </div>
              <button className="abtn btn-ghost btn-ghost-sm" disabled={isTesting} onClick={() => void testGateway(g)}>
                {testLabel}
              </button>
              <button className={`abtn ${g.enabled ? "btn-ghost btn-ghost-sm" : "btn-gold-pill sm"}`} onClick={() => void toggleGateway(g)}>
                {g.enabled ? "Disable" : "Enable"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EnvironmentCard({ environment, onDone }: { environment: "live" | "sandbox"; onDone: () => void }) {
  const mutate = useAdminMutation();

  const toggle = async () => {
    // Need the current gateway rows to round-trip the save payload; refetch is
    // avoided by asking the server to keep gateways unchanged — but the API
    // requires the full config, so we read fresh state first.
    const cur = await api.get<GatewaysResponse>("/api/admin/gateways");
    const gateways = Object.fromEntries(cur.gateways.map((g) => [g.id, { enabled: g.enabled, feePct: g.feePct }]));
    const next = environment === "live" ? "sandbox" : "live";
    await mutate({
      title: "Change payment environment",
      body: `Switch payment environment to ${next === "live" ? "Live" : "Sandbox"}? Applies to every gateway.`,
      requireReason: true,
      confirmLabel: "Switch",
      method: "POST",
      path: "/api/admin/gateways",
      payload: { gateways, environment: next },
      successMsg: `Payment environment set to ${next === "live" ? "Live" : "Sandbox"}.`,
      onDone,
    });
  };

  return (
    <div className="acard" style={{ padding: 20, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ font: "700 14px var(--sans)", color: "var(--ink-2)" }}>Payment environment</div>
          <span className={`badge-st ${environment === "live" ? "st-active" : "st-muted"}`}>{environment === "live" ? "Live" : "Sandbox"}</span>
        </div>
        <div style={{ marginTop: 6, font: "500 11px var(--sans)", color: "var(--dim)" }}>
          Applies to every gateway. Switch to Live only after sandbox testing passes.
        </div>
      </div>
      <button className="abtn btn-ghost btn-ghost-sm" onClick={() => void toggle()}>
        Switch to {environment === "live" ? "Sandbox" : "Live"}
      </button>
    </div>
  );
}

function CredentialCard({ id, name, info, onCopy }: { id: GatewayId; name: string; info: CredentialInfo; onCopy: (s: string) => void }) {
  return (
    <div className="acard" style={{ padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ font: "700 14px var(--sans)", color: "var(--ink-2)" }}>{name} credentials</div>
        <span className={`badge-st ${info.configured ? "st-active" : "st-muted"}`}>{info.configured ? "Configured" : "Not configured"}</span>
      </div>
      <div style={{ marginTop: 6, font: "500 11px var(--sans)", color: "var(--dim)" }}>
        Credential editing arrives with the secrets manager.
      </div>
      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 4 }}>
        {Object.entries(info.fields).map(([field, present]) => (
          <div key={field} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: "1px solid rgba(232, 184, 75, .07)" }}>
            <div style={{ flex: 1, font: "600 12px var(--sans)", color: "var(--ink-2)" }}>{FIELD_LABELS[field] ?? field}</div>
            <input disabled value="••••••••" style={{ width: 120, background: "#0f0720", border: "1px solid rgba(232, 184, 75, .12)", borderRadius: 7, padding: "6px 8px", color: "var(--dim)", fontSize: 12, opacity: 0.6 }} />
            <span className={`badge-st ${present ? "st-active" : "st-muted"}`} style={{ minWidth: 96, textAlign: "center" }}>
              {present ? "Configured" : "Not configured"}
            </span>
          </div>
        ))}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0" }}>
          <div style={{ flex: 1, font: "600 12px var(--sans)", color: "var(--ink-2)" }}>Webhook endpoint</div>
          <div className="mono dim" style={{ fontSize: 11, flex: 2, wordBreak: "break-all" }}>{info.webhookUrl}</div>
          <button className="abtn btn-ghost btn-ghost-sm" onClick={() => onCopy(info.webhookUrl)}>Copy</button>
        </div>
      </div>
    </div>
  );
}

function DiamondPacksCard({ packs }: { packs: GatewaysResponse["diamondPacks"] }) {
  return (
    <div className="acard" style={{ padding: 20 }}>
      <div style={{ font: "700 14px var(--sans)", color: "var(--ink-2)" }}>Diamond packs — gateway product mapping</div>
      <div style={{ marginTop: 6, font: "500 11px var(--sans)", color: "var(--dim)" }}>
        Real store packs (apps/server/src/modules/payments.ts). No IAP/SKU mapping exists yet.
      </div>
      {packs.length === 0 ? (
        <div className="dim" style={{ textAlign: "center", padding: 24 }}>No diamond packs configured.</div>
      ) : (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", gap: 12, padding: "6px 0", font: "700 10px var(--sans)", color: "var(--dim)", textTransform: "uppercase", letterSpacing: ".4px" }}>
            <div style={{ flex: 2 }}>Product</div>
            <div style={{ flex: 1, textAlign: "right" }}>Price</div>
            <div style={{ flex: 1, textAlign: "right" }}>Diamonds</div>
            <div style={{ flex: 1, textAlign: "right" }}>Status</div>
          </div>
          {packs.map((p) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: "1px solid rgba(232, 184, 75, .07)" }}>
              <div style={{ flex: 2 }}>
                <div style={{ font: "700 12.5px var(--sans)", color: "var(--ink-2)" }}>{p.label}</div>
                <div className="dim mono" style={{ fontSize: 10 }}>{p.id}</div>
              </div>
              <div style={{ flex: 1, textAlign: "right", font: "700 12px var(--sans)", color: "var(--gold-lt)" }}>{money(p.priceCents)}</div>
              <div style={{ flex: 1, textAlign: "right", font: "600 12px var(--sans)", color: "var(--ink-2)" }}>
                💎 {p.diamonds}{p.bonus > 0 ? ` +${p.bonus}` : ""}
              </div>
              <div style={{ flex: 1, textAlign: "right" }}>
                <span className="badge-st st-muted">No IAP/SKU</span>
              </div>
            </div>
          ))}
        </div>
      )}
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
