import { prisma } from "../db/client.js";

/**
 * Whether a user is currently muted (admin sanction). Every chat SEND path — DM,
 * room, guild, in-match — checks this so an admin mute actually silences the
 * player everywhere, not just in one channel. Reads the live mutedUntil column
 * set by /api/admin/users/:id/mute.
 */
export async function isMuted(userId: string): Promise<boolean> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { mutedUntil: true } });
  return !!u?.mutedUntil && u.mutedUntil > new Date();
}
