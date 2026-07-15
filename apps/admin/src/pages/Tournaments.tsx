import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAdminMutation } from "../lib/ui";
import { Pagination, usePagination } from "../components/Pagination";

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
  rounds: number | null; // SWISS only — configured round count (null = auto ceil(log2(n)))
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
  bracket: string; // "W" | "L" | "GF" — DOUBLE_ELIM only; every other format's matches are all "W" (the schema default)
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

const BRACKET_SIZES = [8, 16, 32, 64, 128, 256] as const;
const ROUND_ROBIN_SIZES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16] as const;
const ROUND_ROBIN_MAX_PLAYERS = 16;
const SWISS_SIZES = Array.from({ length: 31 }, (_, i) => i + 2); // 2..32
const SWISS_MAX_PLAYERS = 32;
const FORMATS: { value: TournamentFormat; label: string; v1: boolean }[] = [
  { value: "SINGLE_ELIM", label: "Single elimination", v1: true },
  { value: "DOUBLE_ELIM", label: "Double elimination", v1: true },
  { value: "SWISS", label: "Swiss", v1: true },
  { value: "ROUND_ROBIN", label: "Round robin", v1: true },
];
/** Formats ranked by a win/loss/points standings table instead of a bracket
 * tree — RR and SWISS this stage (mirrors apps/web's isStandingsFormat). */
function isStandingsFormat(format: TournamentFormat): boolean {
  return format === "ROUND_ROBIN" || format === "SWISS";
}
/** DOUBLE_ELIM's bracket view groups matches by sub-bracket (W/L/GF) first,
 * round second — every other elimination format has just one implicit
 * bracket ("W", the schema default) so it keeps the flat round-only view. */
function isDoubleElim(format: TournamentFormat): boolean {
  return format === "DOUBLE_ELIM";
}
const BRACKET_LABEL: Record<string, string> = { W: "Winners bracket", L: "Losers bracket", GF: "Grand final" };

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

// ── Exact-value style overrides (mockup fidelity — see fidelity(admin) pass) ─
/** Row/form "Edit" action — ghost outline, mockup exact values. */
const EDIT_BTN_STYLE = {
  font: "700 11px var(--sans)",
  borderRadius: 8,
  padding: "7px 12px",
  border: "1px solid rgba(232, 184, 75, .28)",
  color: "#f0cf72",
  background: "transparent",
} as const;
/** Row lifecycle "Cancel" action — transparent pink outline, mockup exact values. */
const CANCEL_BTN_STYLE = {
  border: "1px solid rgba(255, 143, 174, .35)",
  color: "#ff8fae",
  background: "transparent",
} as const;
/** Primary "New/Create tournament" gold button — mockup gradient starts #e8b04a, not --gold-2. */
const PRIMARY_GOLD_STYLE = { background: "linear-gradient(180deg,#e8b04a,#c98a1e)" } as const;

