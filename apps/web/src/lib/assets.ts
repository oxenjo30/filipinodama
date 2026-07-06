/**
 * assets.ts — central map of asset keys → public `/assets/...` URLs.
 *
 * Every image the UI references lives under `apps/web/public/assets/`. Screens
 * and components should import from here instead of hard-coding path strings, so
 * that filenames/extensions live in exactly one place. Paths are absolute and
 * resolve at runtime from the web root (Vite serves `public/` at `/`).
 */

const BASE = "/assets";

/** Currency / reward icons (note: these ship as .webp, not .png). */
export const ICONS = {
  coin: `${BASE}/icons/ic-coin.webp`,
  gem: `${BASE}/icons/ic-gem.webp`,
  trophy: `${BASE}/icons/ic-trophy.webp`,
  chest: `${BASE}/icons/ic-chest.webp`,
} as const;
export type IconKey = keyof typeof ICONS;

/** Default glossy piece art (transparent .webp — render directly on the board). */
export const PIECES = {
  "red-man": `${BASE}/pieces/red-man.webp`,
  "red-king": `${BASE}/pieces/red-king.webp`,
  "red-castle": `${BASE}/pieces/red-castle.webp`,
  "blue-man": `${BASE}/pieces/blue-man.webp`,
  "blue-king": `${BASE}/pieces/blue-king.webp`,
  "blue-castle": `${BASE}/pieces/blue-castle.webp`,
} as const;
export type PieceArtKey = keyof typeof PIECES;

/**
 * Alternate piece skins. Each skin folder holds `<color>-<rank>.png`
 * (color: red|blue, rank: man|king). `default` returns the top-level glossy webp.
 */
export const PIECE_SKINS = ["crimson", "jade", "obsidian"] as const;
export type PieceSkin = (typeof PIECE_SKINS)[number] | "default";

export function pieceArt(
  color: "red" | "blue",
  king: boolean,
  skin: PieceSkin = "default",
): string {
  const rank = king ? "king" : "man";
  if (skin === "default") return PIECES[`${color}-${rank}` as PieceArtKey];
  return `${BASE}/pieces/skins/${skin}/${color}-${rank}.png`;
}

/** Board surface textures (full-image board themes). */
export const BOARDS = {
  marble: `${BASE}/board/board-marble.png`,
  classic: `${BASE}/board/board-classic.webp`,
  wood: `${BASE}/board/board-wood.png`,
  ebony: `${BASE}/board/board-ebony.png`,
  obsidian: `${BASE}/board/board-obsidian.png`,
} as const;
export type BoardTextureKey = keyof typeof BOARDS;

export function boardTexture(key: BoardTextureKey): string {
  return BOARDS[key];
}

/** Rank-tier art. `img` keys come from @dama/shared RANK_TIERS (e.g. "tier-bayani"). */
export function tierArt(img: string): string {
  return `${BASE}/achievements/${img}.png`;
}

/** Named hero avatars (opaque portraits — always render inside a masked token). */
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
} as const;
export type AvatarKey = keyof typeof AVATARS;

export function avatar(key: AvatarKey | (string & {})): string {
  if (key in AVATARS) return AVATARS[key as AvatarKey];
  // Allow passing a full path / uploaded URL straight through.
  return key.startsWith("/") || key.startsWith("http")
    ? key
    : `${BASE}/avatars/${key}`;
}

/** Cosmetic profile frames (transparent overlays). */
export const FRAMES = {
  laurel: `${BASE}/frames/laurel.png`,
  silver: `${BASE}/frames/silver.png`,
  obsidian: `${BASE}/frames/obsidian.png`,
  filigree: `${BASE}/frames/filigree.webp`,
} as const;
export type FrameKey = keyof typeof FRAMES;

export function frameArt(key: FrameKey | (string & {})): string {
  if (key in FRAMES) return FRAMES[key as FrameKey];
  return key.startsWith("/") ? key : `${BASE}/frames/${key}`;
}

/** Brand marks. */
export const BRAND = {
  logoSun: `${BASE}/brand/logo-sun.png`,
} as const;
