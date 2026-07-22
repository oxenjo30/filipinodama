import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { publishedArticles, categories, formatDate, type BlogCategory, type Article } from "./blog";
import { BlogArticleImage } from "./BlogArticleImage";
import { SiteHead } from "../../lib/seo";
import { api } from "../../lib/api";
import { useAuthStore } from "../../stores/authStore";

/**
 * BlogPage — the /blog index.
 *
 * An editorial layout: a masthead, a featured HERO card for the most-recent
 * article, then the rest in a responsive grid — beside a sidebar with a Play
 * CTA, Featured store items (real, GET /api/store/items), and — for signed-in
 * players — their most recent ranked match. Category filter + search narrow the
 * list (paginated, 8/page). Only LIVE articles show (publishedArticles() honours
 * the drip schedule). A floating "scroll to top" arrow appears once the reader
 * scrolls down.
 *
 * Article images resolve through blogImages.ts, while the category accent/glyph
 * still tints the pill, faint watermark, and card background wash.
 */

type Filter = "All" | BlogCategory;
const PER_PAGE = 8;

const CAT_ACCENT: Record<BlogCategory, string> = {
  Guides: "#f5d88a",
  Rules: "#8ab6f5",
  Strategy: "#c9a0f5",
  Culture: "#f5a0a0",
};

/** A leading glyph per category — the categories read as a designed system,
 *  not just coloured pills. Used in the pill and as a faint card watermark. */
const CAT_GLYPH: Record<BlogCategory, string> = {
  Guides: "♟",
  Rules: "⚖",
  Strategy: "♛",
  Culture: "❦",
};

const ALL_GLYPH = "✦";

function CategoryPill({ category, size = "sm" }: { category: BlogCategory; size?: "sm" | "md" }) {
  const accent = CAT_ACCENT[category];
  const big = size === "md";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: big ? "5px 13px" : "3px 10px",
        borderRadius: 100,
        border: `1px solid ${accent}55`,
        background: `${accent}18`,
        color: accent,
        font: big ? "700 11px Inter" : "700 10px Inter",
        letterSpacing: ".6px",
        textTransform: "uppercase",
      }}
    >
      <span aria-hidden style={{ fontSize: big ? 13 : 11, lineHeight: 1 }}>{CAT_GLYPH[category]}</span>
      {category}
    </span>
  );
}

// ── sidebar data shapes ──
type FeaturedItem = { id: string; type: string; name: string; assetKey: string; priceGold: number | null; priceDiamonds: number | null; featured: boolean };
type MatchPlayer = { id: string; displayName: string; trophies: number } | null;
type MatchRow = {
  id: string;
  mode: string;
  winner: "red" | "blue" | "draw" | null;
  red: MatchPlayer;
  blue: MatchPlayer;
  redTrophyDelta: number | null;
  blueTrophyDelta: number | null;
  endedAt: string | null;
};
/** derived, relative to the signed-in user */
type RecentMatch = { mode: string; result: "win" | "loss" | "draw"; trophyDelta: number | null; opponentName: string; endedAt: string | null };

function SidebarCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ borderRadius: 14, border: "1px solid rgba(232,184,75,.16)", background: "linear-gradient(180deg,rgba(38,22,60,.55),rgba(24,13,40,.5))", padding: 18 }}>
      <div style={{ font: "700 11px Inter", letterSpacing: "2px", textTransform: "uppercase", color: "var(--gold)", marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  );
}

const A = (n: string) => `/assets/${n}`;

/**
 * Resolve a store item's thumbnail image the SAME way the Store does (per type),
 * so the sidebar shows the real art — skins show their coin art, boards their
 * texture, avatars/frames their png — not a wrong fallback icon.
 */
function featuredThumb(it: FeaturedItem): string {
  const a = it.assetKey;
  switch (it.type) {
    case "BOARD":
      return A(a.endsWith(".png") ? a : `board-${a}.png`);
    case "SKIN":
      return a === "classic" ? A("crimson-king.png") : A(`pieces/skins/${a}/red-king.png`);
    case "AVATAR":
      return A(a.startsWith("avatars/") ? a : `avatars/${a}`);
    case "FRAME":
      return A(a);
    case "BUNDLE":
      return A(a.endsWith(".png") ? a : "me-banner.png");
    case "SEASON_PASS":
      return A("me-crown.png");
    default:
      return A(a.endsWith(".png") || a.endsWith(".webp") ? a : "me-banner.png");
  }
}