/** 1.5 Tournaments — list + create/edit + a simple bracket/slot-resolve view. */
export function TournamentsPage() {
  const [status, setStatus] = useState<TournamentStatus | "">("");
  const [rows, setRows] = useState<Tournament[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Tournament | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  // Client-side pagination of the (already fully fetched) tournament list.
  const pg = usePagination(rows, 10);
  // Deep-link from the header global search (handoffv3 row 16): a cup result
  // routes to `?open=<id>`, which opens the same BracketDrawer a row's "View"
  // action does. Consumed once on mount, then stripped from the URL.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const openId = searchParams.get("open");
    if (openId) {
      setViewingId(openId);
      setSearchParams((p) => { p.delete("open"); return p; }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* 4-stat header */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
          <div className="fd-kpi up">
            <div className="l">Live now</div>
            <div className="v" style={{ font: "800 22px var(--mono)", marginTop: 5 }}>{stats?.liveNow ?? "—"}</div>
          </div>
          <div className="fd-kpi amber" style={{ ["--tile" as string]: "var(--gold-2)" }}>
            <div className="l">Upcoming</div>
            <div className="v" style={{ font: "800 22px var(--mono)", marginTop: 5 }}>{stats?.upcoming ?? "—"}</div>
          </div>
          <div className="fd-kpi ink">
            <div className="l">Players registered</div>
            <div className="v" style={{ font: "800 22px var(--mono)", marginTop: 5 }}>{(stats?.playersRegistered ?? 0).toLocaleString()}</div>
          </div>
          <div className="fd-kpi gold" style={{ ["--tile" as string]: "var(--gold)" }}>
            <div className="l">Gold prize pool (scheduled)</div>
            <div className="v" style={{ font: "800 22px var(--mono)", marginTop: 5 }}>{(stats?.goldPrizePool ?? 0).toLocaleString()} 🪙</div>
          </div>
        </div>

        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ font: "700 12px var(--sans)", letterSpacing: ".4px", color: "var(--dim)" }}>
            All tournaments — create, schedule &amp; manage the cups shown on the player Cups screen
          </div>
          <button className="btn gold" style={PRIMARY_GOLD_STYLE} onClick={() => { setCreating(true); setEditing(null); }}>+ New tournament</button>
        </div>

        <div className="row">
          <button className={`chip${status === "" ? " on" : ""}`} onClick={() => setStatus("")}>all</button>
          {(["DRAFT", "OPEN", "RUNNING", "COMPLETED", "CANCELLED"] as TournamentStatus[]).map((s) => (
            <button key={s} className={`chip${status === s ? " on" : ""}`} onClick={() => setStatus(s)}>
              {STATUS_LABEL[s].toLowerCase()}
            </button>
          ))}
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
                pg.pageItems.map((t) => (
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
          {!loading && <Pagination {...pg} noun="tournaments" />}
        </div>
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
      body:
        t.format === "ROUND_ROBIN"
          ? `Seeds the match schedule from ${t.registeredCount} registered player(s). This cannot be undone.`
          : t.format === "SWISS"
            ? `Seeds round 1 only from ${t.registeredCount} registered player(s) (${t.rounds ?? "auto"} round${t.rounds === 1 ? "" : "s"} total — later rounds generate automatically as each round is fully reported). This cannot be undone.`
            : `Seeds the bracket from ${t.registeredCount} registered player(s). This cannot be undone.`,
      requireReason: true,
      confirmLabel: "Start",
      method: "POST",
      path: `/api/admin/tournaments/${t.id}/start`,
      successMsg:
        t.format === "ROUND_ROBIN"
          ? "Matches scheduled — tournament is live."
          : t.format === "SWISS"
            ? "Round 1 seeded — tournament is live."
            : "Bracket seeded — tournament is live.",
      onDone,
    });

  const complete = () =>
    mutate({
      title: `Complete "${t.name}"`,
      body: isStandingsFormat(t.format)
        ? "Pays the top placements by final standings. Requires every match to be reported."
        : "Pays the top placements by final ranking. Requires a champion to already exist.",
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
          <button className="btn" style={EDIT_BTN_STYLE} onClick={onEdit}>Edit</button>
          {t.status === "DRAFT" && (
            <>
              <button className="btn gold" onClick={open}>Open registration</button>
              <button className="btn" style={CANCEL_BTN_STYLE} onClick={cancel}>Cancel</button>
            </>
          )}
          {t.status === "OPEN" && (
            <>
              <button className="btn gold" onClick={start}>Start</button>
              <button className="btn" style={CANCEL_BTN_STYLE} onClick={cancel}>Cancel</button>
            </>
          )}
          {t.status === "RUNNING" && (
            <>
              <button className="btn" onClick={onView}>View bracket</button>
              <button className="btn gold" onClick={complete}>Complete</button>
              <button className="btn" style={CANCEL_BTN_STYLE} onClick={cancel}>Cancel</button>
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

const ORDINAL = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th", "11th", "12th", "13th", "14th", "15th", "16th"];
const ordinalLabel = (i: number) => ORDINAL[i] ?? `${i + 1}th`;

function TournamentForm({ tournament, onClose, onDone }: { tournament?: Tournament; onClose: () => void; onDone: () => void }) {
  const mutate = useAdminMutation();
  const isEdit = !!tournament;

  const [name, setName] = useState(tournament?.name ?? "");
  const [format, setFormat] = useState<TournamentFormat>(tournament?.format ?? "SINGLE_ELIM");
  const [maxPlayers, setMaxPlayers] = useState<number>(tournament?.maxPlayers ?? 16);
  const [entryFeeGold, setEntryFeeGold] = useState<number>(tournament?.entryFeeGold ?? 0);
  const [prizePoolGold, setPrizePoolGold] = useState<number>(tournament?.prizePoolGold ?? 0);
  // Top-N prize split — a dynamic list of per-placement gold amounts (was a
  // fixed 1st/2nd pair). A 2-length split is just the old shape; N can be
  // anywhere from 1 (winner-takes-all) up to maxPlayers.
  const initialSplit = Array.isArray(tournament?.prizeSplitGold) && (tournament!.prizeSplitGold as number[]).length > 0
    ? (tournament!.prizeSplitGold as number[])
    : [0, 0];
  const [split, setSplit] = useState<number[]>(initialSplit);
  const [minTrophies, setMinTrophies] = useState<number>(tournament?.minTrophies ?? 0);
  const [matchMode, setMatchMode] = useState<"CASUAL" | "RANKED">(tournament?.matchMode ?? "CASUAL");
  const [startsAt, setStartsAt] = useState(tournament?.startsAt ? toLocalInput(tournament.startsAt) : "");
  // SWISS ONLY: rounds — blank/null = auto (ceil(log2(n)), computed at Start).
  const [rounds, setRounds] = useState<string>(tournament?.rounds != null ? String(tournament.rounds) : "");

  const isRoundRobin = format === "ROUND_ROBIN";
  const isSwiss = format === "SWISS";
  const bracketSizeOptions = isRoundRobin ? ROUND_ROBIN_SIZES : isSwiss ? SWISS_SIZES : BRACKET_SIZES;

  // When switching format, clamp maxPlayers into the new format's valid set
  // (power-of-two bracket sizes for elimination, 2..16 for round robin, 2..32 for swiss).
  const onFormatChange = (next: TournamentFormat) => {
    setFormat(next);
    if (next === "ROUND_ROBIN" && maxPlayers > ROUND_ROBIN_MAX_PLAYERS) {
      setMaxPlayers(ROUND_ROBIN_MAX_PLAYERS);
    } else if (next === "SWISS" && maxPlayers > SWISS_MAX_PLAYERS) {
      setMaxPlayers(SWISS_MAX_PLAYERS);
    } else if (next !== "ROUND_ROBIN" && next !== "SWISS" && !(BRACKET_SIZES as readonly number[]).includes(maxPlayers)) {
      setMaxPlayers(8);
    }
  };

  const roundsValid = rounds.trim() === "" || (Number.isInteger(Number(rounds)) && Number(rounds) >= 1 && Number(rounds) <= 20);
  const splitSum = split.reduce((a, b) => a + b, 0);
  const splitValid = split.length >= 1 && split.length <= maxPlayers && splitSum === prizePoolGold;
  const supportedFormat = format === "SINGLE_ELIM" || format === "ROUND_ROBIN" || format === "SWISS" || format === "DOUBLE_ELIM";
  const valid = name.trim().length > 0 && supportedFormat && splitValid && roundsValid;

  const setPlace = (i: number, gold: number) => setSplit((s) => s.map((v, idx) => (idx === i ? gold : v)));
  const addPlace = () => setSplit((s) => (s.length < maxPlayers ? [...s, 0] : s));
  const removePlace = (i: number) => setSplit((s) => (s.length > 1 ? s.filter((_, idx) => idx !== i) : s));

  const submit = () => {
    if (!splitValid) return; // client-side gate — mirrors server's PRIZE_SPLIT_MISMATCH
    mutate({
      title: isEdit ? `Edit tournament "${name}"` : `Create tournament "${name}"`,
      body: `${FORMATS.find((f) => f.value === format)?.label} · ${maxPlayers} players · entry ${entryFeeGold} 🪙 · pool ${prizePoolGold} 🪙 (${split.join("/")}). Audited.`,
      requireReason: true,
      confirmLabel: isEdit ? "Save tournament" : "Create tournament",
      method: isEdit ? "PATCH" : "POST",
      path: isEdit ? `/api/admin/tournaments/${tournament!.id}` : "/api/admin/tournaments",
      payload: {
        name: name.trim(),
        format,
        entryFeeGold,
        prizePoolGold,
        prizeSplitGold: split,
        maxPlayers,
        minTrophies,
        matchMode,
        startsAt: startsAt ? new Date(startsAt).toISOString() : null,
        rounds: isSwiss && rounds.trim() !== "" ? Number(rounds) : null,
      },
      successMsg: isEdit ? "Tournament updated." : "Tournament created as a draft.",
      onDone: () => { onDone(); onClose(); },
    });
  };

  return (
    <div className="drawer-wrap">
      <div className="drawer-bd" onClick={onClose} />
      <div className="drawer" style={{ width: "min(96vw,640px)" }}>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ font: "800 16px var(--serif)", color: "var(--ink)" }}>{isEdit ? "Edit tournament" : "New tournament"}</div>
        <button className="btn" onClick={onClose}>Close</button>
      </div>

      <div className="field">
        <label>Tournament name</label>
        <input className="input" placeholder="e.g. Sunday Rapid Cup" value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="row" style={{ alignItems: "flex-start" }}>
        <div className="field" style={{ flex: 1, minWidth: 200 }}>
          <label>Format</label>
          <select className="select" value={format} onChange={(e) => onFormatChange(e.target.value as TournamentFormat)}>
            {FORMATS.map((f) => (
              <option key={f.value} value={f.value} disabled={!f.v1} style={!f.v1 ? { color: "var(--dim-2)" } : undefined}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ flex: 1, minWidth: 160 }}>
          <label>{isRoundRobin ? "Players (cap 16)" : isSwiss ? "Players (cap 32)" : "Bracket size (cap)"}</label>
          <select className="select" value={maxPlayers} onChange={(e) => setMaxPlayers(Number(e.target.value))}>
            {bracketSizeOptions.map((n) => (
              <option key={n} value={n}>{n}</option>
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
        {isSwiss && (
          <div className="field" style={{ flex: 1, minWidth: 160 }}>
            <label>Rounds (optional)</label>
            <input
              className="input"
              type="number"
              min={1}
              max={20}
              placeholder="auto"
              value={rounds}
              onChange={(e) => setRounds(e.target.value)}
            />
          </div>
        )}
      </div>
      {isRoundRobin && (
        <div className="dim" style={{ fontSize: 11, marginTop: -6, marginBottom: 12 }}>
          Round robin: every player plays every other player once. Match count grows fast — capped at 16 players ({(16 * 15) / 2} matches).
        </div>
      )}
      {isSwiss && (
        <div className="dim" style={{ fontSize: 11, marginTop: -6, marginBottom: 12 }}>
          Swiss: players are paired by score each round (rematches avoided where possible). Leave rounds blank for the standard ceil(log2(players)) count.
          {!roundsValid && <span style={{ color: "var(--red-lt)" }}> Rounds must be an integer from 1 to 20.</span>}
        </div>
      )}

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

      <div className="field">
        <label>Prize split by placement (gold)</label>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {split.map((gold, i) => (
            <div key={i} className="row" style={{ alignItems: "center", gap: 8 }}>
              <span style={{ width: 44, font: "700 12px var(--sans)", color: "var(--gold-lt)" }}>{ordinalLabel(i)}</span>
              <input
                className="input"
                type="number"
                min={0}
                style={{ flex: 1 }}
                value={gold || ""}
                onChange={(e) => setPlace(i, Number(e.target.value) || 0)}
              />
              <button
                type="button"
                className="btn"
                style={{ padding: "6px 10px" }}
                disabled={split.length <= 1}
                onClick={() => removePlace(i)}
                aria-label={`Remove ${ordinalLabel(i)} place`}
              >
                −
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="btn"
          style={{ marginTop: 8, alignSelf: "flex-start" }}
          disabled={split.length >= maxPlayers}
          onClick={addPlace}
        >
          + Add place
        </button>
      </div>
      {!splitValid && (
        <div style={{ color: "var(--red-lt)", fontSize: 12, marginTop: -6, marginBottom: 12 }}>
          {split.length > maxPlayers
            ? `Prize split has more placements (${split.length}) than max players (${maxPlayers}).`
            : `Split total (${splitSum.toLocaleString()} 🪙) must equal the prize pool (${prizePoolGold.toLocaleString()} 🪙).`}
        </div>
      )}

      <div className="row" style={{ alignItems: "flex-start" }}>
        <div className="field" style={{ flex: 1, minWidth: 160 }}>
          <label>Min trophies to join (0 = open)</label>
          <input className="input" type="number" min={0} value={minTrophies || ""} onChange={(e) => setMinTrophies(Number(e.target.value) || 0)} />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 200 }}>
          <label>Starts</label>
          <input className="input" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        </div>
      </div>

      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn gold" style={PRIMARY_GOLD_STYLE} disabled={!valid} onClick={submit}>{isEdit ? "Save tournament" : "Create tournament"}</button>
      </div>
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
  const isRoundRobin = d?.format === "ROUND_ROBIN";
  const isSwiss = d?.format === "SWISS";
  const isStandings = d ? isStandingsFormat(d.format) : false;
  const isDE = d ? isDoubleElim(d.format) : false;

  // DOUBLE_ELIM: group the flat round->matches map by each match's own
  // `bracket` field ("W"/"L"/"GF") so the drawer can render three separate
  // labeled sections instead of one flat, interleaved round list — the
  // round-offset scheme (W 1..k, L 101+, GF 201+) guarantees round numbers
  // never collide across brackets, so this grouping is purely presentational.
  const bracketGroups: Array<{ key: string; label: string; rounds: number[] }> = isDE
    ? (["W", "L", "GF"] as const)
        .map((key) => {
          const roundsInBracket = rounds.filter((r) => (d!.bracket[String(r)] ?? []).some((m) => m.bracket === key));
          return { key, label: BRACKET_LABEL[key]!, rounds: roundsInBracket };
        })
        .filter((g) => g.rounds.length > 0)
    : [];

  const entryLabel = (entryId: string | null): string => {
    if (!entryId) return "TBD";
    const e = entryById.get(entryId);
    if (!e) return entryId;
    return `${e.user.username} ${e.user.tag}${e.seed ? ` (seed ${e.seed})` : ""}`;
  };

  // Standings for ROUND_ROBIN and SWISS — a live win/loss tally from the
  // reported matches so far (not just the final placement, which is only set
  // at Complete; for SWISS a bye slot's winnerEntryId still counts as a
  // "win" here exactly like a real match, matching how computeSwissStandings
  // scores byes server-side). Ranked by wins desc, then seed asc — a
  // lightweight client-side view; the authoritative ranking (incl.
  // head-to-head/Buchholz tiebreak) is computed server-side at Complete time.
  const standings = (() => {
    if (!d || !isStandings) return [];
    const allMatches = Object.values(d.bracket).flat();
    const wins = new Map<string, number>();
    const losses = new Map<string, number>();
    for (const e of d.entries) {
      wins.set(e.id, 0);
      losses.set(e.id, 0);
    }
    for (const m of allMatches) {
      if (m.status !== "done" || !m.winnerEntryId) continue;
      wins.set(m.winnerEntryId, (wins.get(m.winnerEntryId) ?? 0) + 1);
      const loser = m.redEntryId === m.winnerEntryId ? m.blueEntryId : m.redEntryId;
      if (loser) losses.set(loser, (losses.get(loser) ?? 0) + 1);
    }
    return [...d.entries]
      .map((e) => ({ entry: e, wins: wins.get(e.id) ?? 0, losses: losses.get(e.id) ?? 0 }))
      .sort((a, b) => (a.entry.placement ?? 999) - (b.entry.placement ?? 999) || b.wins - a.wins || (a.entry.seed ?? 999) - (b.entry.seed ?? 999));
  })();

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

            {isStandings && (
              <>
                <div style={{ fontWeight: 700, margin: "10px 0 8px" }}>
                  Standings <span className="dim" style={{ fontWeight: 500 }}>
                    · ranked by {isSwiss ? "score (wins + byes)" : "wins"} — final placement is set at Complete
                  </span>
                </div>
                <div className="panel" style={{ marginBottom: 20, overflow: "hidden" }}>
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th className="num">#</th>
                        <th>Player</th>
                        <th className="num">W</th>
                        <th className="num">L</th>
                        <th className="num">Placement</th>
                      </tr>
                    </thead>
                    <tbody>
                      {standings.length === 0 ? (
                        <tr><td colSpan={5} className="dim" style={{ textAlign: "center", padding: 18 }}>No entries.</td></tr>
                      ) : (
                        standings.map((row, i) => (
                          <tr key={row.entry.id}>
                            <td className="num">{i + 1}</td>
                            <td>{row.entry.user.username} <span className="dim mono">{row.entry.user.tag}</span></td>
                            <td className="num">{row.wins}</td>
                            <td className="num">{row.losses}</td>
                            <td className="num">{row.entry.placement ?? "—"}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <div style={{ fontWeight: 700, margin: "10px 0 8px" }}>
              {isStandings ? "Matches" : "Bracket"} <span className="dim" style={{ fontWeight: 500 }}>
                · simple slot view — report each match's winner {isStandings ? "" : "to advance"}
                {isSwiss ? " (later rounds appear automatically once the current round is fully reported)" : ""}
              </span>
            </div>
            {rounds.length === 0 ? (
              <div className="panel panel-pad dim">{isStandings ? "Matches" : "Bracket"} not seeded yet — Start the tournament first.</div>
            ) : isDE ? (
              // DOUBLE_ELIM: three labeled sections (Winners / Losers / Grand
              // final), each with its own round-by-round slot list — grouping
              // derived client-side from each match's `bracket` field (see
              // `bracketGroups` above).
              bracketGroups.map((group) => (
                <div key={group.key} style={{ marginBottom: 24 }}>
                  <div style={{ fontWeight: 700, marginBottom: 10, color: "var(--gold-lt)" }}>{group.label}</div>
                  {group.rounds.map((r) => (
                    <div key={r} style={{ marginBottom: 16 }}>
                      <div className="dim" style={{ font: "700 11px var(--sans)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
                        {group.key === "GF" ? (r === 202 ? "Bracket reset (game 2)" : "Game 1") : `Round ${r}`}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {d.bracket[String(r)]!.filter((m) => m.bracket === group.key).sort((a, b) => a.slot - b.slot).map((m) => (
                          <SlotRow key={m.id} tournamentId={d.id} m={m} entryLabel={entryLabel} onDone={() => { load(); onDone(); }} isRoundRobin={false} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ))
            ) : (
              rounds.map((r) => (
                <div key={r} style={{ marginBottom: 16 }}>
                  <div className="dim" style={{ font: "700 11px var(--sans)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
                    Round {r}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {d.bracket[String(r)]!.sort((a, b) => a.slot - b.slot).map((m) => (
                      <SlotRow key={m.id} tournamentId={d.id} m={m} entryLabel={entryLabel} onDone={() => { load(); onDone(); }} isRoundRobin={isStandings} />
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
  isRoundRobin,
}: {
  tournamentId: string;
  m: TournamentMatch;
  entryLabel: (entryId: string | null) => string;
  onDone: () => void;
  isRoundRobin?: boolean;
}) {
  const mutate = useAdminMutation();

  const report = (winnerEntryId: string) =>
    mutate({
      title: `Report winner: ${entryLabel(winnerEntryId)}`,
      body: isRoundRobin ? "Resolves this match. Standings update once every match is reported." : "Resolves this slot and advances the winner into the next round.",
      requireReason: true,
      confirmLabel: "Report result",
      method: "POST",
      path: `/api/admin/tournaments/${tournamentId}/matches/${m.id}/report`,
      payload: { winnerEntryId },
      successMsg: isRoundRobin ? "Result recorded." : "Result recorded — bracket advanced.",
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
