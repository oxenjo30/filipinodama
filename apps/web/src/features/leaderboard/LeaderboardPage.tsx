import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { RANK_TIERS, rankTierFor } from "@dama/shared";
import { Avatar } from "../../components";
import { api } from "../../lib/api";
import { useAuthStore } from "../../stores/authStore";

/**
 * LeaderboardPage — reproduced from the prototype's Leaderboard screen
 * (handoff/FilipinoDama Royal.dc.html, lines 770-886).
 *
 * FULLY LIVE-WIRED — no mock data, no fabricated ladder:
 *   GET /api/leaderboard?scope=global|friends|guild  → { rows, me }
 *       rows: real users (incl. seeded bots) ordered by trophies. Podium = top 3,
 *       table = the rest. Win-rate is computed from real wins/losses.
 *   GET /api/guilds                                   → Top Guilds rail (real)
 *   GET /api/season/current                           → season name + countdown
 *
 * "Your Rank" is the REAL logged-in user: if they appear in the current scope
 * (server returns `me`), we show their true rank/trophies/streak; otherwise we
 * show an HONEST unranked state — never a fabricated #37 / Top 1%.
 * Friends/Guild scopes with no roster render an honest empty state.
 *
 * PUBLIC by default: the GLOBAL ladder, Top Guilds rail and season timer are
 * shown to everyone, signed in or not. Only the identity-scoped surfaces —
 * the Friends/Guild tabs and the personal "Your Rank" / "Rank Progress" cards —
 * require sign-in, and prompt for it inline rather than gating the whole page.
 */

type TierInfo = { key: string; label: string; sub: string; accent: string; img: string };
type LbRow = {
  rank: number;
  userId: string;
  displayName: string;
  tag: string;
  avatarUrl: string | null;
  frameId: string | null;
  trophies: number;
  wins: number;
  losses: number;
  rankTier: TierInfo;
};
type LbResponse = { scope: string; season: string | null; rows: LbRow[]; me: LbRow | null };

type GuildRow = { id: string; name: string; tag: string; weeklyPoints: number; memberCount: number };
type SeasonInfo = { season: { id: string; name: string; startsAt: string; endsAt: string } };

const SB = (n: string) => `/assets/${n}`;

const SCOPES = [
  { key: "global", label: "Global" },
  { key: "friends", label: "Friends" },
  { key: "guild", label: "Guild" },
] as const;
type Scope = (typeof SCOPES)[number]["key"];

const GRID = "64px 1fr 96px 92px 96px";
const MEDALS = ["medal-1.png", "medal-2.png", "medal-3.png"];
const PODIUM_ACCENTS = ["#F5D783", "#c7d0dc", "#c98a5a"];

/** Win rate from real wins/losses; honest "—" when the player has no games. */
function winRate(wins: number, losses: number): string {
  const games = wins + losses;
  if (games === 0) return "—";
  return `${((wins / games) * 100).toFixed(1)}%`;
}

