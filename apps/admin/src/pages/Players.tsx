import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
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

// Drawer action-button styles — copied verbatim from the mockup (actDefs).
const BTN_FONT: CSSProperties = { font: "700 11px Inter", letterSpacing: ".4px", borderRadius: 8, padding: "9px 14px", cursor: "pointer" };
const BTN_BASE: CSSProperties = { ...BTN_FONT, border: "1px solid rgba(232,184,75,.4)", color: "#3a2405", background: "linear-gradient(180deg,#f0cf72,#c99a2e)" };
const BTN_GHOST: CSSProperties = { ...BTN_FONT, border: "1px solid rgba(232,184,75,.3)", color: "#e9e0f7", background: "#221534" };
const BTN_DANGER: CSSProperties = { ...BTN_FONT, border: "1px solid rgba(194,73,90,.5)", color: "#fff", background: "linear-gradient(180deg,#c2495a,#8a2f3c)" };
const BTN_AMBER: CSSProperties = { ...BTN_FONT, border: "1px solid rgba(217,145,31,.5)", color: "#3a2405", background: "linear-gradient(180deg,#e8b04a,#c98a1e)" };
const BTN_RESTORE: CSSProperties = { ...BTN_FONT, border: "1px solid rgba(47,143,91,.5)", color: "#fff", background: "linear-gradient(180deg,#2f8f5b,#1c6e42)" };

