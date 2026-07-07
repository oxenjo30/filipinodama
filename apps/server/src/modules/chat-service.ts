import type { ChannelType } from "@prisma/client";
import { prisma } from "../db/client.js";

/**
 * chat-service — generic Channel/Message primitive shared by DM, in-match, and
 * private-room chat (guild chat has its own service with role annotations).
 *
 * A logical chat = one `Channel(type, refId)`. For DM the refId is a stable key
 * built from the two user ids (sorted). For ROOM/MATCH the refId is the room /
 * match id. ChannelMember rows (with lastReadAt) back unread counts for DMs.
 */

const authorSelect = { id: true, displayName: true, avatarUrl: true } as const;

export type WireMessage = {
  id: string;
  channelId: string;
  body: string;
  createdAt: string;
  author: { id: string; displayName: string; avatarUrl: string | null };
};

/** Stable DM refId for a pair of users (order-independent). */
export function dmRefId(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/**
 * Get (or race-safely create) the channel for (type, refId). Converges on the
 * OLDEST channel if a concurrent create split it (same guard as guild chat).
 * For DM, ensures both users have a ChannelMember row (for unread tracking).
 */
export async function ensureChannel(
  type: ChannelType,
  refId: string,
  memberIds: string[] = [],
): Promise<string> {
  const pick = () =>
    prisma.channel.findFirst({
      where: { type, refId },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });

  let existing = await pick();
  if (!existing) {
    try {
      await prisma.channel.create({ data: { type, refId } });
    } catch {
      /* concurrent create won — re-pick */
    }
    existing = await pick();
  }
  if (!existing) throw new Error(`failed to create ${type} channel`);

  if (memberIds.length) {
    // Idempotent member rows (skipDuplicates on the unique (channelId,userId)).
    await prisma.channelMember.createMany({
      data: memberIds.map((userId) => ({ channelId: existing!.id, userId })),
      skipDuplicates: true,
    });
  }
  return existing.id;
}

function toWire(m: {
  id: string;
  channelId: string;
  body: string;
  createdAt: Date;
  author: { id: string; displayName: string; avatarUrl: string | null };
}): WireMessage {
  return {
    id: m.id,
    channelId: m.channelId,
    body: m.body,
    createdAt: m.createdAt.toISOString(),
    author: m.author,
  };
}

/** Load recent messages for a channel (oldest→newest), capped at `limit`. */
export async function loadHistory(channelId: string, limit = 50): Promise<WireMessage[]> {
  const rows = await prisma.message.findMany({
    where: { channelId },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 100),
    include: { author: { select: authorSelect } },
  });
  return rows.reverse().map(toWire);
}

/** Persist a message and return its wire shape. */
// C0 control chars (0x00–0x1F) + DEL (0x7F). Unicode escapes, no literal bytes.
const CONTROL_CHARS = new RegExp("[" + "\u0000-\u001F\u007F" + "]", "g");
/** Server-side normalization: strip control chars, trim, hard-cap length — defense
 * in depth so a client bypassing its own cap can't store an unbounded /
 * control-char-laden message in the @db.Text column. */
function normalizeBody(raw: string): string {
  return raw.replace(CONTROL_CHARS, "").trim().slice(0, 1000);
}

export async function postMessage(channelId: string, authorId: string, body: string): Promise<WireMessage> {
  const clean = normalizeBody(body);
  const msg = await prisma.message.create({
    data: { channelId, authorId, body: clean },
    include: { author: { select: authorSelect } },
  });
  return toWire(msg);
}

/** Mark a channel read for a user (advance lastReadAt), for DM unread counts. */
export async function markRead(channelId: string, userId: string): Promise<void> {
  await prisma.channelMember.updateMany({
    where: { channelId, userId },
    data: { lastReadAt: new Date() },
  });
}

/** Unread message count for a user in a channel (messages after lastReadAt, not their own). */
export async function unreadCount(channelId: string, userId: string): Promise<number> {
  const member = await prisma.channelMember.findFirst({
    where: { channelId, userId },
    select: { lastReadAt: true },
  });
  if (!member) return 0;
  return prisma.message.count({
    where: { channelId, createdAt: { gt: member.lastReadAt }, authorId: { not: userId } },
  });
}
