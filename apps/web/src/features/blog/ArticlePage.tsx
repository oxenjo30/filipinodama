import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { articles, allBySlug, isPublished, formatDate, type BlogCategory } from "./blog";
import { BlogArticleImage } from "./BlogArticleImage";
import { articleImageFor } from "./blogImages";
import { SiteHead, articleJsonLd } from "../../lib/seo";
import { api } from "../../lib/api";

/**
 * ArticlePage — the /blog/:slug reader.
 *
 * Looks the article up across the FULL set so we can tell three cases apart:
 *   • no such slug              → "Article not found"
 *   • slug exists but future    → "This article isn't published yet" (drip
 *                                  schedule — the date hasn't arrived)
 *   • slug exists and is live   → render it
 * Renders category/date/read-time meta, the <h1> title, then the pre-sanitized
 * static HTML body via dangerouslySetInnerHTML (safe: we author & ship this HTML,
 * it contains no scripts). Prose is styled for the dark theme, scoped to
 * `.fd-article` so it never leaks into the rest of the app. It renders
 * article-level SEO metadata and a related-articles strip (up to 3 other LIVE
 * articles from the same category) plus a CTA.
 */

const CAT_ACCENT: Record<BlogCategory, string> = {
  Guides: "#f5d88a",
  Rules: "#8ab6f5",
  Strategy: "#c9a0f5",
  Culture: "#f5a0a0",
};

// ── Sidebar (mirrors BlogPage's rail so the reader matches the index) ──
type FeaturedItem = { id: string; type: string; name: string; assetKey: string; priceGold: number | null; priceDiamonds: number | null; featured: boolean };

const A = (n: string) => `/assets/${n}`;

/** Resolve a store item's thumbnail per type — same mapping as BlogPage/Store. */
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

function SidebarCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ borderRadius: 14, border: "1px solid rgba(232,184,75,.16)", background: "linear-gradient(180deg,rgba(38,22,60,.55),rgba(24,13,40,.5))", padding: 18 }}>
      <div style={{ font: "700 11px Inter", letterSpacing: "2px", textTransform: "uppercase", color: "var(--gold)", marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  );
}

// Scoped prose styles for the article body — gold headings, comfortable line
// height, ~720px measure. Static string, injected once per mount.
const PROSE_CSS = `
.fd-article{max-width:720px;margin:0 auto;color:var(--ink);font:400 16px/1.75 Inter}
.fd-article h1,.fd-article h2,.fd-article h3,.fd-article h4{font-family:Cinzel,serif;color:var(--gold-lt);line-height:1.3}
.fd-article h2{font-size:24px;margin:2em 0 .6em;padding-bottom:.3em;border-bottom:1px solid rgba(232,184,75,.18)}
.fd-article h3{font-size:19px;margin:1.6em 0 .5em;color:var(--gold)}
.fd-article h4{font-size:16px;margin:1.4em 0 .4em;color:var(--gold)}
.fd-article p{margin:0 0 1.1em}
.fd-article ul,.fd-article ol{margin:0 0 1.2em;padding-left:1.4em}
.fd-article li{margin:0 0 .5em}
.fd-article a{color:var(--gold-lt);text-decoration:underline;text-underline-offset:2px}
.fd-article a:hover{color:var(--gold)}
.fd-article strong{color:var(--ink2);font-weight:700}
.fd-article em{color:var(--ink)}
.fd-article blockquote{margin:1.2em 0;padding:.4em 1.1em;border-left:3px solid rgba(232,184,75,.5);background:rgba(15,8,32,.5);border-radius:0 8px 8px 0;color:var(--ink2)}
.fd-article code{font-family:'JetBrains Mono',monospace;font-size:.9em;background:rgba(15,8,32,.7);border:1px solid rgba(232,184,75,.2);border-radius:5px;padding:.1em .4em}
.fd-article pre{background:rgba(15,8,32,.7);border:1px solid rgba(232,184,75,.2);border-radius:10px;padding:14px 16px;overflow-x:auto;margin:0 0 1.2em}
.fd-article pre code{background:none;border:none;padding:0}
.fd-article img{max-width:100%;height:auto;border-radius:10px}
.fd-article table{width:100%;border-collapse:collapse;margin:0 0 1.2em;display:block;overflow-x:auto}
.fd-article th,.fd-article td{border:1px solid rgba(232,184,75,.2);padding:8px 12px;text-align:left}
.fd-article th{color:var(--gold-lt);font-weight:700}
`;

