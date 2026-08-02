import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { useAppStore } from "../../stores/appStore";
import { useAuthStore } from "../../stores/authStore";
import { useTournamentStore } from "../../stores/tournamentStore";
import { Avatar, CurrencyPill } from "../../components";
import { ICONS } from "../../lib/assets";
import { BracketView } from "./BracketView";
import { YourMatchCard } from "./YourMatchCard";
import { FORMAT_LABEL, STATUS_META, formatStartsAt, isStandingsFormat, type TournamentDetail, type TournamentEntry } from "./types";

/**
 * TournamentDetailPage (/tournaments/:id) — one Cup's entry list + bracket.
 *
 * DATA: GET /api/tournaments/:id → the tournament row + entries[] (with real
 * user avatar/username/tag) + bracket grouped by round (1..N) + myEntry (the
 * signed-in player's own seed/eliminated/placement, or null). Join/Leave POST
 * the same endpoints as the list page, then we re-fetch so the page reflects
 * the server's real state (registeredCount, joined status, entries).
 *
 * The bracket is rendered as simple round columns — each match shows its two
 * entries (looked up from `entries` by id) with the winner highlighted; a slot
 * still awaiting its feeder (null side) shows "TBD", and a bye shows "BYE".
 */

function seedTag(seed: number | null): string {
  return seed != null ? `#${seed}` : "";
}

function EntryRow({ e, isMe }: { e: TournamentEntry; isMe: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 12px",
        borderRadius: 10,
        border: `1px solid ${isMe ? "var(--gold)" : "rgba(232,184,75,.16)"}`,
        background: isMe ? "rgba(232,184,75,.08)" : "rgba(255,255,255,.02)",
      }}
    >
      <Avatar src={e.user.avatarUrl ?? "champion"} size={34} ring={false} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: "700 13px Inter", color: "#f2e9d2", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {e.user.username} <span style={{ color: "var(--ink2)", fontFamily: "'JetBrains Mono',monospace", fontWeight: 500 }}>#{e.user.tag}</span>
        </div>
        <div style={{ font: "600 11px Inter", color: "var(--ink2)" }}>
          Seed {seedTag(e.seed) || "—"}
          {e.eliminated ? " · Eliminated" : ""}
          {e.placement != null ? ` · Placed #${e.placement}` : ""}
        </div>
      </div>
      {isMe && (
        <span style={{ flex: "none", font: "800 10px Inter", letterSpacing: ".5px", color: "var(--gold)", textTransform: "uppercase" }}>You</span>
      )}
    </div>
  );
}

type StandingsRow = { entry: TournamentEntry; wins: number; losses: number };

function StandingsTable({ rows, myEntryId }: { rows: StandingsRow[]; myEntryId: string | undefined }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "32px 1fr 44px 44px 70px",
          gap: 8,
          padding: "4px 10px",
          font: "700 10px Inter",
          letterSpacing: ".4px",
          textTransform: "uppercase",
          color: "var(--ink2)",
        }}
      >
        <span>#</span>
        <span>Player</span>
        <span style={{ textAlign: "right" }}>W</span>
        <span style={{ textAlign: "right" }}>L</span>
        <span style={{ textAlign: "right" }}>Place</span>
      </div>
      {rows.map((row, i) => {
        const isMe = row.entry.id === myEntryId;
        return (
          <div
            key={row.entry.id}
            style={{
              display: "grid",
              gridTemplateColumns: "32px 1fr 44px 44px 70px",
              gap: 8,
              alignItems: "center",
              padding: "8px 10px",
              borderRadius: 8,
              border: `1px solid ${isMe ? "var(--gold)" : "rgba(232,184,75,.14)"}`,
              background: isMe ? "rgba(232,184,75,.08)" : "rgba(255,255,255,.02)",
            }}
          >
            <span style={{ font: "800 12px 'JetBrains Mono',monospace", color: "var(--gold-lt)" }}>{i + 1}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <Avatar src={row.entry.user.avatarUrl ?? "champion"} size={24} ring={false} />
              <span style={{ font: "700 12.5px Inter", color: "#f2e9d2", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {row.entry.user.username}
              </span>
            </span>
            <span style={{ textAlign: "right", font: "700 12px 'JetBrains Mono',monospace", color: "#7ee6a4" }}>{row.wins}</span>
            <span style={{ textAlign: "right", font: "700 12px 'JetBrains Mono',monospace", color: "var(--ink2)" }}>{row.losses}</span>
            <span style={{ textAlign: "right", font: "700 12px Inter", color: "var(--gold)" }}>{row.entry.placement ?? "—"}</span>
          </div>
        );
      })}
    </div>
  );
}