/** Card shell shared by the hero and the grid — a full-bordered panel with a
 *  category-tinted wash and a faint corner watermark glyph. Never a side-stripe. */
function articleCardStyle(accent: string): React.CSSProperties {
  return {
    position: "relative",
    overflow: "hidden",
    textDecoration: "none",
    color: "inherit",
    borderRadius: 14,
    border: "1px solid rgba(232,184,75,.16)",
    background: `linear-gradient(180deg,rgba(38,22,60,.55),rgba(24,13,40,.5)), radial-gradient(120% 90% at 100% 0%, ${accent}14, transparent 55%)`,
    transition: "border-color .16s ease, transform .16s ease, box-shadow .16s ease",
    isolation: "isolate",
  };
}

function CardWatermark({ glyph, accent }: { glyph: string; accent: string }) {
  return (
    <span
      aria-hidden
      style={{
        position: "absolute",
        top: -18,
        right: -6,
        fontSize: 96,
        lineHeight: 1,
        color: accent,
        opacity: 0.1,
        pointerEvents: "none",
        userSelect: "none",
        zIndex: 0,
      }}
    >
      {glyph}
    </span>
  );
}

export function BlogPage() {
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.me);
  const [filter, setFilter] = useState<Filter>("All");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [showTop, setShowTop] = useState(false);

  // sidebar live data
  const [featured, setFeatured] = useState<FeaturedItem[]>([]);
  const [recent, setRecent] = useState<RecentMatch | null>(null);

  // Title/description/canonical are owned by <SiteHead> below (Helmet) so they
  // land in the prerendered HTML — an imperative document.title runs too late.

  // Floating scroll-to-top: show once the reader is past ~500px.
  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 500);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Featured store items (public). Take a few real featured items for the rail.
  useEffect(() => {
    let alive = true;
    api
      .get<{ items: FeaturedItem[] }>("/api/store/items")
      .then((d) => {
        if (!alive) return;
        setFeatured(d.items.filter((i) => i.featured).slice(0, 3));
      })
      .catch(() => {/* leave empty on failure */});
    return () => {
      alive = false;
    };
  }, []);

  // Most recent RANKED match — signed-in players only (the blog is public, so a
  // logged-out visitor simply doesn't see this widget; never fabricated).
  useEffect(() => {
    if (!me || me.isGuest) {
      setRecent(null);
      return;
    }
    let alive = true;
    api
      .get<{ items: MatchRow[] }>(`/api/matches?userId=${me.id}`)
      .then((d) => {
        if (!alive) return;
        // Most recent finished match, derived relative to ME (which side I was on).
        const m = (d.items ?? []).find((x) => x.endedAt);
        if (!m) {
          setRecent(null);
          return;
        }
        const iAmRed = m.red?.id === me.id;
        const mySide: "red" | "blue" = iAmRed ? "red" : "blue";
        const opp = iAmRed ? m.blue : m.red;
        const result: RecentMatch["result"] = m.winner === "draw" || m.winner == null ? "draw" : m.winner === mySide ? "win" : "loss";
        const trophyDelta = iAmRed ? m.redTrophyDelta : m.blueTrophyDelta;
        setRecent({ mode: m.mode, result, trophyDelta, opponentName: opp?.displayName ?? "Opponent", endedAt: m.endedAt });
      })
      .catch(() => {/* leave null */});
    return () => {
      alive = false;
    };
  }, [me]);

  const live = useMemo(() => publishedArticles(), []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return live.filter((a) => {
      if (filter !== "All" && a.category !== filter) return false;
      if (!q) return true;
      return a.title.toLowerCase().includes(q) || a.description.toLowerCase().includes(q);
    });
  }, [live, filter, query]);

  // Reset to page 1 whenever the filter/search changes.
  useEffect(() => {
    setPage(1);
  }, [filter, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const pageItems = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  // The HERO treatment goes to the newest article — but only on the first page
  // and only when nothing is filtered/searched, so the hero is always the true
  // "latest" and never a random mid-list result. Otherwise every card is equal
  // weight in the grid, which is the honest presentation for a filtered view.
  const isDefaultView = filter === "All" && query.trim() === "" && page === 1;
  const heroArticle: Article | null = isDefaultView && pageItems.length > 0 ? pageItems[0] : null;
  const gridItems = heroArticle ? pageItems.slice(1) : pageItems;

  const tabs: Filter[] = ["All", ...categories];

  const goPage = (p: number) => {
    setPage(Math.min(pageCount, Math.max(1, p)));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Staggered entrance runs off inline animationDelay against the .fd-blog-rise
  // keyframes injected below. Content is ALWAYS rendered (the base state is
  // visible); the animation only enhances it, and prefers-reduced-motion turns
  // it off entirely, so nothing is ever gated behind a transition that may not
  // fire. A key on the wrapper re-triggers the stagger when the view changes.
  const viewKey = `${filter}|${query}|${page}`;

  return (
    <>
      <SiteHead
        title="Dama Blog — Rules, Strategy & Filipino Checkers Guides"
        description="Guides, rules explainers, and strategy for Filipino Dama (checkers) — how to play, how to win, and the history of the game Filipinos love."
        path="/blog"
      />
    <div className="fd-page-pad" style={{ maxWidth: 1200, margin: "0 auto", padding: "26px 26px 60px" }}>
      <style>{BLOG_CSS}</style>

      {/* MASTHEAD */}
      <header style={{ textAlign: "center", marginBottom: 30 }}>
        <div style={{ font: "700 11px Inter", letterSpacing: "3.5px", textTransform: "uppercase", color: "var(--gold)", marginBottom: 12 }}>
          ✦&nbsp;&nbsp;The Royal Dispatch&nbsp;&nbsp;✦
        </div>
        <h1
          style={{
            margin: 0,
            font: "800 clamp(34px,5vw,52px)/1.02 Cinzel,serif",
            background: "linear-gradient(180deg,#f7e2a0,#d5a63a)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
            letterSpacing: ".5px",
          }}
        >
          Dama Blog
        </h1>
        <div className="divider" style={{ maxWidth: 420, margin: "16px auto 0" }}>
          <i />
          <span style={{ font: "500 12.5px Inter", letterSpacing: "1.5px", color: "var(--ink)", textTransform: "none" }}>
            Guides, rules &amp; strategy for the crown
          </span>
          <i />
        </div>
      </header>

      {/* CONTROL BAR: category filter + search */}
      <div
        style={{
          display: "flex",
          gap: 14,
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 26,
          padding: "12px 14px",
          borderRadius: 14,
          border: "1px solid rgba(232,184,75,.14)",
          background: "linear-gradient(180deg,rgba(30,17,52,.5),rgba(20,11,36,.45))",
        }}
      >
        <div className="fd-chip-strip" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {tabs.map((t) => {
            const active = filter === t;
            const accent = t === "All" ? "var(--gold-lt)" : CAT_ACCENT[t];
            const glyph = t === "All" ? ALL_GLYPH : CAT_GLYPH[t];
            return (
              <button
                key={t}
                onClick={() => setFilter(t)}
                aria-pressed={active}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "8px 14px",
                  borderRadius: 100,
                  cursor: "pointer",
                  font: "700 12px Inter",
                  letterSpacing: ".5px",
                  textTransform: "uppercase",
                  border: active ? "1px solid rgba(232,184,75,.55)" : "1px solid rgba(232,184,75,.18)",
                  background: active ? "linear-gradient(180deg,#3d2a6b,#241640)" : "rgba(15,8,32,.45)",
                  color: active ? "var(--gold-lt)" : "var(--ink)",
                  transition: "border-color .15s ease, color .15s ease, background .15s ease",
                }}
              >
                <span aria-hidden style={{ fontSize: 12, lineHeight: 1, color: active ? accent : "var(--ink2)" }}>{glyph}</span>
                {t}
              </button>
            );
          })}
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search articles…"
          aria-label="Search articles"
          className="fd-nozoom"
          style={{ minWidth: 220, flex: "0 1 300px", padding: "10px 14px", borderRadius: 10, border: "1px solid rgba(232,184,75,.3)", background: "rgba(15,8,32,.6)", color: "var(--ink)", font: "500 13px Inter", outline: "none" }}
        />
      </div>

      {/* MAIN + SIDEBAR */}
      <div className="fd-two-col" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 300px", gap: 26, alignItems: "start" }}>
        {/* MAIN: hero + article grid */}
        <div style={{ minWidth: 0 }}>
          {filtered.length === 0 ? (
            <div style={{ borderRadius: 14, border: "1px solid rgba(232,184,75,.16)", background: "rgba(24,13,40,.5)", padding: "48px 20px", textAlign: "center" }}>
              <div style={{ fontSize: 34, marginBottom: 10 }}>{live.length === 0 ? "📅" : "🔍"}</div>
              <div style={{ font: "700 16px Cinzel,serif", color: "var(--gold-lt)" }}>{live.length === 0 ? "No articles yet" : "No articles found"}</div>
              <div style={{ font: "400 13px Inter", color: "var(--ink)", margin: "8px 0 0" }}>
                {live.length === 0
                  ? "New Dama guides are on the way — check back soon."
                  : <>Nothing matches “{query.trim()}”{filter !== "All" ? ` in ${filter}` : ""}. Try a different search or category.</>}
              </div>
            </div>
          ) : (
            <>
              <div style={{ font: "500 12px Inter", color: "var(--ink2)", marginBottom: 18, letterSpacing: ".3px" }}>
                {filtered.length} article{filtered.length === 1 ? "" : "s"}
                {pageCount > 1 ? ` · page ${page} of ${pageCount}` : ""}
              </div>

              <div key={viewKey} className="fd-blog-list">
                {/* HERO — the latest article, given real presence */}
                {heroArticle && (() => {
                  const accent = CAT_ACCENT[heroArticle.category];
                  const date = formatDate(heroArticle.datePublished);
                  return (
                    <Link
                      to={`/blog/${heroArticle.slug}`}
                      className="fd-blog-rise fd-blog-hero"
                      style={{ ...articleCardStyle(accent), display: "block", marginBottom: 22, animationDelay: "0ms" }}
                    >
                      <span
                        aria-hidden
                        style={{
                          position: "absolute", top: -34, right: -10, fontSize: 190, lineHeight: 1,
                          color: accent, opacity: 0.1, pointerEvents: "none", userSelect: "none", zIndex: 0,
                        }}
                      >
                        {CAT_GLYPH[heroArticle.category]}
                      </span>
                      <div style={{ position: "relative", zIndex: 1, padding: "clamp(24px,3.5vw,34px)" }}>
                        <BlogArticleImage article={heroArticle} variant="hero" priority />
                        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, font: "800 10px Inter", letterSpacing: "1.5px", textTransform: "uppercase", color: "#2a1a06", background: "linear-gradient(180deg,#f7e2a0,#d5a63a)", padding: "4px 11px", borderRadius: 100 }}>
                            ★ Latest
                          </span>
                          <CategoryPill category={heroArticle.category} size="md" />
                        </div>
                        <div style={{ font: "700 clamp(24px,3.2vw,34px)/1.18 Cinzel,serif", color: "var(--gold-lt)", overflowWrap: "anywhere" }}>
                          {heroArticle.title}
                        </div>
                        <div style={{ font: "400 15px/1.7 Inter", color: "var(--ink)", marginTop: 14, maxWidth: "62ch", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                          {heroArticle.description}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 20, flexWrap: "wrap" }}>
                          <span style={{ font: "700 12px Inter", letterSpacing: ".8px", textTransform: "uppercase", color: accent }}>Read article →</span>
                          <span style={{ font: "500 11px 'JetBrains Mono',monospace", color: "var(--ink2)" }}>
                            {date ? `${date} · ` : ""}{heroArticle.readMin} min read
                          </span>
                        </div>
                      </div>
                    </Link>
                  );
                })()}

                {/* THE REST — a responsive grid (collapses to one column on mobile
                    via the global minmax collapser), tighter than the hero. */}
                {gridItems.length > 0 && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(272px, 1fr))",
                      gap: 16,
                    }}
                  >
                    {gridItems.map((a, i) => {
                      const accent = CAT_ACCENT[a.category];
                      const date = formatDate(a.datePublished);
                      return (
                        <Link
                          key={a.slug}
                          to={`/blog/${a.slug}`}
                          className="fd-blog-rise fd-blog-card"
                          style={{
                            ...articleCardStyle(accent),
                            display: "flex",
                            flexDirection: "column",
                            gap: 10,
                            padding: "20px 22px",
                            // hero occupies index 0's delay slot; grid follows on.
                            animationDelay: `${Math.min((heroArticle ? i + 1 : i) * 45, 360)}ms`,
                          }}
                        >
                          <CardWatermark glyph={CAT_GLYPH[a.category]} accent={accent} />
                          <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", gap: 10, height: "100%" }}>
                            <BlogArticleImage article={a} variant="card" />
                            <CategoryPill category={a.category} />
                            <div style={{ font: "700 19px/1.32 Cinzel,serif", color: "var(--gold-lt)", overflowWrap: "anywhere" }}>{a.title}</div>
                            <div style={{ font: "400 13.5px/1.6 Inter", color: "var(--ink)", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{a.description}</div>
                            <div style={{ marginTop: "auto", paddingTop: 6, font: "500 11px 'JetBrains Mono',monospace", color: "var(--ink2)" }}>
                              {date ? `${date} · ` : ""}{a.readMin} min read
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* PAGINATION */}
              {pageCount > 1 && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 32, flexWrap: "wrap" }}>
                  <button onClick={() => goPage(page - 1)} disabled={page === 1} style={pageBtn(false, page === 1)}>‹ Prev</button>
                  {Array.from({ length: pageCount }).map((_, i) => {
                    const p = i + 1;
                    return (
                      <button key={p} onClick={() => goPage(p)} style={pageBtn(p === page, false)}>{p}</button>
                    );
                  })}
                  <button onClick={() => goPage(page + 1)} disabled={page === pageCount} style={pageBtn(false, page === pageCount)}>Next ›</button>
                </div>
              )}
            </>
          )}
        </div>

        {/* SIDEBAR */}
        <aside style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Play CTA */}
          <SidebarCard title="Play Dama">
            <div style={{ font: "400 13px/1.6 Inter", color: "var(--ink)", marginBottom: 12 }}>Ready to test what you've read? Jump into a match.</div>
            <button className="btn btn-gold" onClick={() => navigate("/play")} style={{ width: "100%", justifyContent: "center", padding: 12 }}>♟ Play Now</button>
          </SidebarCard>

          {/* Featured store items */}
          {featured.length > 0 && (
            <SidebarCard title="Featured in Store">
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {featured.map((it) => (
                  <button
                    key={it.id}
                    onClick={() => navigate("/store")}
                    style={{ display: "flex", alignItems: "center", gap: 11, padding: 8, borderRadius: 10, border: "1px solid rgba(232,184,75,.12)", background: "rgba(0,0,0,.2)", cursor: "pointer", textAlign: "left" }}
                  >
                    <img src={featuredThumb(it)} alt="" style={{ width: 40, height: 40, objectFit: "contain", flex: "none" }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ font: "700 12px Inter", color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.name}</div>
                      <div style={{ font: "600 11px 'JetBrains Mono',monospace", color: it.priceDiamonds ? "#ff9aa8" : "#f2d493" }}>
                        {it.priceDiamonds ? `${it.priceDiamonds.toLocaleString()} 💎` : it.priceGold ? `${it.priceGold.toLocaleString()} 🪙` : "Free"}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              <button onClick={() => navigate("/store")} style={{ marginTop: 12, width: "100%", background: "none", border: "none", color: "var(--gold)", font: "700 11px Inter", letterSpacing: ".5px", textTransform: "uppercase", cursor: "pointer" }}>Visit Store →</button>
            </SidebarCard>
          )}

          {/* Your Last Match — shown to signed-in players. When they haven't
              finished an online game yet, an honest prompt instead of hiding. */}
          {me && !me.isGuest && (
            <SidebarCard title="Your Last Match">
              {recent ? (
                <>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ font: "700 13px Inter", color: "#fff" }}>vs {recent.opponentName}</div>
                      <div style={{ font: "500 11px Inter", color: "var(--ink2)", marginTop: 2 }}>{recent.mode === "RANKED" ? "Ranked" : "Casual"} · {formatDate(recent.endedAt) ?? ""}</div>
                    </div>
                    <div style={{ textAlign: "right", flex: "none" }}>
                      <div style={{ font: "800 13px Inter", color: recent.result === "win" ? "#7ee6a4" : recent.result === "loss" ? "#ff9aa8" : "var(--ink)" }}>{recent.result.toUpperCase()}</div>
                      {recent.trophyDelta != null && recent.trophyDelta !== 0 && (
                        <div style={{ font: "700 11px 'JetBrains Mono',monospace", color: recent.trophyDelta > 0 ? "#7ee6a4" : "#ff9aa8" }}>
                          {recent.trophyDelta > 0 ? "+" : ""}{recent.trophyDelta} 🏆
                        </div>
                      )}
                    </div>
                  </div>
                  <button onClick={() => navigate("/leaderboard")} style={{ marginTop: 12, width: "100%", background: "none", border: "none", color: "var(--gold)", font: "700 11px Inter", letterSpacing: ".5px", textTransform: "uppercase", cursor: "pointer" }}>View Leaderboard →</button>
                </>
              ) : (
                <>
                  <div style={{ font: "400 13px/1.6 Inter", color: "var(--ink)", marginBottom: 12 }}>No online matches yet. Play a ranked or casual game to see your result here.</div>
                  <button className="btn btn-purple" onClick={() => navigate("/play/online?mode=casual")} style={{ width: "100%", justifyContent: "center", padding: 11, fontSize: 12 }}>Find a Match</button>
                </>
              )}
            </SidebarCard>
          )}
        </aside>
      </div>

      {/* SCROLL TO TOP */}
      {showTop && (
        <button
          aria-label="Scroll to top"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          style={{
            position: "fixed",
            right: 24,
            bottom: 24,
            zIndex: 60,
            width: 46,
            height: 46,
            borderRadius: "50%",
            border: "1px solid rgba(232,184,75,.5)",
            background: "linear-gradient(180deg,#f0cf72,#c99a2e)",
            color: "#3a2405",
            font: "900 20px Inter",
            cursor: "pointer",
            boxShadow: "0 8px 22px rgba(0,0,0,.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            paddingBottom: 3,
          }}
        >
          ↑
        </button>
      )}
    </div>
    </>
  );
}

