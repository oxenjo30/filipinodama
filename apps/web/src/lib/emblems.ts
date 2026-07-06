/**
 * emblems.ts — path helpers for the emblem art under `/assets/emblems/`.
 *
 * These are the mode / difficulty / mode-card crests used by the Play hub, the
 * AI-setup screen, and the home dashboard. Extensions differ per file (the mode
 * & difficulty crests ship as .png; the mode-card "mc-*" crests as .webp), so
 * the exact filename is captured here in one place — screens pass a key.
 */

const BASE = "/assets/emblems";

/** Difficulty crests for the AI setup screen. */
export const DIFF_EMBLEMS = {
  easy: `${BASE}/diff-easy.png`,
  normal: `${BASE}/diff-normal.png`,
  hard: `${BASE}/diff-hard.png`,
} as const;
export type DiffEmblemKey = keyof typeof DIFF_EMBLEMS;

/** Play-hub mode crests. */
export const MODE_EMBLEMS = {
  "mode-quick": `${BASE}/mode-quick.png`,
  "mode-ranked": `${BASE}/mode-ranked.png`,
  "mode-vs-ai": `${BASE}/mode-vs-ai.png`,
  "mode-friend": `${BASE}/mode-friend.png`,
} as const;

/** Mode-card crests (home "Featured Modes"). These ship as .webp. */
export const MODE_CARD_EMBLEMS = {
  "mc-classic": `${BASE}/mc-classic.webp`,
  "mc-ranked": `${BASE}/mc-ranked.webp`,
  "mc-training": `${BASE}/mc-training.webp`,
  "mc-kingdom": `${BASE}/mc-kingdom.webp`,
} as const;

const ALL: Record<string, string> = {
  ...MODE_EMBLEMS,
  ...MODE_CARD_EMBLEMS,
};

/** Resolve any emblem key to its `/assets/emblems/...` URL. */
export function emblem(key: string): string {
  return ALL[key] ?? `${BASE}/${key}`;
}

/** Resolve a difficulty crest. */
export function diffEmblem(key: DiffEmblemKey): string {
  return DIFF_EMBLEMS[key];
}
