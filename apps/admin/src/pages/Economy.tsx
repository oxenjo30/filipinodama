import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAdminMutation } from "../lib/ui";
import { PlayerSearch } from "../components/PlayerSearch";
import { StoreCatalog } from "./Store";

type CurrencyT = "GOLD" | "DIAMONDS" | "TROPHIES";

type Ledger = {
  id: string;
  userId: string;
  currency: "GOLD" | "DIAMONDS" | "TROPHIES";
  amount: number;
  reason: string;
  refType: string | null;
  createdAt: string;
  user: { username: string; tag: string } | null;
};

/**
 * 1.5 Economy — the merged "Store & economy" page (mockup secEconomy is one
 * section): store catalog on top (full width), then a 2-column row of
 * grant/compensation (left) + ledger explorer (right).
 */
export function EconomyPage() {
  const [rows, setRows] = useState<Ledger[]>([]);
  const [player, setPlayer] = useState("");
  const [currency, setCurrency] = useState("");
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (player) qs.set("userId", player);
    if (currency) qs.set("currency", currency);
    qs.set("limit", "100");
    api
      .get<{ items: Ledger[] }>(`/api/admin/ledger?${qs}`)
      .then((d) => setRows(d.items))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  return (
    <>
      <div className="crumb">Economy · Store & currency</div>
      <h1 className="page">Store & economy</h1>

      <StoreCatalog />

      <div className="fd-2col" style={{ alignItems: "start" }}>
        <GrantCard onDone={load} />

        <div className="panel" style={{ padding: 20 }}>
          <div style={{ font: "700 14px var(--sans)", color: "var(--ink-2)" }}>Ledger explorer</div>
          <div className="row" style={{ marginTop: 14, marginBottom: 12, alignItems: "stretch" }}>
            <div style={{ flex: "1 1 220px", minWidth: 180 }}>
              <PlayerSearch value={player} onSelect={setPlayer} placeholder="Filter by player (name, tag, email)…" />
            </div>
            <select className="select" style={{ maxWidth: 140 }} value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option value="">All currencies</option>
              <option value="GOLD">Gold</option>
              <option value="DIAMONDS">Diamonds</option>
              <option value="TROPHIES">Trophies</option>
            </select>
            <button className="abtn btn-ghost btn-ghost-sm" onClick={load}>Search</button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 420, overflowY: "auto" }}>
            {loading ? (
              <div className="dim" style={{ textAlign: "center", padding: 24 }}>Loading…</div>
            ) : rows.length === 0 ? (
              <div className="dim" style={{ textAlign: "center", padding: 24 }}>No ledger entries.</div>
            ) : (
              rows.map((r) => (
                <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 11px", background: "var(--bg-2)", borderRadius: 8 }}>
                  <span style={{ font: "600 11px var(--sans)", color: "var(--ink-3)", flex: 1 }}>
                    {r.user?.username ?? "—"} <span className="dim mono" style={{ fontSize: 10 }}>{r.user?.tag ?? ""}</span>
                    <span className="dim"> · {r.reason}{r.refType ? ` · ${r.refType}` : ""}</span>
                    <span className="dim mono" style={{ fontSize: 10 }}> · {new Date(r.createdAt).toLocaleString()}</span>
                  </span>
                  <span className="mono" style={{ fontWeight: 700, fontSize: 12, color: r.amount >= 0 ? "var(--green)" : "var(--red)", whiteSpace: "nowrap" }}>
                    {r.amount >= 0 ? "+" : ""}{r.amount.toLocaleString()} {r.currency}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/** Inline grant form (needs a dynamic path → do the request directly). */
function GrantCard({ onDone }: { onDone: () => void }) {
  const mutate = useAdminMutation();
  const [userId, setUserId] = useState("");
  const [currency, setCurrency] = useState<"GOLD" | "DIAMONDS" | "TROPHIES">("GOLD");
  const [amount, setAmount] = useState<number>(0);

  const submit = () =>
    mutate({
      title: `Grant ${amount} ${currency}`,
      body: `To player ${userId || "(none)"}. Via the ledger, audited.`,
      requireReason: true,
      confirmLabel: "Grant",
      method: "POST",
      path: `/api/admin/users/${userId}/grant`,
      payload: { currency, amount },
      successMsg: "Grant applied.",
      onDone,
    });

  return (
    <div className="panel" style={{ padding: 20 }}>
      <div style={{ font: "700 14px var(--sans)", color: "var(--ink-2)" }}>Grant currency</div>
      <div className="dim" style={{ marginTop: 6, fontSize: 12 }}>Credit or debit a player directly. Every grant is recorded in the ledger + audit log.</div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 14 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Player</label>
          <PlayerSearch value={userId} onSelect={setUserId} placeholder="Search player by name, tag, or email…" />
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <div className="field" style={{ marginBottom: 0, maxWidth: 150 }}>
            <label>Currency</label>
            <select className="select" value={currency} onChange={(e) => setCurrency(e.target.value as any)}>
              <option value="GOLD">Gold</option>
              <option value="DIAMONDS">Diamonds</option>
              <option value="TROPHIES">Trophies</option>
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0, maxWidth: 140 }}>
            <label>Amount</label>
            <input className="input" type="number" placeholder="Amount" value={amount || ""} onChange={(e) => setAmount(Number(e.target.value))} />
          </div>
        </div>
        <button className="abtn btn-gold-pill full" disabled={!userId || !amount} onClick={submit}>Grant</button>
      </div>
      <div className="dim" style={{ fontSize: 11, marginTop: 10 }}>Use a negative amount to debit.</div>
    </div>
  );
}
