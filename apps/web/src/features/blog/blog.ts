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

const SEO_REFRESH = {
  "2026-06-20-dama-vs-checkers-what-is-the-difference": {
    title: "Are Dama and Checkers the Same? 4 Key Differences",
    description:
      "Are Dama and checkers the same? No. Compare four Filipino Dama rules: maximum captures, backward jumps, flying kings, and flexible landing choices.",
  },
  "2026-06-21-filipino-dama-rules-explained-with-examples": {
    title: "Filipino Dama Rules: Captures, Kings and Setup",
    description:
      "Learn Filipino Dama rules: 12-piece setup, mandatory maximum captures, backward captures for men, flying kings, and how to win.",
  },
  "2026-07-09-how-many-pieces-are-in-dama": {
    title: "How Many Pieces Are in Dama? 12 Per Player, 24 Total",
    description:
      "How many pieces are in Dama? Filipino Dama starts with 12 pieces per player, 24 total, placed on the dark squares of an 8x8 board.",
  },
  "2026-07-02-can-you-move-backwards-in-dama": {
    title: "Can You Move Backwards in Dama? Pawn and King Rules",
    description:
      "Can you move backwards in Dama? Men move forward but can capture backward, while kings can move and capture backward across open diagonals.",
  },
  "2026-07-06-dama-notation-how-to-read-and-record-moves": {
    title: "Dama Board Numbering and Notation Guide",
    description:
      "Learn Dama notation and board numbering: number the 32 dark squares, write simple moves, record captures, and review Filipino Dama games.",
  },
  "2026-06-19-how-to-play-filipino-dama-a-complete-beginner-guide": {
    title: "How to Play Filipino Dama: Beginner Guide",
    description:
      "Learn how to play Filipino Dama: board setup, moving, mandatory maximum captures, flying kings, and winning your first game.",
  },
  "2026-06-30-the-history-of-dama-in-the-philippines": {
    title: "History of Dama in the Philippines",
    description:
      "Explore Filipino Dama today, separate platform rules from historical claims, and learn how to document local playing traditions.",
  },
  "2026-06-23-is-dama-the-same-as-damath": {
    title: "Dama vs Damath: Key Differences",
    description:
      "Dama and Damath both use a checkerboard, but Dama is a capture-based strategy game while Damath adds mathematics and scoring.",
  },
} satisfies Record<string, Pick<Article, "title" | "description">>;

