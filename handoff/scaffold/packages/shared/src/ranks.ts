import { z } from "zod";

/** Rank tiers derived from trophy count. Thresholds mirror the prototype —
 *  confirm against the DC file's rankTierFor() before shipping. */
export const RANK_TIERS = [
  { key: "wood", label: "Wood", min: 0, accent: "#8a6a43" },
  { key: "bronze", label: "Bronze", min: 1000, accent: "#c67b3e" },
  { key: "silver", label: "Silver", min: 1400, accent: "#c9d2df" },
  { key: "gold", label: "Gold", min: 1800, accent: "#E8B84B" },
  { key: "platinum", label: "Platinum", min: 2200, accent: "#4fd0c0" },
  { key: "grandmaster", label: "Grandmaster", min: 2600, accent: "#b98cff" },
] as const;

export type RankTierKey = (typeof RANK_TIERS)[number]["key"];

export function rankTierFor(trophies: number) {
  let tier = RANK_TIERS[0];
  for (const t of RANK_TIERS) if (trophies >= t.min) tier = t;
  return tier;
}

export const rankTierSchema = z.enum(
  RANK_TIERS.map((t) => t.key) as [RankTierKey, ...RankTierKey[]],
);
