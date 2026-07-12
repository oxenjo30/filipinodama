/**
 * assets.ts — admin-console avatar/frame resolver.
 *
 * Mirrors apps/web/src/lib/assets.ts `avatar()`/`frameArt()` EXACTLY (same
 * hardened rules — bare key → /assets/avatars/<key>.png; pass through /|http;
 * avatars/ prefix; ambiguous → champion default). The admin console renders
 * real player avatars in the Players table + detail drawer (handoffv3 row 20)
 * and needs the same fallback guarantees so a stale/unknown avatarUrl never
 * leaves a broken image — only apps/admin/public/assets/{avatars,frames} are
 * shipped here (copied verbatim from apps/web/public/assets), not the full
 * asset catalog (boards, icons, loading art, etc. are not needed in admin).
 */

const BASE = "/assets";

/** Named hero avatars — keys must match the copied apps/admin/public/assets/avatars/*.png files. */
export const AVATARS = {
  champion: `${BASE}/avatars/champion.png`,
  sovereign: `${BASE}/avatars/sovereign.png`,
  strategist: `${BASE}/avatars/strategist.png`,
  babaylan: `${BASE}/avatars/babaylan.png`,
  bagani: `${BASE}/avatars/bagani.png`,
  diwata: `${BASE}/avatars/diwata.png`,
  mandirigma: `${BASE}/avatars/mandirigma.png`,
  ermitanyo: `${BASE}/avatars/ermitanyo.png`,
  dayang: `${BASE}/avatars/dayang.png`,
  priestess: `${BASE}/avatars/priestess.png`,
  sultan: `${BASE}/avatars/sultan.png`,
  lakan: `${BASE}/avatars/lakan.png`,
  binukot: `${BASE}/avatars/binukot.png`,
  datu: `${BASE}/avatars/datu.png`,
  magwayen: `${BASE}/avatars/magwayen.png`,
  panday: `${BASE}/avatars/panday.png`,
} as const;
export type AvatarKey = keyof typeof AVATARS;

/**
 * Resolve a player's avatarUrl to a real `/assets/avatars/...png` URL. Every
 * player MUST render an avatar — an unrecognized/blank/legacy value falls back
 * to `champion` rather than an optimistic maybe-404 URL, so the admin table
 * and drawer never show a broken-image glyph before the onError fallback fires.
 */
export function avatar(key: AvatarKey | (string & {}) | null | undefined): string {
  if (!key || typeof key !== "string") return AVATARS.champion;
  if (key in AVATARS) return AVATARS[key as AvatarKey];
  // Full path / uploaded URL → pass straight through.
  if (key.startsWith("/") || key.startsWith("http")) return key;
  // Server-persisted assetKey path like "avatars/lakan.png" — normalize
  // without doubling the avatars/ segment.
  if (key.startsWith("assets/")) return `/${key}`;
  if (key.startsWith("avatars/")) return `${BASE}/${key}`;
  // Ambiguous extensioned/nested value we can't trust → default rather than
  // build a broken URL.
  if (/\.\w+$/.test(key) || key.includes("/")) return AVATARS.champion;
  // Bare key (no folder, no extension) → file is `<key>.png` (e.g. a starter
  // avatar id like "katipunero" persisted as-is).
  return `${BASE}/avatars/${key}.png`;
}

/** Cosmetic profile frames — keys must match the copied apps/admin/public/assets/frames/*.{png,webp} files. */
export const FRAMES = {
  laurel: `${BASE}/frames/laurel.png`,
  silver: `${BASE}/frames/silver.png`,
  obsidian: `${BASE}/frames/obsidian.png`,
  filigree: `${BASE}/frames/filigree.webp`,
  sunburst: `${BASE}/frames/sunburst.png`,
  "jade-dragon": `${BASE}/frames/jade-dragon.png`,
  kalasag: `${BASE}/frames/kalasag.png`,
  sampaguita: `${BASE}/frames/sampaguita.png`,
  capiz: `${BASE}/frames/capiz.png`,
} as const;
export type FrameKey = keyof typeof FRAMES;

/** Resolve a frameId to art. Returns null for no/unrecognized frame → caller renders no overlay. */
export function frameArt(key: FrameKey | (string & {}) | null | undefined): string | null {
  if (!key || typeof key !== "string") return null;
  if (key in FRAMES) return FRAMES[key as FrameKey];
  if (key.startsWith("/") || key.startsWith("http")) return key;
  if (key.startsWith("assets/")) return `/${key}`;
  // Accept an assetKey path like "frames/jade-dragon.png" without doubling the
  // frames/ segment; also accept a bare "jade-dragon" (adds folder + resolves).
  const rel = key.replace(/^frames\//, "");
  return `${BASE}/frames/${rel}`;
}
