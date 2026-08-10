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
    title: "Is Dama the Same as Checkers? Key Differences",
    description:
      "No. Filipino Dama and checkers share an 8x8 board, but Dama uses maximum captures, backward-capturing men, and a flying king.",
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
      "Discover the history of Dama in the Philippines, from Spanish draughts to the Filipino game of maximum captures and flying kings.",
  },
  "2026-06-23-is-dama-the-same-as-damath": {
    title: "Dama vs Damath: Key Differences",
    description:
      "Dama and Damath both use a checkerboard, but Dama is a capture-based strategy game while Damath adds mathematics and scoring.",
  },
} satisfies Record<string, Pick<Article, "title" | "description">>;

function refreshArticleBody(article: Article): string {
  let body = article.body;

  switch (article.slug) {
    case "2026-06-20-dama-vs-checkers-what-is-the-difference":
      return body
        .replace(
          /<div>\s*<strong>Quick answer:<\/strong>[\s\S]*?<\/div>/,
          `<div>\n    <strong>Quick answer:</strong> <strong>No, Dama is not the same as American checkers.</strong> Both games use an 8x8 board and 12 pieces per player, but Filipino Dama requires the maximum-capture line, lets men capture backward, and gives crowned pieces the long-range movement of a flying king.\n  </div>`,
        )
        .replace(
          `<li>Pieces move diagonally and capture by jumping over an adjacent enemy into the empty square beyond.</li>`,
          `<li>Pieces move diagonally and capture by jumping over an enemy into an empty landing square beyond.</li>`,
        )
        .replace(
          `<p>Dama and checkers both use an 8×8 board and 12 pieces per side, but Filipino Dama requires you to take the capture path that removes the most pieces, while American checkers lets you take any available jump. Dama also promotes a pawn to a long-range flying king, whereas a checkers king moves only one square at a time.</p>`,
          `<p>Dama and checkers both use an 8x8 board and 12 pieces per side, but Filipino Dama requires the capture path that removes the most pieces, lets men capture backward, and promotes a pawn to a long-range flying king. American checkers uses a short king and does not force the longest capture line.</p>`,
        )
        .replace(
          /<h2>Quick Comparison Table<\/h2>[\s\S]*?<h2>Which Game Is Harder\?<\/h2>/,
          `<h2>Quick Comparison Table</h2>\n  <table>\n    <caption>Key rule differences between Filipino Dama and American checkers</caption>\n    <thead>\n      <tr><th scope="col">Rule</th><th scope="col">Filipino Dama</th><th scope="col">American Checkers</th></tr>\n    </thead>\n    <tbody>\n      <tr><th scope="row">Board and pieces</th><td>8x8 board, 12 pieces per player</td><td>8x8 board, 12 pieces per player</td></tr>\n      <tr><th scope="row">Men moving</th><td>One square diagonally forward</td><td>One square diagonally forward</td></tr>\n      <tr><th scope="row">Men capturing</th><td>Forward or backward</td><td>Forward only</td></tr>\n      <tr><th scope="row">Capture choice</th><td>Mandatory; take the maximum-capture line</td><td>Mandatory; any available capture is allowed</td></tr>\n      <tr><th scope="row">King movement</th><td>Flying king: any distance along an open diagonal</td><td>One square diagonally</td></tr>\n      <tr><th scope="row">King capture range</th><td>Can capture from distance and land beyond the piece</td><td>Captures one adjacent piece</td></tr>\n    </tbody>\n  </table>\n\n  <h2>Which Game Is Harder?</h2>`,
        );

    case "2026-07-09-how-many-pieces-are-in-dama":
      return body;

    case "2026-07-02-can-you-move-backwards-in-dama":
      body = body
        .replace(
          `<div>\n    <strong>Quick answer:</strong> A regular Dama pawn <strong>cannot move backward</strong> and <strong>cannot capture backward</strong>. Only a promoted king can move backward, and it can fly any distance along an open diagonal in either direction.\n  </div>`,
          `<div>\n    <strong>Quick answer:</strong> A regular Dama man <strong>cannot move backward without capturing</strong>, but it <strong>can capture backward</strong>. A promoted king can move and capture backward freely, flying any distance along an open diagonal.\n  </div>`,
        )
        .replace(
          `<p>It's one of the most common questions from players who are just picking up Filipino Dama: <em>can you move backwards in dama?</em> The short answer is "it depends on which piece you're moving." Pawns and kings follow completely different rules in this regard, and understanding the distinction is fundamental to playing the game correctly. Here is the full picture.</p>`,
          `<p>It's one of the most common questions from players who are just picking up Filipino Dama: <em>can you move backwards in dama?</em> The short answer is: <strong>men cannot move backward without capturing, but they can capture backward; kings can move and capture backward freely.</strong> Understanding that distinction is fundamental to playing the game correctly. Here is the full picture.</p>`,
        )
        .replace(
          `<p>A regular pawn in Filipino Dama can only move <strong>diagonally forward</strong>—one step at a time, toward your opponent's side of the board. It cannot move sideways, and it absolutely cannot step backward under normal movement. This is identical to how pieces work in international draughts or standard checkers.</p>`,
          `<p>A regular man in Filipino Dama can only make a quiet move <strong>diagonally forward</strong> — one step at a time, toward your opponent's side of the board. It cannot move sideways, and it cannot step backward when no capture is involved. Captures are the important exception.</p>`,
        )
        .replace(
          `<p>This is where Filipino Dama diverges from some regional variants. In Filipino Dama, <strong>pawns cannot capture backwards</strong>. A pawn's capture must also be forward—jumping over an adjacent enemy piece diagonally into the empty square beyond, and that square must be in the forward direction. If an enemy piece is sitting behind your pawn, you cannot jump it no matter how tempting it looks.</p>\n\n  <p>This rule is often confused because some house rules or regional variants do allow backward captures for pawns. If you have played another version before, be aware that the standard Filipino Dama rule is forward-only movement and capture for pawns, full stop.</p>`,
          `<p>Yes. This is the rule that trips up many checkers players: in Filipino Dama, <strong>men may capture backward</strong>. If an enemy piece sits on any adjacent diagonal and the landing square beyond it is empty, that jump can be legal whether it points forward or backward.</p>\n\n  <p>Because captures are mandatory, a backward capture is not optional when it is the required or longest available capture line. Before every move, scan all four diagonals for jumps, not only the two forward diagonals.</p>`,
        )
        .replace(
          `<li><strong>Pawn moving:</strong> Diagonally forward only, one square.</li>\n    <li><strong>Pawn capturing:</strong> Diagonally forward only, jumping one enemy piece into an empty square beyond.</li>`,
          `<li><strong>Man moving:</strong> Diagonally forward only, one square.</li>\n    <li><strong>Man capturing:</strong> Diagonally forward or backward, jumping one adjacent enemy piece into an empty square beyond.</li>`,
        )
        .replace(
          `<p>It depends on the piece. A regular pawn can only move diagonally forward, one square at a time, and cannot step or capture backward. A king, or flying king, can move and capture diagonally in any direction—including backwards—across any number of empty squares.</p>`,
          `<p>It depends on the action. A regular man can only move one square diagonally forward when no capture is involved, but it can capture backward. A king, or flying king, can move and capture diagonally in any direction, including backwards, across any number of empty squares.</p>`,
        )
        .replace(
          `<p>No. In standard Filipino Dama a pawn's capture must be forward only. Some regional or house variants allow backward captures, but the standard rule is forward-only movement and capture for pawns.</p>`,
          `<p>Yes. In Filipino Dama, a man can capture backward if the enemy piece is on an adjacent diagonal and the landing square beyond it is empty. Since captures are mandatory, that backward jump must be taken when it is the required capture line.</p>`,
        );
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
