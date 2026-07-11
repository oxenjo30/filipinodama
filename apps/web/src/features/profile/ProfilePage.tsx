import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { RANK_TIERS, rankTierFor, type RankTier } from "@dama/shared";
import { api, ApiError } from "../../lib/api";
import { Avatar } from "../../components";
import { useAuthStore } from "../../stores/authStore";
import { AvatarPickerModal } from "./AvatarPickerModal";
import { EditProfileModal } from "./EditProfileModal";
import { ReplayModal } from "./ReplayModal";
import AchievementsGrid from "./AchievementsGrid";

/**
 * ProfilePage — /profile
 *
 * Faithful port of the prototype Profile screen (lines 1359-1472), fully wired to
 * LIVE data. There is NO mock/placeholder user data:
 *   • Identity + all per-user stats come from useAuthStore().me (real account —
 *     zero for a brand-new user). Logged out ⇒ sign-in prompt, never fake data.
 *   • Rank ladder is RANK_TIERS from @dama/shared; current tier via rankTierFor().
 *   • Trophy History  → GET /api/users/me/ledger?currency=TROPHIES.
 *   • Match History   → GET /api/matches?userId=<me>&result=<filter>.
 *   • Edit Profile    → EditProfileModal → PATCH /api/users/me { displayName, bio }.
 * Each async section shows an honest loading state while pending and an honest
 * empty state when there is nothing to show.
 */

// ── live DTO shapes (mirror the server serializers) ──
type MatchPlayer = {
  id: string;
  username: string;
  displayName: string;
  tag: string;
  avatarUrl: string | null;
  rankTier: string;
  trophies: number;
} | null;

type MatchRow = {
  id: string;
  mode: "AI" | "CASUAL" | "RANKED" | "PRIVATE" | "LOCAL";
  winner: "red" | "blue" | "draw" | null;
  reason: string | null;
  red: MatchPlayer;
  blue: MatchPlayer;
  redId?: string;
  blueId?: string;
  redTrophyDelta: number | null;
  blueTrophyDelta: number | null;
  goldReward: number | null;
  redCaptures: number;
  blueCaptures: number;
  moveCount: number;
  startedAt: string;
  endedAt: string | null;
};

type LedgerRow = {
  id: string;
  currency: "GOLD" | "DIAMONDS" | "TROPHIES";
  amount: number;
  balance: number;
  reason: string | null;
  refType: string | null;
  refId: string | null;
  createdAt: string;
};

const MODE_LABEL: Record<string, string> = {
  AI: "vs AI",
  CASUAL: "Casual",
  RANKED: "Ranked",
  PRIVATE: "Private",
  LOCAL: "Local",
};

type HistoryFilter = "all" | "win" | "loss" | "RANKED" | "CASUAL" | "AI";
const HISTORY_FILTERS: { key: HistoryFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "win", label: "Wins" },
  { key: "loss", label: "Losses" },
  { key: "RANKED", label: "Ranked" },
  { key: "CASUAL", label: "Casual" },
  { key: "AI", label: "AI" },
];
const MODE_FILTERS: HistoryFilter[] = ["RANKED", "CASUAL", "AI"];

/** Human "x ago" from an ISO timestamp. */
function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

