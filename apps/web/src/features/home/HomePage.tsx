import { useCallback, useEffect, useMemo, useState, type ReactNode, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { createInitialState, legalMoves, applyMove } from "@dama/game-engine";
import { DEFAULT_SETTINGS } from "@dama/shared";
import { Board } from "../../components";
import { api, ApiError, type Me } from "../../lib/api";
import { useAppStore } from "../../stores/appStore";
import { useAuthStore } from "../../stores/authStore";
import { useOnlineStore } from "../../stores/onlineStore";
import { ICONS, avatar as avatarSrc } from "../../lib/assets";
import { recentUpdates, timeAgo } from "./updates";

/**
 * HomePage — adapted from the prototype's Home screen (handoff/FilipinoDama
 * Royal.dc.html, lines 186-293): hero (with the "players online" pill),
 * Featured Game Modes (the 3 shipped modes — Classic / Ranked / Play vs AI;
 * the prototype's coming-soon Kingdom/Featured Match tiles were dropped),
 * Continue Playing + Recent Updates, and the right rail (Daily Challenge /
 * Quick Stats). The modes grid derives its column count from MODES.length so
 * it stays balanced regardless of how many modes ship.
 */

const SB = (n: string) => `/assets/${n}`;

// Featured modes — prototype `modes` array (line 3808), plus Math Dama (the
// educational Damath variant mode).
const MODES = [
  { title: "Classic Mode", desc: "Timeless Dama fun for everyone.", border: "rgba(60,110,200,.55)", btn: "btn-blue", icon: "mc-classic.png" },
  { title: "Ranked Mode", desc: "Climb the ladder, prove your skill.", border: "rgba(180,60,70,.55)", btn: "btn-red", icon: "mc-ranked.png" },
  { title: "Play vs AI", desc: "Practice offline against the computer.", border: "rgba(50,150,100,.55)", btn: "btn-green", icon: "mc-training.png" },
  { title: "Math Dama", desc: "Dama with math scoring — win by score.", border: "rgba(232,184,75,.55)", btn: "btn-gold", icon: "mc-mathdama.png" },
];

// prototype `updates` (line 3816) & `quickStats` (line 3819).
// Ambient PLATFORM-WIDE stats (not the user's personal data). These are the
// documented "big-platform numbers" exception to the no-mock rule — the same
// class as the players-online pill and global-leaderboard ambience. They are
// community-scale figures, NEVER presented as the signed-in user's own stats
// (personal stats live on the Profile page and are 100% real per-user). When a
// real aggregate-metrics endpoint lands, swap these for its values.
const QUICK_STATS = [
  { value: "128,945", label: "Active Players", icon: "sb-players.png" },
  { value: "4.2M", label: "Matches Played", icon: "sb-matches.png" },
  { value: "56,230", label: "Ranked Wins", icon: "sb-trophy.png" },
  { value: "87", label: "Countries", icon: "sb-modes.png" },
];

// GET /api/matches/active — the caller's in-progress online match (endedAt
// null), used to drive the "Continue Playing" resume card. red/blue mirror the
// server player serializer (matches.ts playerSelect).
type MatchPlayer = {
  id: string;
  username: string;
  displayName: string;
  tag: string;
  avatarUrl: string | null;
  rankTier: string;
  trophies: number;
} | null;

type ActiveMatch = {
  id: string;
  mode: "CASUAL" | "RANKED" | "PRIVATE" | "AI" | "LOCAL";
  red: MatchPlayer;
  blue: MatchPlayer;
  startedAt: string;
};

const MODE_LABEL: Record<string, string> = {
  CASUAL: "Casual Match",
  RANKED: "Ranked Match",
  PRIVATE: "Private Match",
  AI: "vs AI",
  LOCAL: "Local Match",
};

// Daily Challenge card is driven by the first daily quest from GET /api/quests.
// Shape matches the quests API (same as QuestsPage): id/title/description/goal/
// rewardGold/value/completed/claimed/claimable.
type Quest = {
  id: string;
  title: string;
  description: string | null;
  goal: number;
  rewardGold: number;
  value: number;
  completed: boolean;
  claimed: boolean;
  claimable: boolean;
};

// ── Featured store items (subset of the /api/store/items shape) ──
type HomeStoreItem = {
  id: string;
  type: "BOARD" | "SKIN" | "AVATAR" | "FRAME" | "EMOTE" | "BUNDLE" | "SEASON_PASS";
  name: string;
  priceGold: number | null;
  salePrice: number | null;
  onSale: boolean;
  featured: boolean;
  assetKey: string;
  previewKey: string | null;
};

/**
 * Resolve a store item's thumbnail to a renderable node — mirrors StorePage's
 * thumbFor() so Home shows the SAME art (no placeholder-thumbnail bugs). Emotes
 * render as their emoji glyph; the default Classic skin renders a coin disc;
 * everything else resolves to a real image under /assets.
 */
function StoreThumb({ it }: { it: HomeStoreItem }) {
  const wrap: CSSProperties = { width: 40, height: 40, flex: "none", borderRadius: 8, objectFit: "cover", background: "rgba(74,45,122,.35)" };
  const a = it.assetKey;
  if (it.type === "EMOTE") {
    const glyph = it.previewKey?.startsWith("emote:") ? it.previewKey.slice(6) : "👑";
    return <div style={{ ...wrap, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>{glyph}</div>;
  }
  let file: string;
  switch (it.type) {
    case "BOARD":
      file = a.endsWith(".png") ? a : `board-${a}.png`;
      break;
    case "SKIN":
      // Premium skins have coin art at pieces/skins/<key>/red-king.png; the
      // default "classic" skin has no art → show a simple gold disc glyph.
      if (a === "classic") return <div style={{ ...wrap, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>🔴</div>;
      file = `pieces/skins/${a}/red-king.png`;
      break;
    case "AVATAR":
      file = a.startsWith("avatars/") ? a : `avatars/${a}`;
      break;
    case "FRAME":
      file = a; // "laurel.png" or "frames/silver.png"
      break;
    default:
      file = "me-banner.png"; // BUNDLE / SEASON_PASS marketing art
  }
  return (
    <img
      src={`/assets/${file}`}
      alt=""
      onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
      style={{ ...wrap, filter: it.type === "AVATAR" ? "brightness(1.15)" : undefined }}
    />
  );
}

// "Ends in: HHh MMm" — daily quests reset at 00:00 UTC (matches the backend
// period rollover), so this counts down honestly to that boundary.
function timeUntilUtcMidnight(): string {
  const now = new Date();
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0);
  const ms = Math.max(0, next - now.getTime());
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m`;
}

export function HomePage() {
  const navigate = useNavigate();
  const showToast = useAppStore((s) => s.showToast);
  const me = useAuthStore((s) => s.me);
  const patchMe = useAuthStore((s) => s.patchMe);

  // ── Continue Playing: the caller's in-progress online match, if any ──
  const [activeMatch, setActiveMatch] = useState<ActiveMatch | null>(null);

  useEffect(() => {
    if (!me) {
      setActiveMatch(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const data = await api.get<{ match: ActiveMatch | null }>("/api/matches/active");
        if (!cancelled) setActiveMatch(data.match ?? null);
      } catch {
        // Silent: the resume card is purely opportunistic — a failed fetch
        // simply means we don't show it (honest: no active match surfaced).
        if (!cancelled) setActiveMatch(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [me]);

  // ── Daily Challenge (first quest) + Today's Quests (full daily list) ──
  const [dailyQuest, setDailyQuest] = useState<Quest | null>(null);
  const [dailyQuests, setDailyQuests] = useState<Quest[]>([]);
  const [questLoaded, setQuestLoaded] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [endsIn, setEndsIn] = useState(timeUntilUtcMidnight());

  const loadQuest = useCallback(async () => {
    if (!me) {
      setDailyQuest(null);
      setDailyQuests([]);
      setQuestLoaded(true);
      return;
    }
    try {
      const data = await api.get<{ daily: Quest[]; seasonal: Quest[] }>("/api/quests");
      setDailyQuest(data.daily[0] ?? null);
      setDailyQuests(data.daily ?? []);
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) {
        showToast("Couldn't load the daily challenge. Try again in a moment.");
      }
      setDailyQuest(null);
      setDailyQuests([]);
    } finally {
      setQuestLoaded(true);
    }
  }, [me, showToast]);

  useEffect(() => {
    void loadQuest();
  }, [loadQuest]);

  // ── Featured store items (public catalog; curated featured cosmetics) ──
  const [featuredItems, setFeaturedItems] = useState<HomeStoreItem[]>([]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await api.get<{ items: HomeStoreItem[] }>("/api/store/items");
        if (cancelled) return;
        // Prefer curated featured items; fall back to on-sale, then the cheapest
        // few — always real catalog rows, never fabricated. Cap at 3 for the card.
        const items = data.items ?? [];
        let pool = items.filter((i) => i.featured);
        if (!pool.length) pool = items.filter((i) => i.onSale);
        if (!pool.length) pool = [...items].sort((a, b) => (a.priceGold ?? 0) - (b.priceGold ?? 0));
        setFeaturedItems(pool.slice(0, 3));
      } catch {
        if (!cancelled) setFeaturedItems([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Tick the "Ends in" countdown once a minute.
  useEffect(() => {
    const t = setInterval(() => setEndsIn(timeUntilUtcMidnight()), 60_000);
    return () => clearInterval(t);
  }, []);

  const onClaimDaily = useCallback(async () => {
    if (!dailyQuest) return;
    setClaiming(true);
    try {
      const res = await api.post<{ rewardGold: number; goldBalance: number }>(
        `/api/quests/${dailyQuest.id}/claim`,
      );
      patchMe({ gold: res.goldBalance });
      showToast(`Claimed +${res.rewardGold} Gold!`);
      await loadQuest();
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : "Couldn't claim reward.");
    } finally {
      setClaiming(false);
    }
  }, [dailyQuest, patchMe, showToast, loadQuest]);

  // hero board — a real GameState after a few opening moves, for a lived-in look.
  const heroState = useMemo(() => {
    let s = createInitialState(DEFAULT_SETTINGS, "hero");
    for (let i = 0; i < 4; i++) {
      const mv = legalMoves(s);
      if (!mv.length || s.result) break;
      s = applyMove(s, mv[Math.floor(mv.length / 2)]);
    }
    return s;
  }, []);

  // mini board for the Continue Playing card — a real GameState after a couple
  // of moves (the live board isn't fetched here; this is a decorative preview,
  // and Resume rejoins the authoritative match via the onlineStore/EV.matchResync).
  const miniState = useMemo(() => {
    let s = createInitialState(DEFAULT_SETTINGS, "mini");
    for (let i = 0; i < 6; i++) {
      const mv = legalMoves(s);
      if (!mv.length || s.result) break;
      s = applyMove(s, mv[Math.floor(mv.length / 3)]);
    }
    return s;
  }, []);

  // Recent Updates — real game updates merged with the latest published blog posts.
  const updates = useMemo(() => recentUpdates(), []);

  const onMode = (title: string) => {
    if (title === "Math Dama") {
      navigate("/damath"); // educational Damath variant selector
    } else if (title === "Ranked Mode") {
      if (me && !me.isGuest) navigate("/play/online?mode=ranked");
      // A guest can't play ranked, and routing to /login would loop (its guest
      // option sends them right back). Tell them; a logged-out user signs in.
      else if (me?.isGuest) showToast("Ranked needs a free account — create one to climb the ladder.");
      else navigate(`/login?next=${encodeURIComponent("/play/online?mode=ranked")}`);
    } else navigate("/play/ai"); // Classic Mode / Play vs AI
  };

  return (
    <div className="fd-home-grid fd-page-pad" style={{ maxWidth: 1560, margin: "0 auto", padding: 26, display: "grid", gridTemplateColumns: "minmax(0,1fr) 340px", gap: 22, alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        {/* HERO */}
        <div className="frame fd-collapse-2 fd-card-m" style={{ padding: 34, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, alignItems: "center", overflow: "hidden" }}>
          <div>
            <div style={{ font: "700 12px Inter", letterSpacing: "3px", color: "var(--gold)", marginBottom: 16 }}>✦ STRATEGY · HERITAGE · VICTORY ✦</div>
            <h1 style={{ margin: 0, font: "800 clamp(28px,3vw,44px)/1.05 Cinzel,serif" }}>
              <span style={{ background: "linear-gradient(180deg,#f7e2a0,#d5a63a)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>CLASSIC FILIPINO DAMA,</span>
              <br />
              <span style={{ color: "#efe7fb" }}>REIMAGINED FOR ONLINE PLAY</span>
            </h1>
            <p style={{ font: "400 15px/1.6 Inter", color: "var(--ink)", maxWidth: 440, margin: "18px 0 26px" }}>
              Challenge real players, sharpen your strategy, and rise through the ranks in the timeless game of Filipino Dama.
            </p>
            <div className="fd-btn-stack" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <button className="btn btn-red" onClick={() => navigate("/play/ai")} style={{ fontSize: 15, padding: "15px 26px" }}>🌐 Play Now</button>
              <button className="btn btn-purple" onClick={() => navigate("/learn")} style={{ fontSize: 15, padding: "15px 26px" }}>📖 Learn the Rules</button>
              <button onClick={() => navigate("/rooms")} style={{ display: "inline-flex", alignItems: "center", gap: 9, padding: "15px 22px", borderRadius: 8, border: "1px solid rgba(232,184,75,.4)", background: "rgba(15,8,32,.5)", color: "var(--gold-lt)", font: "700 13px Inter", letterSpacing: "1px", textTransform: "uppercase", cursor: "pointer" }}>👥 Private Room</button>
            </div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginTop: 22, padding: "8px 14px", borderRadius: 100, border: "1px solid rgba(232,184,75,.25)", background: "rgba(15,8,32,.5)" }}>
              <div style={{ display: "flex" }}>
                <span style={{ width: 26, height: 26, borderRadius: "50%", background: "linear-gradient(160deg,#c98,#843)", border: "2px solid #1c1030" }} />
                <span style={{ width: 26, height: 26, borderRadius: "50%", background: "linear-gradient(160deg,#89c,#358)", border: "2px solid #1c1030", marginLeft: -9 }} />
              </div>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#3fbf6f", boxShadow: "0 0 8px #3fbf6f" }} />
              <span style={{ font: "600 13px Inter", color: "var(--ink)" }}><b style={{ color: "#fff" }}>2,458</b> players online</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ position: "relative", width: "min(100%,380px)", padding: "4%", borderRadius: 14, background: "linear-gradient(145deg,#f5d88a 0%,#d3a63c 45%,#8a5a1e 100%)", boxShadow: "0 0 0 1px rgba(0,0,0,.55),inset 0 2px 3px rgba(255,245,210,.55),inset 0 -4px 7px rgba(0,0,0,.4),0 20px 40px rgba(0,0,0,.55)" }}>
              <Board state={heroState} boardTheme="marble" />
            </div>
          </div>
        </div>

        {/* FEATURED MODES */}
        <div className="divider"><i /><span>✦ Featured Game Modes ✦</span><i /></div>
        <div className="fd-modes-grid" style={{ display: "grid", gridTemplateColumns: `repeat(${MODES.length},minmax(0,1fr))`, gap: 14 }}>
          {MODES.map((m) => (
            <div key={m.title} className="frame" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 11, borderColor: m.border }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <img src={SB(m.icon)} alt="" width={48} height={48} style={{ objectFit: "contain", flex: "none" }} />
                <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                  <div style={{ font: "700 16px Cinzel,serif", color: "var(--gold-lt)", lineHeight: 1.12 }}>{m.title}</div>
                  {m.title === "Math Dama" && (
                    <span style={{ font: "700 8px Inter", letterSpacing: 1, textTransform: "uppercase", color: "#8ce0ad", background: "rgba(50,150,100,.18)", padding: "2px 6px", borderRadius: 100 }}>New</span>
                  )}
                </div>
              </div>
              <div style={{ font: "400 13px/1.45 Inter", color: "var(--ink)" }}>{m.desc}</div>
              <button className={`btn ${m.btn}`} onClick={() => onMode(m.title)} style={{ marginTop: "auto", width: "100%" }}>Play Now</button>
            </div>
          ))}
        </div>

        {/* CONTINUE PLAYING + RECENT UPDATES — the resume card renders only when
            GET /api/matches/active returns a live match for the caller (honest:
            no active match → no card, Recent Updates fills the row full-width).
            When present, the two sit side-by-side as in the prototype. */}
        <div
          className="fd-continue-grid fd-collapse-2"
          style={
            activeMatch
              ? { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }
              : undefined
          }
        >
          {activeMatch ? (
            <ContinuePlayingCard
              match={activeMatch}
              meId={me?.id ?? null}
              miniBoard={<Board state={miniState} boardTheme="marble" compact />}
              onResume={() => {
                // Seed the online store with this in-progress match so /play/online
                // RESYNCS into it instead of starting a fresh casual search (CC-2).
                const myColor = activeMatch.red?.id === me?.id ? "red" : "blue";
                useOnlineStore.setState({ status: "playing", matchId: activeMatch.id, myColor, state: null, end: null });
                navigate("/play/online");
              }}
            />
          ) : null}

          <div className="frame" style={{ padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <span className="ptitle" style={{ border: "none", padding: 0, margin: 0, textAlign: "left" }}>Recent Updates</span>
              <span onClick={() => navigate("/blog")} style={{ font: "600 11px Inter", color: "var(--gold)", cursor: "pointer" }}>View All</span>
            </div>
            {updates.map((u) => (
              <div
                key={u.title}
                onClick={() => u.href && navigate(u.href)}
                style={{ display: "flex", gap: 12, padding: "10px 0", borderTop: "1px solid rgba(232,184,75,.12)", cursor: u.href ? "pointer" : "default" }}
              >
                <div style={{ width: 44, height: 44, flex: "none", borderRadius: 8, background: "rgba(74,45,122,.5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>{u.glyph}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ font: "700 9px Inter", letterSpacing: "1px", padding: "2px 6px", borderRadius: 4, background: u.tagBg, color: "#fff", flex: "none" }}>{u.tag}</span>
                    <span style={{ font: "700 13px Inter", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.title}</span>
                  </div>
                  <div style={{ font: "400 12px Inter", color: "var(--ink)", marginTop: 3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{u.body}</div>
                  <div style={{ font: "500 11px Inter", color: "var(--ink2)", marginTop: 3 }}>{timeAgo(u.date)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* RIGHT RAIL */}
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <DailyChallengeCard
          me={me}
          quest={dailyQuest}
          loaded={questLoaded}
          claiming={claiming}
          endsIn={endsIn}
          onClaim={onClaimDaily}
          onSignIn={() => navigate(`/login?next=${encodeURIComponent("/")}`)}
        />

        <div className="frame" style={{ padding: 20 }}>
          <div className="ptitle">Quick Stats</div>
          <div className="fd-stat-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {QUICK_STATS.map((q) => (
              <div key={q.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <img src={SB(q.icon)} alt="" width={24} height={24} style={{ objectFit: "contain" }} />
                <div>
                  <div style={{ font: "700 16px 'JetBrains Mono',monospace" }}>{q.value}</div>
                  <div style={{ font: "500 11px Inter", color: "var(--ink2)" }}>{q.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* HOT IN THE STORE — real featured/on-sale cosmetics (gold-only). Renders
            only when the public catalog returns items, so it never shows an empty
            frame. Same thumbnail resolver as the Store, and every price is gold. */}
        {featuredItems.length > 0 && (
          <div className="frame" style={{ padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <span className="ptitle" style={{ border: "none", padding: 0, margin: 0, textAlign: "left" }}>Hot in the Store</span>
              <span onClick={() => navigate("/store")} style={{ font: "600 11px Inter", color: "var(--gold)", cursor: "pointer" }}>Shop All</span>
            </div>
            {featuredItems.map((it) => {
              const price = it.onSale && it.salePrice != null ? it.salePrice : it.priceGold ?? 0;
              return (
                <div
                  key={it.id}
                  onClick={() => navigate(`/store?item=${encodeURIComponent(it.id)}`)}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderTop: "1px solid rgba(232,184,75,.12)", cursor: "pointer" }}
                >
                  <StoreThumb it={it} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ font: "700 13px Inter", color: "var(--gold-lt)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.name}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                      <img src={ICONS.coin} alt="" width={14} height={14} style={{ objectFit: "contain" }} />
                      <span style={{ font: "700 12px 'JetBrains Mono',monospace", color: "#f2d493" }}>{price.toLocaleString()}</span>
                      {it.onSale && it.salePrice != null && it.priceGold != null && (
                        <span style={{ font: "500 11px 'JetBrains Mono',monospace", color: "var(--ink2)", textDecoration: "line-through" }}>{it.priceGold.toLocaleString()}</span>
                      )}
                    </div>
                  </div>
                  {it.featured ? (
                    <span style={{ font: "700 9px Inter", letterSpacing: "1px", padding: "2px 6px", borderRadius: 4, background: "#7a4fbf", color: "#fff", flex: "none" }}>FEATURED</span>
                  ) : it.onSale ? (
                    <span style={{ font: "700 9px Inter", letterSpacing: "1px", padding: "2px 6px", borderRadius: 4, background: "#a83744", color: "#fff", flex: "none" }}>SALE</span>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}

        {/* TODAY'S QUESTS — the full daily quest list with real progress bars
            (the single Daily Challenge above is just the first one). Signed-in
            only; a logged-out visitor sees the sign-in prompt on the Daily card. */}
        {me && dailyQuests.length > 0 && (
          <div className="frame" style={{ padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <span className="ptitle" style={{ border: "none", padding: 0, margin: 0, textAlign: "left" }}>Today's Quests</span>
              <span onClick={() => navigate("/quests")} style={{ font: "600 11px Inter", color: "var(--gold)", cursor: "pointer" }}>View All</span>
            </div>
            {dailyQuests.map((q) => {
              const cur = Math.min(q.value, q.goal);
              const pct = Math.max(2, Math.min(100, Math.round((cur / Math.max(1, q.goal)) * 100)));
              return (
                <div key={q.id} style={{ padding: "9px 0", borderTop: "1px solid rgba(232,184,75,.12)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ font: "600 12px Inter", color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q.title}</span>
                    <span style={{ font: "700 11px 'JetBrains Mono',monospace", color: q.claimed ? "var(--ink2)" : q.claimable ? "#8ce0ad" : "var(--gold)", flex: "none" }}>
                      {q.claimed ? "✓ Claimed" : q.claimable ? "Claim ready" : `${cur}/${q.goal}`}
                    </span>
                  </div>
                  <div style={{ height: 5, borderRadius: 3, background: "rgba(255,255,255,.08)", marginTop: 6, overflow: "hidden" }}>
                    <div style={{ width: `${q.claimed ? 100 : pct}%`, height: "100%", borderRadius: 3, background: q.claimed ? "rgba(140,224,173,.5)" : "linear-gradient(90deg,#f0c24b,#c98b2e)" }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Daily Challenge card (prototype lines 258-272) — driven by the first daily
 * quest from GET /api/quests. Progress bar / counter / reward pill all reflect
 * real per-user state; claimable shows a Claim button, claimed shows "✓
 * Claimed", otherwise progress. Logged out → honest signed-out prompt (no fake
 * numbers). Footer counts down to the next 00:00 UTC daily reset.
 */
function DailyChallengeCard({
  me,
  quest,
  loaded,
  claiming,
  endsIn,
  onClaim,
  onSignIn,
}: {
  me: Me | null;
  quest: Quest | null;
  loaded: boolean;
  claiming: boolean;
  endsIn: string;
  onClaim: () => void;
  onSignIn: () => void;
}) {
  const cur = quest ? Math.min(quest.value, quest.goal) : 0;
  // Match the prototype/QuestsPage rule: min 2% so an empty bar is still visible.
  const pct = quest ? Math.max(2, Math.min(100, Math.round((cur / Math.max(1, quest.goal)) * 100))) : 0;

  return (
    <div className="frame" style={{ padding: 20, textAlign: "center" }}>
      <div className="ptitle">Daily Challenge</div>
      <div style={{ display: "flex", justifyContent: "center", margin: "4px 0" }}>
        <img src={ICONS.chest} alt="Chest" width={92} height={92} style={{ objectFit: "contain" }} />
      </div>

      {!me ? (
        <>
          <div style={{ font: "600 13px Inter", color: "var(--ink)", margin: "12px 0 8px" }}>
            Sign in to track your daily challenge.
          </div>
          <button className="btn btn-blue" onClick={onSignIn} style={{ width: "100%", marginTop: 4 }}>
            Sign In
          </button>
        </>
      ) : !loaded ? (
        <div style={{ font: "600 13px Inter", color: "var(--ink2)", margin: "18px 0" }}>Loading…</div>
      ) : !quest ? (
        <div style={{ font: "600 13px Inter", color: "var(--ink2)", margin: "18px 0" }}>
          No daily challenge right now — check back soon.
        </div>
      ) : (
        <>
          <div style={{ font: "600 13px Inter", color: "var(--ink)", margin: "12px 0 8px" }}>
            {quest.title}
            {quest.description ? (
              <div style={{ font: "500 11px Inter", color: "var(--ink2)", marginTop: 4 }}>{quest.description}</div>
            ) : null}
          </div>
          <div style={{ height: 12, borderRadius: 100, background: "rgba(0,0,0,.4)", border: "1px solid rgba(232,184,75,.25)", overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg,#3f79d6,#6fa8ff)", transition: "width .4s ease" }} />
          </div>
          <div style={{ font: "700 12px 'JetBrains Mono',monospace", color: "var(--ink)", marginTop: 6 }}>
            {cur} / {quest.goal}
          </div>

          {quest.claimed ? (
            <div
              style={{
                margin: "14px auto 8px",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "9px 18px",
                borderRadius: 100,
                border: "1px solid rgba(63,191,111,.5)",
                background: "rgba(50,150,100,.14)",
                color: "#7fe0a6",
                font: "800 12px Inter",
              }}
            >
              ✓ Claimed · {quest.rewardGold} Gold
            </div>
          ) : quest.claimable ? (
            <button
              type="button"
              disabled={claiming}
              onClick={onClaim}
              style={{
                margin: "14px auto 8px",
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                padding: "10px 20px",
                borderRadius: 100,
                border: "none",
                background: "linear-gradient(180deg,#f7e2a0,#d5a63a)",
                color: "#2a1a06",
                font: "800 13px Inter",
                letterSpacing: ".4px",
                cursor: claiming ? "default" : "pointer",
                boxShadow: "0 3px 14px rgba(232,184,75,.45)",
              }}
            >
              {claiming ? "…" : "Claim"}
              <img src={ICONS.coin} alt="" width={16} height={16} style={{ objectFit: "contain" }} /> {quest.rewardGold}
            </button>
          ) : (
            <>
              <div className="pill" style={{ margin: "14px auto 8px", color: "#f2d493" }}>
                <img src={ICONS.coin} alt="" width={16} height={16} style={{ objectFit: "contain" }} /> {quest.rewardGold}
              </div>
              <div style={{ font: "500 11px Inter", color: "var(--ink2)" }}>Reward on completion</div>
            </>
          )}
        </>
      )}

      <div style={{ font: "500 11px Inter", color: "var(--ink2)", marginTop: 10 }}>Ends in: {endsIn}</div>
    </div>
  );
}

/**
 * Continue Playing card (prototype lines 228-242) — rendered only when
 * GET /api/matches/active returns a live match for the caller. Shows the mini
 * board preview, both players (me vs opponent, resolved from match.red/blue by
 * my user id), the mode, and a Resume button that rejoins the authoritative
 * online match (/play/online → onlineStore resyncs via EV.matchResync).
 *
 * Honest: no fabricated "your turn" claim — the active-match GET doesn't carry
 * turn state, so the status reads a plain "Match in progress" live indicator.
 */
function ContinuePlayingCard({
  match,
  meId,
  miniBoard,
  onResume,
}: {
  match: ActiveMatch;
  meId: string | null;
  miniBoard: ReactNode;
  onResume: () => void;
}) {
  // Order the seats so I'm on the left when identifiable; otherwise fall back to
  // red-vs-blue as serialized. Either seat may be null (guest/AI/open slot).
  const iAmRed = meId != null && match.red?.id === meId;
  const iAmBlue = meId != null && match.blue?.id === meId;
  const mine = iAmRed ? match.red : iAmBlue ? match.blue : match.red;
  const other = iAmRed ? match.blue : iAmBlue ? match.red : match.blue;

  const seat = (p: MatchPlayer, fallbackName: string) => (
    <div style={{ textAlign: "center" }}>
      <img
        src={avatarSrc(p?.avatarUrl ?? "champion")}
        alt=""
        onError={(e) => {
          // Never leave a blank circle if an equipped avatar file is missing.
          const img = e.currentTarget;
          if (!img.src.endsWith("/avatars/champion.png")) img.src = "/assets/avatars/champion.png";
        }}
        style={{ width: 58, height: 58, display: "block", margin: "0 auto", border: "2px solid var(--gold)", borderRadius: "50%", objectFit: "cover" }}
      />
      <div style={{ font: "700 13px Inter", marginTop: 7 }}>{p?.displayName ?? fallbackName}</div>
      <div style={{ font: "600 11px 'JetBrains Mono',monospace", color: "var(--gold)" }}>🏆 {p?.trophies ?? 0}</div>
    </div>
  );

  return (
    <div className="frame" style={{ padding: 20 }}>
      <div className="ptitle" style={{ textAlign: "left", border: "none", margin: "0 0 14px" }}>Continue Playing</div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
        <div style={{ width: 108, height: 108, flex: "none" }}>{miniBoard}</div>
        <div style={{ flex: "1 1 180px", display: "flex", alignItems: "center", justifyContent: "center", gap: 18 }}>
          {seat(mine, "You")}
          <span style={{ font: "800 14px Cinzel,serif", color: "var(--ink2)" }}>VS</span>
          {seat(other, "Opponent")}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14 }}>
        <span style={{ font: "600 12px Inter", color: "#3fbf6f" }}>
          ● {MODE_LABEL[match.mode] ?? "Match"} in progress
        </span>
        <button className="btn btn-red" onClick={onResume} style={{ padding: "10px 18px", fontSize: 12 }}>
          Resume Game
        </button>
      </div>
    </div>
  );
}

export default HomePage;
