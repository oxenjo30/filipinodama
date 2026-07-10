import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAdminMutation } from "../lib/ui";

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

/** 1.5 Economy — grant currency to a player + browse the ledger. */
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
      <div className="crumb">Economy · Grants & Ledger</div>
      <h1 className="page">Grants & Ledger</h1>

      <GrantCard onDone={load} />

      <div className="row" style={{ margin: "22px 0 12px" }}>
        <input className="input" style={{ maxWidth: 240 }} placeholder="Filter by player id" value={player} onChange={(e) => setPlayer(e.target.value)} />
        <select className="select" style={{ maxWidth: 160 }} value={currency} onChange={(e) => setCurrency(e.target.value)}>
          <option value="">All currencies</option>
          <option value="GOLD">Gold</option>
          <option value="DIAMONDS">Diamonds</option>
          <option value="TROPHIES">Trophies</option>
        </select>
        <button className="btn" onClick={load}>Search</button>
      </div>

      <div className="panel">
        <table className="tbl">
          <thead>
            <tr><th>When</th><th>Player</th><th>Currency</th><th className="num">Amount</th><th>Reason</th></tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="dim" style={{ textAlign: "center", padding: 24 }}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={5} className="dim" style={{ textAlign: "center", padding: 24 }}>No ledger entries.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td className="mono dim" style={{ whiteSpace: "nowrap" }}>{new Date(r.createdAt).toLocaleString()}</td>
                  <td>{r.user?.username ?? "—"} <span className="dim mono">{r.user?.tag ?? ""}</span></td>
                  <td className="mono">{r.currency}</td>
                  <td className="num" style={{ color: r.amount >= 0 ? "var(--green)" : "var(--red)" }}>{r.amount >= 0 ? "+" : ""}{r.amount.toLocaleString()}</td>
                  <td className="dim">{r.reason}{r.refType ? ` · ${r.refType}` : ""}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
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
    <div className="panel panel-pad">
      <div style={{ fontWeight: 700, marginBottom: 12 }}>Grant currency</div>
      <div className="row">
        <input className="input" style={{ maxWidth: 260 }} placeholder="Player ID (from Players)" value={userId} onChange={(e) => setUserId(e.target.value)} />
        <select className="select" style={{ maxWidth: 150 }} value={currency} onChange={(e) => setCurrency(e.target.value as any)}>
          <option value="GOLD">Gold</option>
          <option value="DIAMONDS">Diamonds</option>
          <option value="TROPHIES">Trophies</option>
        </select>
        <input className="input" style={{ maxWidth: 160 }} type="number" placeholder="Amount" value={amount || ""} onChange={(e) => setAmount(Number(e.target.value))} />
        <button className="btn gold" disabled={!userId || !amount} onClick={submit}>Grant</button>
      </div>
      <div className="dim" style={{ fontSize: 12, marginTop: 8 }}>Use a negative amount to debit. Every grant is recorded in the ledger + audit log.</div>
    </div>
  );
}