/** ms → "18d 04:12:33" countdown text. */
function countdown(ms: number): string {
  if (ms <= 0) return "Season ended";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d}d ${pad(h)}:${pad(m)}:${pad(sec)}`;
}

export function LeaderboardPage() {
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.me);

  const [scope, setScope] = useState<Scope>("global");
  const [data, setData] = useState<LbResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [guilds, setGuilds] = useState<GuildRow[] | null>(null);
  const [season, setSeason] = useState<SeasonInfo["season"] | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Live countdown tick (1s) — cosmetic; drives the season timer text only.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Friends/Guild ladders are identity-scoped; they need a signed-in user.
  const needsAuth = (scope === "friends" || scope === "guild") && !me;

  // Ladder for the active scope. Global is public; friends/guild need auth
  // (we skip the fetch when signed out and prompt for sign-in inline instead).
  useEffect(() => {
    if (needsAuth) {
      setData(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .get<LbResponse>(`/api/leaderboard?scope=${scope}`)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load the leaderboard. Try again shortly.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scope, me, needsAuth]);

  // Ambient rails (real): top guilds + current season. Public — fetched once
  // for everyone, signed in or not.
  useEffect(() => {
    let cancelled = false;
    api
      .get<{ guilds: GuildRow[] }>("/api/guilds")
      .then((r) => {
        if (!cancelled) setGuilds(r.guilds);
      })
      .catch(() => {
        if (!cancelled) setGuilds([]);
      });
    api
      .get<SeasonInfo>("/api/season/current")
      .then((r) => {
        if (!cancelled) setSeason(r.season);
      })
      .catch(() => {
        if (!cancelled) setSeason(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = data?.rows ?? [];
  const podium = rows.slice(0, 3);
  const tableRows = rows.slice(3);
  const youRow = data?.me ?? null;

  const seasonLabel = season?.name ?? "Season";
  const endsText = season
    ? `Season ends in: ${countdown(new Date(season.endsAt).getTime() - now)}`
    : "Season timing unavailable";

  // Live Climbers: the real top movers on the GLOBAL board (honest — no fake deltas).
  const [climbers, setClimbers] = useState<LbRow[]>([]);
  useEffect(() => {
    if (scope === "global" && rows.length) {
      setClimbers(rows.slice(0, 5));
      return;
    }
    let cancelled = false;
    api
      .get<LbResponse>("/api/leaderboard?scope=global")
      .then((r) => {
        if (!cancelled) setClimbers(r.rows.slice(0, 5));
      })
      .catch(() => {
        if (!cancelled) setClimbers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [scope, rows]);

  // Your-rank surfaces: real when placed, honest unranked otherwise.
  const myTier = me ? rankTierFor(me.trophies) : null;
  const nextTier = useMemo(() => {
    if (!me) return null;
    return RANK_TIERS.find((t) => t.min > me.trophies) ?? null;
  }, [me]);
  const rankProgress = useMemo(() => {
    if (!me || !myTier) return { cur: 0, max: 100, pct: 0 };
    if (!nextTier) return { cur: 100, max: 100, pct: 100 };
    const span = nextTier.min - myTier.min || 1;
    const into = me.trophies - myTier.min;
    return { cur: into, max: span, pct: Math.max(0, Math.min(100, (into / span) * 100)) };
  }, [me, myTier, nextTier]);

  return (
    <div className="fd-lb-grid" style={{ maxWidth: 1560, margin: "0 auto", padding: 26, display: "grid", gridTemplateColumns: "280px minmax(0,1fr) 300px", gap: 20, alignItems: "start" }}>
      {/* LEFT RAIL */}
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div className="frame" style={{ padding: 22, textAlign: "center" }}>
          <img src={SB("me-banner.png")} alt="" style={{ width: 110, height: 130, objectFit: "contain", margin: "0 auto", display: "block", filter: "drop-shadow(0 8px 18px rgba(0,0,0,.5))" }} />
          <div style={{ font: "800 22px Cinzel,serif", color: "var(--gold-lt)", marginTop: 10 }}>{seasonLabel}</div>
          <div style={{ font: "400 12px/1.5 Inter", color: "var(--ink)", margin: "8px 0 14px" }}>Conquer the board.<br />Earn glory. Be the legend.</div>
          <button className="btn btn-purple" onClick={() => navigate("/season")} style={{ width: "100%" }}>📖 Season Overview</button>
        </div>
        <div className="frame" style={{ padding: 20 }}>
          <div className="ptitle">Season Stats</div>
          {(() => {
            // Honest aggregates derived from live data we actually have.
            const global = scope === "global" ? rows : climbers;
            const stats = [
              { k: "Ranked Players", v: (scope === "global" ? rows.length : climbers.length).toLocaleString() },
              { k: "Top Rating", v: (global[0]?.trophies ?? 0).toLocaleString() },
              // Personal rows only when signed in — never imply "0" for anonymous visitors.
              ...(me
                ? [
                    { k: "Your Trophies", v: me.trophies.toLocaleString() },
                    { k: "Your Wins", v: me.wins.toLocaleString() },
                  ]
                : []),
              { k: "Days Left", v: season ? String(Math.max(0, Math.floor((new Date(season.endsAt).getTime() - now) / 86400000))) : "—" },
            ];
            return stats.map((st) => (
              <div key={st.k} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid rgba(232,184,75,.1)" }}>
                <span style={{ font: "500 13px Inter", color: "var(--ink)" }}>{st.k}</span>
                <span style={{ font: "700 14px 'JetBrains Mono',monospace", color: "var(--gold-lt)" }}>{st.v}</span>
              </div>
            ));
          })()}
        </div>
        <div className="frame" style={{ padding: 20 }}>
          <div className="ptitle">Top Guilds</div>
          {guilds === null ? (
            <div style={{ padding: "14px 0", font: "500 12px Inter", color: "var(--ink2)" }}>Loading…</div>
          ) : guilds.length === 0 ? (
            <div style={{ padding: "14px 0", font: "500 12px Inter", color: "var(--ink2)" }}>No guilds yet.</div>
          ) : (
            guilds.slice(0, 3).map((g, i) => (
              <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "9px 0", borderTop: "1px solid rgba(232,184,75,.1)" }}>
                <span style={{ font: "800 14px 'JetBrains Mono',monospace", color: "var(--gold)", width: 16 }}>{i + 1}</span>
                <span style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(232,184,75,.12)", border: "1px solid rgba(232,184,75,.3)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--gold-lt)" }}>🛡</span>
                <span style={{ flex: 1, font: "600 13px Inter" }}>{g.name}</span>
                <span style={{ font: "700 12px 'JetBrains Mono',monospace", color: "var(--gold)" }}>🏆 {g.weeklyPoints.toLocaleString()}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* CENTER */}
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ flex: 1, display: "flex", gap: 8, minWidth: 260 }}>
            {SCOPES.map((t) => {
              const active = scope === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setScope(t.key)}
                  style={{
                    padding: "9px 16px", borderRadius: 8, cursor: "pointer",
                    font: "700 12px Inter", letterSpacing: ".5px", textTransform: "uppercase",
                    border: active ? "1px solid rgba(232,184,75,.55)" : "1px solid rgba(232,184,75,.2)",
                    background: active ? "linear-gradient(180deg,#3d2a6b,#241640)" : "rgba(15,8,32,.5)",
                    color: active ? "var(--gold-lt)" : "var(--ink)",
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
          <span className="pill" style={{ color: "var(--gold-lt)", border: "1px solid rgba(232,184,75,.4)", background: "rgba(232,184,75,.08)" }}>{seasonLabel}</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, font: "600 12px Inter", color: "var(--ink)" }}>⏳ {endsText}</span>
        </div>

        {needsAuth ? (
          <div className="frame" style={{ padding: "44px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 34, marginBottom: 10 }}>{scope === "friends" ? "🤝" : "🛡"}</div>
            <div style={{ font: "700 16px Cinzel,serif", color: "var(--gold-lt)" }}>
              Sign in to see the {scope === "friends" ? "friends" : "guild"} ladder
            </div>
            <div style={{ font: "400 13px Inter", color: "var(--ink)", margin: "8px 0 18px" }}>
              The Global ladder is open to everyone — sign in to compare against your{" "}
              {scope === "friends" ? "friends" : "guild"}.
            </div>
            <button className="btn btn-purple" onClick={() => navigate("/login")}>
              Sign In
            </button>
          </div>
        ) : loading ? (
          <div className="frame" style={{ padding: "44px 20px", textAlign: "center", color: "var(--ink2)", font: "600 14px Inter" }}>Loading the ladder…</div>
        ) : error ? (
          <div className="frame" style={{ padding: "44px 20px", textAlign: "center" }}>
            <div style={{ font: "700 15px Inter", color: "#ff9aa6" }}>{error}</div>
          </div>
        ) : rows.length === 0 ? (
          <div className="frame" style={{ padding: "44px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 34, marginBottom: 10 }}>{scope === "friends" ? "🤝" : scope === "guild" ? "🛡" : "🏆"}</div>
            <div style={{ font: "700 16px Cinzel,serif", color: "var(--gold-lt)" }}>
              {scope === "friends" ? "No friends on the ladder yet" : scope === "guild" ? "You're not in a guild yet" : "No ranked players yet"}
            </div>
            <div style={{ font: "400 13px Inter", color: "var(--ink)", margin: "8px 0 18px" }}>
              {scope === "friends" ? "Add friends to see how you stack up against them." : scope === "guild" ? "Join or create a guild to see the guild ladder." : "Be the first to climb the board."}
            </div>
            {scope !== "global" && (
              <button className="btn btn-purple" onClick={() => navigate(scope === "friends" ? "/friends" : "/guilds")}>
                {scope === "friends" ? "Find Friends" : "Browse Guilds"}
              </button>
            )}
          </div>
        ) : (
          <>
            {/* PODIUM */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, marginTop: 58, alignItems: "start" }}>
              {/* prototype order: 2nd, 1st, 3rd */}
              {[podium[1], podium[0], podium[2]].map((p, idx) => {
                if (!p) return <div key={`empty-${idx}`} />;
                const first = p.rank === 1;
                const accent = PODIUM_ACCENTS[p.rank - 1] ?? "#F5D783";
                return (
                  <div key={p.userId} className="frame" style={{ position: "relative", padding: "20px 16px", textAlign: "center", borderColor: accent, paddingTop: first ? 34 : 24, marginTop: first ? -44 : 0, overflow: "visible" }}>
                    <img src={SB(MEDALS[p.rank - 1] ?? "medal-3.png")} alt="" style={{ position: "absolute", top: -26, left: "50%", transform: "translateX(-50%)", width: first ? 58 : 48, height: first ? 58 : 48, objectFit: "contain", filter: "drop-shadow(0 6px 14px rgba(0,0,0,.5))", zIndex: 2 }} />
                    <Avatar src={p.avatarUrl ?? "champion"} frame={p.frameId ?? undefined} size={first ? 84 : 70} style={{ margin: "6px auto 0" }} />
                    <div style={{ font: "700 17px Cinzel,serif", color: "var(--gold-lt)", marginTop: 9 }}>{p.displayName}</div>
                    <div style={{ font: "500 12px Inter", color: "var(--ink)", marginTop: 2 }}>{p.rankTier.label}</div>
                    <div style={{ font: "700 16px 'JetBrains Mono',monospace", color: "var(--gold)", marginTop: 7 }}>🏆 {p.trophies.toLocaleString()}</div>
                  </div>
                );
              })}
            </div>

            {/* TABLE */}
            <div className="frame" style={{ padding: "10px 6px" }}>
              <div style={{ display: "grid", gridTemplateColumns: GRID, gap: 8, padding: "12px 16px", font: "700 11px Inter", letterSpacing: "1px", textTransform: "uppercase", color: "var(--ink2)" }}>
                <span>Rank</span><span>Player</span><span style={{ textAlign: "center" }}>🏆 Rating</span><span style={{ textAlign: "center" }}>Win Rate</span><span style={{ textAlign: "center" }}>Games</span>
              </div>
              {tableRows.length === 0 ? (
                <div style={{ padding: "16px", font: "500 13px Inter", color: "var(--ink2)", borderTop: "1px solid rgba(232,184,75,.1)" }}>Only the podium so far — more challengers coming.</div>
              ) : (
                tableRows.map((r) => {
                  const isYou = r.userId === me?.id;
                  return (
                    <div key={r.userId} style={{ display: "grid", gridTemplateColumns: GRID, gap: 8, alignItems: "center", padding: "11px 16px", borderTop: "1px solid rgba(232,184,75,.1)", background: isYou ? "rgba(232,184,75,.06)" : undefined }}>
                      <span style={{ font: "800 15px 'JetBrains Mono',monospace", color: "var(--ink)" }}>{r.rank}</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 11 }}>
                        <Avatar src={r.avatarUrl ?? "strategist"} frame={r.frameId ?? undefined} size={34} />
                        <span>
                          <span style={{ font: "600 14px Inter", display: "block" }}>{r.displayName}{isYou && <span style={{ color: "var(--gold)", fontWeight: 600 }}> (You)</span>}</span>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 4, padding: "2px 8px", borderRadius: 100, border: "1px solid rgba(232,184,75,.2)", background: "rgba(15,8,32,.5)" }}>
                            <span style={{ width: 9, height: 9, borderRadius: "50%", background: `radial-gradient(circle at 35% 30%,${r.rankTier.accent},rgba(0,0,0,.6))`, border: `1px solid ${r.rankTier.accent}` }} />
                            <span style={{ font: "600 10px Inter", color: r.rankTier.accent }}>{r.rankTier.label}</span>
                          </span>
                        </span>
                      </span>
                      <span style={{ textAlign: "center", font: "700 14px 'JetBrains Mono',monospace", color: "var(--gold-lt)" }}>{r.trophies.toLocaleString()}</span>
                      <span style={{ textAlign: "center", font: "600 13px 'JetBrains Mono',monospace", color: "var(--ink)" }}>{winRate(r.wins, r.losses)}</span>
                      <span style={{ textAlign: "center", font: "600 13px 'JetBrains Mono',monospace", color: "var(--ink)" }}>{(r.wins + r.losses).toLocaleString()}</span>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}

        {/* YOUR RANK — real when placed, honest unranked otherwise */}
        {me && (
          <div className="frame" style={{ padding: "4px 6px", borderColor: "var(--gold)", boxShadow: "inset 0 0 0 4px rgba(15,8,32,.55),inset 0 0 0 5px rgba(232,184,75,.4),0 0 26px rgba(232,184,75,.2)" }}>
            <div style={{ display: "grid", gridTemplateColumns: GRID, gap: 8, alignItems: "center", padding: "14px 16px" }}>
              <span style={{ font: "800 15px 'JetBrains Mono',monospace", color: "var(--gold-lt)" }}>{youRow ? youRow.rank : "—"}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 11 }}>
                <Avatar src={me.avatarUrl ?? "champion"} frame={me.frameId ?? undefined} size={34} />
                <span>
                  <span style={{ font: "700 14px Inter", display: "block" }}>
                    {me.displayName} <span style={{ color: "var(--gold)", fontWeight: 600 }}>(You)</span>
                  </span>
                  {youRow ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 4, padding: "2px 8px", borderRadius: 100, border: "1px solid rgba(232,184,75,.28)", background: "rgba(15,8,32,.5)" }}>
                      <span style={{ width: 9, height: 9, borderRadius: "50%", background: `radial-gradient(circle at 35% 30%,${youRow.rankTier.accent},rgba(0,0,0,.6))`, border: `1px solid ${youRow.rankTier.accent}` }} />
                      <span style={{ font: "600 10px Inter", color: youRow.rankTier.accent }}>{youRow.rankTier.label}</span>
                    </span>
                  ) : (
                    <span style={{ font: "500 11px Inter", color: "var(--ink2)", marginTop: 3, display: "block" }}>
                      {scope === "global" ? "Unranked — play ranked matches to earn a spot" : scope === "friends" ? "Not on the friends ladder yet" : "Join a guild to appear here"}
                    </span>
                  )}
                </span>
              </span>
              <span style={{ textAlign: "center", font: "700 14px 'JetBrains Mono',monospace", color: youRow ? "var(--gold-lt)" : "var(--ink2)" }}>{youRow ? `🏆 ${youRow.trophies.toLocaleString()}` : "—"}</span>
              <span style={{ textAlign: "center", font: "600 13px 'JetBrains Mono',monospace", color: "var(--ink)" }}>{youRow ? winRate(youRow.wins, youRow.losses) : "—"}</span>
              <span style={{ textAlign: "center", font: "600 13px Inter", color: me.streak > 0 ? "#ff9a5a" : "var(--ink2)" }}>{me.streak > 0 ? `🔥 ${me.streak}` : "—"}</span>
            </div>
          </div>
        )}
      </div>

      {/* RIGHT RAIL */}
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div className="frame" style={{ padding: 22, textAlign: "center" }}>
          <div className="ptitle">Your Rank</div>
          {!me ? (
            <>
              <img src={SB("medal-3.png")} alt="" style={{ width: 72, height: 72, objectFit: "contain", margin: "0 auto", display: "block", opacity: 0.5, filter: "grayscale(.6)" }} />
              <div style={{ font: "800 22px 'JetBrains Mono',monospace", color: "var(--ink2)", marginTop: 6 }}>Sign in</div>
              <div style={{ font: "600 12px Inter", color: "var(--ink2)" }}>Sign in to track your standing</div>
              <button className="btn btn-purple" onClick={() => navigate("/login")} style={{ width: "100%", marginTop: 14 }}>Sign In</button>
            </>
          ) : youRow ? (
            <>
              <img src={SB(MEDALS[Math.min(youRow.rank, 3) - 1] ?? "medal-3.png")} alt="" style={{ width: 72, height: 72, objectFit: "contain", margin: "0 auto", display: "block" }} />
              <div style={{ font: "800 34px 'JetBrains Mono',monospace", color: "var(--gold-lt)", marginTop: 6 }}>#{youRow.rank}</div>
              <div style={{ font: "600 12px Inter", color: "var(--gold)" }}>{youRow.rankTier.label}</div>
              <div style={{ font: "700 15px 'JetBrains Mono',monospace", color: "var(--gold)", marginTop: 8 }}>🏆 {youRow.trophies.toLocaleString()}</div>
            </>
          ) : (
            <>
              <img src={SB("medal-3.png")} alt="" style={{ width: 72, height: 72, objectFit: "contain", margin: "0 auto", display: "block", opacity: 0.5, filter: "grayscale(.6)" }} />
              <div style={{ font: "800 22px 'JetBrains Mono',monospace", color: "var(--ink2)", marginTop: 6 }}>Unranked</div>
              <div style={{ font: "600 12px Inter", color: "var(--ink2)" }}>Play ranked to get placed</div>
              <button className="btn btn-red" onClick={() => navigate(me && !me.isGuest ? "/play/online?mode=ranked" : "/login?next=/play/online?mode=ranked")} style={{ width: "100%", marginTop: 14 }}>Play Ranked</button>
            </>
          )}
        </div>
        {me && (
          <div className="frame" style={{ padding: 20 }}>
            <div className="ptitle">Rank Progress</div>
            <div style={{ height: 14, borderRadius: 100, background: "rgba(0,0,0,.4)", border: "1px solid rgba(232,184,75,.25)", overflow: "hidden" }}>
              <div style={{ width: `${rankProgress.pct}%`, height: "100%", background: "linear-gradient(90deg,#c99a2e,#f5d88a)" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 7 }}>
              <span style={{ font: "700 12px 'JetBrains Mono',monospace", color: "var(--ink)" }}>{rankProgress.cur} / {rankProgress.max}</span>
              <span style={{ font: "500 11px Inter", color: "var(--ink2)" }}>{nextTier ? `To ${nextTier.label}` : "Max tier reached"}</span>
            </div>
          </div>
        )}
        <div className="frame" style={{ padding: 20 }}>
          <div className="ptitle">Live Climbers</div>
          {climbers.length === 0 ? (
            <div style={{ padding: "14px 0", font: "500 12px Inter", color: "var(--ink2)" }}>No climbers yet.</div>
          ) : (
            climbers.map((c) => (
              <div key={c.userId} style={{ display: "flex", alignItems: "center", gap: 11, padding: "9px 0", borderTop: "1px solid rgba(232,184,75,.1)" }}>
                <span style={{ font: "800 13px 'JetBrains Mono',monospace", color: "var(--ink2)", width: 14 }}>{c.rank}</span>
                <Avatar src={c.avatarUrl ?? "strategist"} frame={c.frameId ?? undefined} size={30} />
                <span style={{ flex: 1, font: "600 13px Inter" }}>{c.displayName}</span>
                <span style={{ font: "700 12px 'JetBrains Mono',monospace", color: "var(--gold)" }}>🏆 {c.trophies.toLocaleString()}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default LeaderboardPage;
