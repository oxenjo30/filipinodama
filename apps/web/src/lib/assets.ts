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

/**
 * Guild crests — the ornate heraldic emblem art a guild displays on its banner,
 * in the roster/browser, and in the create/edit crest picker. These are real
 * PNG renders (flat filenames, `me-*.png`), ported from the handoff's `_GEMBLEMS`
 * list. `crestKey` (the value stored per-guild on the server) is a key of this
 * map; `guildCrest()` resolves it, falling back to a stable per-guild pick.
 */
export const CRESTS = {
  vanguard: { src: `${BASE}/me-guild.png`, name: "Vanguard Star" },
  crown: { src: `${BASE}/me-crown.png`, name: "Sovereign Crown" },
  swords: { src: `${BASE}/me-swords.png`, name: "Crossed Blades" },
  citadel: { src: `${BASE}/me-castle.png`, name: "Iron Citadel" },
  marksman: { src: `${BASE}/me-target.png`, name: "Marksman" },
  banner: { src: `${BASE}/me-banner.png`, name: "Royal Banner" },
} as const;
export type CrestKey = keyof typeof CRESTS;
export const CREST_KEYS = Object.keys(CRESTS) as CrestKey[];

/**
 * Resolve a guild's crest art. If `crestKey` names a known crest, use it;
 * otherwise deterministically pick one from `seed` (the guild id) so every guild
 * gets a stable crest even before one is chosen. Guarantees a real image — never
 * an emoji.
 */
export function guildCrest(
  crestKey: string | null | undefined,
  seed = "",
): { key: CrestKey; src: string; name: string } {
  if (crestKey && crestKey in CRESTS) {
    const key = crestKey as CrestKey;
    return { key, ...CRESTS[key] };
  }
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const key = CREST_KEYS[h % CREST_KEYS.length];
  return { key, ...CRESTS[key] };
}

/**
 * Pre-match loading-screen backgrounds (in the loading/ subfolder, per ASSETS.md).
 *
 * Each art set ships a landscape image plus a `-portrait` variant for tall
 * viewports. The handoff's loader is driven by a `loadingCtx` of "matchmaking",
 * "ranked", or "default" (see `playWithLoader`); the "default" (offline vs-AI /
 * local) board additionally reflects the player's equipped piece skin so the
 * loader previews the cosmetics they're about to play with:
 *
 *   matchmaking      → load-matchmaking  (casual online pairing)
 *   ranked           → load-throne       (the arena / ranked ladder)
 *   default + crimson→ load-crimson
 *   default + jade   → load-jade
 *   default + obsidian→ load-obsidian
 *   default + classic→ load-throne       (no skin equipped)
 *
 * (`load-victory` is reserved for the post-match win screen, not the loader.)
 */
const LOADING_STEMS = [
  "matchmaking",
  "throne",
  "victory",
  "crimson",
  "jade",
  "obsidian",
] as const;
export type LoadingArtStem = (typeof LOADING_STEMS)[number];

/** Landscape + portrait URLs for a loading-art set. */
export type LoadingArt = { landscape: string; portrait: string };

export const LOADING: Record<LoadingArtStem, LoadingArt> = Object.fromEntries(
  LOADING_STEMS.map((stem) => [
    stem,
    {
      landscape: `${BASE}/loading/load-${stem}.webp`,
      portrait: `${BASE}/loading/load-${stem}-portrait.webp`,
    },
  ]),
) as Record<LoadingArtStem, LoadingArt>;

/** The loader contexts the app actually passes (mirrors the handoff's loadingCtx). */
export type LoadingContext = "matchmaking" | "ranked" | "default";

/**
 * Resolve the background art for a loading context. For the offline/default
 * context the equipped piece `skin` selects a skin-themed backdrop; "classic"
 * (no skin) and the online contexts fall back to their fixed art.
 */
export function loadingArt(
  context: LoadingContext,
  skin: PieceSkin = "default",
): LoadingArt {
  if (context === "matchmaking") return LOADING.matchmaking;
  if (context === "ranked") return LOADING.throne;
  // "default" → mirror the equipped skin (throne for classic/none).
  switch (skin) {
    case "crimson":
      return LOADING.crimson;
    case "jade":
      return LOADING.jade;
    case "obsidian":
      return LOADING.obsidian;
    default:
      return LOADING.throne;
  }
}
