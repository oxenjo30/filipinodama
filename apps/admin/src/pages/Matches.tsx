import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Pagination, usePagination } from "../components/Pagination";

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
  analyses?: ListAnalysis[];
};

type MatchDetail = MatchRow & {
  settings: unknown;
  moveCount: number;
  moves: unknown;
};

/** One player's engine-agreement result for one match. */
type Analysis = {
  id: string;
  userId: string;
  side: "red" | "blue";
  moveCount: number;
  decisionCount: number;
  engineMatchCount: number;
  engineMatchRate: number | null;
  suspicion: number | null;
  reasons: string[];
  status: "CLEAR" | "FLAGGED" | "CONFIRMED" | "DISMISSED";
  reviewNote: string | null;
  reviewedAt: string | null;
  reviewedBy: { username: string; tag: string } | null;
  computedAt: string;
};

/** The slice the match LIST carries, so the table can show real flag state. */
type ListAnalysis = Pick<Analysis, "id" | "userId" | "side" | "suspicion" | "engineMatchRate" | "status">;

type AnalysisResponse = {
  matchId: string;
  analyses: Analysis[];
  analysed: boolean;
  finished: boolean;
  moveCount: number;
  avgSecPerMove: number | null;
};

type Priors = { confirmed: number; flagged: number; dismissed: number; cheatReports: number };

const MODES = ["AI", "CASUAL", "RANKED", "PRIVATE", "LOCAL"] as const;

/**
 * Analysis is a background job, not a request: the reference engine costs
 * hundreds of milliseconds per decision, so a match takes seconds to replay.
 * Queuing returns immediately and the row appears once the poller finishes.
 */
const QUEUE_NOTE = "Analysis runs as a background job — the result appears once the poller picks it up.";

/** Colour + label per verdict. */
const STATUS_META: Record<Analysis["status"], { label: string; color: string }> = {
  CLEAR: { label: "Clear", color: "var(--dim)" },
  FLAGGED: { label: "Flagged", color: "var(--amber, #d98a3a)" },
  CONFIRMED: { label: "Confirmed", color: "var(--red-lt)" },
  DISMISSED: { label: "Dismissed", color: "var(--green-lt)" },
};

function pct(v: number | null): string {
  return v === null ? "—" : `${Math.round(v * 100)}%`;
}

function fmtSecs(v: number | null): string {
  return v === null ? "—" : `${v.toFixed(1)}s`;
}

/** The worst (highest-suspicion) verdict on a match, for the list row. */
function worstOf(list: ListAnalysis[] | undefined): ListAnalysis | null {
  if (!list || list.length === 0) return null;
  const rank: Record<Analysis["status"], number> = { CONFIRMED: 3, FLAGGED: 2, DISMISSED: 1, CLEAR: 0 };
  return [...list].sort(
    (a, b) => rank[b.status] - rank[a.status] || (b.suspicion ?? -1) - (a.suspicion ?? -1)
  )[0]!;
}

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
 * Anti-cheat review queue, backed by the real detection subsystem.
 *
 * Two views: the FLAGGED queue (cases waiting on a moderator, highest
 * suspicion first) and the full match browser. Flag reason, confidence and
 * status are real values from MatchAnalysis — a match that has not been
 * analysed shows "not analysed" and offers a button to queue it, rather than a
 * fabricated score.
 *
 * Everything here measures ENGINE AGREEMENT over positions where the player had
 * a real choice; forced captures are excluded because everyone "agrees with the
 * engine" there. Detection never bans on its own: confirming a case is an
 * explicit moderator action with a mandatory note, and the ban it can trigger
 * goes through the same sanction path the reports queue uses.
 */
export function MatchesPage() {
  const [tab, setTab] = useState<"queue" | "all">("queue");
  return (
    <>
      <div className="row" style={{ marginBottom: 14, gap: 8 }}>
        <button className={`chip${tab === "queue" ? " on" : ""}`} onClick={() => setTab("queue")}>Review queue</button>
        <button className={`chip${tab === "all" ? " on" : ""}`} onClick={() => setTab("all")}>All matches</button>
      </div>
      {tab === "queue" ? <ReviewQueue /> : <MatchBrowser />}
    </>
  );
}

