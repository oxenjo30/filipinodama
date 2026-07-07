/** Tunable game/economy constants. Confirm values against the prototype. */
export const ECONOMY = {
  /** ranked trophy delta on a win/loss (base; scale by rating gap if using Elo/Glicko) */
  rankedTrophyWin: 25,
  rankedTrophyLoss: -18,
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
