import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { useAppStore } from "../../stores/appStore";
import { useAuthStore } from "../../stores/authStore";
import { CurrencyPill } from "../../components";
import { ICONS } from "../../lib/assets";
import { FORMAT_LABEL, STATUS_META, formatStartsAt, type TournamentListItem } from "./types";

/**
 * TournamentsPage (/cups) — the player-facing list of Cups (tournaments).
 *
 * DATA: GET /api/tournaments (default OPEN+RUNNING) → { items }. Each item
 * already carries `joined` (whether the signed-in user has an entry) and
 * `registered`/`maxPlayers` for capacity — nothing here is fabricated.
 *
 * Join → POST /api/tournaments/:id/join, Leave → POST /api/tournaments/:id/leave
 * (leave only valid while OPEN — the server enforces this; we just hide the
 * button once RUNNING). Guests are blocked server-side (403 GUEST_CANNOT_JOIN)
 * but we also gate the button client-side and prompt sign-in, matching how
 * OnlineMatchPage/HomePage gate Ranked play for guests.
 *
 * Gold-only: entry fee + prize pool are always Gold — never Diamonds here.
 */

function CupErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div style={{ padding: "34px 4px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      <div style={{ font: "500 13px Inter", color: "var(--ink2)" }}>Couldn&rsquo;t load Cups — try again.</div>
      <button
        type="button"
        onClick={onRetry}
        style={{
          padding: "9px 20px",
          borderRadius: 9,
          font: "800 12px Inter",
          letterSpacing: ".4px",
          border: "1px solid var(--gold)",
          background: "linear-gradient(180deg,#f0c24b,#c98b2e)",
          color: "#2a1607",
          cursor: "pointer",
        }}
      >
        Retry
      </button>
    </div>
  );
}

function CupCard({
  t,
  busy,
  isGuest,
  onJoin,
  onLeave,
  onOpen,
}: {
  t: TournamentListItem;
  busy: boolean;
  isGuest: boolean;
  onJoin: (id: string) => void;
  onLeave: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const status = STATUS_META[t.status];
  const full = t.registered >= t.maxPlayers;
  const canJoin = t.status === "OPEN" && !t.joined && !full;
  const canLeave = t.status === "OPEN" && t.joined;

  let actionLabel = "";
  let actionDisabled = true;
  let onAction: (() => void) | null = null;
  if (t.joined && t.status === "RUNNING") {
    actionLabel = "In Progress";
  } else if (canLeave) {
    actionLabel = busy ? "…" : "Leave Cup";
    actionDisabled = busy;
    onAction = () => onLeave(t.id);
  } else if (isGuest && t.status === "OPEN" && !full) {
    actionLabel = "Sign In to Join";
    actionDisabled = false;
    onAction = () => onJoin(t.id);
  } else if (canJoin) {
    actionLabel = busy ? "…" : "Join Cup";
    actionDisabled = busy;
    onAction = () => onJoin(t.id);
  } else if (full && t.status === "OPEN") {
    actionLabel = "Full";
  } else if (t.status === "RUNNING") {
    actionLabel = "Live";
  } else {
    actionLabel = "Closed";
  }

  return (
    <div className="frame" style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div
            onClick={() => onOpen(t.id)}
            style={{ font: "800 18px Cinzel,serif", color: "var(--gold-lt)", cursor: "pointer", overflowWrap: "anywhere" }}
          >
            {t.name}
          </div>
          <div style={{ font: "600 12px Inter", color: "var(--ink2)", marginTop: 3 }}>
            {FORMAT_LABEL[t.format]} · Starts {formatStartsAt(t.startsAt)}
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
            whiteSpace: "nowrap",
          }}
        >
          {status.label}
        </span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <CurrencyPill kind="gold" value={t.entryFeeGold} title="Entry fee" />
        <CurrencyPill kind="gold" value={t.prizePoolGold} iconSize={18} title="Prize pool" style={{ color: "#f2d493" }} />
        <span className="pill" style={{ color: "var(--ink)" }}>
          {t.registered}/{t.maxPlayers} players
        </span>
        {t.minTrophies > 0 && (
          <span className="pill" style={{ color: "var(--ink)" }}>
            <img src={ICONS.trophy} alt="" width={16} height={16} style={{ display: "block", objectFit: "contain" }} />
            {t.minTrophies.toLocaleString()}+ required
          </span>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 2 }}>
        <button
          type="button"
          className="fd-tap"
          onClick={() => onOpen(t.id)}
          style={{ background: "none", border: "none", padding: 0, color: "var(--gold)", font: "700 11px Inter", letterSpacing: ".6px", textTransform: "uppercase", cursor: "pointer" }}
        >
          View Bracket →
        </button>
        <button
          type="button"
          disabled={actionDisabled}
          onClick={() => onAction?.()}
          style={{
            flex: "none",
            padding: "9px 18px",
            borderRadius: 9,
            font: "800 12px Inter",
            letterSpacing: ".4px",
            whiteSpace: "nowrap",
            border: canLeave ? "1px solid rgba(168,55,68,.5)" : "1px solid var(--gold)",
            background: actionDisabled
              ? "rgba(15,8,32,.5)"
              : canLeave
                ? "rgba(168,55,68,.16)"
                : "linear-gradient(180deg,#f0c24b,#c98b2e)",
            color: actionDisabled ? "var(--ink2)" : canLeave ? "#ff9aa8" : "#2a1607",
            cursor: actionDisabled ? "default" : "pointer",
          }}
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
}