// -- Flagged cases waiting on a moderator -------------------------------------
function ReviewQueue() {
  const [status, setStatus] = useState<Analysis["status"]>("FLAGGED");
  const [items, setItems] = useState<Array<Analysis & { user: { id: string; username: string; tag: string }; match: { id: string; mode: string; winner: string | null; startedAt: string } }>>([]);
  const [loading, setLoading] = useState(true);
  const [selId, setSelId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api
      .get<{ items: typeof items }>(`/api/admin/anticheat/queue?status=${status}`)
      .then((d) => setItems(d.items))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };
  useEffect(load, [status]);

  return (
    <>
      <div className="row" style={{ marginBottom: 14, gap: 6 }}>
        {(["FLAGGED", "CONFIRMED", "DISMISSED", "CLEAR"] as const).map((st) => (
          <button key={st} className={`chip${status === st ? " on" : ""}`} onClick={() => setStatus(st)}>
            {STATUS_META[st].label}
          </button>
        ))}
        <div style={{ marginLeft: "auto" }} className="dim">{items.length} case{items.length === 1 ? "" : "s"}</div>
      </div>

      <div className="panel" style={{ overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table className="tbl" style={{ minWidth: 900 }}>
            <thead>
              <tr className="thead-raised">
                <th>Player</th>
                <th>Match</th>
                <th>Engine agreement</th>
                <th className="num">Suspicion</th>
                <th style={{ textAlign: "center" }}>Status</th>
                <th style={{ textAlign: "center" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="dim" style={{ textAlign: "center", padding: 24 }}>Loading…</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={6} className="dim" style={{ textAlign: "center", padding: 24 }}>
                  No {STATUS_META[status].label.toLowerCase()} cases. Matches are analysed on request from the All matches tab.
                </td></tr>
              ) : (
                items.map((a) => (
                  <tr key={a.id} className="arow">
                    <td>
                      <div style={{ fontWeight: 700, color: "var(--ink-2)" }}>{a.user.username} {a.user.tag}</div>
                      <div className="dim mono" style={{ fontSize: 10.5 }}>played {a.side}</div>
                    </td>
                    <td>
                      <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>{a.match.mode}</div>
                      <div className="dim mono" style={{ fontSize: 10.5 }}>{new Date(a.match.startedAt).toLocaleString()}</div>
                    </td>
                    <td className="mono" style={{ color: "var(--ink-2)" }}>
                      {pct(a.engineMatchRate)}
                      <span className="dim"> of {a.decisionCount} free choice{a.decisionCount === 1 ? "" : "s"}</span>
                    </td>
                    <td className="num mono" style={{ color: (a.suspicion ?? 0) >= 70 ? "var(--red-lt)" : "var(--ink-3)" }}>
                      {a.suspicion ?? "—"}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span className="mono" style={{ fontSize: 11, color: STATUS_META[a.status].color }}>{STATUS_META[a.status].label}</span>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <button className="abtn btn-ghost btn-ghost-sm" onClick={() => setSelId(a.match.id)}>Review</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selId && <MatchDrawer id={selId} onClose={() => { setSelId(null); load(); }} />}
    </>
  );
}

// -- Full match browser -------------------------------------------------------
function MatchBrowser() {
  const [rows, setRows] = useState<MatchRow[]>([]);
  const [mode, setMode] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [loading, setLoading] = useState(true);
  const [selId, setSelId] = useState<string | null>(null);
  const [queued, setQueued] = useState<Record<string, boolean>>({});
  const pg = usePagination(rows, 10);

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

  const analyse = (id: string) => {
    setQueued((q) => ({ ...q, [id]: true }));
    api.post(`/api/admin/matches/${id}/analysis`).catch(() => setQueued((q) => ({ ...q, [id]: false })));
  };

  return (
    <>
      <div className="row" style={{ marginBottom: 14 }}>
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
                <th>Engine agreement</th>
                <th className="num">Suspicion</th>
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
                pg.pageItems.map((m) => {
                  const worst = worstOf(m.analyses);
                  const done = m.endedAt !== null;
                  return (
                    <tr key={m.id} className="arow">
                      <td>
                        <div style={{ fontWeight: 700, color: "var(--ink-2)" }}>{playerLabel(m.red)} <span className="dim" style={{ fontWeight: 500 }}>vs</span> {playerLabel(m.blue)}</div>
                        <div className="dim mono" style={{ fontSize: 10.5 }}>
                          {m.id} · {new Date(m.startedAt).toLocaleString()} · <span style={{ color: winnerColor(m.winner) }}>{outcomeLabel(m.winner)}</span>
                        </div>
                      </td>
                      <td className="mono" style={{ color: "var(--ink-3)" }}>{m.mode}</td>
                      <td className="mono" style={{ color: worst ? "var(--ink-2)" : undefined }}>
                        {worst ? pct(worst.engineMatchRate) : <span className="dim">not analysed</span>}
                      </td>
                      <td className="num mono" style={{ color: (worst?.suspicion ?? 0) >= 70 ? "var(--red-lt)" : "var(--ink-3)" }}>
                        {worst?.suspicion ?? <span className="dim">—</span>}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        {worst
                          ? <span className="mono" style={{ fontSize: 11, color: STATUS_META[worst.status].color }}>{STATUS_META[worst.status].label}</span>
                          : <span className="dim">—</span>}
                      </td>
                      <td>
                        <div className="row" style={{ gap: 6, justifyContent: "center" }}>
                          <button className="abtn btn-ghost btn-ghost-sm" onClick={() => setSelId(m.id)}>Review</button>
                          <button
                            className="abtn btn-ghost btn-ghost-sm"
                            onClick={() => analyse(m.id)}
                            disabled={!done || queued[m.id]}
                            title={done ? QUEUE_NOTE : "Only finished matches can be analysed."}
                          >
                            {queued[m.id] ? "Queued" : worst ? "Re-analyse" : "Analyse"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {!loading && <Pagination {...pg} noun="matches" />}
      </div>

      {selId && <MatchDrawer id={selId} onClose={() => { setSelId(null); load(); }} />}
    </>
  );
}

// ── Detail drawer ─────────────────────────────────────────────────────────────
function MatchDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const [d, setD] = useState<MatchDetail | null>(null);
  const [err, setErr] = useState(false);
  const [an, setAn] = useState<AnalysisResponse | null>(null);
  const [queued, setQueued] = useState(false);

  const loadAnalysis = () => {
    api.get<AnalysisResponse>(`/api/admin/matches/${id}/analysis`).then(setAn).catch(() => setAn(null));
  };

  useEffect(() => {
    setErr(false);
    setQueued(false);
    api.get<MatchDetail>(`/api/admin/matches/${id}`).then(setD).catch(() => setErr(true));
    loadAnalysis();
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

            {/* Anti-cheat analysis - real values from MatchAnalysis, or an
               honest "not analysed" with a way to queue it. */}
            <div>
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 12, letterSpacing: .5, color: "var(--ink-2)" }}>ANTI-CHEAT ANALYSIS</div>
                <button
                  className="abtn btn-ghost btn-ghost-sm"
                  disabled={!d.endedAt || queued}
                  title={d.endedAt ? QUEUE_NOTE : "Only finished matches can be analysed."}
                  onClick={() => {
                    setQueued(true);
                    api.post(`/api/admin/matches/${id}/analysis`)
                      .then(() => setTimeout(loadAnalysis, 2500))
                      .catch(() => setQueued(false));
                  }}
                >
                  {queued ? "Queued…" : an?.analysed ? "Re-analyse" : "Analyse this match"}
                </button>
              </div>

              {!an?.analysed ? (
                <div className="panel panel-pad dim" style={{ fontSize: 12 }}>
                  {d.endedAt
                    ? "This match has not been analysed yet. Queue it above — analysis runs as a background job because replaying a game against the engine takes seconds, not milliseconds."
                    : "Match is still in progress. Only finished matches can be analysed."}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {an.analyses.map((a) => (
                    <AnalysisCard
                      key={a.id}
                      a={a}
                      avgSecPerMove={an.avgSecPerMove}
                      player={a.side === "red" ? d.red : d.blue}
                      onReviewed={loadAnalysis}
                    />
                  ))}
                </div>
              )}
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

            {/* Decisions live on each player's analysis card above: a verdict is
               about a PLAYER in this match, not about the match as a whole. */}
          </>
        )}
      </div>
    </div>
  );
}

// -- One player's verdict for one match ---------------------------------------
//
// A case is about a PLAYER in a match, not about the match, so the decision
// controls live here rather than on a match-wide bar. Confirming requires a
// note and is irreversible from the UI; the optional ban goes through the same
// sanction path the reports queue uses.
function AnalysisCard({
  a,
  avgSecPerMove,
  player,
  onReviewed,
}: {
  a: Analysis;
  avgSecPerMove: number | null;
  player: Player;
  onReviewed: () => void;
}) {
  const [priors, setPriors] = useState<Priors | null>(null);
  const [note, setNote] = useState("");
  const [ban, setBan] = useState(false);
  const [banHours, setBanHours] = useState(24 * 7);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<Priors>(`/api/admin/anticheat/priors/${a.userId}`).then(setPriors).catch(() => setPriors(null));
  }, [a.userId]);

  const decided = a.status === "CONFIRMED" || a.status === "DISMISSED";
  const meta = STATUS_META[a.status];

  const submit = (decision: "CONFIRMED" | "DISMISSED") => {
    if (note.trim().length === 0) {
      setError("A note is required — it is the record of why this decision was made.");
      return;
    }
    setBusy(true);
    setError(null);
    api
      .post(`/api/admin/anticheat/${a.id}/review`, {
        decision,
        note: note.trim(),
        ...(decision === "CONFIRMED" && ban ? { banDurationHours: banHours } : {}),
      })
      .then(() => onReviewed())
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Review failed."))
      .finally(() => setBusy(false));
  };

  return (
    <div className="panel panel-pad" style={{ borderColor: a.status === "FLAGGED" ? "rgba(217,138,58,.45)" : undefined }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 700, color: "var(--ink)" }}>
            {player ? `${player.username} ${player.tag}` : "Unknown player"}{" "}
            <span className="dim mono" style={{ fontSize: 11, fontWeight: 500 }}>played {a.side}</span>
          </div>
          <div className="dim" style={{ fontSize: 11 }}>analysed {new Date(a.computedAt).toLocaleString()}</div>
        </div>
        <span className="mono" style={{ fontSize: 12, color: meta.color, fontWeight: 700 }}>{meta.label}</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
        <div className="fd-kpi pad-sm" title="Share of positions WITH A CHOICE where this player picked the engine's move. Forced captures are excluded.">
          <div className="l">Engine agreement</div>
          <div className="v mono" style={{ fontSize: 15 }}>{pct(a.engineMatchRate)}</div>
        </div>
        <div className="fd-kpi pad-sm" title="Whole-match seconds per ply. Shared by both players — context only, never scored.">
          <div className="l">Move time (match)</div>
          <div className="v mono dim" style={{ fontSize: 15 }}>{fmtSecs(avgSecPerMove)}</div>
        </div>
        <div className="fd-kpi pad-sm" title="Total plies, and how many of those were real choices.">
          <div className="l">Moves</div>
          <div className="v mono" style={{ fontSize: 15 }}>
            {a.moveCount}<span className="dim" style={{ fontSize: 11 }}> / {a.decisionCount} free</span>
          </div>
        </div>
        <div className="fd-kpi pad-sm" title="Prior signal on this account: confirmed cases, open flags, and player-submitted cheating reports.">
          <div className="l">Priors</div>
          <div className="v mono" style={{ fontSize: 15 }}>
            {priors ? `${priors.confirmed}C / ${priors.flagged}F` : "—"}
            {priors && priors.cheatReports > 0 && (
              <span className="dim" style={{ fontSize: 11 }}> · {priors.cheatReports} report{priors.cheatReports === 1 ? "" : "s"}</span>
            )}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        <div className="dim" style={{ fontSize: 11, letterSpacing: .5, marginBottom: 4 }}>
          WHY {a.suspicion !== null && <span className="mono">· suspicion {a.suspicion}/100</span>}
        </div>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {a.reasons.map((r, i) => (
            <li key={i} className="dim" style={{ fontSize: 12, marginBottom: 2 }}>{r}</li>
          ))}
        </ul>
      </div>

      {decided ? (
        <div className="dim" style={{ fontSize: 12, marginTop: 12, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
          {meta.label} by {a.reviewedBy ? `${a.reviewedBy.username} ${a.reviewedBy.tag}` : "a moderator"}
          {a.reviewedAt ? ` on ${new Date(a.reviewedAt).toLocaleString()}` : ""}
          {a.reviewNote ? ` — “${a.reviewNote}”` : ""}
        </div>
      ) : (
        <div style={{ marginTop: 12, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
          <input
            className="input"
            style={{ width: "100%", marginBottom: 8 }}
            placeholder="Decision note (required — this is the permanent record)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
          />
          <label className="row dim" style={{ gap: 8, fontSize: 12, marginBottom: 8, alignItems: "center" }}>
            <input type="checkbox" checked={ban} onChange={(e) => setBan(e.target.checked)} />
            Ban this player when confirming
            {ban && (
              <select className="input" style={{ maxWidth: 150 }} value={banHours} onChange={(e) => setBanHours(Number(e.target.value))}>
                <option value={24}>24 hours</option>
                <option value={24 * 7}>7 days</option>
                <option value={24 * 30}>30 days</option>
                <option value={0}>Permanent</option>
              </select>
            )}
          </label>
          {error && <div style={{ color: "var(--red-lt)", fontSize: 12, marginBottom: 8 }}>{error}</div>}
          <div className="row" style={{ gap: 9 }}>
            <button
              className="abtn btn-ghost"
              style={{ flex: 1, borderColor: "rgba(75,214,160,.35)", color: "var(--green-lt)" }}
              disabled={busy}
              onClick={() => submit("DISMISSED")}
            >
              Dismiss — legitimate
            </button>
            <button className="abtn btn-danger" style={{ flex: 1 }} disabled={busy} onClick={() => submit("CONFIRMED")}>
              {ban ? "Confirm & ban" : "Confirm cheating"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