/** Pagination button style (active / disabled aware). */
function pageBtn(active: boolean, disabled: boolean): React.CSSProperties {
  return {
    minWidth: 34,
    height: 34,
    padding: "0 10px",
    borderRadius: 8,
    cursor: disabled ? "not-allowed" : "pointer",
    font: "700 12px Inter",
    border: active ? "1px solid rgba(232,184,75,.6)" : "1px solid rgba(232,184,75,.2)",
    background: active ? "linear-gradient(180deg,#3d2a6b,#241640)" : "rgba(15,8,32,.5)",
    color: active ? "var(--gold-lt)" : disabled ? "var(--ink2)" : "var(--ink)",
    opacity: disabled ? 0.5 : 1,
  };
}

/**
 * Scoped styles for the blog: the staggered card entrance and the hover lift.
 * Kept inline so the redesign is self-contained (the global stylesheet has no
 * prefers-reduced-motion block). Content renders regardless of the animation —
 * .fd-blog-rise sets its final state via `both` fill, and reduced-motion
 * disables the animation and the transform entirely (instant, fully visible).
 */
const BLOG_CSS = `
@keyframes fdBlogRise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
.fd-blog-rise { animation: fdBlogRise .5s cubic-bezier(.2,.7,.3,1) both; will-change: transform, opacity; }
.fd-blog-card:hover, .fd-blog-hero:hover {
  border-color: rgba(232,184,75,.42) !important;
  transform: translateY(-3px);
  box-shadow: 0 14px 34px rgba(0,0,0,.42);
}
.fd-blog-card:focus-visible, .fd-blog-hero:focus-visible {
  outline: none;
  border-color: rgba(232,184,75,.55) !important;
  box-shadow: 0 0 0 2px rgba(232,184,75,.35);
}
@media (prefers-reduced-motion: reduce) {
  .fd-blog-rise { animation: fdBlogFade .01s linear both; }
  @keyframes fdBlogFade { from { opacity: 1; } to { opacity: 1; } }
  .fd-blog-card:hover, .fd-blog-hero:hover { transform: none; }
}
`;

export default BlogPage;
