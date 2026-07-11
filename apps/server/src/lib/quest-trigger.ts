import { z } from "zod";

/**
 * Dynamic quest conditions — a `trigger` on Quest tells the settlement engine
 * WHICH match outcomes advance it, so any admin-created quest tracks without
 * a code change (see docs/superpowers/specs/2026-07-11-dynamic-quest-conditions.md).
 *
 * Pure, DB-free evaluation lives here so it can be unit-tested exhaustively
 * (like tournament-bracket.ts) and reused by both the match-settlement engine
 * and the admin validation route.
 */

export const QUEST_EVENTS = [
  "match_played",
  "match_won",
  "ranked_played",
  "ranked_won",
  "captures",
  "win_streak",
] as const;

export type QuestEvent = (typeof QUEST_EVENTS)[number];

export type QuestTrigger = { event: QuestEvent };

export const questTriggerSchema = z.object({
  event: z.enum(QUEST_EVENTS),
});

/** Per-match context the settlement engine derives for ONE player. */
export type MatchQuestContext = {
  won: boolean;
  drew: boolean;
  captures: number;
  isRanked: boolean;
  streak: number;
};

/**
 * Pure: does this match outcome advance a quest with this `trigger`, and by
 * how much? Never throws — an invalid/missing/unknown trigger (e.g. a
 * pre-existing custom quest authored before triggers existed) simply returns
 * null so a single bad quest row can never break match settlement.
 *
 * `setTo:true` means "value = max(value, by)" (peak trackers like win streak);
 * `setTo:false` means "value += by" (counters). Mirrors advanceQuest's contract
 * in realtime/match.ts.
 */
export function questAdvanceFor(
  trigger: unknown,
  ctx: MatchQuestContext,
): { by: number; setTo: boolean } | null {
  const parsed = questTriggerSchema.safeParse(trigger);
  if (!parsed.success) return null;

  switch (parsed.data.event) {
    case "match_played":
      return { by: 1, setTo: false };
    case "match_won":
      return ctx.won ? { by: 1, setTo: false } : null;
    case "ranked_played":
      return ctx.isRanked ? { by: 1, setTo: false } : null;
    case "ranked_won":
      return ctx.won && ctx.isRanked ? { by: 1, setTo: false } : null;
    case "captures":
      return ctx.captures > 0 ? { by: ctx.captures, setTo: false } : null;
    case "win_streak":
      return ctx.won && ctx.streak > 0 ? { by: ctx.streak, setTo: true } : null;
  }
}
