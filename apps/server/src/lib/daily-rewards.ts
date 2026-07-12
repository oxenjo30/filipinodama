import { z } from "zod";
import { getConfig } from "./config-service.js";

/**
 * Daily login rewards ladder — admin-configurable (v3 delta Cluster A6).
 *
 * Shared between:
 *   - apps/server/src/modules/admin-liveops.ts (GET/PATCH the editor)
 *   - apps/server/src/modules/rewards.ts (the player claim endpoint reads it)
 *
 * Storage: one Config row, key DAILY_REWARDS_LADDER, type "json" (the Config
 * table's `value` column is already a String — this is JSON text in it, same
 * as every other Config row, just parsed instead of used raw). category
 * "economy". Falls back to DEFAULT_LADDER (production's CURRENT hardcoded
 * values, ported 1:1 from rewards.ts's LOGIN_REWARDS) whenever no row has
 * been saved yet, so behavior is UNCHANGED until an admin explicitly saves.
 *
 * NOTE (owner decision pending): the handoffv3 prototype suggests a DIFFERENT
 * default ladder (200/400/10💎/700/20💎/1200/chest 2000💰+50💎). We deliberately
 * do NOT adopt that as the seed — adopting it would silently change live
 * player economics. DEFAULT_LADDER below is production's real values. The
 * prototype ladder is only a flagged suggestion for the owner to consider
 * saving through this editor later.
 */

export const CONFIG_KEY = "DAILY_REWARDS_LADDER";

export type DailyRewardRow =
  | { type: "gold"; amt: number }
  | { type: "gem"; amt: number }
  | { type: "chest"; gold: number; gem: number };

// Production's current values (apps/server/src/modules/rewards.ts LOGIN_REWARDS),
// gold-only — this is the seed, NOT the prototype's suggested ladder.
export const DEFAULT_LADDER: DailyRewardRow[] = [
  { type: "gold", amt: 100 },
  { type: "gold", amt: 150 },
  { type: "gold", amt: 200 },
  { type: "gold", amt: 300 },
  { type: "gold", amt: 400 },
  { type: "gold", amt: 500 },
  { type: "chest", gold: 1000, gem: 0 },
];

// Sane server-side clamps — reject junk regardless of what the client sends.
const MAX_GOLD = 100_000;
const MAX_GEM = 1_000;

const rowSchema = z.union([
  z.object({ type: z.literal("gold"), amt: z.number().int().min(0).max(MAX_GOLD) }),
  z.object({ type: z.literal("gem"), amt: z.number().int().min(0).max(MAX_GEM) }),
  z.object({
    type: z.literal("chest"),
    gold: z.number().int().min(0).max(MAX_GOLD),
    gem: z.number().int().min(0).max(MAX_GEM),
  }),
]);

/** Exactly 7 rows; days 1-6 must NOT be chest, day 7 MUST be chest. */
export const ladderSchema = z
  .array(rowSchema)
  .length(7, "Ladder must have exactly 7 entries (Day 1–7)")
  .superRefine((rows, ctx) => {
    // Wrong length already raised an issue above (and Zod still invokes this
    // refinement) — bail out before indexing to avoid a spurious 500.
    if (rows.length !== 7) return;
    for (let i = 0; i < 6; i++) {
      if (rows[i].type === "chest") {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Day ${i + 1} must be gold or gem, not a chest` });
      }
    }
    if (rows[6].type !== "chest") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Day 7 must be a grand chest" });
    }
  });

/** Read the configured ladder, falling back to DEFAULT_LADDER if absent/invalid. */
export async function getDailyRewardsLadder(): Promise<DailyRewardRow[]> {
  const raw = await getConfig(CONFIG_KEY);
  if (!raw) return DEFAULT_LADDER;
  try {
    const parsed = ladderSchema.parse(JSON.parse(raw));
    return parsed as DailyRewardRow[];
  } catch {
    return DEFAULT_LADDER;
  }
}

/** Gold value a row grants (gem-only rows and chest gem portion are diamonds, not gold). */
export function rowGold(row: DailyRewardRow): number {
  if (row.type === "gold") return row.amt;
  if (row.type === "chest") return row.gold;
  return 0;
}

/** Diamond value a row grants. */
export function rowGems(row: DailyRewardRow): number {
  if (row.type === "gem") return row.amt;
  if (row.type === "chest") return row.gem;
  return 0;
}
