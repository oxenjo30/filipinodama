export const CURRENCIES = ["GOLD", "DIAMONDS", "TROPHIES"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const MATCH_MODES = ["AI", "CASUAL", "RANKED", "PRIVATE", "LOCAL"] as const;
export type MatchMode = (typeof MATCH_MODES)[number];

export const ITEM_TYPES = ["BOARD", "SKIN", "AVATAR", "FRAME", "EMOTE", "BUNDLE", "SEASON_PASS"] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export const GUILD_ROLES = ["LEADER", "OFFICER", "MEMBER"] as const;
export type GuildRole = (typeof GUILD_ROLES)[number];

export const AI_DIFFICULTIES = ["easy", "normal", "hard"] as const;
export type AiDifficulty = (typeof AI_DIFFICULTIES)[number];

export const NOTIF_TYPES = ["friend_request", "achievement", "event", "system"] as const;
export type NotifType = (typeof NOTIF_TYPES)[number];

export type PieceColor = "red" | "blue";

export type MatchEndReason =
  | "capture-all"
  | "no-moves"
  | "resign"
  | "timeout"
  | "abandon"
  | "agreement"
  | "repetition"
  | "inactivity";
