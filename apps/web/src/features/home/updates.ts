import { publishedArticles } from "../blog/blog";

/**
 * Home "Recent Updates" feed. Merges two REAL sources — no fake announcements:
 *   1. Curated game updates (things that are actually live), maintained here.
 *   2. The latest published blog posts (auto-included; drops in as blog grows).
 * Sorted newest-first. "View All" on the card links to the Blog.
 *
 * When adding a game update, put a real ISO date and only announce things that
 * actually shipped — this card is player-facing and should never advertise a
 * feature that isn't live.
 */

export type UpdateKind = "NEW" | "UPDATE" | "BLOG";

export type UpdateItem = {
  kind: UpdateKind;
  /** tag label + colour */
  tag: string;
  tagBg: string;
  title: string;
  body: string;
  /** ISO date of the update */
  date: string;
  /** emoji glyph shown in the tile */
  glyph: string;
  /** where the item links (blog slug path, or an in-app route) */
  href?: string;
};

/** Curated, REAL game updates. Keep these accurate — only things that shipped. */
const GAME_UPDATES: UpdateItem[] = [
  {
    kind: "NEW",
    tag: "NEW",
    tagBg: "#2f8f5b",
    title: "15 New Premium Cosmetics",
    body: "Filipino-heritage piece skins, avatars and profile frames — now in the Store.",
    date: "2026-07-08",
    glyph: "💎",
    // Deep-link to a flagship new cosmetic so the announcement lands ON an item
    // (the Store opens its preview via ?item=), not just the generic catalog.
    href: "/store?item=sarimanokskin",
  },
  {
    kind: "UPDATE",
    tag: "SEASON",
    tagBg: "#c99a2e",
    title: "Royal Season Pass",
    body: "Climb the reward track for free & premium rewards. Unlock it on the Season page.",
    date: "2026-07-07",
    glyph: "👑",
    href: "/season",
  },
  {
    kind: "NEW",
    tag: "NEW",
    tagBg: "#2f5da8",
    title: "Dama Blog is Live",
    body: "Guides, rules, strategy and Filipino Dama culture — fresh reads every week.",
    date: "2026-07-07",
    glyph: "📰",
    href: "/blog",
  },
];

/** Human "N days ago" / date label from an ISO date. */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const days = Math.floor((now.getTime() - then.getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  return then.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * The merged Recent-Updates feed: curated game updates + the latest published
 * blog posts, newest-first. `blogCount` caps how many blog items to include.
 */
export function recentUpdates(now: Date = new Date(), limit = 4, blogCount = 2): UpdateItem[] {
  const blog: UpdateItem[] = publishedArticles(now)
    .slice(0, blogCount)
    .map((a) => ({
      kind: "BLOG" as const,
      tag: "BLOG",
      tagBg: "#7a4fbf",
      title: a.title,
      body: a.description,
      date: a.datePublished ?? "",
      glyph: "📖",
      href: `/blog/${a.slug}`,
    }));

  return [...GAME_UPDATES, ...blog]
    .filter((u) => u.date) // drop undated
    .sort((x, y) => y.date.localeCompare(x.date))
    .slice(0, limit);
}
