import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { useAppStore } from "../../stores/appStore";
import { useAuthStore } from "../../stores/authStore";
import { Avatar, CurrencyPill } from "../../components";
import { ICONS } from "../../lib/assets";
import { FORMAT_LABEL, STATUS_META, formatStartsAt, type TournamentDetail, type TournamentEntry } from "./types";

/**
 * TournamentDetailPage (/cups/:id) — one Cup's entry list + bracket.
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

function MatchSlot({
  label,
  entry,
  isWinner,
  bye,
}: {
  label: string;
  entry: TournamentEntry | null;
  isWinner: boolean;
  bye: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        borderRadius: 7,
        background: isWinner ? "rgba(47,143,91,.16)" : "rgba(0,0,0,.25)",
        border: `1px solid ${isWinner ? "rgba(63,191,111,.4)" : "rgba(232,184,75,.1)"}`,
      }}
    >
      {entry ? (
        <>
          <Avatar src={entry.user.avatarUrl ?? "champion"} size={22} ring={false} />
          <span
            style={{
              font: "700 12px Inter",
              color: isWinner ? "#7ee6a4" : "#f2e9d2",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {entry.user.username}
          </span>
        </>
      ) : (
        <span style={{ font: "600 12px Inter", color: "var(--ink2)", fontStyle: "italic" }}>{bye ? "BYE" : label}</span>
      )}
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

  const load = useCallback(async () => {
    if (!id) return;
    setLoadError(false);
    try {
      const t = await api.get<TournamentDetail>(`/api/tournaments/${id}`);
      setData(t);
    } catch (e) {
      setLoadError(true);
      if (!(e instanceof ApiError && e.status === 404)) {
        showToast("Couldn't load this Cup.");
      }
    }
  }, [id, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const entryById = useMemo(() => {
    const m = new Map<string, TournamentEntry>();
    for (const e of data?.entries ?? []) m.set(e.id, e);
    return m;
  }, [data]);

  const rounds = useMemo(() => {
    if (!data) return [];
    return Object.keys(data.bracket)
      .map(Number)
      .sort((a, b) => a - b);
  }, [data]);

  const onJoin = useCallback(async () => {
    if (!id) return;
    if (isGuest) {
      showToast("Sign in to join a Cup.");
      navigate(`/login?next=/cups/${id}`);
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
          <button type="button" className="btn btn-gold" onClick={() => navigate("/cups")} style={{ padding: "9px 20px" }}>
            Back to Cups
          </button>
        </div>
      </div>
    );
  }

  const status = STATUS_META[data.status];
  const full = data.registeredCount >= data.maxPlayers;
  const joined = !!data.myEntry;
  const canJoin = data.status === "OPEN" && !joined && !full;
  const canLeave = data.status === "OPEN" && joined;

  return (
    <div data-screen-label="Tournament Detail" className="fd-page-pad" style={{ maxWidth: 980, margin: "0 auto", padding: 26, display: "flex", flexDirection: "column", gap: 22 }}>
      <button
        type="button"
        className="fd-tap"
        onClick={() => navigate("/cups")}
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

      {/* BRACKET */}
      {rounds.length > 0 && (
        <div className="frame fd-card-m" style={{ padding: "20px 22px" }}>
          <div className="ptitle">Bracket</div>
          <div style={{ display: "flex", gap: 18, overflowX: "auto", paddingBottom: 8, marginTop: 6 }}>
            {rounds.map((round) => (
              <div key={round} style={{ flex: "none", minWidth: 220, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ font: "700 12px Inter", letterSpacing: ".5px", color: "var(--gold)", textAlign: "center" }}>
                  {round === rounds[rounds.length - 1] ? "Final" : `Round ${round}`}
                </div>
                {data.bracket[String(round)].map((m) => {
                  const red = m.redEntryId ? (entryById.get(m.redEntryId) ?? null) : null;
                  const blue = m.blueEntryId ? (entryById.get(m.blueEntryId) ?? null) : null;
                  const bye = (!!m.redEntryId && !m.blueEntryId) || (!m.redEntryId && !!m.blueEntryId);
                  return (
                    <div key={m.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <MatchSlot label="TBD" entry={red} isWinner={!!red && m.winnerEntryId === red.id} bye={bye && !red} />
                      <MatchSlot label="TBD" entry={blue} isWinner={!!blue && m.winnerEntryId === blue.id} bye={bye && !blue} />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default TournamentDetailPage;
