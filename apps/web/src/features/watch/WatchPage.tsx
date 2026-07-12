import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";

/**
 * WatchPage (/watch) — "✦ SPECTATE ✦ / Live Matches", reproduced from the
 * approved mockup section (data-screen-label="Watch Live").
 *
 * DATA: GET /api/matches/live → { items, liveCount }. Every field on a card is
 * real: both players + their live trophies, the mode the match is being played
 * in, and the running move count. `viewers` is the REAL spectator count tracked
 * server-side (never seeded/bumped) — 0 is shown like any other real count.
 *
 * Two kinds of items share the grid:
 *   • a plain live Match — "Watch →" navigates into the read-only spectator view
 *     at /play/online?spectate=<matchId>.
 *   • a synthetic open-room entry (`room: true`, id "room-<code>") — an active
 *     private room (live match, or a lobby with a guest already seated) that
 *     anyone can drop in on. "Watch →" navigates to /rooms?code=<code>&spectate=1
 *     instead, which resolves the room by code and joins as a spectator.
 * Both reuse the same card layout; only the click target differs.
 */

type LiveMatchMode = "AI" | "CASUAL" | "RANKED" | "PRIVATE" | "LOCAL" | "DAMATH";

type LivePlayer = {
  id: string;
  username: string;
  displayName: string;
  tag: string;
  avatarUrl: string | null;
  trophies: number;
} | null;

type LiveMatchItem = {
  id: string;
  mode: LiveMatchMode;
  red: LivePlayer;
  blue: LivePlayer;
  moveCount: number;
  startedAt: string;
  /** Real spectator count — always present now; 0 is a legitimate value. */
  viewers?: number;
  /** Present + true only for a synthetic open-room entry. */
  room?: boolean;
  /** Room code — only present when room is true; drives the /rooms navigation. */
  code?: string;
};

/** Mode → display tag + color. Only real MatchMode values — never an invented
 *  "TOURNAMENT"/"BLITZ" tag that doesn't exist in the data. */
const MODE_META: Record<LiveMatchMode, { label: string; color: string }> = {
  RANKED: { label: "RANKED", color: "#8fb3ff" },
  CASUAL: { label: "CASUAL", color: "#8ce0ad" },
  PRIVATE: { label: "PRIVATE", color: "var(--gold)" },
  AI: { label: "AI", color: "var(--ink2)" },
  LOCAL: { label: "LOCAL", color: "var(--ink2)" },
  DAMATH: { label: "DAMATH", color: "#f2a4d0" },
};

function playerName(p: LivePlayer): string {
  return p?.displayName || p?.username || "Player";
}

function LiveMatchCard({ m, onWatch }: { m: LiveMatchItem; onWatch: (m: LiveMatchItem) => void }) {
  const meta = MODE_META[m.mode] ?? { label: m.mode, color: "var(--ink2)" };
  return (
    <button
      onClick={() => onWatch(m)}
      className="frame"
      style={{
        textAlign: "left",
        padding: 18,
        cursor: "pointer",
        border: "1px solid rgba(232,184,75,.2)",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        background: "rgba(15,8,32,.4)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ font: "800 10px Inter", letterSpacing: ".6px", textTransform: "uppercase", color: meta.color }}>
            {meta.label}
          </span>
          {m.room && (
            <span style={{ font: "700 9px Inter", letterSpacing: ".4px", textTransform: "uppercase", color: "var(--gold)" }}>
              🔑 Room
            </span>
          )}
        </span>
        {/* Real spectator count — 0 is a legitimate value and is shown like any other. */}
        {typeof m.viewers === "number" && (
          <span style={{ font: "600 11px Inter", color: "var(--ink2)" }}>👁 {m.viewers.toLocaleString()}</span>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ textAlign: "center", flex: 1, minWidth: 0 }}>
          <div style={{ font: "800 15px Cinzel,serif", color: "#ff8fae", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {playerName(m.red)}
          </div>
          <div style={{ font: "600 11px 'JetBrains Mono',monospace", color: "var(--ink2)" }}>🏆 {(m.red?.trophies ?? 0).toLocaleString()}</div>
        </div>
        <div style={{ font: "800 13px Cinzel,serif", color: "var(--gold)" }}>VS</div>
        <div style={{ textAlign: "center", flex: 1, minWidth: 0 }}>
          <div style={{ font: "800 15px Cinzel,serif", color: "#8fb3ff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {playerName(m.blue)}
          </div>
          <div style={{ font: "600 11px 'JetBrains Mono',monospace", color: "var(--ink2)" }}>🏆 {(m.blue?.trophies ?? 0).toLocaleString()}</div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, paddingTop: 12, borderTop: "1px solid rgba(232,184,75,.12)" }}>
        <span style={{ font: "600 11px Inter", color: "var(--ink2)" }}>Move {m.moveCount}</span>
        <span style={{ font: "800 12px Inter", color: "var(--gold-lt)" }}>Watch →</span>
      </div>
    </button>
  );
}

export function WatchPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<LiveMatchItem[] | null>(null); // null = loading
  const [liveCount, setLiveCount] = useState(0);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const data = await api.get<{ items: LiveMatchItem[]; liveCount: number }>("/api/matches/live");
      setItems(data.items);
      setLiveCount(data.liveCount);
    } catch {
      setItems([]);
      setLiveCount(0);
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onWatch = useCallback(
    (m: LiveMatchItem) =>
      m.room && m.code
        ? navigate(`/rooms?code=${m.code}&spectate=1`)
        : navigate(`/play/online?spectate=${m.id}`),
    [navigate],
  );

  const loading = items === null;

  return (
    <div
      data-screen-label="Watch Live"
      className="fd-page-pad"
      style={{ maxWidth: 1180, margin: "0 auto", padding: 26, display: "flex", flexDirection: "column", gap: 22 }}
    >
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ font: "700 12px Inter", letterSpacing: 3, color: "var(--gold)" }}>✦ SPECTATE ✦</div>
          <h1 style={{ margin: "9px 0 5px", font: "800 clamp(26px,3.4vw,36px) Cinzel,serif", color: "var(--gold-lt)" }}>Live Matches</h1>
          <p style={{ margin: 0, maxWidth: 560, font: "400 14px Inter", color: "var(--ink)", lineHeight: 1.5 }}>
            Jump into any live game — watch top players, tournament clashes and casual duels unfold in real time.
          </p>
        </div>
        <span className="pill" style={{ color: "#ff8fae", whiteSpace: "nowrap" }}>🔴 {liveCount} live now</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(330px,1fr))", gap: 16 }}>
        {loading ? (
          <div style={{ gridColumn: "1/-1", padding: "34px 4px", textAlign: "center", font: "500 13px Inter", color: "var(--ink2)" }}>
            Loading live matches…
          </div>
        ) : loadError ? (
          <div style={{ gridColumn: "1/-1", padding: "34px 4px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <div style={{ font: "500 13px Inter", color: "var(--ink2)" }}>Couldn&rsquo;t load live matches — try again.</div>
            <button
              type="button"
              onClick={load}
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
        ) : items.length === 0 ? (
          <div style={{ gridColumn: "1/-1", padding: "34px 4px", textAlign: "center", font: "500 13px Inter", color: "var(--ink2)" }}>
            No live matches right now — check back soon, or jump into Play to start one yourself.
          </div>
        ) : (
          items.map((m) => <LiveMatchCard key={m.id} m={m} onWatch={onWatch} />)
        )}
      </div>
    </div>
  );
}

export default WatchPage;
