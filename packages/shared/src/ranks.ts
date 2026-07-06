import { z } from "zod";

/** Rank tiers derived from trophy count. Names, floors, colors, and art keys are
 *  taken verbatim from the prototype's TIERS table (FilipinoDama Royal.dc.html).
 *  Art lives at public/assets/achievements/tier-<key>.png. */
export const RANK_TIERS = [
  { key: "squire", label: "Squire", sub: "Recruit", min: 0, accent: "#9aa6bf", img: "tier-squire" },
  { key: "mandirigma", label: "Mandirigma", sub: "Warrior", min: 300, accent: "#cd7f4a", img: "tier-mandirigma" },
  { key: "kabalyero", label: "Kabalyero", sub: "Knight", min: 600, accent: "#c3c7d6", img: "tier-kabalyero" },
  { key: "bayani", label: "Bayani", sub: "Champion", min: 900, accent: "#e8b84b", img: "tier-bayani" },
  { key: "datu", label: "Datu", sub: "Warlord", min: 1100, accent: "#3fbf6f", img: "tier-datu" },
  { key: "star-guardian", label: "Star Guardian", sub: "Ascendant", min: 1200, accent: "#a06bff", img: "tier-star-guardian" },
  { key: "alamat", label: "Alamat", sub: "Legend", min: 1800, accent: "#ff5d73", img: "tier-alamat" },
] as const;

export type RankTierKey = (typeof RANK_TIERS)[number]["key"];
export type RankTier = (typeof RANK_TIERS)[number];

export function rankTierFor(trophies: number): RankTier {
  let tier: RankTier = RANK_TIERS[0];
  for (const t of RANK_TIERS) if (trophies >= t.min) tier = t;
  return tier;
}

export const rankTierSchema = z.enum(
  RANK_TIERS.map((t) => t.key) as [RankTierKey, ...RankTierKey[]],
);
