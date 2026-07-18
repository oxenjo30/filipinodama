// prerender.mjs — emit static HTML for the content routes so crawlers + AI answer
// engines see real text (the SPA otherwise ships an empty #root shell).
//
// Runs as the LAST step of `pnpm --filter web build`, AFTER:
//   1. `vite build`                          → dist/            (client bundle + index.html)
//   2. `vite build --ssr entry-prerender`    → dist-ssr/entry-prerender.js  (Node render())
//
// For "/", "/blog", and each LIVE "/blog/<slug>", it calls the SSR render(), injects
// the body + Helmet head into the built dist/index.html template, de-links any body
// links that point to not-yet-live articles, and writes dist/<route>/index.html.
// It also regenerates dist/sitemap.xml from the same live set (single source of truth).

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { liveArticles } from "./live-articles.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = join(__dirname, "..");
const DIST = join(WEB_ROOT, "dist");
const SSR_ENTRY = join(WEB_ROOT, "dist-ssr", "entry-prerender.js");
const ORIGIN = "https://filipinodama.com";

async function main() {
  // 1. Load the SSR render() from the Node build.
  const { render } = await import(pathToFileURL(SSR_ENTRY).href);

  // 2. The built client shell we inject into. CRITICAL: read it ONCE into memory as
  //    the pristine template BEFORE writing any route. "/" is written back to
  //    dist/index.html, so if we re-read the file per page we'd pollute every
  //    subsequent page with the home route's head (two canonicals). Vite empties
  //    dist on each build, so on a real build this file is always the clean shell;
  //    holding it in a const also makes a standalone re-run idempotent.
  const template = await readFile(join(DIST, "index.html"), "utf8");
  // Guard: if a prior standalone run already injected the home head into index.html,
  // strip any injected per-route Helmet tags so we start from a clean base.
  const cleanTemplate = stripInjectedHead(template);

  // 3. The drip-aware live set (Asia/Manila anchored — see live-articles.mjs).
  const { live, liveSlugs, today } = await liveArticles();

  // Routes to prerender: home, blog index, and each live article.
  const routes = ["/", "/blog", ...live.map((a) => `/blog/${a.slug}`)];

  let written = 0;
  for (const route of routes) {
    const { html, head } = render(route);
    // De-link body links whose target isn't live yet, so prerendered pages don't
    // point crawlers at not-yet-published (thin) pages. Applies to article bodies
    // only; the home/blog shells have no such links.
    const deLinked = deLinkFutureTargets(html, liveSlugs);
    const page = injectIntoTemplate(cleanTemplate, deLinked, head);
    await writeRoute(route, page);
    written++;
  }

  // 4. Branded 404 page: render the router's catch-all (NotFoundPage, which
  //    carries a noindex meta) at an unmatched path. serve-handler automatically
  //    returns dist/404.html with HTTP 404 for paths that match no file and no
  //    rewrite — which, with the enumerated rewrites below, is exactly the set of
  //    genuinely-unknown URLs.
  {
    const { html, head } = render("/__not_found__");
    await writeFile(join(DIST, "404.html"), injectIntoTemplate(cleanTemplate, html, head), "utf8");
  }

  // 5. serve.json — the static host's routing. VERIFIED BEHAVIOR (do not "simplify"
  //    back to a catch-all): serve-handler resolves exact files before rewrites, but
  //    a bare "**" catch-all rewrite SUPPRESSES directory-index resolution for every
  //    path (even rules listed before it — rewrites are not first-match-wins), which
  //    served the home shell for /blog and every article. So: NO catch-all. The SPA's
  //    app routes are enumerated explicitly (the route table in App.tsx is finite);
  //    content routes (/blog/**) resolve natively to their prerendered files; anything
  //    else falls through to 404.html with a real HTTP 404 status.
  const SPA_SEGMENTS = [
    "login", "register", "reset", "verify",
    "play", "damath", "rooms", "leaderboard", "learn", "store", "orders",
    "inventory", "profile", "friends", "messages", "guilds", "quests",
    "season", "tournaments", "watch", "settings", "legal", "privacy",
    "terms", "community", "anti-cheat", "data", "contact",
  ];
  const serveConfig = {
    directoryListing: false,
    rewrites: SPA_SEGMENTS.flatMap((seg) => [
      { source: seg, destination: "/index.html" },
      { source: `${seg}/**`, destination: "/index.html" },
    ]),
  };
  await writeFile(join(DIST, "serve.json"), JSON.stringify(serveConfig, null, 2) + "\n", "utf8");

  // 6. Regenerate the sitemap from the same live set.
  await writeSitemap(live);

  console.log(
    `[prerender] Asia/Manila today=${today}: wrote ${written} pages ` +
      `(/, /blog, ${live.length} articles) + 404.html + serve.json + sitemap.xml`,
  );
}

