import { useEffect, useState } from "react";
import { RANK_TIERS } from "@dama/shared";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useAdminMutation, useToast } from "../lib/ui";

type PlayerRow = {
  id: string; username: string; displayName: string; tag: string; email: string | null;
  rankTier: string; trophies: number; gold: number; diamonds: number; status: string; createdAt: string;
};
type Detail = PlayerRow & {
  bio: string | null; countryCode: string | null; isGuest: boolean; adminRole: string | null;
  wins: number; losses: number; draws: number; streak: number;
  bannedUntil: string | null; mutedUntil: string | null; createdAt: string; lastSeenAt: string;
  guildMember: { guild: { name: string; tag: string }; role: string } | null;
  ledger: { id: string; currency: string; amount: number; reason: string; createdAt: string }[];
  openReportsAgainst: number;
};
type MatchRow = { id: string; mode: string; winner: string | null; startedAt: string; red: { username: string } | null; blue: { username: string } | null };

const FILTERS = ["all", "active", "muted", "banned"] as const;

function StatusBadge({ s }: { s: string }) {
  const cls = s === "banned" ? "st-banned" : s === "muted" ? "st-muted" : s === "deleted" ? "st-deleted" : "st-active";
  return <span className={`badge-st ${cls}`}>{s}</span>;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** 1.3/1.4 Players — search, list, detail drawer, sanctions. */
export function PlayersPage() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [rows, setRows] = useState<PlayerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selId, setSelId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    const qs = new URLSearchParams({ filter, limit: "50" });
    if (q.trim()) qs.set("q", q.trim());
    api
      .get<{ items: PlayerRow[]; total: number }>(`/api/admin/users?${qs}`)
      .then((d) => { setRows(d.items); setTotal(d.total); })
      .catch(() => { setRows([]); setTotal(0); })
      .finally(() => setLoading(false));
  };
  useEffect(load, [filter]);

  return (
    <>
      <div className="crumb">Player Management · Players</div>
      <h1 className="page">Players</h1>

      <div className="row" style={{ marginBottom: 12, gap: 10, flexWrap: "wrap" }}>
        <input
          className="input" style={{ flex: 1, minWidth: 220 }}
          placeholder="Search by username, tag, email, or ID…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
        />
        {FILTERS.map((f) => (
          <button key={f} className={`abtn chip${filter === f ? " on" : ""}`} onClick={() => setFilter(f)}>{f}</button>
        ))}
        <button className="btn" onClick={load}>Search</button>
      </div>
      <div className="dim" style={{ marginBottom: 14, fontSize: 12 }}>{total} players</div>

      <div className="panel">
        <table className="tbl">
          <thead>
            <tr className="thead-raised">
              <th>Player</th><th>Rank</th><th className="num">Trophies</th><th className="num">Gold</th><th className="num">Diamonds</th><th style={{ textAlign: "center" }}>Status</th><th className="num">Joined</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="dim" style={{ textAlign: "center", padding: 24 }}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="dim" style={{ textAlign: "center", padding: 24 }}>No players match your search.</td></tr>
            ) : (
              rows.map((p) => {
                const tier = RANK_TIERS.find((t) => t.key === p.rankTier);
                return (
                  <tr key={p.id} className="arow" style={{ cursor: "pointer" }} onClick={() => setSelId(p.id)}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div className="fd-avatar">{initials(p.displayName || p.username)}</div>
                        <div>
                          <div style={{ fontWeight: 600 }}>{p.displayName}</div>
                          <div className="dim mono" style={{ fontSize: 12 }}>{p.username} {p.tag}</div>
                        </div>
                      </div>
                    </td>
                    <td><span className="rank-chip" style={{ color: tier?.accent }}>{tier?.label ?? p.rankTier}</span></td>
                    <td className="num">{p.trophies.toLocaleString()}</td>
                    <td className="num">{p.gold.toLocaleString()}</td>
                    <td className="num">{p.diamonds.toLocaleString()}</td>
                    <td style={{ textAlign: "center" }}><StatusBadge s={p.status} /></td>
                    <td className="num dim">{new Date(p.createdAt).toLocaleDateString()}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {selId && <PlayerDrawer id={selId} onClose={() => setSelId(null)} onChanged={load} />}
    </>
  );
}

// ── Detail drawer ─────────────────────────────────────────────────────────────
function PlayerDrawer({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { can } = useAuth();
  const mutate = useAdminMutation();
  const toast = useToast();
  const [d, setD] = useState<Detail | null>(null);
  const [matches, setMatches] = useState<MatchRow[]>([]);

  const load = () => {
    api.get<Detail>(`/api/admin/users/${id}`).then(setD).catch(() => setD(null));
    api.get<{ items: MatchRow[] }>(`/api/admin/users/${id}/matches?limit=15`).then((r) => setMatches(r.items)).catch(() => setMatches([]));
  };
  useEffect(load, [id]);

  const after = () => { load(); onChanged(); };

  const durationField = (set: (k: string, v: unknown) => void, vals: Record<string, unknown>) => (
    <div className="field">
      <label>Duration</label>
      <select className="select" value={(vals.durationHours as number) ?? 24} onChange={(e) => set("durationHours", Number(e.target.value))}>
        <option value={1}>1 hour</option>
        <option value={24}>24 hours</option>
        <option value={168}>7 days</option>
        <option value={0}>Permanent</option>
      </select>
    </div>
  );

  const ban = () => mutate({ title: `Ban ${d?.username}`, requireReason: true, danger: true, confirmLabel: "Ban", method: "POST", path: `/api/admin/users/${id}/ban`, payload: { durationHours: 24 }, successMsg: "Player banned.", onDone: after, extra: durationField });
  const unban = () => mutate({ title: `Unban ${d?.username}`, requireReason: true, confirmLabel: "Unban", method: "POST", path: `/api/admin/users/${id}/unban`, successMsg: "Ban lifted.", onDone: after });
  const mute = () => mutate({ title: `Mute ${d?.username}`, requireReason: true, danger: true, confirmLabel: "Mute", method: "POST", path: `/api/admin/users/${id}/mute`, payload: { durationHours: 24 }, successMsg: "Player muted.", onDone: after, extra: durationField });
  const unlock = () => mutate({ title: `Unmute ${d?.username}`, requireReason: true, confirmLabel: "Unmute", method: "POST", path: `/api/admin/users/${id}/unlock`, successMsg: "Mute lifted.", onDone: after });

  const notify = () =>
    mutate({
      title: `Notify ${d?.username}`, confirmLabel: "Send", method: "POST", path: `/api/admin/users/${id}/notify`, successMsg: "Notification sent.",
      extra: (set, vals) => (
        <>
          <div className="field"><label>Title</label><input className="input" value={(vals.title as string) ?? ""} onChange={(e) => set("title", e.target.value)} /></div>
          <div className="field"><label>Message</label><textarea className="input" rows={3} value={(vals.body as string) ?? ""} onChange={(e) => set("body", e.target.value)} /></div>
        </>
      ),
    });

  const grant = () =>
    mutate({
      title: `Grant currency to ${d?.username}`, requireReason: true, confirmLabel: "Grant", method: "POST", path: `/api/admin/users/${id}/grant`, successMsg: "Grant applied.", onDone: after,
      extra: (set, vals) => (
        <>
          <div className="field"><label>Currency</label>
            <select className="select" value={(vals.currency as string) ?? "GOLD"} onChange={(e) => set("currency", e.target.value)}>
              <option>GOLD</option><option>DIAMONDS</option><option>TROPHIES</option>
            </select>
          </div>
          <div className="field"><label>Amount (negative to debit)</label>
            <input className="input" type="number" value={(vals.amount as number) ?? ""} onChange={(e) => set("amount", Number(e.target.value))} />
          </div>
        </>
      ),
    });

  return (
    <div className="drawer-wrap">
      <div className="drawer-bd" onClick={onClose} />
      <div className="drawer">
        {!d ? (
          <div className="dim">Loading…</div>
        ) : (
          <>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div>
                <div style={{ font: "800 20px var(--sans)" }}>{d.displayName} <StatusBadge s={d.status} /></div>
                <div className="dim mono">{d.username} {d.tag}{d.email ? ` · ${d.email}` : ""}</div>
              </div>
              <button className="btn" onClick={onClose}>Close</button>
            </div>

            <div className="kpi" style={{ margin: "18px 0" }}>
              <div className="card"><div className="v mono">{d.trophies.toLocaleString()}</div><div className="l">Trophies · {d.rankTier}</div></div>
              <div className="card"><div className="v mono">{d.gold.toLocaleString()}</div><div className="l">Gold</div></div>
              <div className="card"><div className="v mono">{d.diamonds.toLocaleString()}</div><div className="l">Diamonds</div></div>
              <div className="card"><div className="v mono">{d.wins}/{d.losses}/{d.draws}</div><div className="l">W / L / D · streak {d.streak}</div></div>
            </div>

            <div className="dim" style={{ fontSize: 12, marginBottom: 16 }}>
              Joined {new Date(d.createdAt).toLocaleDateString()} · last seen {new Date(d.lastSeenAt).toLocaleString()}
              {d.guildMember ? ` · Guild: ${d.guildMember.guild.name} (${d.guildMember.role})` : ""}
              {d.adminRole ? ` · ADMIN: ${d.adminRole}` : ""}
            </div>

            {d.openReportsAgainst > 0 && <div className="dim">⚠ Reports against: {d.openReportsAgainst}</div>}

            {/* Actions — role-gated (server enforces too) */}
            <div style={{ fontWeight: 700, margin: "10px 0 8px" }}>Actions</div>
            <div className="row">
              {can("SUPPORT") && <button className="btn" onClick={notify}>Notify</button>}
              {can("SUPPORT") && d.status === "muted" && <button className="btn" onClick={unlock}>Unmute</button>}
              {can("MODERATOR") && d.status !== "muted" && <button className="btn" onClick={mute}>Mute</button>}
              {can("MODERATOR") && d.status !== "banned" && <button className="btn danger" onClick={ban}>Ban</button>}
              {can("MODERATOR") && d.status === "banned" && <button className="btn" onClick={unban}>Unban</button>}
              {can("ECONOMY") && <button className="btn" onClick={grant}>Grant currency</button>}
              {!can("SUPPORT") && <span className="dim">No actions available for your role.</span>}
            </div>

            {/* Recent matches */}
            <div style={{ fontWeight: 700, margin: "22px 0 8px" }}>Recent matches</div>
            <div className="panel">
              <table className="tbl">
                <thead><tr><th>Mode</th><th>Result</th><th>When</th></tr></thead>
                <tbody>
                  {matches.length === 0 ? (
                    <tr><td colSpan={3} className="dim" style={{ textAlign: "center", padding: 16 }}>No matches.</td></tr>
                  ) : (
                    matches.map((m) => (
                      <tr key={m.id}>
                        <td className="mono">{m.mode}</td>
                        <td className="dim">{m.winner ? `winner: ${m.winner}` : "unfinished"}</td>
                        <td className="mono dim">{new Date(m.startedAt).toLocaleString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Ledger */}
            <div style={{ fontWeight: 700, margin: "22px 0 8px" }}>Recent ledger</div>
            <div className="panel">
              <table className="tbl">
                <thead><tr><th>Currency</th><th className="num">Amount</th><th>Reason</th><th>When</th></tr></thead>
                <tbody>
                  {d.ledger.length === 0 ? (
                    <tr><td colSpan={4} className="dim" style={{ textAlign: "center", padding: 16 }}>No ledger entries.</td></tr>
                  ) : (
                    d.ledger.map((l) => (
                      <tr key={l.id}>
                        <td className="mono">{l.currency}</td>
                        <td className="num" style={{ color: l.amount >= 0 ? "var(--green)" : "var(--red)" }}>{l.amount >= 0 ? "+" : ""}{l.amount.toLocaleString()}</td>
                        <td className="dim">{l.reason}</td>
                        <td className="mono dim">{new Date(l.createdAt).toLocaleDateString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
