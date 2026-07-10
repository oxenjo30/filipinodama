import type { Prisma } from "@prisma/client";
import { audit } from "./audit.js";

export const PERMANENT = new Date("2999-01-01T00:00:00Z");
export function untilFrom(durationHours?: number): Date {
  if (!durationHours || durationHours <= 0) return PERMANENT;
  return new Date(Date.now() + durationHours * 3_600_000);
}

export type SanctionEmail = { email: string; username: string; until: Date | null } | null;
type Args = { targetId: string; actorId: string; durationHours?: number; reason: string };

export async function muteUser(tx: Prisma.TransactionClient, a: Args): Promise<{ mutedUntil: Date; email: SanctionEmail }> {
  const before = await tx.user.findUnique({ where: { id: a.targetId }, select: { mutedUntil: true } });
  const mutedUntil = untilFrom(a.durationHours);
  await tx.user.update({ where: { id: a.targetId }, data: { mutedUntil } });
  await audit(tx, { actorId: a.actorId, action: "user.mute", targetType: "user", targetId: a.targetId, before, after: { mutedUntil }, reason: a.reason });
  return { mutedUntil, email: null }; // no mute email today (bans-only)
}

export async function banUser(tx: Prisma.TransactionClient, a: Args): Promise<{ bannedUntil: Date; email: SanctionEmail }> {
  const before = await tx.user.findUnique({ where: { id: a.targetId }, select: { bannedUntil: true, email: true, username: true, isGuest: true } });
  const bannedUntil = untilFrom(a.durationHours);
  await tx.user.update({ where: { id: a.targetId }, data: { bannedUntil } });
  await audit(tx, { actorId: a.actorId, action: "user.ban", targetType: "user", targetId: a.targetId, before: { bannedUntil: before?.bannedUntil ?? null }, after: { bannedUntil }, reason: a.reason });
  const email: SanctionEmail = before?.email && !before.isGuest
    ? { email: before.email, username: before.username, until: bannedUntil.getTime() === PERMANENT.getTime() ? null : bannedUntil }
    : null;
  return { bannedUntil, email };
}