/** 1.3/1.4 Players — search, list, detail drawer, sanctions. */
export function PlayersPage() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [rows, setRows] = useState<PlayerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selId, setSelId] = useState<string | null>(null);
  // Deep-link from the header global search (handoffv3 row 16): a player
  // result routes to `?open=<id>`, which opens this same detail drawer.
  // Consumed once on mount, then stripped from the URL.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const openId = searchParams.get("open");
    if (openId) {
      setSelId(openId);
      setSearchParams((p) => { p.delete("open"); return p; }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = (query: string) => {
    setLoading(true);
    const qs = new URLSearchParams({ filter, limit: "50" });
    if (query.trim()) qs.set("q", query.trim());
    api
      .get<{ items: PlayerRow[]; total: number }>(`/api/admin/users?${qs}`)
      .then((d) => { setRows(d.items); setTotal(d.total); })
      .catch(() => { setRows([]); setTotal(0); })
      .finally(() => setLoading(false));
  };

  // Live/debounced search — reload 300ms after the user stops typing, or
  // immediately when the filter pill changes.
  useEffect(() => {
    const t = setTimeout(() => load(q), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, filter]);

  return (
    <>
      <div className="row" style={{ marginBottom: 16, gap: 10, flexWrap: "wrap" }}>
        <input
          className="input" style={{ flex: 1, minWidth: 220 }}
          placeholder="Search by username, tag, email, or ID…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {FILTERS.map((f) => (
          <button key={f} className={`abtn chip${filter === f ? " on" : ""}`} onClick={() => setFilter(f)}>{f}</button>
        ))}
      </div>

      <div className="panel" style={{ overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
        <table className="tbl" style={{ minWidth: 720 }}>
          <thead>
            <tr className="thead-raised">
              <th>Player</th><th>Rank</th><th className="num">Trophies</th><th className="num">Gold</th><th className="num">Diamonds</th><th style={{ textAlign: "center" }}>Status</th><th className="num">Joined</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="dim" style={{ textAlign: "center", padding: 40, fontSize: 13, fontWeight: 600 }}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="dim" style={{ textAlign: "center", padding: 40, fontSize: 13, fontWeight: 600 }}>No players match your search.</td></tr>
            ) : (
              rows.map((p) => {
                const tier = RANK_TIERS.find((t) => t.key === p.rankTier);
                return (
                  <tr key={p.id} className="arow" style={{ cursor: "pointer" }} onClick={() => setSelId(p.id)}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div className="fd-avatar md">{initials(p.displayName || p.username)}</div>
                        <div>
                          <div style={{ font: "700 12.5px var(--sans)", color: "var(--ink-2)" }}>{p.displayName}</div>
                          <div className="dim mono" style={{ fontSize: 10.5, fontWeight: 500 }}>{p.tag}</div>
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
      </div>

      {selId && <PlayerDrawer id={selId} onClose={() => setSelId(null)} onChanged={() => load(q)} />}
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

  // Build the role-gated ACTIONS list, mirroring the mockup's actDefs order
  // (Notify · Restore · Mute · Grant · Ban). Suspend is intentionally omitted:
  // the backend has no suspend endpoint, and a dead button would be a fake control.
  const actions: { label: string; go: () => void; style: CSSProperties }[] = d
    ? [
        can("SUPPORT") && { label: "Notify", go: notify, style: BTN_GHOST },
        can("SUPPORT") && d.status === "muted" && { label: "Unmute", go: unlock, style: BTN_RESTORE },
        can("MODERATOR") && d.status === "banned" && { label: "Unban", go: unban, style: BTN_RESTORE },
        can("MODERATOR") && d.status !== "muted" && { label: "Mute", go: mute, style: BTN_AMBER },
        can("ECONOMY") && { label: "Grant", go: grant, style: BTN_BASE },
        can("MODERATOR") && d.status !== "banned" && { label: "Ban", go: ban, style: BTN_DANGER },
      ].filter(Boolean) as { label: string; go: () => void; style: CSSProperties }[]
    : [];

  // "vs {opponent}" + W/L/D chip, computed from the player's perspective.
  // Match.winner is a side ("red"|"blue"|"draw"), so resolve the player's side first.
  const matchView = matches.map((m) => {
    const me = d?.username;
    const isRed = m.red?.username === me;
    const opp = (isRed ? m.blue?.username : m.red?.username) ?? "—";
    const mySide = isRed ? "red" : "blue";
    let res: "W" | "L" | "D" = "D";
    if (m.winner === "red" || m.winner === "blue") res = m.winner === mySide ? "W" : "L";
    return { id: m.id, res, opp, mode: m.mode };
  });

  return (
    <div className="drawer-wrap">
      <div className="drawer-bd" onClick={onClose} />
      <div className="player-drawer">
        {!d ? (
          <div style={{ padding: 24 }} className="dim">Loading…</div>
        ) : (
          <>
            {/* Header: avatar · name · tag·email · close */}
            <div className="pd-head">
              <div className="pd-av">{initials(d.displayName || d.username)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="pd-name">{d.displayName}</div>
                <div className="pd-sub">{d.tag}{d.email ? ` · ${d.email}` : ""}</div>
              </div>
              <button className="pd-close" onClick={onClose} aria-label="Close">✕</button>
            </div>

            <div className="pd-body">
              {/* 3 KPI tiles */}
              <div className="pd-tiles">
                <div className="pd-tile"><div className="pd-tile-l">TROPHIES</div><div className="pd-tile-v" style={{ color: "#f5d783" }}>{d.trophies.toLocaleString()}</div></div>
                <div className="pd-tile"><div className="pd-tile-l">GOLD</div><div className="pd-tile-v" style={{ color: "#f2d493" }}>{d.gold.toLocaleString()}</div></div>
                <div className="pd-tile"><div className="pd-tile-l">DIAMONDS</div><div className="pd-tile-v" style={{ color: "#ff9aa8" }}>{d.diamonds.toLocaleString()}</div></div>
              </div>

              {/* Status row */}
              <div className="pd-status-row">
                <span className="pd-status-l">Status</span>
                <StatusBadge s={d.status} />
              </div>

              {/* Recent matches */}
              <div className="pd-section-l">RECENT MATCHES</div>
              <div className="pd-matches">
                {matchView.length === 0 ? (
                  <div className="pd-empty">No matches yet.</div>
                ) : (
                  matchView.map((m) => (
                    <div key={m.id} className="pd-match">
                      <span className={`pd-res ${m.res === "W" ? "win" : m.res === "L" ? "loss" : "draw"}`}>{m.res}</span>
                      <span className="pd-opp">vs {m.opp}</span>
                      <span className="pd-mode">{m.mode}</span>
                    </div>
                  ))
                )}
              </div>

              {/* Actions — 2-col grid, role-gated (server enforces too) */}
              <div className="pd-section-l">ACTIONS</div>
              {actions.length === 0 ? (
                <div className="pd-empty">No actions available for your role.</div>
              ) : (
                <div className="pd-actions">
                  {actions.map((a) => (
                    <button key={a.label} className="pd-abtn" style={a.style} onClick={a.go}>{a.label}</button>
                  ))}
                </div>
              )}

              <div className="pd-note">
                Actions available to your role are shown. Destructive and economy actions require a reason and are written to the audit log.
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
