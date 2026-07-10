import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAdminMutation } from "../lib/ui";

// ── Types (mirror admin-tournaments.ts response shapes) ────────────────────

type TournamentStatus = "DRAFT" | "OPEN" | "RUNNING" | "COMPLETED" | "CANCELLED";
type TournamentFormat = "SINGLE_ELIM" | "DOUBLE_ELIM" | "SWISS" | "ROUND_ROBIN";

type Tournament = {
  id: string;
  name: string;
  format: TournamentFormat;
  status: TournamentStatus;
  entryFeeGold: number;
  prizePoolGold: number;
  prizeSplitGold: unknown;
  maxPlayers: number;
  registeredCount: number;
  minTrophies: number;
  matchMode: "CASUAL" | "RANKED";
  startsAt: string | null;
  createdAt: string;
};

type Stats = { liveNow: number; upcoming: number; playersRegistered: number; goldPrizePool: number };

type EntryUser = { id: string; username: string; tag: string; avatarUrl: string | null; trophies: number };
type TournamentEntry = {
  id: string;
  tournamentId: string;
  userId: string;
  seed: number | null;
  eliminated: boolean;
  placement: number | null;
  refunded: boolean;
  joinedAt: string;
  user: EntryUser;
};

type TournamentMatch = {
  id: string;
  tournamentId: string;
  round: number;
  slot: number;
  redEntryId: string | null;
  blueEntryId: string | null;
  matchId: string | null;
  winnerEntryId: string | null;
  status: "pending" | "ready" | "done";
  resolvedAt: string | null;
};

type TournamentDetail = Tournament & {
  entries: TournamentEntry[];
  bracket: Record<string, TournamentMatch[]>;
};

const POWERS_OF_TWO = [2, 4, 8, 16, 32] as const;
const FORMATS: { value: TournamentFormat; label: string; v1: boolean }[] = [
  { value: "SINGLE_ELIM", label: "Single elimination", v1: true },
  { value: "DOUBLE_ELIM", label: "Double elimination", v1: false },
  { value: "SWISS", label: "Swiss", v1: false },
  { value: "ROUND_ROBIN", label: "Round robin", v1: false },
];

const STATUS_CLASS: Record<TournamentStatus, string> = {
  DRAFT: "st-muted",
  OPEN: "st-active",
  RUNNING: "st-active",
  COMPLETED: "st-deleted",
  CANCELLED: "st-banned",
};
const STATUS_LABEL: Record<TournamentStatus, string> = {
  DRAFT: "Draft",
  OPEN: "Upcoming",
  RUNNING: "Live",
  COMPLETED: "Finished",
  CANCELLED: "Cancelled",
};

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

