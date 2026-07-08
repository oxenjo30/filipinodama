import { z } from "zod";
import { AI_DIFFICULTIES } from "./enums.js";
import { LIMITS } from "./constants.js";

// ── auth ──
export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(72),
  username: z.string().min(LIMITS.usernameMin).max(LIMITS.usernameMax).regex(/^[a-zA-Z0-9_]+$/),
});
export const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

// ── profile ──
export const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(24).optional(),
  bio: z.string().max(LIMITS.bioMax).optional(),
  // Either a bare avatar key ("champion") or an app-relative asset path
  // ("/assets/avatars/champion.png"). Arbitrary external URLs are rejected:
  // avatars are uploaded to R2 and referenced as /assets paths, and an attacker
  // could otherwise point this at a tracking/NSFW URL rendered in other players'
  // views. Bare keys are the portable form.
  avatarUrl: z
    .string()
    .max(200)
    .regex(/^([a-z0-9-]+|\/assets\/[\w./-]+)$/i, "invalid avatar reference")
    .optional(),
  countryCode: z.string().length(2).optional(),
});
export const equipSchema = z.object({
  board: z.string().optional(),
  skin: z.string().optional(),
  frame: z.string().optional(),
  avatar: z.string().optional(),
});
/** Toggle an owned emote in/out of the equipped set (max enforced server-side). */
export const equipEmoteSchema = z.object({ itemId: z.string(), equipped: z.boolean() });

// ── game / matchmaking ──
export const squareSchema = z.object({ r: z.number().int().min(0).max(7), c: z.number().int().min(0).max(7) });
export const moveSchema = z.object({
  from: squareSchema,
  path: z.array(squareSchema).min(1),
  captures: z.array(squareSchema),
  promotion: z.boolean(),
});
export const mmJoinSchema = z.object({ mode: z.enum(["casual", "ranked"]) });
export const aiSetupSchema = z.object({ difficulty: z.enum(AI_DIFFICULTIES) });

// ── store / payments ──
export const purchaseSchema = z.object({ itemId: z.string() });
export const checkoutSchema = z.object({ packId: z.string() });

// ── social / guild ──
export const friendRequestSchema = z.object({ toUserId: z.string() });
/** Add-by-tag: a #NNNN player tag (leading # optional, trimmed client-side). */
export const friendRequestByTagSchema = z.object({ tag: z.string().min(1).max(16) });
/** The heraldic crest a guild displays (mirrors the client's CRESTS registry). */
export const GUILD_CREST_KEYS = ["vanguard", "crown", "swords", "citadel", "marksman", "banner"] as const;
export const guildCrestKeySchema = z.enum(GUILD_CREST_KEYS);
export const GUILD_JOIN_POLICIES = ["open", "request", "invite"] as const;
export const guildJoinPolicySchema = z.enum(GUILD_JOIN_POLICIES);
export const createGuildSchema = z.object({
  name: z.string().min(3).max(LIMITS.guildNameMax),
  tag: z.string().min(2).max(5),
  description: z.string().max(LIMITS.guildDescMax).optional(),
  crestKey: guildCrestKeySchema.optional(),
  minTrophies: z.number().int().min(0).max(5000).optional(),
  joinPolicy: guildJoinPolicySchema.optional(),
});
export const updateGuildSchema = z.object({
  name: z.string().min(3).max(LIMITS.guildNameMax).optional(),
  description: z.string().max(LIMITS.guildDescMax).optional(),
  minTrophies: z.number().int().min(0).max(5000).optional(),
  crestKey: guildCrestKeySchema.optional(),
  joinPolicy: guildJoinPolicySchema.optional(),
});

// ── chat ──
export const chatSendSchema = z.object({ channelId: z.string(), body: z.string().min(1).max(500) });
/** Post a message to a guild's chat channel (the guild is identified in the URL). */
export const guildChatSendSchema = z.object({ body: z.string().trim().min(1).max(LIMITS.chatBodyMax) });

// ── account ──
export const deleteAccountSchema = z.object({ confirm: z.literal("DELETE") });

export type RegisterInput = z.infer<typeof registerSchema>;
export type MoveInput = z.infer<typeof moveSchema>;