/**
 * Rewrite the article body's internal links at render time.
 *
 * The authored HTML links to flat filenames (e.g. href="some-slug.html"), but
 * the SPA route is /blog/:slug — so every bare *.html link would 404. Strip the
 * ".html" and prefix "/blog/". We only touch *relative* *.html hrefs: any href
 * that is already absolute (starts with http, //, or /) or is an anchor/mailto
 * is left alone, so "/play/" style links and external links are untouched here.
 */
function rewriteBodyLinks(html: string): string {
  return html.replace(/href="([^"]+?)\.html"/g, (match, path: string) => {
    // Leave absolute/protocol/anchor/mailto links alone — only rewrite bare slugs.
    if (/^([a-z][\w+.-]*:|\/\/|\/|#)/i.test(path)) return match;
    // Strip any leading "./" and a trailing slash from the slug, if present.
    const slug = path.replace(/^\.\//, "");
    return `href="/blog/${slug}"`;
  });
}

export function ArticlePage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  // Featured store items for the sidebar rail (public catalog; real data only).
  const [featured, setFeatured] = useState<FeaturedItem[]>([]);
  useEffect(() => {
    let alive = true;
    api
      .get<{ items: FeaturedItem[] }>("/api/store/items")
      .then((d) => {
        if (alive) setFeatured(d.items.filter((i) => i.featured).slice(0, 3));
      })
      .catch(() => {/* leave empty on failure */});
    return () => {
      alive = false;
    };
  }, []);

  // Look up across ALL articles (published + future) so a future-dated slug is
  // "found" — we then gate it below rather than 404'ing it.
  const found = slug ? allBySlug[slug] : undefined;
  const live = found ? isPublished(found) : false;
  const article = found && live ? found : undefined;

  // Title / description / canonical / OG / JSON-LD are owned by <SiteHead> in each
  // return branch below (Helmet), so they land in the prerendered HTML.

  // Body HTML with internal *.html links rewritten to /blog/<slug> routes.
  const bodyHtml = useMemo(
    () => (article ? rewriteBodyLinks(article.body) : ""),
    [article],
  );

  // Intercept clicks on in-app links inside the article body so they navigate
  // via react-router (SPA) instead of triggering a full page reload. Only
  // plain left-clicks on same-origin in-app hrefs (/blog/…, /play, /…) are
  // hijacked; modified clicks (new tab), external links, and anchors fall
  // through to default browser behaviour.
  const onBodyClick = useCallback(
    (e: MouseEvent<HTMLElement>) => {
      if (e.defaultPrevented) return;
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as HTMLElement).closest("a");
      if (!anchor) return;
      if (anchor.target && anchor.target !== "_self") return;
      // Use the raw attribute (not the resolved .href) to keep it relative.
      const href = anchor.getAttribute("href");
      if (!href) return;
      // Only intercept in-app absolute paths; leave external/protocol/anchor links.
      if (!href.startsWith("/") || href.startsWith("//")) return;
      e.preventDefault();
      navigate(href);
    },
    [navigate],
  );

  // Up to 3 other LIVE articles from the same category (excludes the current one).
  const related = useMemo(() => {
    if (!article) return [];
    return articles
      .filter((a) => a.category === article.category && a.slug !== article.slug)
      .slice(0, 3);
  }, [article]);

  // Slug exists but its publish date hasn't arrived — a friendly "coming soon"
  // rather than pretending it doesn't exist.
  if (found && !live) {
    const when = formatDate(found.datePublished);
    return (
      <div style={{ maxWidth: 720, margin: "0 auto", padding: 26 }}>
        <SiteHead
          title={`Coming soon — ${found.title} — FilipinoDama`}
          description="This Dama article isn't published yet."
          path={`/blog/${found.slug}`}
          noindex
        />
        <div className="frame" style={{ padding: "48px 20px", textAlign: "center" }}>
          <div style={{ fontSize: 34, marginBottom: 10 }}>📅</div>
          <div style={{ font: "700 18px Cinzel,serif", color: "var(--gold-lt)" }}>
            This article isn&apos;t published yet
          </div>
          <div style={{ font: "400 13px Inter", color: "var(--ink)", margin: "8px 0 18px" }}>
            “{found.title}” goes live{when ? ` on ${when}` : " soon"}. Check back then —
            or explore the guides already published.
          </div>
          <Link to="/blog" className="btn btn-purple" style={{ textDecoration: "none" }}>
            ← Browse the blog
          </Link>
        </div>
      </div>
    );
  }

  if (!article) {
    return (
      <div style={{ maxWidth: 720, margin: "0 auto", padding: 26 }}>
        <SiteHead
          title="Article not found — FilipinoDama"
          description="We couldn't find that article."
          path="/blog"
          noindex
        />
        <div className="frame" style={{ padding: "48px 20px", textAlign: "center" }}>
          <div style={{ fontSize: 34, marginBottom: 10 }}>📄</div>
          <div style={{ font: "700 18px Cinzel,serif", color: "var(--gold-lt)" }}>
            Article not found
          </div>
          <div style={{ font: "400 13px Inter", color: "var(--ink)", margin: "8px 0 18px" }}>
            We couldn&apos;t find that article. It may have moved or the link is mistyped.
          </div>
          <Link to="/blog" className="btn btn-purple" style={{ textDecoration: "none" }}>
            ← All articles
          </Link>
        </div>
      </div>
    );
  }

  const accent = CAT_ACCENT[article.category];
  const date = formatDate(article.datePublished);
  const heroImage = articleImageFor(article);

  return (
    <div className="fd-page-pad" style={{ maxWidth: 1200, margin: "0 auto", padding: "26px 26px 60px" }}>
      <SiteHead
        title={`${article.title} — FilipinoDama`}
        description={article.description}
        path={`/blog/${article.slug}`}
        ogType="article"
        image={heroImage.url}
        jsonLd={articleJsonLd({ ...article, image: heroImage.url })}
      />
      <style>{PROSE_CSS}</style>

      {/* Two-column: reading column + sidebar rail (collapses on mobile). */}
      <div className="fd-two-col" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 300px", gap: 26, alignItems: "start" }}>
        {/* MAIN: header + article body + footer */}
        <div style={{ minWidth: 0 }}>
          <Link
            to="/blog"
            style={{ font: "600 12px Inter", color: "var(--ink2)", textDecoration: "none" }}
          >
            ← All articles
          </Link>

          {/* META: category pill + date · read time */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "18px 0 12px", flexWrap: "wrap" }}>
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
              {article.category}
            </span>
            <span style={{ font: "500 12px Inter", color: "var(--ink2)" }}>
              {date ? `${date} · ` : ""}
              {article.readMin} min read
            </span>
          </div>

          <h1 style={{ font: "800 clamp(26px,3.6vw,34px)/1.25 Cinzel,serif", color: "var(--gold-lt)", margin: "0 0 24px", overflowWrap: "anywhere" }}>
            {article.title}
          </h1>

          <BlogArticleImage article={article} variant="article" priority />

          {/* BODY — pre-sanitized static HTML we ship (no scripts); safe to render.
              The .fd-article measure caps at 720px so long prose stays readable
              even though the column can be wider. */}
          <article
            className="fd-article"
            style={{ marginLeft: 0, marginRight: 0 }}
            onClick={onBodyClick}
            dangerouslySetInnerHTML={{ __html: bodyHtml }}
          />

          {/* FOOTER: back link + CTA */}
          <div
            style={{
              maxWidth: 720,
              margin: "36px 0 0",
              paddingTop: 24,
              borderTop: "1px solid rgba(232,184,75,.18)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 14,
              flexWrap: "wrap",
            }}
          >
            <Link
              to="/blog"
              style={{ font: "600 13px Inter", color: "var(--ink2)", textDecoration: "none" }}
            >
              ← All articles
            </Link>
            <Link to="/play" className="btn btn-gold" style={{ textDecoration: "none" }}>
              ♟ Play Dama online
            </Link>
          </div>
        </div>

        {/* SIDEBAR — matches the blog index rail (Play CTA, Featured store, Related). */}
        <aside style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <SidebarCard title="Play Dama">
            <div style={{ font: "400 13px/1.6 Inter", color: "var(--ink)", marginBottom: 12 }}>
              Ready to test what you&apos;ve read? Jump into a match.
            </div>
            <Link to="/play" className="btn btn-gold" style={{ width: "100%", justifyContent: "center", padding: 12, textDecoration: "none", boxSizing: "border-box" }}>
              ♟ Play Now
            </Link>
          </SidebarCard>

          {related.length > 0 && (
            <SidebarCard title={`More in ${article.category}`}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {related.map((r) => {
                  const rDate = formatDate(r.datePublished);
                  return (
                    <Link
                      key={r.slug}
                      to={`/blog/${r.slug}`}
                      style={{ display: "block", padding: 10, borderRadius: 10, border: "1px solid rgba(232,184,75,.12)", background: "rgba(0,0,0,.2)", textDecoration: "none", color: "inherit" }}
                    >
                      <div style={{ font: "700 13px Cinzel,serif", color: "var(--gold-lt)", lineHeight: 1.3 }}>{r.title}</div>
                      <div style={{ marginTop: 4, font: "500 11px Inter", color: "var(--ink2)" }}>
                        {rDate ? `${rDate} · ` : ""}{r.readMin} min read
                      </div>
                    </Link>
                  );
                })}
              </div>
            </SidebarCard>
          )}

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
        </aside>
      </div>
    </div>
  );
}

export default ArticlePage;