export function TournamentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const me = useAuthStore((s) => s.me);
  const showToast = useAppStore((s) => s.showToast);
  const navigate = useNavigate();
  const isGuest = !me || me.isGuest;

  const [data, setData] = useState<TournamentDetail | null>(null); // null = loading
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);

  // Live half of the page: readiness echoes + the auto-start handoff. The REST
  // payload below seeds it, so everything renders correctly even before (or
  // without) a socket.
  const bindLive = useTournamentStore((s) => s.bind);
  const hydrateLive = useTournamentStore((s) => s.hydrate);
  const liveMyMatch = useTournamentStore((s) => s.myMatch);
  const readyPending = useTournamentStore((s) => s.pending);
  const readyError = useTournamentStore((s) => s.error);
  const consumeReadyError = useTournamentStore((s) => s.consumeError);
  const startedMatchId = useTournamentStore((s) => s.startedMatchId);
  const consumeStart = useTournamentStore((s) => s.consumeStart);
  const sendReady = useTournamentStore((s) => s.ready);
  const resetLive = useTournamentStore((s) => s.reset);

  const load = useCallback(async () => {
    if (!id) return;
    setLoadError(false);
    try {
      const t = await api.get<TournamentDetail>(`/api/tournaments/${id}`);
      setData(t);
      hydrateLive(t.myMatch ?? null);
    } catch (e) {
      setLoadError(true);
      if (!(e instanceof ApiError && e.status === 404)) {
        showToast("Couldn't load this Cup.");
      }
    }
  }, [id, showToast, hydrateLive]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!isGuest) void bindLive();
    return () => resetLive();
  }, [isGuest, bindLive, resetLive]);

  // The server started our match — it has already seeded the board and put our
  // socket in the match room, so all that's left is to go there.
  useEffect(() => {
    if (!startedMatchId) return;
    consumeStart();
    navigate("/play/online");
  }, [startedMatchId, consumeStart, navigate]);

  useEffect(() => {
    if (!readyError) return;
    showToast(readyError.message);
    consumeReadyError();
    // A rejected ready usually means our view is stale (the slot already
    // started, or an admin resolved it) — refetch rather than leave it wrong.
    void load();
  }, [readyError, showToast, consumeReadyError, load]);

  // The bracket arrives grouped by round number; BracketView wants a flat list
  // (it re-groups by sub-bracket and round itself, and owns all the geometry).
  const allMatches = useMemo(() => Object.values(data?.bracket ?? {}).flat(), [data]);

  // Standings for no-elimination formats (ROUND_ROBIN this stage) — a live
  // win/loss tally from reported matches, ranked by final placement (once
  // set at Complete) then wins desc then seed asc. The authoritative ranking
  // (incl. head-to-head tiebreak) is computed server-side at Complete time;
  // this is a lightweight client-side view of the same match data the
  // bracket would otherwise render.
  const standings = useMemo(() => {
    if (!data || !isStandingsFormat(data.format)) return [];
    const allMatches = Object.values(data.bracket).flat();
    const wins = new Map<string, number>();
    const losses = new Map<string, number>();
    for (const e of data.entries) {
      wins.set(e.id, 0);
      losses.set(e.id, 0);
    }
    for (const m of allMatches) {
      if (m.status !== "done" || !m.winnerEntryId) continue;
      wins.set(m.winnerEntryId, (wins.get(m.winnerEntryId) ?? 0) + 1);
      const loser = m.redEntryId === m.winnerEntryId ? m.blueEntryId : m.redEntryId;
      if (loser) losses.set(loser, (losses.get(loser) ?? 0) + 1);
    }
    return [...data.entries]
      .map((e) => ({ entry: e, wins: wins.get(e.id) ?? 0, losses: losses.get(e.id) ?? 0 }))
      .sort((a, b) => (a.entry.placement ?? 999) - (b.entry.placement ?? 999) || b.wins - a.wins || (a.entry.seed ?? 999) - (b.entry.seed ?? 999));
  }, [data]);

  const onJoin = useCallback(async () => {
    if (!id) return;
    if (isGuest) {
      showToast("Sign in to join a Cup.");
      navigate(`/login?next=/tournaments/${id}`);
      return;
    }
    setBusy(true);
    try {
      await api.post(`/api/tournaments/${id}/join`);
      showToast("Joined the Cup!");
      await load();
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : "Couldn't join this Cup.");
    } finally {
      setBusy(false);
    }
  }, [id, isGuest, showToast, navigate, load]);

  const onLeave = useCallback(async () => {
    if (!id) return;
    setBusy(true);
    try {
      await api.post(`/api/tournaments/${id}/leave`);
      showToast("Left the Cup.");
      await load();
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : "Couldn't leave this Cup.");
    } finally {
      setBusy(false);
    }
  }, [id, showToast, load]);

  if (data === null && !loadError) {
    return (
      <div className="fd-page-pad" style={{ maxWidth: 980, margin: "0 auto", padding: 26 }}>
        <div className="frame" style={{ padding: 34, textAlign: "center", font: "500 13px Inter", color: "var(--ink2)" }}>
          Loading Cup…
        </div>
      </div>
    );
  }

  if (loadError || !data) {
    return (
      <div className="fd-page-pad" style={{ maxWidth: 980, margin: "0 auto", padding: 26 }}>
        <div className="frame" style={{ padding: 34, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <div style={{ font: "500 13px Inter", color: "var(--ink2)" }}>This Cup couldn&rsquo;t be found.</div>
          <button type="button" className="btn btn-gold" onClick={() => navigate("/tournaments")} style={{ padding: "9px 20px" }}>
            Back to Cups
          </button>
        </div>
      </div>
    );
  }

  const status = STATUS_META[data.status];
  // Prefer the socket's view (it reflects a ready that landed since page load);
  // fall back to the REST payload so the card is right without a socket at all.
  const myMatch = liveMyMatch ?? data.myMatch;
  const full = data.registeredCount >= data.maxPlayers;
  const joined = !!data.myEntry;
  const canJoin = data.status === "OPEN" && !joined && !full;
  const canLeave = data.status === "OPEN" && joined;

  return (
    <div data-screen-label="Tournament Detail" className="fd-page-pad" style={{ maxWidth: 980, margin: "0 auto", padding: 26, display: "flex", flexDirection: "column", gap: 22 }}>
      <button
        type="button"
        className="fd-tap"
        onClick={() => navigate("/tournaments")}
        style={{ alignSelf: "flex-start", background: "none", border: "none", padding: 0, color: "var(--gold)", font: "700 12px Inter", cursor: "pointer" }}
      >
        ← Back to Cups
      </button>

      <div className="frame" style={{ padding: "22px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, font: "800 clamp(22px,3.2vw,30px) Cinzel,serif", color: "var(--gold-lt)" }}>{data.name}</h1>
            <div style={{ font: "600 12px Inter", color: "var(--ink2)", marginTop: 4 }}>
              {FORMAT_LABEL[data.format]} · Starts {formatStartsAt(data.startsAt)}
            </div>
          </div>
          <span
            style={{
              flex: "none",
              font: "800 10px Inter",
              letterSpacing: ".6px",
              textTransform: "uppercase",
              padding: "5px 10px",
              borderRadius: 100,
              color: status.color,
              background: status.bg,
              border: `1px solid ${status.color}55`,
            }}
          >
            {status.label}
          </span>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <CurrencyPill kind="gold" value={data.entryFeeGold} title="Entry fee" />
          <CurrencyPill kind="gold" value={data.prizePoolGold} title="Prize pool" />
          <span className="pill" style={{ color: "var(--ink)" }}>
            {data.registeredCount}/{data.maxPlayers} players
          </span>
          {data.minTrophies > 0 && (
            <span className="pill" style={{ color: "var(--ink)" }}>
              <img src={ICONS.trophy} alt="" width={16} height={16} style={{ display: "block", objectFit: "contain" }} />
              {data.minTrophies.toLocaleString()}+ required
            </span>
          )}
        </div>

        {data.myEntry && (
          <div style={{ font: "600 12px Inter", color: "var(--gold)" }}>
            Your seed: {seedTag(data.myEntry.seed) || "—"}
            {data.myEntry.eliminated ? " · Eliminated" : ""}
            {data.myEntry.placement != null ? ` · Placed #${data.myEntry.placement}` : ""}
          </div>
        )}

        <div>
          {canLeave ? (
            <button
              type="button"
              disabled={busy}
              onClick={onLeave}
              style={{
                padding: "10px 22px",
                borderRadius: 9,
                font: "800 12px Inter",
                letterSpacing: ".4px",
                border: "1px solid rgba(168,55,68,.5)",
                background: "rgba(168,55,68,.16)",
                color: "#ff9aa8",
                cursor: busy ? "default" : "pointer",
                opacity: busy ? 0.7 : 1,
              }}
            >
              {busy ? "…" : "Leave Cup"}
            </button>
          ) : canJoin || isGuest ? (
            <button
              type="button"
              disabled={busy}
              onClick={onJoin}
              style={{
                padding: "10px 22px",
                borderRadius: 9,
                font: "800 12px Inter",
                letterSpacing: ".4px",
                border: "1px solid var(--gold)",
                background: "linear-gradient(180deg,#f0c24b,#c98b2e)",
                color: "#2a1607",
                cursor: busy ? "default" : "pointer",
                opacity: busy ? 0.7 : 1,
              }}
            >
              {busy ? "…" : isGuest ? "Sign In to Join" : "Join Cup"}
            </button>
          ) : (
            <span style={{ font: "700 12px Inter", color: "var(--ink2)" }}>
              {joined && data.status === "RUNNING" ? "You're in — good luck!" : full ? "Registration full" : "Registration closed"}
            </span>
          )}
        </div>
      </div>

      {/* YOUR MATCH — the player's own slot: ready up, then the server drops
          both of you onto the board by itself. Only while the Cup is running. */}
      {data.status === "RUNNING" && myMatch && (
        <YourMatchCard
          myMatch={myMatch}
          pending={readyPending}
          onReady={() => sendReady(myMatch.tmId)}
          onRejoin={() => navigate("/play/online")}
        />
      )}

      {/* ENTRIES */}
      <div className="frame fd-card-m" style={{ padding: "20px 22px" }}>
        <div className="ptitle">Entries ({data.entries.length})</div>
        {data.entries.length === 0 ? (
          <div style={{ padding: "18px 4px", textAlign: "center", font: "500 13px Inter", color: "var(--ink2)" }}>
            No one has joined yet — be the first!
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 10, marginTop: 6 }}>
            {data.entries.map((e) => (
              <EntryRow key={e.id} e={e} isMe={data.myEntry?.id === e.id} />
            ))}
          </div>
        )}
      </div>

      {/* STANDINGS (round robin / other no-elimination formats) */}
      {isStandingsFormat(data.format) && standings.length > 0 && (
        <div className="frame fd-card-m" style={{ padding: "20px 22px" }}>
          <div className="ptitle">Standings</div>
          <StandingsTable rows={standings} myEntryId={data.myEntry?.id} />
        </div>
      )}

      {/* BRACKET — round-named columns, per-competitor rows and elbow connectors.
          BracketView handles SINGLE_ELIM and DOUBLE_ELIM's three sub-brackets
          alike; standings formats (round robin / Swiss) have no tree to draw. */}
      {!isStandingsFormat(data.format) && allMatches.length > 0 && (
        <div className="frame fd-card-m" style={{ padding: "20px 22px" }}>
          <div className="ptitle">Bracket</div>
          <div style={{ marginTop: 10 }}>
            <BracketView
              matches={allMatches}
              entries={data.entries}
              format={data.format}
              myEntryId={data.myEntry?.id}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default TournamentDetailPage;
