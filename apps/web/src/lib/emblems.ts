/**
 * emblems.ts — path helpers for the mode / difficulty / mode-card crests.
 *
 * All emblem art lives flat under `/assets/` (copied from handoff/assets/ per
 * ASSETS.md). Extensions differ per file: the difficulty and mode crests ship as
 * .webp; the mode-card "mc-*" crests as .png. Screens pass a key.
 */

const BASE = "/assets";

/** Difficulty crests for the AI setup screen (flat .webp). */
export const DIFF_EMBLEMS = {
  easy: `${BASE}/diff-easy.webp`,
  normal: `${BASE}/diff-normal.webp`,
  hard: `${BASE}/diff-hard.webp`,
} as const;
export type DiffEmblemKey = keyof typeof DIFF_EMBLEMS;

/** Play-hub mode crests (flat .webp). */
export const MODE_EMBLEMS = {
  "mode-quick": `${BASE}/mode-quick.webp`,
  "mode-ranked": `${BASE}/mode-ranked.webp`,
  "mode-vs-ai": `${BASE}/mode-vs-ai.webp`,
  "mode-friend": `${BASE}/mode-friend.webp`,
} as const;

/** Mode-card crests (home "Featured Modes"), flat .png. */
export const MODE_CARD_EMBLEMS = {
  "mc-classic": `${BASE}/mc-classic.png`,
  "mc-ranked": `${BASE}/mc-ranked.png`,
  "mc-training": `${BASE}/mc-training.png`,
  "mc-kingdom": `${BASE}/mc-kingdom.png`,
} as const;

const ALL: Record<string, string> = {
  ...MODE_EMBLEMS,
  ...MODE_CARD_EMBLEMS,
};

/** Resolve any emblem key to its `/assets/...` URL. */
export function emblem(key: string): string {
  return ALL[key] ?? `${BASE}/${key}`;
}

/** Resolve a difficulty crest. */
export function diffEmblem(key: DiffEmblemKey): string {
  return DIFF_EMBLEMS[key];
}
