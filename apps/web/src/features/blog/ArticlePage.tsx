import { useCallback, useEffect, useMemo, type MouseEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { articles, allBySlug, isPublished, formatDate, type BlogCategory } from "./blog";

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
 * `.fd-article` so it never leaks into the rest of the app. On mount we set
 * document.title and the meta description for SEO, and render a related-articles
 * strip (up to 3 other LIVE articles from the same category) plus a CTA.
 */

const CAT_ACCENT: Record<BlogCategory, string> = {
  Guides: "#f5d88a",
  Rules: "#8ab6f5",
  Strategy: "#c9a0f5",
  Culture: "#f5a0a0",
};

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

/** Set/create <meta name="description"> for SEO, restoring nothing on unmount
 *  (each article overwrites it on mount; that's the desired behaviour). */
function setMetaDescription(content: string) {
  let el = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", "description");
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

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
  // Look up across ALL articles (published + future) so a future-dated slug is
  // "found" — we then gate it below rather than 404'ing it.
  const found = slug ? allBySlug[slug] : undefined;
  const live = found ? isPublished(found) : false;
  const article = found && live ? found : undefined;

  useEffect(() => {
    if (!article) {
      document.title = "Dama Blog — FilipinoDama";
      return;
    }
    document.title = `${article.title} — FilipinoDama`;
    setMetaDescription(article.description);
  }, [article]);

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

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 26 }}>
      <style>{PROSE_CSS}</style>

      <div style={{ maxWidth: 720, margin: "0 auto" }}>
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

        <h1 style={{ font: "800 34px/1.25 Cinzel,serif", color: "var(--gold-lt)", margin: "0 0 24px" }}>
          {article.title}
        </h1>
      </div>

      {/* BODY — pre-sanitized static HTML we ship (no scripts); safe to render. */}
      <article
        className="fd-article"
        onClick={onBodyClick}
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
      />

      {/* FOOTER: back link + CTA */}
      <div
        style={{
          maxWidth: 720,
          margin: "36px auto 0",
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

      {/* RELATED — up to 3 more from the same category */}
      {related.length > 0 && (
        <div style={{ maxWidth: 720, margin: "40px auto 0" }}>
          <div className="ptitle" style={{ textAlign: "left" }}>
            More in {article.category}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill,minmax(210px,1fr))",
              gap: 14,
            }}
          >
            {related.map((r) => {
              const rDate = formatDate(r.datePublished);
              return (
                <Link
                  key={r.slug}
                  to={`/blog/${r.slug}`}
                  className="frame"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    padding: 16,
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  <div style={{ font: "700 15px Cinzel,serif", color: "var(--gold-lt)", lineHeight: 1.25 }}>
                    {r.title}
                  </div>
                  <div style={{ marginTop: "auto", font: "500 11px Inter", color: "var(--ink2)" }}>
                    {rDate ? `${rDate} · ` : ""}
                    {r.readMin} min read
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default ArticlePage;
