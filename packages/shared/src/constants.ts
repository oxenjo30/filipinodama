/** Tunable game/economy constants. Confirm values against the prototype. */
export const ECONOMY = {
  /** ranked trophy delta on a win/loss (base; scale by rating gap if using Elo/Glicko) */
  rankedTrophyWin: 25,
  rankedTrophyLoss: -18,
  /**
   * Trophy delta when a RANKED match is bot-filled (empty-queue fallback vs an
   * NPC). Only the HUMAN seat moves; the bot seat never does. Kept small and
   * win-only (no loss penalty) so a low-population ladder can still fill without
   * being farmable or punishing a player for being auto-matched with a bot.
   */
  rankedBotTrophyWin: 10,
  rankedBotTrophyLoss: 0,
  /** gold banked per win, by mode */
  goldPerWin: { RANKED: 50, CASUAL: 25, AI: 10, PRIVATE: 25, LOCAL: 0 } as const,
  dailyChallengeGold: 500,
} as const;

export const LIMITS = {
  chatPerMinute: 20,
  chatBodyMax: 500,
  usernameMin: 3,
  usernameMax: 16,
  bioMax: 240,
  guildNameMax: 24,
  guildDescMax: 160,
} as const;

export const ROOM_CODE_LENGTH = 6;

/** Quick-chat phrases available to every player in a match (free, sent as text). */
export const MATCH_PHRASES = [
  "Good game!",
  "Nice move!",
  "Let's go!",
  "Well played",
  "Good luck",
  "Oops",
  "Close one",
  "Rematch?",
] as const;
