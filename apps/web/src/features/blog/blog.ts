import articlesJson from "./articles.json";

/**
 * blog.ts — the blog's static data layer.
 *
 * The 145 real articles were extracted to ./articles.json (sorted newest-first),
 * each a { slug, title, description, datePublished, readMin, category, body }.
 * `body` is a clean, pre-sanitized semantic-HTML string we author and ship — it
 * carries no scripts, so the article page renders it via dangerouslySetInnerHTML.
 *
 * This module types that shape, re-exports the list, and offers a slug lookup,
 * the category list (in a fixed display order), and a date formatter.
 */

export type BlogCategory = "Guides" | "Rules" | "Strategy" | "Culture";

export interface Article {
  slug: string;
  title: string;
  description: string;
  /** ISO 8601 date-time, or null when the source had no publish date. */
  datePublished: string | null;
  readMin: number;
  category: BlogCategory;
  /** Clean semantic HTML (<h2>/<p>/<ul>…), pre-sanitized static content. */
  body: string;
}

/** Every authored article, newest-first (published + not-yet-published). */
export const allArticles = articlesJson as Article[];

/**
 * Is this article live yet? The 145 articles are a scheduled DRIP: each has a
 * publish date, and it only becomes visible once that date has arrived. An
 * article with no date is treated as always-published.
 *
 * We compare on the calendar day (YYYY-MM-DD) in the viewer's local time, so an
 * article dated "today" is live for the whole day rather than only after noon.
 */
export function isPublished(a: Article, now: Date = new Date()): boolean {
  if (!a.datePublished) return true; // no date → always live
  const d = new Date(a.datePublished);
  if (Number.isNaN(d.getTime())) return true; // unparseable → don't hide it
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const pub = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return pub.getTime() <= today.getTime();
}

/**
 * The articles visible RIGHT NOW — future-dated ones are hidden until their day.
 * This is the list the index, search, category filters and related-strip use.
 * Recomputed per call so a page that stays open across midnight can re-filter.
 */
export function publishedArticles(now: Date = new Date()): Article[] {
  return allArticles.filter((a) => isPublished(a, now));
}

/**
 * All articles, newest-first — published only. Most callers want this; the
 * article route additionally uses `allBySlug` to tell "not yet published" apart
 * from "no such article".
 * @deprecated for listing use `publishedArticles()`; kept for compatibility.
 */
export const articles = publishedArticles();

/** slug → Article across the FULL set (needed to detect future-dated slugs). */
export const allBySlug: Record<string, Article> = Object.fromEntries(
  allArticles.map((a) => [a.slug, a]),
);

/** slug → published Article (index/related lookups). */
export const bySlug: Record<string, Article> = Object.fromEntries(
  articles.map((a) => [a.slug, a]),
);

/** The four real categories, in a stable display order for the filter row. */
export const categories: BlogCategory[] = ["Guides", "Rules", "Strategy", "Culture"];

/**
 * Format an article's publish date for display, e.g. "April 12, 2027".
 * Returns null for a missing/invalid date so callers can omit the "· date"
 * segment rather than print "Invalid Date".
 */
export function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}
