import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { articles, categories, formatDate, type BlogCategory } from "./blog";

/**
 * BlogPage — the /blog index.
 *
 * Lists the 145 real articles from articles.json (via ./blog). A category filter
 * row (All + the 4 real categories) and a title/description search narrow the
 * grid of cards; each card links to /blog/:slug. When a search matches nothing we
 * show an honest empty state rather than a blank grid. Styling follows the app's
 * gold/dark frame language (`.frame`, `.pill`, CSS vars).
 */

type Filter = "All" | BlogCategory;

// Category → pill accent, so each category reads distinctly in the grid.
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

export function BlogPage() {
  const [filter, setFilter] = useState<Filter>("All");
  const [query, setQuery] = useState("");

  useEffect(() => {
    document.title = "Dama Blog — FilipinoDama";
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return articles.filter((a) => {
      if (filter !== "All" && a.category !== filter) return false;
      if (!q) return true;
      return (
        a.title.toLowerCase().includes(q) || a.description.toLowerCase().includes(q)
      );
    });
  }, [filter, query]);

  const tabs: Filter[] = ["All", ...categories];

  return (
    <div style={{ maxWidth: 1560, margin: "0 auto", padding: 26 }}>
      {/* HEADER */}
      <div style={{ textAlign: "center", marginBottom: 22 }}>
        <div style={{ font: "800 34px Cinzel,serif", color: "var(--gold-lt)" }}>Dama Blog</div>
        <div style={{ font: "400 14px Inter", color: "var(--ink)", marginTop: 6 }}>
          Guides, rules &amp; strategy
        </div>
      </div>

      {/* CONTROLS: category filter row + search */}
      <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 22,
        }}
      >
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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
          style={{
            minWidth: 240,
            flex: "0 1 320px",
            padding: "10px 14px",
            borderRadius: 8,
            border: "1px solid rgba(232,184,75,.3)",
            background: "rgba(15,8,32,.6)",
            color: "var(--ink)",
            font: "500 13px Inter",
            outline: "none",
          }}
        />
      </div>

      {/* RESULTS */}
      {filtered.length === 0 ? (
        <div className="frame" style={{ padding: "48px 20px", textAlign: "center" }}>
          <div style={{ fontSize: 34, marginBottom: 10 }}>🔍</div>
          <div style={{ font: "700 16px Cinzel,serif", color: "var(--gold-lt)" }}>
            No articles found
          </div>
          <div style={{ font: "400 13px Inter", color: "var(--ink)", margin: "8px 0 0" }}>
            Nothing matches “{query.trim()}”
            {filter !== "All" ? ` in ${filter}` : ""}. Try a different search or category.
          </div>
        </div>
      ) : (
        <>
          <div style={{ font: "500 12px Inter", color: "var(--ink2)", marginBottom: 14 }}>
            {filtered.length} article{filtered.length === 1 ? "" : "s"}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))",
              gap: 18,
            }}
          >
            {filtered.map((a) => {
              const date = formatDate(a.datePublished);
              return (
                <Link
                  key={a.slug}
                  to={`/blog/${a.slug}`}
                  className="frame"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                    padding: 20,
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  <CategoryPill category={a.category} />
                  <div
                    style={{
                      font: "700 18px Cinzel,serif",
                      color: "var(--gold-lt)",
                      lineHeight: 1.25,
                    }}
                  >
                    {a.title}
                  </div>
                  <div
                    style={{
                      font: "400 13px/1.6 Inter",
                      color: "var(--ink)",
                      display: "-webkit-box",
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {a.description}
                  </div>
                  <div
                    style={{
                      marginTop: "auto",
                      paddingTop: 6,
                      font: "500 11px Inter",
                      color: "var(--ink2)",
                    }}
                  >
                    {date ? `${date} · ` : ""}
                    {a.readMin} min read
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export default BlogPage;