/** Match duration between started/ended timestamps. */
function duration(startedAt: string, endedAt: string | null): string {
  if (!endedAt) return "—";
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  if (Number.isNaN(ms) || ms <= 0) return "—";
  const s = Math.floor(ms / 1000);
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${ss.toString().padStart(2, "0")}`;
}


export function ProfilePage() {
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.me);
  const ready = useAuthStore((s) => s.ready);

  const [tab, setTab] = useState<"overview" | "history">("overview");

  // ── Avatar picker (grid modal → PATCH /api/users/me { avatarUrl }) ──
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);

  // ── Edit Profile (modal → PATCH /api/users/me { displayName, bio }) ──
  const [editOpen, setEditOpen] = useState(false);

  // Open the Edit Profile modal when arriving via ?edit=1 (account menu "Edit Profile").
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("edit") === "1") setEditOpen(true);
  }, []);

  // ── Trophy History (live ledger) ──
  const [trophyRows, setTrophyRows] = useState<LedgerRow[] | null>(null);
  const [trophyErr, setTrophyErr] = useState<string | null>(null);

  // ── Match History (live matches) ──
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const [matches, setMatches] = useState<MatchRow[] | null>(null);
  const [matchErr, setMatchErr] = useState<string | null>(null);

  // ── Match Replay (row → GET /api/matches/:id → engine replay) ──
  const [replayId, setReplayId] = useState<string | null>(null);

  const meId = me?.id ?? null;

  // Trophy ledger — fetch once we have a session (Overview tab).
  useEffect(() => {
    if (!meId) {
      setTrophyRows(null);
      return;
    }
    let cancelled = false;
    setTrophyRows(null);
    setTrophyErr(null);
    api
      .get<{ items: LedgerRow[]; nextCursor: string | null }>("/api/users/me/ledger?currency=TROPHIES")
      .then((res) => {
        if (!cancelled) setTrophyRows(res.items);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setTrophyRows([]);
          setTrophyErr(e instanceof ApiError ? e.message : "Could not load trophy history.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [meId]);

  // Match history — refetch on filter change (History tab).
  useEffect(() => {
    if (!meId) {
      setMatches(null);
      return;
    }
    let cancelled = false;
    setMatches(null);
    setMatchErr(null);
    const params = new URLSearchParams({ userId: meId });
    if (historyFilter === "win" || historyFilter === "loss") {
      params.set("result", historyFilter);
    } else if (MODE_FILTERS.includes(historyFilter)) {
      params.set("mode", historyFilter);
    }
    api
      .get<{ items: MatchRow[]; nextCursor: string | null }>(`/api/matches?${params.toString()}`)
      .then((res) => {
        if (!cancelled) setMatches(res.items);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setMatches([]);
          setMatchErr(e instanceof ApiError ? e.message : "Could not load match history.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [meId, historyFilter]);

  const tabStyle = (active: boolean): React.CSSProperties => ({
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: "12px 18px",
    font: "700 13px Inter",
    letterSpacing: "1.2px",
    textTransform: "uppercase",
    color: active ? "var(--gold-lt)" : "var(--ink2)",
    borderBottom: active ? "2px solid var(--gold)" : "2px solid transparent",
    marginBottom: "-1px",
  });

  // ── logged-out / loading guards (never fake a user) ──
  if (!ready) {
    return (
      <div style={{ maxWidth: 900, margin: "0 auto", padding: 26, textAlign: "center", color: "var(--ink2)", font: "500 14px Inter" }}>
        Loading your profile…
      </div>
    );
  }
  if (!me) {
    return (
      <div style={{ maxWidth: 900, margin: "0 auto", padding: 26 }}>
        <div className="frame" style={{ padding: 40, textAlign: "center", display: "flex", flexDirection: "column", gap: 16, alignItems: "center" }}>
          <div className="ptitle" style={{ marginBottom: 0 }}>Sign in to view your profile</div>
          <div style={{ color: "var(--ink2)", font: "500 13px/1.6 Inter", maxWidth: 420 }}>
            Your rank, trophies, match history and achievements live on your account.
          </div>
          <button className="btn btn-gold" onClick={() => navigate("/login")} style={{ padding: "12px 26px" }}>
            Sign In
          </button>
        </div>
      </div>
    );
  }

  // ── real identity + stats (zero when the account is genuinely at zero) ──
  const displayName = me.displayName;
  const playerTag = me.tag;
  const trophies = me.trophies;
  const wins = me.wins;
  const losses = me.losses;
  const draws = me.draws;
  const total = wins + losses + draws;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

  const STATS: { k: string; v: string; c: string }[] = [
    { k: "Matches", v: total.toLocaleString(), c: "#efe7fb" },
    { k: "Wins", v: wins.toLocaleString(), c: "var(--green)" },
    { k: "Losses", v: losses.toLocaleString(), c: "var(--red)" },
    { k: "Win Rate", v: `${winRate}%`, c: "var(--gold-lt)" },
  ];

  // Favorite faction — client preference mirrored from the prototype's localStorage.
  const favFaction: "Red" | "Blue" | null = (() => {
    try {
      const raw = localStorage.getItem("fdr.profile");
      if (!raw) return null;
      const p = JSON.parse(raw) as { favFaction?: unknown };
      return p?.favFaction === "Red" || p?.favFaction === "Blue" ? p.favFaction : null;
    } catch {
      return null;
    }
  })();

  // ── rank ladder from shared RANK_TIERS + progress from trophy balance ──
  const tierNow = rankTierFor(trophies);
  const curIdx = RANK_TIERS.findIndex((t) => t.key === tierNow.key);
  const nextTier: RankTier | undefined = RANK_TIERS[curIdx + 1];
  const span = nextTier ? nextTier.min - tierNow.min : 1;
  const into = trophies - tierNow.min;
  const pct = nextTier ? Math.max(0, Math.min(100, Math.round((into / span) * 100))) : 100;
  const toNextLabel = nextTier ? `${Math.max(0, nextTier.min - trophies)} trophies to next tier` : "Top tier reached";

  return (
    <div className="fd-page-pad" style={{ maxWidth: 900, margin: "0 auto", padding: 26, display: "flex", flexDirection: "column", gap: 20 }}>
      {/* ── avatar picker (grid modal → PATCH /api/users/me) ── */}
      <AvatarPickerModal open={avatarPickerOpen} onClose={() => setAvatarPickerOpen(false)} />

      {/* ── edit profile (modal → PATCH /api/users/me { displayName, bio }) ── */}
      <EditProfileModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onChangeAvatar={() => setAvatarPickerOpen(true)}
      />

      {/* ── match replay (row → GET /api/matches/:id → engine replay) ── */}
      <ReplayModal matchId={replayId} meId={me.id} onClose={() => setReplayId(null)} />

      {/* ── identity header ── */}
      <div className="frame fd-card-m" style={{ padding: 28, display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "none" }}>
          <Avatar src={me.avatarUrl ?? "champion"} frame={me.frameId ?? undefined} size={92} alt={displayName} />
          <button
            onClick={() => setAvatarPickerOpen(true)}
            title="Change avatar"
            style={{
              position: "absolute",
              right: -2,
              bottom: -2,
              width: 36,
              height: 36,
              borderRadius: "50%",
              border: "2px solid #1e1134",
              background: "linear-gradient(180deg,#f7e2a0,#d5a63a)",
              color: "#1a0f2e",
              cursor: "pointer",
              fontSize: 15,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 4px 12px rgba(0,0,0,.5)",
            }}
          >
            ✎
          </button>
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1 style={{ margin: 0, font: "800 clamp(22px,6vw,30px) Cinzel,serif", color: "var(--gold-lt)", wordBreak: "break-word" }}>
            {displayName}{" "}
            <span style={{ font: "800 18px 'JetBrains Mono',monospace", color: "var(--ink2)", verticalAlign: "middle" }}>
              {playerTag}
            </span>
          </h1>
          <div style={{ font: "600 13px Inter", color: "var(--gold)", margin: "4px 0 12px" }}>
            {tierNow.label} · 🏆 {trophies.toLocaleString()}
          </div>
          {favFaction &&
            (() => {
              const red = favFaction === "Red";
              return (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 14px",
                    borderRadius: 100,
                    border: `1px solid ${red ? "rgba(180,60,70,.4)" : "rgba(60,110,190,.45)"}`,
                    background: red ? "rgba(160,48,58,.14)" : "rgba(48,90,170,.16)",
                    font: "600 13px Inter",
                    color: red ? "#ff9aa2" : "#9ac4ff",
                  }}
                >
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: `radial-gradient(circle at 35% 30%,${red ? "#ff8790,#8f1b28" : "#8fb6ff,#22468f"})`,
                    }}
                  />
                  Favorite faction · {favFaction}
                </span>
              );
            })()}
        </div>
        <div className="fd-btn-grid-2" style={{ display: "flex", gap: 10, flexWrap: "wrap", width: "100%", justifyContent: "flex-end" }}>
          <button className="btn btn-gold" onClick={() => setEditOpen(true)} style={{ padding: "12px 22px" }}>
            Edit Profile
          </button>
          <button className="btn btn-purple" onClick={() => navigate("/friends")} style={{ padding: "12px 22px" }}>
            👥 Friends
          </button>
          <button className="btn btn-purple" onClick={() => navigate("/inventory")} style={{ padding: "12px 22px" }}>
            🎒 Inventory
          </button>
          <button className="btn btn-purple" onClick={() => navigate("/settings")} style={{ padding: "12px 22px" }}>
            ⚙ Settings
          </button>
        </div>
      </div>

      {/* ── tabs ── */}
      <div style={{ display: "flex", alignItems: "center", borderBottom: "1px solid rgba(232,184,75,.18)" }}>
        <button onClick={() => setTab("overview")} style={tabStyle(tab === "overview")}>
          Overview
        </button>
        <button onClick={() => setTab("history")} style={tabStyle(tab === "history")}>
          Match History
        </button>
      </div>

      {/* ── OVERVIEW ── */}
      {tab === "overview" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* stat grid — real/zero */}
          <div className="fd-stat-2" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
            {STATS.map((p) => (
              <div key={p.k} className="frame" style={{ padding: "20px 12px", textAlign: "center" }}>
                <div style={{ font: "800 28px 'JetBrains Mono',monospace", color: p.c }}>{p.v}</div>
                <div style={{ font: "500 12px Inter", color: "var(--ink2)", marginTop: 4 }}>{p.k}</div>
              </div>
            ))}
          </div>

          {/* rank tiers — from shared RANK_TIERS */}
          <div className="frame fd-card-m" style={{ padding: 24 }}>
            <div className="ptitle">Rank Tiers</div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                padding: 16,
                borderRadius: 14,
                border: "1px solid rgba(232,184,75,.35)",
                background: "linear-gradient(135deg,rgba(232,184,75,.14),rgba(15,8,32,.4))",
              }}
            >
              <img
                src={`/assets/${tierNow.img}.png`}
                alt={tierNow.label}
                style={{ width: 56, height: 56, objectFit: "contain", flex: "none" }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ font: "800 20px Cinzel,serif", color: "var(--gold-lt)" }}>{tierNow.label}</div>
                <div style={{ font: "500 12px Inter", color: "var(--ink2)" }}>
                  {tierNow.sub} · 🏆 {trophies.toLocaleString()}
                </div>
              </div>
            </div>
            <div
              style={{
                height: 12,
                borderRadius: 100,
                background: "rgba(0,0,0,.4)",
                border: "1px solid rgba(232,184,75,.25)",
                overflow: "hidden",
                margin: "14px 0 6px",
              }}
            >
              <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg,#c98b2e,#f7e2a0)" }} />
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                font: "500 12px Inter",
                color: "var(--ink2)",
                marginBottom: 16,
              }}
            >
              <span>{toNextLabel}</span>
              <span>Next: {nextTier ? nextTier.label : "—"}</span>
            </div>
            {RANK_TIERS.map((t, i) => {
              const isCurrent = i === curIdx;
              const reached = trophies >= t.min;
              const badge = isCurrent ? "CURRENT" : reached ? "REACHED" : "LOCKED";
              const badgeStyle: React.CSSProperties = {
                flex: "none",
                font: "700 10px Inter",
                letterSpacing: ".5px",
                padding: "4px 9px",
                borderRadius: 7,
                color: isCurrent ? "#1a0f2e" : "var(--ink2)",
                background: isCurrent
                  ? "linear-gradient(180deg,#f7e2a0,#d5a63a)"
                  : reached
                    ? "rgba(47,143,91,.16)"
                    : "rgba(0,0,0,.3)",
                border: isCurrent
                  ? "1px solid rgba(255,240,200,.7)"
                  : reached
                    ? "1px solid rgba(47,143,91,.4)"
                    : "1px solid rgba(232,184,75,.18)",
              };
              return (
                <div
                  key={t.key}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 0",
                    borderTop: i === 0 ? "none" : "1px solid rgba(232,184,75,.1)",
                    opacity: reached ? 1 : 0.55,
                  }}
                >
                  <img src={`/assets/${t.img}.png`} alt={t.label} style={{ width: 34, height: 34, objectFit: "contain", flex: "none" }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ font: "700 14px Cinzel,serif", color: isCurrent ? "var(--gold-lt)" : "var(--ink)" }}>
                      {t.label}
                    </span>{" "}
                    <span style={{ font: "400 12px Inter", color: "var(--ink2)" }}>{t.sub}</span>
                  </div>
                  <span style={{ font: "700 12px 'JetBrains Mono',monospace", color: "var(--ink)" }}>🏆 {t.min}+</span>
                  <span style={badgeStyle}>{badge}</span>
                </div>
              );
            })}
          </div>

          {/* trophy history — LIVE ledger */}
          <div className="frame fd-card-m" style={{ padding: 24 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <div className="ptitle" style={{ marginBottom: 0 }}>
                Trophy History
              </div>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  font: "700 15px 'JetBrains Mono',monospace",
                  color: "var(--gold-lt)",
                }}
              >
                <img src="/assets/ic-trophy.png" alt="" style={{ width: 18, height: 18, objectFit: "contain" }} />
                {trophies.toLocaleString()}
              </span>
            </div>
            <div style={{ font: "400 12px Inter", color: "var(--ink2)", marginBottom: 14 }}>
              Trophies change only in Ranked — win +25, loss −5.
            </div>

            {trophyRows === null ? (
              <div style={{ textAlign: "center", padding: "38px 12px", color: "var(--ink2)", font: "500 13px Inter", borderTop: "1px solid rgba(232,184,75,.1)" }}>
                Loading trophy history…
              </div>
            ) : trophyRows.length === 0 ? (
              <div style={{ textAlign: "center", padding: "38px 12px", color: "var(--ink2)", font: "500 13px/1.6 Inter", borderTop: "1px solid rgba(232,184,75,.1)" }}>
                {trophyErr ? (
                  trophyErr
                ) : (
                  <>
                    No ranked matches yet.
                    <br />
                    Play a Ranked game and your trophy changes will appear here.
                  </>
                )}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {trophyRows.map((h) => {
                  const positive = h.amount >= 0;
                  const dc = positive ? "var(--green)" : "var(--red)";
                  const tint = positive ? "rgba(47,143,91,.14)" : "rgba(199,58,58,.14)";
                  const ring = positive ? "rgba(47,143,91,.4)" : "rgba(199,58,58,.4)";
                  const label = positive ? "WIN" : "LOSS";
                  return (
                    <div
                      key={h.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 14,
                        padding: "12px 0",
                        borderTop: "1px solid rgba(232,184,75,.1)",
                      }}
                    >
                      <span
                        style={{
                          width: 52,
                          flex: "none",
                          textAlign: "center",
                          font: "800 12px Inter",
                          letterSpacing: ".5px",
                          padding: "5px 0",
                          borderRadius: 7,
                          color: dc,
                          background: tint,
                          border: `1px solid ${ring}`,
                        }}
                      >
                        {label}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ font: "700 14px Inter", color: "#efe7fb" }}>{h.reason ?? "Ranked match"}</div>
                        <div style={{ font: "400 12px Inter", color: "var(--ink2)", marginTop: 2 }}>{timeAgo(h.createdAt)}</div>
                      </div>
                      <span style={{ font: "800 15px 'JetBrains Mono',monospace", color: dc, flex: "none" }}>
                        {positive ? "+" : ""}
                        {h.amount}
                      </span>
                      <span style={{ width: 66, flex: "none", textAlign: "right", font: "600 12px 'JetBrains Mono',monospace", color: "var(--ink)" }}>
                        🏆 {h.balance}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* achievements — real, computed client-side from the live account stats */}
          <AchievementsGrid stats={{ wins: me.wins, streak: me.streak, trophies: me.trophies }} />
        </div>
      )}

      {/* ── MATCH HISTORY — LIVE ── */}
      {tab === "history" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div className="frame fd-card-m" style={{ padding: 24 }}>
            <div
              className="fd-page-head"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 12,
                marginBottom: 10,
              }}
            >
              <div className="ptitle" style={{ marginBottom: 0 }}>
                Match History
              </div>
              <div className="fd-chip-strip" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {HISTORY_FILTERS.map((hf) => {
                  const active = historyFilter === hf.key;
                  return (
                    <button
                      key={hf.key}
                      onClick={() => setHistoryFilter(hf.key)}
                      style={{
                        cursor: "pointer",
                        font: "700 12px Inter",
                        padding: "7px 14px",
                        borderRadius: 999,
                        color: active ? "#1a0f2e" : "var(--ink2)",
                        background: active ? "linear-gradient(180deg,#f7e2a0,#d5a63a)" : "rgba(0,0,0,.25)",
                        border: active ? "1px solid rgba(255,240,200,.7)" : "1px solid rgba(232,184,75,.2)",
                      }}
                    >
                      {hf.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ font: "400 12px Inter", color: "var(--ink2)", marginBottom: 2 }}>
              {matches === null
                ? "Loading…"
                : `${matches.length} match${matches.length === 1 ? "" : "es"}${historyFilter !== "all" ? " · filtered" : ""}`}
            </div>

            {matches === null ? (
              <div style={{ textAlign: "center", padding: "38px 12px", color: "var(--ink2)", font: "500 13px Inter" }}>
                Loading match history…
              </div>
            ) : matches.length === 0 ? (
              <div style={{ textAlign: "center", padding: "38px 12px", color: "var(--ink2)", font: "500 13px/1.6 Inter" }}>
                {matchErr ? (
                  matchErr
                ) : (
                  <>
                    No matches here yet.
                    <br />
                    Finish a game and it will appear in your history automatically.
                  </>
                )}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {matches.map((m) => {
                  const iAmRed = m.red?.id === me.id;
                  const opponent = iAmRed ? m.blue : m.red;
                  const oppName = opponent?.displayName ?? (m.mode === "AI" || m.mode === "LOCAL" ? "Computer" : "Opponent");
                  const myDelta = iAmRed ? m.redTrophyDelta : m.blueTrophyDelta;
                  const result: "win" | "loss" | "draw" =
                    m.winner === "draw" || m.winner === null
                      ? "draw"
                      : (m.winner === "red") === iAmRed
                        ? "win"
                        : "loss";
                  const rc =
                    result === "win" ? "var(--green)" : result === "loss" ? "var(--red)" : "var(--ink2)";
                  const tint =
                    result === "win" ? "rgba(47,143,91,.14)" : result === "loss" ? "rgba(199,58,58,.14)" : "rgba(0,0,0,.25)";
                  const ring =
                    result === "win" ? "rgba(47,143,91,.4)" : result === "loss" ? "rgba(199,58,58,.4)" : "rgba(232,184,75,.2)";
                  const resultLabel = result === "win" ? "WIN" : result === "loss" ? "LOSS" : "DRAW";
                  const deltaStr = myDelta === null || myDelta === undefined ? "—" : `${myDelta > 0 ? "+" : ""}${myDelta}`;
                  return (
                    <button
                      key={m.id}
                      onClick={() => setReplayId(m.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 14,
                        padding: "14px 0",
                        borderTop: "1px solid rgba(232,184,75,.1)",
                        background: "none",
                        border: "none",
                        borderTopStyle: "solid",
                        cursor: "pointer",
                        textAlign: "left",
                        width: "100%",
                      }}
                    >
                      <span
                        style={{
                          width: 52,
                          flex: "none",
                          textAlign: "center",
                          font: "800 12px Inter",
                          letterSpacing: ".5px",
                          padding: "5px 0",
                          borderRadius: 7,
                          color: rc,
                          background: tint,
                          border: `1px solid ${ring}`,
                        }}
                      >
                        {resultLabel}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ font: "700 14px Inter", color: "#efe7fb" }}>vs {oppName}</div>
                        <div style={{ font: "400 12px Inter", color: "var(--ink2)", marginTop: 2 }}>
                          {MODE_LABEL[m.mode] ?? m.mode} · {timeAgo(m.startedAt)} · {duration(m.startedAt, m.endedAt)} · {m.moveCount} moves
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flex: "none" }}>
                        <div style={{ font: "700 13px 'JetBrains Mono',monospace", color: rc }}>{deltaStr}</div>
                        <div style={{ font: "600 11px 'JetBrains Mono',monospace", color: "var(--ink2)", marginTop: 3 }}>
                          Score {m.redCaptures}–{m.blueCaptures}
                        </div>
                      </div>
                      <span style={{ flex: "none", color: "var(--ink2)", fontSize: 20, lineHeight: 1 }}>›</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default ProfilePage;