export function TournamentsPage() {
  const me = useAuthStore((s) => s.me);
  const showToast = useAppStore((s) => s.showToast);
  const navigate = useNavigate();
  const isGuest = !me || me.isGuest;

  const [items, setItems] = useState<TournamentListItem[] | null>(null); // null = loading
  const [loadError, setLoadError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const data = await api.get<{ items: TournamentListItem[] }>("/api/tournaments");
      setItems(data.items);
    } catch {
      setItems([]);
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onJoin = useCallback(
    async (id: string) => {
      if (isGuest) {
        showToast("Sign in to join a Cup.");
        navigate(`/login?next=/cups`);
        return;
      }
      setBusyId(id);
      try {
        await api.post(`/api/tournaments/${id}/join`);
        showToast("Joined the Cup!");
        await load();
      } catch (e) {
        showToast(e instanceof ApiError ? e.message : "Couldn't join this Cup.");
      } finally {
        setBusyId(null);
      }
    },
    [isGuest, showToast, navigate, load],
  );

  const onLeave = useCallback(
    async (id: string) => {
      setBusyId(id);
      try {
        await api.post(`/api/tournaments/${id}/leave`);
        showToast("Left the Cup.");
        await load();
      } catch (e) {
        showToast(e instanceof ApiError ? e.message : "Couldn't leave this Cup.");
      } finally {
        setBusyId(null);
      }
    },
    [showToast, load],
  );

  const onOpen = useCallback((id: string) => navigate(`/cups/${id}`), [navigate]);

  const loading = items === null;
  const openCups = items?.filter((t) => t.status === "OPEN") ?? [];
  const liveCups = items?.filter((t) => t.status === "RUNNING") ?? [];

  return (
    <div
      data-screen-label="Tournaments"
      className="fd-page-pad"
      style={{ maxWidth: 980, margin: "0 auto", padding: 26, display: "flex", flexDirection: "column", gap: 22 }}
    >
      <div>
        <div style={{ font: "700 12px Inter", letterSpacing: 3, color: "var(--gold)" }}>✦ COMPETE ✦</div>
        <h1 style={{ margin: "9px 0 5px", font: "800 clamp(26px,3.4vw,36px) Cinzel,serif", color: "var(--gold-lt)" }}>Cups</h1>
        <p style={{ margin: 0, maxWidth: 560, font: "400 14px Inter", color: "var(--ink)", lineHeight: 1.5 }}>
          {isGuest
            ? "Sign in to enter Cups — bracket tournaments with a Gold entry fee and a Gold prize pool."
            : "Enter bracket tournaments for a shot at the Gold prize pool. Registration closes once a Cup starts."}
        </p>
      </div>

      {/* LIVE */}
      <div className="frame fd-card-m" style={{ padding: "22px 22px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
          <span style={{ font: "800 19px Cinzel,serif", color: "var(--gold-lt)" }}>Live Cups</span>
          <span style={{ font: "700 12px Inter", color: "var(--ink2)" }}>{liveCups.length} running</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {loading ? (
            <div style={{ padding: "22px 4px", textAlign: "center", font: "500 13px Inter", color: "var(--ink2)" }}>Loading Cups…</div>
          ) : loadError ? (
            <CupErrorState onRetry={load} />
          ) : liveCups.length === 0 ? (
            <div style={{ padding: "22px 4px", textAlign: "center", font: "500 13px Inter", color: "var(--ink2)" }}>
              No cups running right now.
            </div>
          ) : (
            liveCups.map((t) => (
              <CupCard key={t.id} t={t} busy={busyId === t.id} isGuest={isGuest} onJoin={onJoin} onLeave={onLeave} onOpen={onOpen} />
            ))
          )}
        </div>
      </div>

      {/* OPEN */}
      <div className="frame fd-card-m" style={{ padding: "22px 22px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
          <span style={{ font: "800 19px Cinzel,serif", color: "var(--gold-lt)" }}>Open Registration</span>
          <span style={{ font: "700 12px Inter", color: "var(--ink2)" }}>{openCups.length} open</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {loading ? (
            <div style={{ padding: "22px 4px", textAlign: "center", font: "500 13px Inter", color: "var(--ink2)" }}>Loading Cups…</div>
          ) : loadError ? (
            <CupErrorState onRetry={load} />
          ) : openCups.length === 0 ? (
            <div style={{ padding: "22px 4px", textAlign: "center", font: "500 13px Inter", color: "var(--ink2)" }}>
              No cups running right now — check back soon.
            </div>
          ) : (
            openCups.map((t) => (
              <CupCard key={t.id} t={t} busy={busyId === t.id} isGuest={isGuest} onJoin={onJoin} onLeave={onLeave} onOpen={onOpen} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default TournamentsPage;