/**
 * Replace <a href="/blog/<slug>">…</a> with a plain <span> when <slug> is NOT in
 * the live set — otherwise a prerendered live page links to a not-yet-published
 * article (a thin "coming soon" page / crawl dead-end). The <a>'s text is kept.
 */
function deLinkFutureTargets(html, liveSlugs) {
  return html.replace(
    /<a\b([^>]*?)href="\/blog\/([^"#?]+)"([^>]*)>([\s\S]*?)<\/a>/gi,
    (match, pre, slug, post, text) => {
      if (liveSlugs.has(slug)) return match; // live → keep the link
      return `<span${pre}${post}>${text}</span>`; // future → strip the link
    },
  );
}

/**
 * Undo a prior prerender injection so a standalone re-run starts from a clean base.
 * Helmet tags all carry data-rh="true"; the shell's own tags never do. We also
 * clear any previously-injected #root body. On a real `vite build` (which empties
 * dist) index.html is already pristine, so this is a no-op there — it only matters
 * for repeated standalone `node scripts/prerender.mjs` runs during development.
 */
function stripInjectedHead(template) {
  return template
    .replace(/\s*<[a-z]+[^>]*\sdata-rh="true"[^>]*>[\s\S]*?<\/[a-z]+>/gi, "")
    .replace(/\s*<(meta|link)[^>]*\sdata-rh="true"[^>]*\/?>/gi, "")
    .replace(/<div id="root">[\s\S]*?<\/div>/, '<div id="root"></div>');
}

/** Inject rendered body + head into the built index.html template. */
function injectIntoTemplate(template, bodyHtml, headHtml) {
  let out = template.replace(
    '<div id="root"></div>',
    `<div id="root">${bodyHtml}</div>`,
  );
  if (headHtml) {
    // Remove the shell's static no-JS <title> fallback: Helmet always emits its own
    // per-route <title>, and a browser/crawler uses the FIRST <title> it sees — so
    // leaving the generic shell title in would override the article's title.
    out = out.replace(/\s*<title>[^<]*<\/title>/, "");
    out = out.replace("</head>", `    ${headHtml}\n  </head>`);
  }
  return out;
}

/** Write dist/<route>/index.html (root → dist/index.html). */
async function writeRoute(route, html) {
  const rel = route === "/" ? "index.html" : join(route.replace(/^\/+/, ""), "index.html");
  const outPath = join(DIST, rel);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, html, "utf8");
}

/** Sitemap: home + blog index + each live article, with honest lastmod. */
async function writeSitemap(live) {
  const latest = live
    .map((a) => a.datePublished)
    .filter(Boolean)
    .sort()
    .at(-1);
  const lastmod = (iso) => (iso ? `\n    <lastmod>${iso.slice(0, 10)}</lastmod>` : "");

  const urls = [
    `  <url>\n    <loc>${ORIGIN}/</loc>${lastmod(latest)}\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>`,
    `  <url>\n    <loc>${ORIGIN}/blog</loc>${lastmod(latest)}\n    <changefreq>daily</changefreq>\n    <priority>0.8</priority>\n  </url>`,
    ...live.map(
      (a) =>
        `  <url>\n    <loc>${ORIGIN}/blog/${a.slug}</loc>${lastmod(a.datePublished)}\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>`,
    ),
  ];

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.join("\n") +
    `\n</urlset>\n`;

  await writeFile(join(DIST, "sitemap.xml"), xml, "utf8");
}

main().catch((err) => {
  console.error("[prerender] FAILED:", err);
  process.exit(1);
});
