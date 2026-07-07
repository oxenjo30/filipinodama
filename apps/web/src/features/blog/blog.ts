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

/** All articles, newest-first (as authored in articles.json). */
export const articles = articlesJson as Article[];

/** slug → Article, for O(1) lookup on the article route. */
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
