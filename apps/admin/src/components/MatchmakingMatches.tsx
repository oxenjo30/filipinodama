import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";

export type MatchCompletionFilter = "all" | "completed" | "unfinished";
type OutcomeFilter = "all" | "red" | "blue" | "draw" | "unfinished";
type Player = { id: string; username: string; displayName: string; tag: string; deleted: boolean };
type Match = { id: string; mode: string; red: Player; blue: Player; startedAt: string; endedAt: string | null; durationMs: number | null; outcome: "red" | "blue" | "draw" | "unfinished" | "unknown"; completion: "completed" | "unfinished"; reason: string | null; redTrophyDelta: number | null; blueTrophyDelta: number | null };
type Response = { mode: string; timeWindow: { since: string; until: string }; filters: { completion: MatchCompletionFilter; outcome: OutcomeFilter; player: string }; page: number; limit: number; total: number; totalPages: number; items: Match[] };

const MANILA = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" });
const UTC = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", dateStyle: "medium", timeStyle: "long" });
const when = (iso: string | null) => iso ? MANILA.format(new Date(iso)) : "In progress";
const duration = (ms: number | null) => ms == null ? "—" : `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
const delta = (n: number | null) => n == null ? "—" : `${n > 0 ? "+" : ""}${n}`;
const manilaInput = (timestamp: number) => new Date(timestamp + 8 * 60 * 60 * 1000).toISOString().slice(0, 16);
const toUtc = (value: string) => {
  const parsed = Date.parse(`${value}:00+08:00`);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
};

export function MatchmakingMatches({ initialCompletion, timeWindow, onClose }: { initialCompletion: MatchCompletionFilter; timeWindow: { since: string; until: string }; onClose: () => void }) {
  const navigate = useNavigate();
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const [completion, setCompletion] = useState(initialCompletion);
  const [outcome, setOutcome] = useState<OutcomeFilter>("all");
  const [player, setPlayer] = useState("");
  const [playerQuery, setPlayerQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Response | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const sinceMs = Date.parse(timeWindow.since);
  const untilMs = Date.parse(timeWindow.until);
  const minStarted = manilaInput(Math.ceil(sinceMs / 60_000) * 60_000);
  const maxStarted = manilaInput(Math.floor(untilMs / 60_000) * 60_000);
  const fromUtc = from ? toUtc(from) : null;
  const toUtcValue = to ? toUtc(to) : null;
  const dateError = (from && !fromUtc) || (to && !toUtcValue)
    ? "Enter valid Manila date and time values."
    : fromUtc && (Date.parse(fromUtc) < sinceMs || Date.parse(fromUtc) > untilMs)
      ? "The start date must be inside this analytics snapshot."
      : toUtcValue && (Date.parse(toUtcValue) < sinceMs || Date.parse(toUtcValue) > untilMs)
        ? "The end date must be inside this analytics snapshot."
        : fromUtc && toUtcValue && Date.parse(fromUtc) > Date.parse(toUtcValue)
          ? "Started from must be before started to."
          : null;

  useEffect(() => {
    const timer = window.setTimeout(() => { setPage(1); setPlayerQuery(player.trim()); }, 300);
    return () => window.clearTimeout(timer);
  }, [player]);

  useEffect(() => {
    previousFocus.current = document.activeElement as HTMLElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.querySelector<HTMLElement>("button")?.focus();
    return () => { document.body.style.overflow = previousOverflow; previousFocus.current?.focus(); };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab" || !dialog.current) return;
      const nodes = [...dialog.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href]')];
      if (!nodes.length) return;
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let live = true;
    if (dateError) { setData(null); setError(false); return () => { live = false; }; }
    setData(null); setError(false);
    const query = new URLSearchParams({ mode: "RANKED", page: String(page), limit: "25", completion, outcome, since: timeWindow.since, until: timeWindow.until });
    if (playerQuery) query.set("player", playerQuery);
    if (fromUtc) query.set("startedFrom", fromUtc);
    if (toUtcValue) query.set("startedTo", toUtcValue);
    api.get<Response>(`/api/admin/analytics/matchmaking-matches?${query}`).then((value) => { if (live) setData(value); }).catch(() => { if (live) setError(true); });
    return () => { live = false; };
  }, [completion, outcome, playerQuery, fromUtc, toUtcValue, dateError, page, retry, timeWindow.since, timeWindow.until]);

  const update = (fn: () => void) => { setPage(1); fn(); };
  const openPlayer = (id: string) => { onClose(); navigate(`/players?open=${encodeURIComponent(id)}`); };

  return createPortal(<div className="match-drilldown-layer" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div ref={dialog} className="match-drilldown" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header className="match-drilldown-head">
        <div><div className="route-eyebrow">Ranked matchmaking</div><h2 id={titleId}>Match drill-down</h2><p>Snapshot {when(timeWindow.since)} – {when(timeWindow.until)} (Asia/Manila)</p></div>
        <button className="abtn" onClick={onClose} aria-label="Close match drill-down">Close</button>
      </header>
      <div className="match-filters">
        <label>Completion<select className="select" value={completion} onChange={(e) => update(() => setCompletion(e.target.value as MatchCompletionFilter))}><option value="all">All started</option><option value="completed">Completed</option><option value="unfinished">Unfinished</option></select></label>
        <label>Outcome<select className="select" value={outcome} onChange={(e) => update(() => setOutcome(e.target.value as OutcomeFilter))}><option value="all">All outcomes</option><option value="red">Red won</option><option value="blue">Blue won</option><option value="draw">Draw</option><option value="unfinished">Unfinished</option></select></label>
        <label>Player<input className="input" value={player} onChange={(e) => update(() => setPlayer(e.target.value))} placeholder="Name, username, or tag" /></label>
        <label>Started from (Manila)<input className="input" type="datetime-local" min={minStarted} max={maxStarted} value={from} onChange={(e) => update(() => setFrom(e.target.value))} aria-invalid={Boolean(dateError)} aria-describedby={dateError ? "match-date-error" : undefined} /></label>
        <label>Started to (Manila)<input className="input" type="datetime-local" min={minStarted} max={maxStarted} value={to} onChange={(e) => update(() => setTo(e.target.value))} aria-invalid={Boolean(dateError)} aria-describedby={dateError ? "match-date-error" : undefined} /></label>
      </div>
      {dateError ? <div id="match-date-error" className="match-filter-error" role="alert">{dateError}</div> : null}
      <div className="match-results" aria-live="polite">
        {dateError ? null : error ? <div className="match-state" role="alert">Couldn't load ranked matches. <button className="abtn" onClick={() => setRetry((n) => n + 1)}>Retry</button></div> : !data ? <div className="match-state">Loading ranked matches…</div> : data.items.length === 0 ? <div className="match-state">No ranked matches match these filters.</div> : <>
          <div className="match-summary">{data.total.toLocaleString()} matches · newest first</div>
          <div className="match-table-wrap"><table className="tbl match-table"><thead><tr><th>Match</th><th>Red player</th><th>Blue player</th><th>Started</th><th>Ended</th><th>Duration</th><th>Result</th><th></th></tr></thead><tbody>{data.items.map((m) => <MatchRows key={m.id} match={m} expanded={expanded === m.id} onToggle={() => setExpanded(expanded === m.id ? null : m.id)} openPlayer={openPlayer} />)}</tbody></table></div>
          <div className="match-pagination"><button className="abtn" disabled={data.page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button><span>Page {data.page} of {Math.max(1, data.totalPages)}</span><button className="abtn" disabled={data.page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>Next</button></div>
        </>}
      </div>
    </div>
  </div>, document.body);
}

function MatchRows({ match: m, expanded, onToggle, openPlayer }: { match: Match; expanded: boolean; onToggle: () => void; openPlayer: (id: string) => void }) {
  const player = (p: Player) => <button className="match-player-link" onClick={() => openPlayer(p.id)}><strong>{p.displayName || p.username}{p.deleted ? " (deleted)" : ""}</strong><span>@{p.username} · {p.tag}</span></button>;
  const result = m.outcome === "unfinished" ? "Unfinished" : m.outcome === "draw" ? "Draw" : m.outcome === "unknown" ? "Unknown" : `${m.outcome === "red" ? "Red" : "Blue"} won`;
  return <><tr><td className="mono">{m.id.slice(0, 8)}</td><td>{player(m.red)}</td><td>{player(m.blue)}</td><td title={`${UTC.format(new Date(m.startedAt))} UTC`}>{when(m.startedAt)}</td><td title={m.endedAt ? `${UTC.format(new Date(m.endedAt))} UTC` : undefined}>{when(m.endedAt)}</td><td className="mono">{duration(m.durationMs)}</td><td>{result}</td><td><button className="abtn" onClick={onToggle} aria-expanded={expanded} aria-controls={`match-${m.id}`}>Details</button></td></tr>{expanded ? <tr id={`match-${m.id}`} className="match-detail-row"><td colSpan={8}><dl><div><dt>Match ID</dt><dd className="mono">{m.id}</dd></div><div><dt>Completion</dt><dd>{m.completion}</dd></div><div><dt>Finish reason</dt><dd>{m.reason || "Not recorded"}</dd></div><div><dt>Red trophies</dt><dd className="mono">{delta(m.redTrophyDelta)}</dd></div><div><dt>Blue trophies</dt><dd className="mono">{delta(m.blueTrophyDelta)}</dd></div><div><dt>Started UTC</dt><dd>{UTC.format(new Date(m.startedAt))}</dd></div><div><dt>Ended UTC</dt><dd>{m.endedAt ? UTC.format(new Date(m.endedAt)) : "In progress"}</dd></div></dl></td></tr> : null}</>;
}