/** 1.5 Tournaments — list + create/edit + a simple bracket/slot-resolve view. */
export function TournamentsPage() {
  const [status, setStatus] = useState<TournamentStatus | "">("");
  const [rows, setRows] = useState<Tournament[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Tournament | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (status) qs.set("status", status);
    qs.set("limit", "100");
    api
      .get<{ items: Tournament[]; stats: Stats }>(`/api/admin/tournaments?${qs}`)
      .then((d) => {
        setRows(d.items);
        setStats(d.stats);
      })
      .catch(() => {
        setRows([]);
        setStats(null);
      })
      .finally(() => setLoading(false));
  };
  useEffect(load, [status]);

  return (
    <>
      <div className="crumb">Live Ops · Tournaments</div>
      <h1 className="page">Tournaments</h1>

      {/* 4-stat header */}
      <div className="kpi" style={{ marginBottom: 18 }}>
        <div className="card">
          <div className="v mono">{stats?.liveNow ?? "—"}</div>
          <div className="l">Live now</div>
        </div>
        <div className="card">
          <div className="v mono">{stats?.upcoming ?? "—"}</div>
          <div className="l">Upcoming</div>
        </div>
        <div className="card">
          <div className="v mono">{(stats?.playersRegistered ?? 0).toLocaleString()}</div>
          <div className="l">Players registered</div>
        </div>
        <div className="card">
          <div className="v mono">{(stats?.goldPrizePool ?? 0).toLocaleString()} 🪙</div>
          <div className="l">Gold prize pool (scheduled)</div>
        </div>
      </div>

      <div className="row" style={{ marginBottom: 14, justifyContent: "space-between" }}>
        <div className="row">
          <button className={`chip${status === "" ? " on" : ""}`} onClick={() => setStatus("")}>all</button>
          {(["DRAFT", "OPEN", "RUNNING", "COMPLETED", "CANCELLED"] as TournamentStatus[]).map((s) => (
            <button key={s} className={`chip${status === s ? " on" : ""}`} onClick={() => setStatus(s)}>
              {STATUS_LABEL[s].toLowerCase()}
            </button>
          ))}
        </div>
        <button className="btn gold" onClick={() => { setCreating(true); setEditing(null); }}>+ New tournament</button>
      </div>

      {creating && <TournamentForm onClose={() => setCreating(false)} onDone={load} />}
      {editing && <TournamentForm tournament={editing} onClose={() => setEditing(null)} onDone={load} />}

      <div className="panel">
        <table className="tbl">
          <thead>
            <tr>
              <th>Tournament</th>
              <th>Status</th>
              <th>Format</th>
              <th className="num">Entry</th>
              <th className="num">Prize pool</th>
              <th className="num">Players</th>
              <th>Starts</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="dim" style={{ textAlign: "center", padding: 24 }}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="dim" style={{ textAlign: "center", padding: 24 }}>
                  {status ? "No tournaments match this filter." : "No tournaments yet — create one."}
                </td>
              </tr>
            ) : (
              rows.map((t) => (
                <TournamentRow
                  key={t.id}
                  t={t}
                  onEdit={() => { setEditing(t); setCreating(false); }}
                  onView={() => setViewingId(t.id)}
                  onDone={load}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {viewingId && <BracketDrawer id={viewingId} onClose={() => setViewingId(null)} onDone={load} />}
    </>
  );
}

// ── Row + lifecycle actions ─────────────────────────────────────────────────

function TournamentRow({
  t,
  onEdit,
  onView,
  onDone,
}: {
  t: Tournament;
  onEdit: () => void;
  onView: () => void;
  onDone: () => void;
}) {
  const mutate = useAdminMutation();

  const open = () =>
    mutate({
      title: `Open registration for "${t.name}"`,
      body: "Players will be able to join and pay the entry fee.",
      requireReason: true,
      confirmLabel: "Open registration",
      method: "POST",
      path: `/api/admin/tournaments/${t.id}/open`,
      successMsg: "Registration opened.",
      onDone,
    });

  const start = () =>
    mutate({
      title: `Start "${t.name}"`,
      body: `Seeds the bracket from ${t.registeredCount} registered player(s). This cannot be undone.`,
      requireReason: true,
      confirmLabel: "Start",
      method: "POST",
      path: `/api/admin/tournaments/${t.id}/start`,
      successMsg: "Bracket seeded — tournament is live.",
      onDone,
    });

  const complete = () =>
    mutate({
      title: `Complete "${t.name}"`,
      body: "Pays the champion and runner-up their gold prizes. Requires a champion to already exist.",
      requireReason: true,
      confirmLabel: "Complete & pay prizes",
      method: "POST",
      path: `/api/admin/tournaments/${t.id}/complete`,
      successMsg: "Prizes paid.",
      onDone,
    });

  const cancel = () =>
    mutate({
      title: `Cancel "${t.name}"`,
      body: "Refunds every paid, un-refunded entry fee.",
      requireReason: true,
      danger: true,
      confirmLabel: "Cancel tournament",
      method: "POST",
      path: `/api/admin/tournaments/${t.id}/cancel`,
      successMsg: "Tournament cancelled — entries refunded.",
      onDone,
    });

  const canCancel = t.status === "DRAFT" || t.status === "OPEN" || t.status === "RUNNING";

  return (
    <tr>
      <td>
        <div style={{ font: "700 12.5px var(--sans)", color: "var(--ink-2)" }}>{t.name}</div>
        {t.minTrophies > 0 && <div className="dim" style={{ fontSize: 11 }}>min {t.minTrophies.toLocaleString()} trophies</div>}
        <div className="mono dim" style={{ fontSize: 10 }}>{t.id}</div>
      </td>
      <td><span className={`badge-st ${STATUS_CLASS[t.status]}`}>{STATUS_LABEL[t.status]}</span></td>
      <td className="dim">{FORMATS.find((f) => f.value === t.format)?.label ?? t.format}</td>
      <td className="num">{t.entryFeeGold > 0 ? `${t.entryFeeGold.toLocaleString()} 🪙` : "Free"}</td>
      <td className="num" style={{ color: "var(--gold-lt)" }}>{t.prizePoolGold.toLocaleString()} 🪙</td>
      <td className="num">{t.registeredCount} / {t.maxPlayers}</td>
      <td className="dim" style={{ whiteSpace: "nowrap" }}>{fmtDate(t.startsAt)}</td>
      <td className="num">
        <div className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
          {t.status === "DRAFT" && (
            <>
              <button className="btn" onClick={onEdit}>Edit</button>
              <button className="btn gold" onClick={open}>Open registration</button>
              <button className="btn danger" onClick={cancel}>Cancel</button>
            </>
          )}
          {t.status === "OPEN" && (
            <>
              <button className="btn gold" onClick={start}>Start</button>
              <button className="btn danger" onClick={cancel}>Cancel</button>
            </>
          )}
          {t.status === "RUNNING" && (
            <>
              <button className="btn" onClick={onView}>View bracket</button>
              <button className="btn gold" onClick={complete}>Complete</button>
              <button className="btn danger" onClick={cancel}>Cancel</button>
            </>
          )}
          {(t.status === "COMPLETED" || t.status === "CANCELLED") && (
            <button className="btn" onClick={onView}>View</button>
          )}
          {!canCancel && t.status !== "COMPLETED" && t.status !== "CANCELLED" && null}
        </div>
      </td>
    </tr>
  );
}

// ── Create / edit form ──────────────────────────────────────────────────────

function TournamentForm({ tournament, onClose, onDone }: { tournament?: Tournament; onClose: () => void; onDone: () => void }) {
  const mutate = useAdminMutation();
  const isEdit = !!tournament;

  const [name, setName] = useState(tournament?.name ?? "");
  const [format, setFormat] = useState<TournamentFormat>(tournament?.format ?? "SINGLE_ELIM");
  const [maxPlayers, setMaxPlayers] = useState<number>(tournament?.maxPlayers ?? 16);
  const [entryFeeGold, setEntryFeeGold] = useState<number>(tournament?.entryFeeGold ?? 0);
  const [prizePoolGold, setPrizePoolGold] = useState<number>(tournament?.prizePoolGold ?? 0);
  const initialSplit = Array.isArray(tournament?.prizeSplitGold) ? (tournament!.prizeSplitGold as number[]) : [0, 0];
  const [firstPrize, setFirstPrize] = useState<number>(initialSplit[0] ?? 0);
  const [secondPrize, setSecondPrize] = useState<number>(initialSplit[1] ?? 0);
  const [minTrophies, setMinTrophies] = useState<number>(tournament?.minTrophies ?? 0);
  const [matchMode, setMatchMode] = useState<"CASUAL" | "RANKED">(tournament?.matchMode ?? "CASUAL");
  const [startsAt, setStartsAt] = useState(tournament?.startsAt ? toLocalInput(tournament.startsAt) : "");

  const splitSum = firstPrize + secondPrize;
  const splitValid = splitSum === prizePoolGold;
  const valid = name.trim().length > 0 && format === "SINGLE_ELIM" && splitValid;

  const submit = () => {
    if (!splitValid) return; // client-side gate — mirrors server's PRIZE_SPLIT_MISMATCH
    mutate({
      title: isEdit ? `Edit tournament "${name}"` : `Create tournament "${name}"`,
      body: `${FORMATS.find((f) => f.value === format)?.label} · ${maxPlayers} players · entry ${entryFeeGold} 🪙 · pool ${prizePoolGold} 🪙 (${firstPrize}/${secondPrize}). Audited.`,
      requireReason: true,
      confirmLabel: isEdit ? "Save tournament" : "Create tournament",
      method: isEdit ? "PATCH" : "POST",
      path: isEdit ? `/api/admin/tournaments/${tournament!.id}` : "/api/admin/tournaments",
      payload: {
        name: name.trim(),
        format,
        entryFeeGold,
        prizePoolGold,
        prizeSplitGold: [firstPrize, secondPrize],
        maxPlayers,
        minTrophies,
        matchMode,
        startsAt: startsAt ? new Date(startsAt).toISOString() : null,
      },
      successMsg: isEdit ? "Tournament updated." : "Tournament created as a draft.",
      onDone: () => { onDone(); onClose(); },
    });
  };

  return (
    <div className="panel panel-pad" style={{ marginBottom: 14 }}>
      <div style={{ fontWeight: 700, marginBottom: 12 }}>{isEdit ? "Edit tournament" : "New tournament"}</div>

      <div className="field">
        <label>Name</label>
        <input className="input" placeholder="e.g. Weekend Datu Cup" value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="row" style={{ alignItems: "flex-start" }}>
        <div className="field" style={{ flex: 1, minWidth: 200 }}>
          <label>Format</label>
          <select className="select" value={format} onChange={(e) => setFormat(e.target.value as TournamentFormat)}>
            {FORMATS.map((f) => (
              <option key={f.value} value={f.value} disabled={!f.v1}>
                {f.label}{!f.v1 ? " (V2)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ flex: 1, minWidth: 160 }}>
          <label>Bracket size (max players)</label>
          <select className="select" value={maxPlayers} onChange={(e) => setMaxPlayers(Number(e.target.value))}>
            {POWERS_OF_TWO.map((n) => (
              <option key={n} value={n}>{n} players</option>
            ))}
          </select>
        </div>
        <div className="field" style={{ flex: 1, minWidth: 160 }}>
          <label>Match mode</label>
          <select className="select" value={matchMode} onChange={(e) => setMatchMode(e.target.value as "CASUAL" | "RANKED")}>
            <option value="CASUAL">Casual (recommended)</option>
            <option value="RANKED">Ranked</option>
          </select>
        </div>
      </div>

      <div className="row" style={{ alignItems: "flex-start" }}>
        <div className="field" style={{ flex: 1, minWidth: 180 }}>
          <label>Entry fee currency</label>
          {/* GOLD only — real-money/diamond top-up is disabled for legal compliance. */}
          <select className="select" value="GOLD" disabled>
            <option value="GOLD">Gold</option>
          </select>
        </div>
        <div className="field" style={{ flex: 1, minWidth: 140 }}>
          <label>Entry fee (gold)</label>
          <input className="input" type="number" min={0} value={entryFeeGold || ""} onChange={(e) => setEntryFeeGold(Number(e.target.value) || 0)} />
        </div>
      </div>

      <div className="row" style={{ alignItems: "flex-start" }}>
        <div className="field" style={{ flex: 1, minWidth: 180 }}>
          <label>Prize pool currency</label>
          <select className="select" value="GOLD" disabled>
            <option value="GOLD">Gold</option>
          </select>
        </div>
        <div className="field" style={{ flex: 1, minWidth: 140 }}>
          <label>Prize pool (gold)</label>
          <input className="input" type="number" min={0} value={prizePoolGold || ""} onChange={(e) => setPrizePoolGold(Number(e.target.value) || 0)} />
        </div>
      </div>

      <div className="row" style={{ alignItems: "flex-start" }}>
        <div className="field" style={{ flex: 1, minWidth: 140 }}>
          <label>1st place (gold)</label>
          <input className="input" type="number" min={0} value={firstPrize || ""} onChange={(e) => setFirstPrize(Number(e.target.value) || 0)} />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 140 }}>
          <label>2nd place (gold)</label>
          <input className="input" type="number" min={0} value={secondPrize || ""} onChange={(e) => setSecondPrize(Number(e.target.value) || 0)} />
        </div>
      </div>
      {!splitValid && (
        <div style={{ color: "var(--red-lt)", fontSize: 12, marginTop: -6, marginBottom: 12 }}>
          1st + 2nd ({splitSum.toLocaleString()} 🪙) must equal the prize pool ({prizePoolGold.toLocaleString()} 🪙). V1 pays only the top two placements.
        </div>
      )}

      <div className="row" style={{ alignItems: "flex-start" }}>
        <div className="field" style={{ flex: 1, minWidth: 160 }}>
          <label>Min trophies (0 = open to all)</label>
          <input className="input" type="number" min={0} value={minTrophies || ""} onChange={(e) => setMinTrophies(Number(e.target.value) || 0)} />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 200 }}>
          <label>Starts (optional, descriptive)</label>
          <input className="input" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        </div>
      </div>

      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn gold" disabled={!valid} onClick={submit}>{isEdit ? "Save tournament" : "Create tournament"}</button>
      </div>
    </div>
  );
}

// ── Bracket / slot-resolve drawer (simple — not a rendered bracket tree) ────

function BracketDrawer({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: () => void }) {
  const [d, setD] = useState<TournamentDetail | null>(null);
  const [err, setErr] = useState(false);

  const load = () => {
    setErr(false);
    api.get<TournamentDetail>(`/api/admin/tournaments/${id}`).then(setD).catch(() => setErr(true));
  };
  useEffect(load, [id]);

  const rounds = d ? Object.keys(d.bracket).map(Number).sort((a, b) => a - b) : [];
  const entryById = new Map((d?.entries ?? []).map((e) => [e.id, e]));

  const entryLabel = (entryId: string | null): string => {
    if (!entryId) return "TBD";
    const e = entryById.get(entryId);
    if (!e) return entryId;
    return `${e.user.username} ${e.user.tag}${e.seed ? ` (seed ${e.seed})` : ""}`;
  };

  return (
    <div className="drawer-wrap">
      <div className="drawer-bd" onClick={onClose} />
      <div className="drawer">
        {err ? (
          <div className="dim">Couldn't load tournament.</div>
        ) : !d ? (
          <div className="dim">Loading…</div>
        ) : (
          <>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div className="crumb">{STATUS_LABEL[d.status]} · {FORMATS.find((f) => f.value === d.format)?.label}</div>
                <div style={{ font: "800 18px var(--serif)", color: "var(--gold-lt)", marginTop: 4 }}>{d.name}</div>
                <div className="dim mono" style={{ fontSize: 12, marginTop: 2 }}>{d.id}</div>
              </div>
              <button className="btn" onClick={onClose}>Close</button>
            </div>

            <div className="kpi" style={{ margin: "18px 0", gridTemplateColumns: "repeat(2,1fr)" }}>
              <div className="card">
                <div className="v mono">{d.registeredCount} / {d.maxPlayers}</div>
                <div className="l">Registered</div>
              </div>
              <div className="card">
                <div className="v mono">{d.prizePoolGold.toLocaleString()} 🪙</div>
                <div className="l">Prize pool</div>
              </div>
            </div>

            <div style={{ fontWeight: 700, margin: "10px 0 8px" }}>Entries</div>
            <div className="panel" style={{ marginBottom: 20, overflow: "hidden" }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Player</th>
                    <th className="num">Seed</th>
                    <th>Status</th>
                    <th className="num">Placement</th>
                  </tr>
                </thead>
                <tbody>
                  {d.entries.length === 0 ? (
                    <tr><td colSpan={4} className="dim" style={{ textAlign: "center", padding: 18 }}>No entries.</td></tr>
                  ) : (
                    d.entries.map((e) => (
                      <tr key={e.id}>
                        <td>{e.user.username} <span className="dim mono">{e.user.tag}</span></td>
                        <td className="num">{e.seed ?? "—"}</td>
                        <td>{e.eliminated ? <span className="badge-st st-deleted">eliminated</span> : <span className="badge-st st-active">active</span>}</td>
                        <td className="num">{e.placement ?? "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div style={{ fontWeight: 700, margin: "10px 0 8px" }}>
              Bracket <span className="dim" style={{ fontWeight: 500 }}>· simple slot view — report each match's winner to advance</span>
            </div>
            {rounds.length === 0 ? (
              <div className="panel panel-pad dim">Bracket not seeded yet — Start the tournament first.</div>
            ) : (
              rounds.map((r) => (
                <div key={r} style={{ marginBottom: 16 }}>
                  <div className="dim" style={{ font: "700 11px var(--sans)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
                    Round {r}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {d.bracket[String(r)]!.sort((a, b) => a.slot - b.slot).map((m) => (
                      <SlotRow key={m.id} tournamentId={d.id} m={m} entryLabel={entryLabel} onDone={() => { load(); onDone(); }} />
                    ))}
                  </div>
                </div>
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SlotRow({
  tournamentId,
  m,
  entryLabel,
  onDone,
}: {
  tournamentId: string;
  m: TournamentMatch;
  entryLabel: (entryId: string | null) => string;
  onDone: () => void;
}) {
  const mutate = useAdminMutation();

  const report = (winnerEntryId: string) =>
    mutate({
      title: `Report winner: ${entryLabel(winnerEntryId)}`,
      body: "Resolves this slot and advances the winner into the next round.",
      requireReason: true,
      confirmLabel: "Report result",
      method: "POST",
      path: `/api/admin/tournaments/${tournamentId}/matches/${m.id}/report`,
      payload: { winnerEntryId },
      successMsg: "Result recorded — bracket advanced.",
      onDone,
    });

  const statusBadge =
    m.status === "done" ? <span className="badge-st st-deleted">done</span> :
    m.status === "ready" ? <span className="badge-st st-active">ready</span> :
    <span className="badge-st st-muted">pending</span>;

  return (
    <div className="acard" style={{ padding: 12 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
        <div className="row" style={{ gap: 8 }}>
          {statusBadge}
          <span style={{ color: m.winnerEntryId === m.redEntryId && m.winnerEntryId ? "var(--gold-lt)" : "var(--ink-2)", fontWeight: m.winnerEntryId === m.redEntryId && m.winnerEntryId ? 700 : 500 }}>
            {entryLabel(m.redEntryId)}
          </span>
          <span className="dim">vs</span>
          <span style={{ color: m.winnerEntryId === m.blueEntryId && m.winnerEntryId ? "var(--gold-lt)" : "var(--ink-2)", fontWeight: m.winnerEntryId === m.blueEntryId && m.winnerEntryId ? 700 : 500 }}>
            {entryLabel(m.blueEntryId)}
          </span>
        </div>
        {m.status === "ready" && m.redEntryId && m.blueEntryId && (
          <div className="row" style={{ flexWrap: "nowrap" }}>
            <button className="btn" onClick={() => report(m.redEntryId!)}>Report {entryLabel(m.redEntryId).split(" ")[0]} wins</button>
            <button className="btn" onClick={() => report(m.blueEntryId!)}>Report {entryLabel(m.blueEntryId).split(" ")[0]} wins</button>
          </div>
        )}
        {m.status === "done" && <span className="dim" style={{ fontSize: 12 }}>Winner: {entryLabel(m.winnerEntryId)}</span>}
      </div>
    </div>
  );
}

/** ISO string → value for <input type="datetime-local"> (local time, no seconds). */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
