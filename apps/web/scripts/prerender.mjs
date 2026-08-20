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

  // 2. The built client shell we inject into. "/" is written back over
  //    dist/index.html, so the pristine template must be preserved elsewhere for
  //    standalone re-runs: on a fresh `vite build` (which empties dist) we read the
  //    clean shell and snapshot it into dist-ssr/ (never served, never shipped); if
  //    dist/index.html already carries injected Helmet tags (data-rh) we're in a
  //    re-run and use the snapshot instead. Regex-stripping a nested-div body to
  //    "undo" injection is not reliably possible — don't reintroduce it.
  const templateSnapshot = join(WEB_ROOT, "dist-ssr", "template.html");
  const distIndex = await readFile(join(DIST, "index.html"), "utf8");
  let cleanTemplate;
  if (distIndex.includes("data-rh=")) {
    cleanTemplate = await readFile(templateSnapshot, "utf8").catch(() => {
      throw new Error(
        "[prerender] dist/index.html is already injected and no pristine snapshot " +
          "exists — run a full `pnpm build` instead of a standalone re-run.",
      );
    });
  } else {
    cleanTemplate = distIndex;
    await writeFile(templateSnapshot, cleanTemplate, "utf8");
  }

  // 3. The drip-aware live set (Asia/Manila anchored — see live-articles.mjs).
  const { live, liveSlugs, today } = await liveArticles();

  // Routes to prerender: home, blog index, the /learn rules pillar, and each
  // live article. (/learn renders its logged-out state — the public RulesGuide —
  // which is exactly what crawlers should see; per-user lesson progress stays
  // client-side.)
  const routes = [
    "/", "/blog", "/learn", "/strategy", "/play", "/traditional-filipino-games",
    "/tl/learn", "/tl/strategy",
    ...live.map((a) => `/blog/${a.slug}`),
  ];

  let written = 0;
  for (const route of routes) {
    const { html, head } = render(route);
    // De-link body links whose target isn't live yet, so prerendered pages don't
    // point crawlers at not-yet-published (thin) pages. Applies to article bodies
    // only; the home/blog shells have no such links.
    const deLinked = deLinkFutureTargets(html, liveSlugs);
    const page = injectIntoTemplate(cleanTemplate, deLinked, head);
    assertNoLegacyBlogLinks(page, route);
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
    "damath", "rooms", "leaderboard", "store", "orders",
    "inventory", "profile", "friends", "messages", "guilds", "quests",
    "season", "tournaments", "watch", "settings", "legal", "privacy",
    "terms", "community", "anti-cheat", "data", "contact",
  ];
  const serveConfig = {
    directoryListing: false,
    // Enable directory-index resolution only for the routes we prerender. A
    // global `true` also strips `.html` before custom redirects run, turning a
    // legacy /blog/posts/<slug>.html request into two hops. Enumerating the
    // modern routes preserves their extensionless URLs while legacy `.html`
    // requests reach the direct redirect rules below unchanged.
    cleanUrls: routes.flatMap((route) => route === "/" ? [route] : [route, `${route}/`]),
    // The old prototype's blog lived at /blog/posts/<slug> and Google indexed at
    // least one of those URLs. 301 them to the current /blog/<slug> so the earned
    // equity transfers instead of dying on a 404 (a slug with no current article
    // 301s onto our 404 page, which is no worse than before).
    redirects: [
      { source: "blog/posts/:slug.html", destination: "/blog/:slug", type: 301 },
      { source: "blog/posts/:slug", destination: "/blog/:slug", type: 301 },
      { source: "blog/:slug.html", destination: "/blog/:slug", type: 301 },
      // /rules 301s to the canonical rules pillar at /learn. The "dama rules"
      // content lives at /learn (title "Dama Rules — How to Play…", already
      // indexed + in the sitemap + llms.txt); /rules itself was never a route,
      // so it 404'd. Redirecting (not adding a competing /rules page) sends any
      // inbound link/typed URL to the real page and avoids duplicate-content
      // cannibalization with /learn.
      { source: "rules", destination: "/learn", type: 301 },
    ],
    rewrites: [
      ...SPA_SEGMENTS.flatMap((seg) => [
        { source: seg, destination: "/index.html" },
        { source: `${seg}/**`, destination: "/index.html" },
      ]),
      // /learn and /play are PRERENDERED (they resolve natively to their
      // dist/<route>/index.html — no rewrite for the bare segments), but the
      // screens under them are SPA and still need the shell. NOTE: these must be
      // :param rules mirroring the router's actual sub-routes and NOT "seg/**" —
      // the ** form also matches the bare segment and, because rewrites are not
      // first-match-wins, it would shadow the prerendered file.
      { source: "learn/:id", destination: "/index.html" },
      { source: "play/:mode", destination: "/index.html" },
      { source: "play/:mode/:screen", destination: "/index.html" },
    ],
  };
  await writeFile(join(DIST, "serve.json"), JSON.stringify(serveConfig, null, 2) + "\n", "utf8");

  // 6. Regenerate the sitemap from the same live set.
  await writeSitemap(live);

  console.log(
    `[prerender] Asia/Manila today=${today}: wrote ${written} pages ` +
      `(/, /blog, /learn, /strategy, /play, /traditional-filipino-games, /tl/learn, /tl/strategy, ` +
      `${live.length} articles) + 404.html + serve.json + sitemap.xml`,
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

/** Fail closed if an authored link bypasses the canonical blog-link rewrite. */
function assertNoLegacyBlogLinks(html, route) {
  const legacyPosts = /href=(["'])(?:https:\/\/filipinodama\.com)?\/blog\/posts\/[^"']*\1/i;
  const legacyHtml = /href=(["'])(?:https:\/\/filipinodama\.com)?\/blog\/[^/"?#]+\.html(?:[?#][^"']*)?\1/i;
  if (legacyPosts.test(html) || legacyHtml.test(html)) {
    throw new Error(`[prerender] legacy same-origin blog link leaked into ${route}`);
  }
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

  // hreflang annotations for the translated pillar pairs. Google requires the
  // full reciprocal set on EVERY member of a pair (self-referential included),
  // mirroring the <link rel="alternate"> tags each page emits in its head.
  // "tl-PH" (Tagalog) NOT "fil-PH": Google's hreflang only accepts ISO 639-1
  // languages, and Filipino has no 639-1 code — "fil" would be ignored.
  const alternatesFor = (en, tl) =>
    `\n    <xhtml:link rel="alternate" hreflang="en-PH" href="${ORIGIN}${en}"/>` +
    `\n    <xhtml:link rel="alternate" hreflang="tl-PH" href="${ORIGIN}${tl}"/>` +
    `\n    <xhtml:link rel="alternate" hreflang="x-default" href="${ORIGIN}${en}"/>`;
  const learnAlts = alternatesFor("/learn", "/tl/learn");
  const strategyAlts = alternatesFor("/strategy", "/tl/strategy");

  const urls = [
    `  <url>\n    <loc>${ORIGIN}/</loc>${lastmod(latest)}\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>`,
    `  <url>\n    <loc>${ORIGIN}/learn</loc>${learnAlts}\n    <changefreq>monthly</changefreq>\n    <priority>0.9</priority>\n  </url>`,
    `  <url>\n    <loc>${ORIGIN}/strategy</loc>${strategyAlts}\n    <changefreq>monthly</changefreq>\n    <priority>0.9</priority>\n  </url>`,
    `  <url>\n    <loc>${ORIGIN}/tl/learn</loc>${learnAlts}\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n  </url>`,
    `  <url>\n    <loc>${ORIGIN}/tl/strategy</loc>${strategyAlts}\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n  </url>`,
    `  <url>\n    <loc>${ORIGIN}/play</loc>\n    <changefreq>monthly</changefreq>\n    <priority>0.9</priority>\n  </url>`,
    `  <url>\n    <loc>${ORIGIN}/traditional-filipino-games</loc>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n  </url>`,
    `  <url>\n    <loc>${ORIGIN}/blog</loc>${lastmod(latest)}\n    <changefreq>daily</changefreq>\n    <priority>0.8</priority>\n  </url>`,
    ...live.map(
      (a) =>
        `  <url>\n    <loc>${ORIGIN}/blog/${a.slug}</loc>${lastmod(a.datePublished)}\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>`,
    ),
  ];

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n` +
    `        xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` +
    urls.join("\n") +
    `\n</urlset>\n`;

  if (/<loc>[^<]*\/blog\/posts\//i.test(xml) || /<loc>[^<]*\.html[^<]*<\/loc>/i.test(xml)) {
    throw new Error("[prerender] legacy blog URL leaked into sitemap.xml");
  }

  await writeFile(join(DIST, "sitemap.xml"), xml, "utf8");
}

main().catch((err) => {
  console.error("[prerender] FAILED:", err);
  process.exit(1);
});
