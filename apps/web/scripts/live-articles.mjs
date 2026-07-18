// live-articles.mjs — build-time "which articles are live?" logic for the
// prerender + sitemap steps. Plain ESM (runs under Node during `vite build`,
// outside tsc), reading articles.json directly (can't import the TS blog.ts).
//
// WHY A SEPARATE COPY OF THE DRIP LOGIC: the app's isPublished() (blog.ts)
// compares against `new Date()` in the RUNTIME's local timezone. Railway builds
// in UTC; the audience is in the Philippines (UTC+8). For up to 8h/day it can be
// "yesterday" in UTC while it's already "today" in PH — so a just-due article
// would be live in a PH viewer's SPA (and linked from the prerendered index and
// sitemap) but have NO static HTML. We fix that by anchoring "today" to
// Asia/Manila, which makes the prerendered set a SUPERSET of what any PH viewer
// can see. Article timestamps are all noon-UTC, so the publish DAY itself is
// timezone-invariant; only the "today" side is the hazard.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ARTICLES_JSON = join(__dirname, "..", "src", "features", "blog", "articles.json");

/** Today's calendar day in Asia/Manila as a comparable YYYY-MM-DD string. */
export function manilaToday(now = new Date()) {
  // en-CA formats as YYYY-MM-DD; timeZone pins it to PH regardless of build TZ.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** The publish DAY (YYYY-MM-DD) of an article, in Asia/Manila. Null if no/bad date. */
function publishDay(datePublished) {
  if (!datePublished) return null; // no date → treated as always-live
  const d = new Date(datePublished);
  if (Number.isNaN(d.getTime())) return null; // unparseable → always-live
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * Mirrors blog.ts isPublished(): an article is live once its publish day has
 * arrived. No/invalid date → always live. Compared as YYYY-MM-DD strings (safe
 * lexical compare), both anchored to Asia/Manila.
 */
export function isLive(article, today = manilaToday()) {
  const day = publishDay(article.datePublished);
  if (day === null) return true;
  return day <= today;
}

/** Load and parse articles.json (newest-first, as authored). */
export async function loadArticles() {
  const raw = await readFile(ARTICLES_JSON, "utf8");
  return JSON.parse(raw);
}

/** The live set + a Set of live slugs (for de-linking future targets). */
export async function liveArticles(today = manilaToday()) {
  const all = await loadArticles();
  const live = all.filter((a) => isLive(a, today));
  const liveSlugs = new Set(live.map((a) => a.slug));
  return { all, live, liveSlugs, today };
}
