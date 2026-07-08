import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { publishedArticles, categories, formatDate, type BlogCategory } from "./blog";
import { api } from "../../lib/api";
import { useAuthStore } from "../../stores/authStore";

/**
 * BlogPage — the /blog index.
 *
 * A single column of article cards (paginated, 8/page) beside a sidebar with a
 * Play CTA, Featured store items (real, GET /api/store/items), and — for signed-in
 * players — their most recent ranked match. Category filter + search narrow the
 * list. Only LIVE articles show (publishedArticles() honours the drip schedule).
 * A floating "scroll to top" arrow appears once the reader scrolls down.
 */

type Filter = "All" | BlogCategory;
const PER_PAGE = 8;

const CAT_ACCENT: Record<BlogCategory, string> = {
  Guides: "#f5d88a",
  Rules: "#8ab6f5",
  Strategy: "#c9a0f5",
  Culture: "#f5a0a0",
};

function CategoryPill({ category }: { category: BlogCategory }) {
  const accent = CAT_ACCENT[category];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 10px",
        borderRadius: 100,
        border: `1px solid ${accent}55`,
        background: `${accent}18`,
        color: accent,
        font: "700 10px Inter",
        letterSpacing: ".6px",
        textTransform: "uppercase",
      }}
    >
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

  useEffect(() => {
    document.title = "Dama Blog — FilipinoDama";
  }, []);

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

  const tabs: Filter[] = ["All", ...categories];

  const goPage = (p: number) => {
    setPage(Math.min(pageCount, Math.max(1, p)));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="fd-page-pad" style={{ maxWidth: 1200, margin: "0 auto", padding: "26px 26px 60px" }}>
      {/* HEADER */}
      <div style={{ textAlign: "center", marginBottom: 26 }}>
        <div style={{ font: "800 34px Cinzel,serif", color: "var(--gold-lt)" }}>Dama Blog</div>
        <div style={{ font: "400 14px Inter", color: "var(--ink)", marginTop: 6 }}>Guides, rules &amp; strategy</div>
      </div>

      {/* CONTROLS: category filter + search */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
        <div className="fd-chip-strip" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {tabs.map((t) => {
            const active = filter === t;
            return (
              <button
                key={t}
                onClick={() => setFilter(t)}
                style={{
                  padding: "8px 15px",
                  borderRadius: 8,
                  cursor: "pointer",
                  font: "700 12px Inter",
                  letterSpacing: ".5px",
                  textTransform: "uppercase",
                  border: active ? "1px solid rgba(232,184,75,.55)" : "1px solid rgba(232,184,75,.2)",
                  background: active ? "linear-gradient(180deg,#3d2a6b,#241640)" : "rgba(15,8,32,.5)",
                  color: active ? "var(--gold-lt)" : "var(--ink)",
                }}
              >
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
          style={{ minWidth: 240, flex: "0 1 320px", padding: "10px 14px", borderRadius: 8, border: "1px solid rgba(232,184,75,.3)", background: "rgba(15,8,32,.6)", color: "var(--ink)", font: "500 13px Inter", outline: "none" }}
        />
      </div>

      {/* MAIN + SIDEBAR */}
      <div className="fd-two-col" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 300px", gap: 26, alignItems: "start" }}>
        {/* MAIN: single column of article cards */}
        <div>
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
              <div style={{ font: "500 12px Inter", color: "var(--ink2)", marginBottom: 14 }}>
                {filtered.length} article{filtered.length === 1 ? "" : "s"}
                {pageCount > 1 ? ` · page ${page} of ${pageCount}` : ""}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {pageItems.map((a) => {
                  const date = formatDate(a.datePublished);
                  return (
                    <Link
                      key={a.slug}
                      to={`/blog/${a.slug}`}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 10,
                        padding: "22px 24px",
                        textDecoration: "none",
                        color: "inherit",
                        borderRadius: 14,
                        border: "1px solid rgba(232,184,75,.16)",
                        background: "linear-gradient(180deg,rgba(38,22,60,.55),rgba(24,13,40,.5))",
                        transition: "border-color .15s ease, transform .15s ease",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = "rgba(232,184,75,.4)";
                        e.currentTarget.style.transform = "translateY(-2px)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = "rgba(232,184,75,.16)";
                        e.currentTarget.style.transform = "none";
                      }}
                    >
                      <CategoryPill category={a.category} />
                      <div style={{ font: "700 21px/1.3 Cinzel,serif", color: "var(--gold-lt)" }}>{a.title}</div>
                      <div style={{ font: "400 14px/1.65 Inter", color: "var(--ink)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{a.description}</div>
                      <div style={{ marginTop: 4, font: "500 11px Inter", color: "var(--ink2)" }}>
                        {date ? `${date} · ` : ""}{a.readMin} min read
                      </div>
                    </Link>
                  );
                })}
              </div>

              {/* PAGINATION */}
              {pageCount > 1 && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 28, flexWrap: "wrap" }}>
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
                    <img src={A(it.assetKey.endsWith(".png") || it.assetKey.endsWith(".webp") ? it.assetKey : "me-banner.png")} alt="" style={{ width: 40, height: 40, objectFit: "contain", flex: "none" }} />
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

          {/* Recent ranked match — signed-in only */}
          {recent && (
            <SidebarCard title="Your Last Match">
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

export default BlogPage;