function refreshArticleBody(article: Article): string {
  const body = article.body;

  switch (article.slug) {
    case "2026-06-20-dama-vs-checkers-what-is-the-difference":
      return body
        .replace(
          `<p>At first glance, Filipino Dama and American (Western) checkers look identical: both games use an 8×8 board, both give each player 12 pieces, and both restrict movement to the dark squares. New players coming from a checkers background often assume they already know most of the rules. That assumption causes a lot of early losses. In the dama vs checkers comparison, the surface similarities hide some very significant rule differences that change how every single turn is played.</p>`,
          `<p><strong>No — Filipino Dama and American checkers are not the same game.</strong> They share an 8x8 board, 12 pieces per player, and diagonal movement, but they diverge on capture priority, backward captures, king movement, and long-range multi-jump landing choices.</p>`,
        )
        .replace(
          /<div>\s*<strong>Quick answer:<\/strong>[\s\S]*?<\/div>/,
          `<div>\n    <strong>Quick answer:</strong> <strong>No, Filipino Dama is not the same as American checkers.</strong> The four key differences are Dama's maximum-capture rule, men that can capture backward, flying kings, and long-range multi-jump landing choices. Both games use an 8x8 board and 12 pieces per player.\n  </div>`,
        )
        .replace(
          `<li>Pieces move diagonally and capture by jumping over an adjacent enemy into the empty square beyond.</li>`,
          `<li>Pieces move diagonally and capture by jumping over an enemy into an empty landing square beyond.</li>`,
        )
        .replace(
          `<p>Dama and checkers both use an 8×8 board and 12 pieces per side, but Filipino Dama requires you to take the capture path that removes the most pieces, while American checkers lets you take any available jump. Dama also promotes a pawn to a long-range flying king, whereas a checkers king moves only one square at a time.</p>`,
          `<p><strong>No: Filipino Dama and American checkers are not the same game.</strong> They share an 8x8 board and 12 pieces per side, but Dama requires the maximum-capture path, lets men capture backward, promotes a pawn to a long-range flying king, and gives flying kings more landing choices during capture chains.</p>`,
        )
        .replace(
          /<h2>Quick Comparison Table<\/h2>[\s\S]*?<h2>Which Game Is Harder\?<\/h2>/,
          `<h2>Quick Comparison Table</h2>\n  <table>\n    <caption>Key rule differences between Filipino Dama and American checkers</caption>\n    <thead>\n      <tr><th scope="col">Rule</th><th scope="col">Filipino Dama</th><th scope="col">American Checkers</th></tr>\n    </thead>\n    <tbody>\n      <tr><th scope="row">Board and pieces</th><td>8x8 board, 12 pieces per player</td><td>8x8 board, 12 pieces per player</td></tr>\n      <tr><th scope="row">Men moving</th><td>One square diagonally forward</td><td>One square diagonally forward</td></tr>\n      <tr><th scope="row">Men capturing</th><td>Forward or backward</td><td>Forward only</td></tr>\n      <tr><th scope="row">Capture choice</th><td>Mandatory; take the maximum-capture line</td><td>Mandatory; any available capture is allowed</td></tr>\n      <tr><th scope="row">King movement</th><td>Flying king: any distance along an open diagonal</td><td>One square diagonally</td></tr>\n      <tr><th scope="row">King capture range</th><td>Can capture from distance and land beyond the piece</td><td>Captures one adjacent piece</td></tr>\n    </tbody>\n  </table>\n\n  <h2>Which Game Is Harder?</h2>`,
        )
        .replace(
          `<h2>Quick Comparison Table</h2>`,
          `<h2>Filipino Dama vs American Checkers: Rule Comparison</h2>`,
        )
        .replace(
          `<h2>Difference 1: Captures Are Always Mandatory</h2>`,
          `<h2>Difference 1: Maximum-Capture Rule</h2>`,
        )
        .replace(
          `<h2>Difference 2: The Flying King</h2>`,
          `<h2>Difference 2: Backward Captures for Men</h2>\n  <p>In both games, a regular man makes quiet moves one square diagonally forward. Filipino Dama differs when a capture is available: <strong>a man can capture forward or backward</strong> by jumping an adjacent enemy into an empty square beyond it. In American checkers, an uncrowned man captures forward only.</p>\n  <p>That changes every capture scan. In Dama, check all four diagonals before choosing the required maximum-capture line; a backward jump can begin or extend that line.</p>\n\n  <h2>Difference 3: The Flying King</h2>`,
        )
        .replace(
          `<h2>Difference 3: Multi-Jump Chains and Landing Squares</h2>`,
          `<h2>Difference 4: Long-Range Multi-Jump Landing Choices</h2>`,
        )
        .replace(
          `<h2>Difference 4: No "Huffing" Penalty</h2>`,
          `<h2>Shared Modern Rule: No "Huffing" Penalty</h2>`,
        );

    case "2026-06-19-how-to-play-filipino-dama-a-complete-beginner-guide":
      return body.replace(
        `<p>Now that you know the full ruleset, you can deepen your understanding by exploring specific topics. The mandatory capture rule alone has enough nuance to fill an entire article — because it can be used as a weapon against your opponent. Kings deserve their own deep-dive because flying-king tactics are what separate beginners from strong players. And if you have played Western checkers before, you will find the comparison between the two games eye-opening.</p>`,
        `<p>Now that you know the full ruleset, you can deepen your understanding by exploring specific topics. The mandatory capture rule alone has enough nuance to fill an entire article — because it can be used as a weapon against your opponent. Kings deserve their own deep-dive because flying-king tactics are what separate beginners from strong players. If you have played Western checkers before, read <a href="/blog/2026-06-20-dama-vs-checkers-what-is-the-difference">Dama vs. Checkers: What Is the Difference?</a> to see the four rule differences that matter before your first game.</p>`,
      );

    case "2026-07-09-how-many-pieces-are-in-dama":
      return body;

    case "2026-07-06-dama-notation-how-to-read-and-record-moves":
      return body.replace(
        `<p>It is worth sketching this grid on paper the first time you use it — after a few games the square numbers become instinctive and you will not need to look them up.</p>`,
        `<p><strong>Dama board numbering quick map:</strong> the playable dark squares run 1-4 on the top row, 5-8 on the second row, 9-12 on the third row, and continue down to 29-32 on the bottom row. Memorize those eight rows and every move becomes easier to read.</p>\n\n  <p>It is worth sketching this grid on paper the first time you use it — after a few games the square numbers become instinctive and you will not need to look them up.</p>`,
      );

    default:
      return body;
  }
}

function refreshArticle(article: Article): Article {
  const seo = SEO_REFRESH[article.slug as keyof typeof SEO_REFRESH];
  if (!seo) return article;
  return { ...article, ...seo, body: refreshArticleBody(article) };
}

/** Every authored article, newest-first (published + not-yet-published). */
export const allArticles = (articlesJson as Article[]).map(refreshArticle);

/**
 * Is this article live yet? The 145 articles are a scheduled DRIP: each has a
 * publish date, and it only becomes visible once that date has arrived. An
 * article with no date is treated as always-published.
 *
 * We compare on the calendar day (YYYY-MM-DD) in Asia/Manila, so an
 * article dated "today" is live for the whole day rather than only after noon.
 */
export function manilaDay(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function isPublished(a: Article, now: Date = new Date()): boolean {
  if (!a.datePublished) return true; // no date → always live
  const d = new Date(a.datePublished);
  if (Number.isNaN(d.getTime())) return true; // unparseable → don't hide it
  return manilaDay(d) <= manilaDay(now);
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
  return d.toLocaleDateString("en-US", { timeZone: "Asia/Manila", year: "numeric", month: "long", day: "numeric" });
}
