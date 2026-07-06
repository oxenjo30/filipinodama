/**
 * assets.ts — central map of asset keys → public `/assets/...` URLs.
 *
 * Every image the UI references lives under `apps/web/public/assets/`, copied
 * verbatim (flat filenames) from `handoff/assets/` per handoff/ASSETS.md. Screens
 * and components import from here instead of hard-coding path strings. Paths are
 * absolute and resolve at runtime from the web root (Vite serves `public/` at `/`).
 */

const BASE = "/assets";

/** Currency / reward icons (flat .png, per ASSETS.md). */
export const ICONS = {
  coin: `${BASE}/ic-coin.png`,
  gem: `${BASE}/ic-gem.png`,
  trophy: `${BASE}/ic-trophy.png`,
  chest: `${BASE}/ic-chest.png`,
} as const;
export type IconKey = keyof typeof ICONS;

/**
 * Piece disc skins. Pieces are rendered as CSS discs (see components/Piece.tsx) —
 * NO image files — matching the approved redesign's round Dama discs. A skin just
 * re-tints the disc. `default` = classic crimson/royal.
 */
export const PIECE_SKINS = ["crimson", "jade", "obsidian"] as const;
export type PieceSkin = (typeof PIECE_SKINS)[number] | "default";

/** Board surface textures (full-image board themes, flat filenames per ASSETS.md). */
export const BOARDS = {
  marble: `${BASE}/board-marble.png`,
  classic: `${BASE}/board-wood.png`, // "Classic Wood" is the wood board
  wood: `${BASE}/board-wood.png`,
  ebony: `${BASE}/board-ebony.png`,
  obsidian: `${BASE}/board-obsidian.png`,
} as const;
export type BoardTextureKey = keyof typeof BOARDS;

export function boardTexture(key: BoardTextureKey): string {
  return BOARDS[key];
}

/** Rank-tier art. `img` keys come from @dama/shared RANK_TIERS (e.g. "tier-bayani"). */
export function tierArt(img: string): string {
  return `${BASE}/${img}.png`;
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

/** Cosmetic profile frames (in the frames/ subfolder, per ASSETS.md). */
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

/** Brand marks (flat filename per ASSETS.md). */
export const BRAND = {
  logoSun: `${BASE}/logo-sun.png`,
} as const;
