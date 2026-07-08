import { useEffect, useState } from "react";
import { api } from "../lib/api";

type Player = { id: string; username: string; tag: string } | null;

type MatchRow = {
  id: string;
  mode: string;
  red: Player;
  blue: Player;
  winner: string | null;
  reason: string | null;
  redTrophyDelta: number | null;
  blueTrophyDelta: number | null;
  goldReward: number | null;
  startedAt: string;
  endedAt: string | null;
  durationSec: number | null;
};

type MatchDetail = MatchRow & {
  settings: unknown;
  moveCount: number;
  moves: unknown;
};

const MODES = ["AI", "CASUAL", "RANKED", "PRIVATE", "LOCAL"] as const;

/** Colour a winner cell: red side / blue side / draw / unfinished. */
function winnerColor(winner: string | null): string {
  if (!winner) return "var(--dim)";
  if (winner === "red") return "var(--red-lt)";
  if (winner === "blue") return "var(--blue)";
  return "var(--dim-2)";
}

function fmtDuration(sec: number | null): string {
  if (sec == null) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function playerLabel(p: Player): string {
  return p ? `${p.username} ${p.tag}` : "AI / vacant";
}

/** Trophy delta with sign + colour (null → em dash). */
function Delta({ v }: { v: number | null }) {
  if (v == null) return <span className="dim">—</span>;
  return <span style={{ color: v >= 0 ? "var(--green)" : "var(--red)" }}>{v >= 0 ? "+" : ""}{v}</span>;
}

/**
 * Match integrity viewer — a read-only inspector over the real Match model.
 * List with mode + player filters; a row opens a detail drawer showing the two
 * sides, outcome, trophy/gold deltas, timing, settings, and the raw moves JSON.
 * No write actions (the anti-cheat detection subsystem is Phase 2 and is not
 * faked here — every value shown is a real column).
 */
export function MatchesPage() {
  const [rows, setRows] = useState<MatchRow[]>([]);
  const [mode, setMode] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [loading, setLoading] = useState(true);
  const [selId, setSelId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    const qs = new URLSearchParams({ limit: "100" });
    if (mode) qs.set("mode", mode);
    if (playerId.trim()) qs.set("playerId", playerId.trim());
    api
      .get<{ items: MatchRow[] }>(`/api/admin/matches?${qs}`)
      .then((d) => setRows(d.items))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  };
  useEffect(load, [mode]);

  return (
    <>
      <div className="crumb">Match Integrity · Matches</div>
      <h1 className="page">Matches</h1>

      <div className="row" style={{ marginBottom: 12 }}>
        <input
          className="input" style={{ maxWidth: 300 }}
          placeholder="Filter by player id (red or blue)"
          value={playerId}
          onChange={(e) => setPlayerId(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
        />
        <button className="btn" onClick={load}>Search</button>
        <div style={{ marginLeft: "auto" }} className="dim">{rows.length} matches</div>
      </div>
      <div className="row" style={{ marginBottom: 14 }}>
        <button className={`chip${mode === "" ? " on" : ""}`} onClick={() => setMode("")}>all</button>
        {MODES.map((m) => (
          <button key={m} className={`chip${mode === m ? " on" : ""}`} onClick={() => setMode(m)}>{m}</button>
        ))}
      </div>

      <div className="panel">
        <table className="tbl">
          <thead>
            <tr>
              <th>Match</th>
              <th>Mode</th>
              <th>Red</th>
              <th>Blue</th>
              <th>Winner</th>
              <th className="num">Trophy Δ</th>
              <th className="num">Gold</th>
              <th className="num">Duration</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="dim" style={{ textAlign: "center", padding: 24 }}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} className="dim" style={{ textAlign: "center", padding: 24 }}>No matches found.</td></tr>
            ) : (
              rows.map((m) => (
                <tr key={m.id} className="click" onClick={() => setSelId(m.id)}>
                  <td>
                    <div className="dim mono" style={{ fontSize: 12 }}>{m.id}</div>
                    <div className="dim" style={{ fontSize: 11 }}>{new Date(m.startedAt).toLocaleString()}</div>
                  </td>
                  <td className="mono">{m.mode}</td>
                  <td>{playerLabel(m.red)}</td>
                  <td>{playerLabel(m.blue)}</td>
                  <td style={{ color: winnerColor(m.winner), fontWeight: 600 }}>{m.winner ?? "unfinished"}</td>
                  <td className="num"><Delta v={m.redTrophyDelta} /> / <Delta v={m.blueTrophyDelta} /></td>
                  <td className="num">{(m.goldReward ?? 0).toLocaleString()}</td>
                  <td className="num">{fmtDuration(m.durationSec)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selId && <MatchDrawer id={selId} onClose={() => setSelId(null)} />}
    </>
  );
}

// ── Detail drawer ─────────────────────────────────────────────────────────────
function MatchDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const [d, setD] = useState<MatchDetail | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    setErr(false);
    api.get<MatchDetail>(`/api/admin/matches/${id}`).then(setD).catch(() => setErr(true));
  }, [id]);

  return (
    <div className="drawer-wrap">
      <div className="drawer-bd" onClick={onClose} />
      <div className="drawer">
        {err ? (
          <div className="dim">Couldn't load match.</div>
        ) : !d ? (
          <div className="dim">Loading…</div>
        ) : (
          <>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div className="crumb">{d.mode} match</div>
                <div style={{ font: "800 18px var(--serif)", color: "var(--gold-lt)", marginTop: 4 }}>
                  {playerLabel(d.red)} <span className="dim">vs</span> {playerLabel(d.blue)}
                </div>
                <div className="dim mono" style={{ fontSize: 12, marginTop: 2 }}>{d.id}</div>
              </div>
              <button className="btn" onClick={onClose}>Close</button>
            </div>

            {/* Outcome stat cards — real columns only */}
            <div className="kpi" style={{ margin: "18px 0", gridTemplateColumns: "repeat(2,1fr)" }}>
              <div className="card">
                <div className="v mono" style={{ color: winnerColor(d.winner) }}>{d.winner ?? "—"}</div>
                <div className="l">Winner{d.reason ? ` · ${d.reason}` : ""}</div>
              </div>
              <div className="card">
                <div className="v mono">{fmtDuration(d.durationSec)}</div>
                <div className="l">Duration</div>
              </div>
              <div className="card">
                <div className="v mono"><Delta v={d.redTrophyDelta} /> / <Delta v={d.blueTrophyDelta} /></div>
                <div className="l">Trophy Δ · red / blue</div>
              </div>
              <div className="card">
                <div className="v mono">{(d.goldReward ?? 0).toLocaleString()}</div>
                <div className="l">Gold reward</div>
              </div>
            </div>

            <div className="dim" style={{ fontSize: 12, marginBottom: 16 }}>
              Started {new Date(d.startedAt).toLocaleString()}
              {d.endedAt ? ` · ended ${new Date(d.endedAt).toLocaleString()}` : " · not yet ended"}
              {` · ${d.moveCount} move${d.moveCount === 1 ? "" : "s"}`}
            </div>

            {/* Settings (Json) */}
            <div style={{ fontWeight: 700, margin: "10px 0 8px" }}>Settings</div>
            <div className="panel panel-pad">
              <pre className="mono" style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-word", color: "var(--ink-3)" }}>
                {JSON.stringify(d.settings, null, 2)}
              </pre>
            </div>

            {/* Raw moves (Json array) — for integrity inspection */}
            <div style={{ fontWeight: 700, margin: "22px 0 8px" }}>Moves <span className="dim" style={{ fontWeight: 500 }}>· {d.moveCount} total (raw JSON)</span></div>
            <div className="panel panel-pad">
              <pre className="mono" style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-word", color: "var(--ink-3)", maxHeight: 360, overflow: "auto" }}>
                {JSON.stringify(d.moves, null, 2)}
              </pre>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
