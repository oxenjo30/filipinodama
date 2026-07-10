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

/** A note shown on every disabled Phase-2 control — never silently disabled. */
const PHASE2_NOTE = "Anti-cheat detection is a Phase 2 subsystem — not yet built. No detection data exists to act on.";

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

/** Real outcome label shown in the Match cell (win/draw/unfinished) — not a mockup column. */
function outcomeLabel(winner: string | null): string {
  if (!winner) return "Unfinished";
  if (winner === "draw") return "Draw";
  return winner === "red" ? "Red won" : "Blue won";
}

/**
 * Match review queue — matches the approved anti-cheat review-queue mockup's
 * structure (flag banner, 6-column queue table, per-row decision buttons,
 * detail drawer with detection tiles/timeline/signals/decision bar). We have
 * NO anti-cheat detection subsystem, so this stays an honest read-only
 * inspector over the real Match model: the queue shows real matches (id,
 * players, mode, outcome — outcome folded into the Match cell since there is
 * no real case-review Status yet), the Flag reason/Confidence/Status columns
 * the mockup calls for are rendered as "—" (no fabricated scores), and every
 * decision button (Review is real; Replay / Clear flag / Void / Ban are
 * Phase-2) is disabled with a tooltip explaining why, per the no-fabrication
 * rule. The drawer's 4 mockup detection tiles (Avg accuracy/Move time/Moves/
 * Priors) are honest "—"; real match data (winner/duration/trophy/gold) is a
 * separate clearly-labelled block. Settings + raw moves are real API data.
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

      <div className="flag-banner" style={{ marginBottom: 14 }}>
        <span className="dot" />
        <span>Anti-cheat detection is a Phase 2 subsystem — this is a read-only match review view. No flags, confidence scores, or decisions below are real.</span>
      </div>

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

      <div className="panel" style={{ overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table className="tbl" style={{ minWidth: 900 }}>
            <thead>
              <tr className="thead-raised">
                <th>Match</th>
                <th>Mode</th>
                <th>Flag reason</th>
                <th className="num">Confidence</th>
                <th style={{ textAlign: "center" }}>Status</th>
                <th style={{ textAlign: "center" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="dim" style={{ textAlign: "center", padding: 24 }}>Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} className="dim" style={{ textAlign: "center", padding: 24 }}>No matches found.</td></tr>
              ) : (
                rows.map((m) => (
                  <tr key={m.id} className="arow">
                    <td>
                      <div style={{ fontWeight: 700, color: "var(--ink-2)" }}>{playerLabel(m.red)} <span className="dim" style={{ fontWeight: 500 }}>vs</span> {playerLabel(m.blue)}</div>
                      <div className="dim mono" style={{ fontSize: 10.5 }}>
                        {m.id} · {new Date(m.startedAt).toLocaleString()} · <span style={{ color: winnerColor(m.winner) }}>{outcomeLabel(m.winner)}</span>
                      </div>
                    </td>
                    <td className="mono" style={{ color: "var(--ink-3)" }}>{m.mode}</td>
                    <td className="dim" title={PHASE2_NOTE}>—</td>
                    <td className="num dim" title={PHASE2_NOTE}>—</td>
                    <td style={{ textAlign: "center" }} className="dim" title={PHASE2_NOTE}>—</td>
                    <td>
                      <div className="row" style={{ gap: 6, justifyContent: "center" }}>
                        <button className="abtn btn-ghost btn-ghost-sm" onClick={() => setSelId(m.id)}>Review</button>
                        <button className="abtn btn-ghost btn-ghost-sm" disabled title={PHASE2_NOTE}>Replay</button>
                        <button className="abtn btn-danger btn-danger-sm" disabled title={PHASE2_NOTE}>Void</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
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
      <div className="drawer" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {err ? (
          <div className="dim">Couldn't load match.</div>
        ) : !d ? (
          <div className="dim">Loading…</div>
        ) : (
          <>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div className="dim mono" style={{ fontSize: 10, letterSpacing: 1 }}>CASE {d.id.slice(0, 8).toUpperCase()} · {d.winner ? "REVIEWED" : "UNFINISHED"}</div>
                <div style={{ font: "800 18px var(--serif)", color: "var(--ink)", marginTop: 4 }}>
                  {playerLabel(d.red)} <span className="dim" style={{ fontWeight: 500 }}>vs</span> {playerLabel(d.blue)}
                </div>
                <div className="dim" style={{ fontSize: 12, marginTop: 2 }}>{d.mode} · {new Date(d.startedAt).toLocaleString()}</div>
              </div>
              <button className="btn" onClick={onClose}>Close</button>
            </div>

            {/* Phase-2 notice — replaces the mockup's flagged-case banner (no real flag exists) */}
            <div className="flag-banner" style={{ alignItems: "flex-start" }}>
              <span className="dot" style={{ marginTop: 3 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>No anti-cheat signal available</div>
                <div className="dim" style={{ fontSize: 11, marginTop: 2 }}>
                  Detection subsystem not yet built (Phase 2). This match was not flagged — it is shown because it matched your filters.
                </div>
              </div>
            </div>

            {/* Detection stat tiles — mockup's 4 (Avg accuracy / Move time / Moves / Priors). Honest
               "—": the anti-cheat detection subsystem does not exist yet, so there is no real data
               to fill these with. */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
              <div className="fd-kpi pad-sm" title={PHASE2_NOTE}>
                <div className="l">Avg accuracy</div>
                <div className="v mono dim" style={{ fontSize: 15 }}>—</div>
              </div>
              <div className="fd-kpi pad-sm" title={PHASE2_NOTE}>
                <div className="l">Move time</div>
                <div className="v mono dim" style={{ fontSize: 15 }}>—</div>
              </div>
              <div className="fd-kpi pad-sm" title={PHASE2_NOTE}>
                <div className="l">Moves</div>
                <div className="v mono dim" style={{ fontSize: 15 }}>—</div>
              </div>
              <div className="fd-kpi pad-sm" title={PHASE2_NOTE}>
                <div className="l">Priors</div>
                <div className="v mono dim" style={{ fontSize: 15 }}>—</div>
              </div>
            </div>

            {/* Move-accuracy timeline — mockup block, honest empty-state (no per-ply accuracy data
               exists without the detection subsystem). */}
            <div className="panel panel-pad">
              <div style={{ fontWeight: 700, fontSize: 11, letterSpacing: .5, color: "var(--ink-2)", marginBottom: 12 }}>MOVE-ACCURACY TIMELINE</div>
              <div className="dim" style={{ fontSize: 12, textAlign: "center", padding: "18px 0" }}>Detection subsystem not built — no per-move accuracy data available.</div>
            </div>

            {/* Detection signals — mockup block, honest empty-state. */}
            <div className="panel panel-pad">
              <div style={{ fontWeight: 700, fontSize: 11, letterSpacing: .5, color: "var(--ink-2)", marginBottom: 12 }}>DETECTION SIGNALS</div>
              <div className="dim" style={{ fontSize: 12, textAlign: "center", padding: "18px 0" }}>Detection subsystem not built — no signals available.</div>
            </div>

            {/* Real match data — separate labelled block, distinct from the detection tiles above. */}
            <div>
              <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 12, letterSpacing: .5, color: "var(--ink-2)" }}>MATCH OUTCOME (real data)</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
                <div className="fd-kpi pad-sm" style={{ ["--tile" as string]: winnerColor(d.winner) }}>
                  <div className="l">Winner</div>
                  <div className="v mono" style={{ fontSize: 15 }}>{d.winner ?? "—"}</div>
                </div>
                <div className="fd-kpi pad-sm ink">
                  <div className="l">Duration</div>
                  <div className="v mono" style={{ fontSize: 15 }}>{fmtDuration(d.durationSec)}</div>
                </div>
                <div className="fd-kpi pad-sm ink">
                  <div className="l">Trophy Δ</div>
                  <div className="v mono" style={{ fontSize: 15 }}><Delta v={d.redTrophyDelta} /> / <Delta v={d.blueTrophyDelta} /></div>
                </div>
                <div className="fd-kpi pad-sm gold">
                  <div className="l">Gold reward</div>
                  <div className="v mono" style={{ fontSize: 15 }}>{(d.goldReward ?? 0).toLocaleString()}</div>
                </div>
              </div>
            </div>

            <div className="dim" style={{ fontSize: 12 }}>
              Started {new Date(d.startedAt).toLocaleString()}
              {d.endedAt ? ` · ended ${new Date(d.endedAt).toLocaleString()}` : " · not yet ended"}
              {d.reason ? ` · ${d.reason}` : ""}
              {` · ${d.moveCount} move${d.moveCount === 1 ? "" : "s"}`}
            </div>

            {/* Settings (Json) */}
            <div>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Settings</div>
              <div className="panel panel-pad">
                <pre className="mono" style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-word", color: "var(--ink-3)" }}>
                  {JSON.stringify(d.settings, null, 2)}
                </pre>
              </div>
            </div>

            {/* Raw moves (Json array) — for integrity inspection */}
            <div>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Moves <span className="dim" style={{ fontWeight: 500 }}>· {d.moveCount} total (raw JSON)</span></div>
              <div className="panel panel-pad">
                <pre className="mono" style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-word", color: "var(--ink-3)", maxHeight: 300, overflow: "auto" }}>
                  {JSON.stringify(d.moves, null, 2)}
                </pre>
              </div>
            </div>

            {/* Decision bar — approved 3-tier hierarchy, all disabled: no detection subsystem to act on */}
            <div className="row" style={{ gap: 9, flexWrap: "wrap", marginTop: 2 }}>
              <button className="abtn btn-ghost" style={{ flex: 1, minWidth: 130 }} disabled title={PHASE2_NOTE}>Watch replay</button>
              <button className="abtn btn-ghost" style={{ flex: 1, minWidth: 130, borderColor: "rgba(75,214,160,.35)", color: "var(--green-lt)" }} disabled title={PHASE2_NOTE}>Clear flag</button>
              <button className="abtn btn-amber" style={{ flex: 1, minWidth: 130 }} disabled title={PHASE2_NOTE}>Void match</button>
              <button className="abtn btn-danger" style={{ flex: 1, minWidth: 130 }} disabled title={PHASE2_NOTE}>Ban &amp; void</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
