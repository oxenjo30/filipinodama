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
  avatarUrl: z.string().url().optional(),
  countryCode: z.string().length(2).optional(),
});
export const equipSchema = z.object({
  board: z.string().optional(),
  skin: z.string().optional(),
  frame: z.string().optional(),
});

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
export const createGuildSchema = z.object({
  name: z.string().min(3).max(LIMITS.guildNameMax),
  tag: z.string().min(2).max(5),
  description: z.string().max(LIMITS.guildDescMax).optional(),
});
export const updateGuildSchema = z.object({
  name: z.string().min(3).max(LIMITS.guildNameMax).optional(),
  description: z.string().max(LIMITS.guildDescMax).optional(),
  minTrophies: z.number().int().min(0).max(5000).optional(),
});

// ── chat ──
export const chatSendSchema = z.object({ channelId: z.string(), body: z.string().min(1).max(500) });

// ── account ──
export const deleteAccountSchema = z.object({ confirm: z.literal("DELETE") });

export type RegisterInput = z.infer<typeof registerSchema>;
export type MoveInput = z.infer<typeof moveSchema>;
