import { prisma } from "../db/client.js";
import { blockedIdsFor } from "./blocks.js";
import { maskProfanity } from "@dama/shared";

/**
 * guild-chat-service — shared DB logic for guild chat, used by both the REST
 * routes (modules/guilds.ts) and the socket layer (realtime/guild-chat.ts).
 *
 * A guild's chat lives in a single `Channel(type=GUILD, refId=<guildId>)`,
 * lazily created on first use. Messages are persisted `Message` rows; the wire
 * shape (`ChatMessage`) includes the author's display fields so the client can
 * render without extra lookups.
 */

/** Socket.IO room name for a guild's live chat feed. */
export const guildRoom = (guildId: string): string => `guild:${guildId}`;

const authorSelect = {
  id: true,
  displayName: true,
  avatarUrl: true,
  frameId: true,
} as const;

export type ChatMessage = {
  id: string;
  guildId: string;
  body: string;
  createdAt: string;
  author: { id: string; displayName: string; avatarUrl: string | null; frameId: string | null };
  /** the author's guild role at send time, for the name colour (Leader/Officer/Member) */
  role: "LEADER" | "OFFICER" | "MEMBER" | null;
};

/**
 * Get (or lazily create) the GUILD channel for a guild. There is no DB unique
 * constraint on (type, refId), so two concurrent first-posts could otherwise
 * each create a channel and split history. We guard against that by re-checking
 * after a create and, if a race produced two, always collapsing to the OLDEST
 * channel (deterministic) so every caller converges on the same one.
 */
export async function ensureGuildChannel(guildId: string): Promise<string> {
  const pick = async () =>
    prisma.channel.findFirst({
      where: { type: "GUILD", refId: guildId },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });

  const existing = await pick();
  if (existing) return existing.id;

  try {
    await prisma.channel.create({ data: { type: "GUILD", refId: guildId } });
  } catch {
    // A concurrent create won the race — fall through to the re-pick below.
  }
  const settled = await pick();
  if (!settled) throw new Error("failed to create guild channel");
  return settled.id;
}

/** Shape a Message row (+ author + role) into the wire `ChatMessage`. */
function toWire(
  guildId: string,
  m: { id: string; body: string; createdAt: Date; author: { id: string; displayName: string; avatarUrl: string | null } },
  role: "LEADER" | "OFFICER" | "MEMBER" | null,
): ChatMessage {
  return {
    id: m.id,
    guildId,
    body: m.body,
    createdAt: m.createdAt.toISOString(),
    author: m.author,
    role,
  };
}

/**
 * Load the most recent messages for a guild (oldest→newest), capped at `limit`.
 * Each message is annotated with the author's CURRENT guild role (best-effort;
 * null if the author has since left the guild).
 */
export async function loadGuildHistory(guildId: string, viewerId: string, limit = 50): Promise<ChatMessage[]> {
  const channelId = await ensureGuildChannel(guildId);
  const blocked = await blockedIdsFor(viewerId);
  const rows = await prisma.message.findMany({
    where: {
      channelId,
      ...(blocked.length > 0 ? { authorId: { notIn: blocked } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 100),
    include: { author: { select: authorSelect } },
  });
  // roles for all distinct authors, in one query
  const authorIds = [...new Set(rows.map((r) => r.author.id))];
  const memberships = await prisma.guildMember.findMany({
    where: { guildId, userId: { in: authorIds } },
    select: { userId: true, role: true },
  });
  const roleByUser = new Map(memberships.map((m) => [m.userId, m.role]));
  return rows
    .reverse() // oldest first for display
    .map((r) => toWire(guildId, r, roleByUser.get(r.author.id) ?? null));
}

/** Persist a new message and return its wire shape (with author role). */
export async function postGuildMessage(
  guildId: string,
  authorId: string,
  body: string,
  role: "LEADER" | "OFFICER" | "MEMBER" | null,
): Promise<ChatMessage> {
  const channelId = await ensureGuildChannel(guildId);
  const clean = maskProfanity(body);
  const msg = await prisma.message.create({
    data: { channelId, authorId, body: clean },
    include: { author: { select: authorSelect } },
  });
  return toWire(guildId, msg, role);
}
