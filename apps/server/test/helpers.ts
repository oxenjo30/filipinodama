import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/index.js";
import { prisma } from "../src/db/client.js";
import { signAccess, COOKIE, type AccessClaims } from "../src/auth/tokens.js";
import type { AdminRole } from "@prisma/client";

export async function buildTestApp(): Promise<FastifyInstance> {
  const app = await buildApp();
  await app.ready();
  return app;
}

/** Mint an access cookie header for `inject()`. Pass a partial to forge stale claims. */
export function authFor(claims: { sub: string; isGuest?: boolean; adminRole?: AdminRole | null }): string {
  const payload: AccessClaims = {
    sub: claims.sub,
    isGuest: claims.isGuest ?? false,
    adminRole: claims.adminRole ?? null,
  };
  const token = signAccess(payload);
  return `${COOKIE.access}=${token}`;
}

let seq = 0;
export async function seedUser(
  overrides: Partial<{
    username: string;
    displayName: string;
    isBot: boolean;
    isGuest: boolean;
    adminRole: AdminRole | null;
    bannedUntil: Date | null;
    deletedAt: Date | null;
    email: string | null;
    gold: number;
    trophies: number;
  }> = {},
) {
  seq += 1;
  const username = overrides.username ?? `t_user_${seq}_${process.pid}`;
  return prisma.user.create({
    data: {
      username,
      displayName: overrides.displayName ?? username,
      tag: `#${1000 + seq}`,
      isBot: overrides.isBot ?? false,
      isGuest: overrides.isGuest ?? false,
      adminRole: overrides.adminRole ?? null,
      bannedUntil: overrides.bannedUntil ?? null,
      deletedAt: overrides.deletedAt ?? null,
      email: overrides.email ?? null,
      gold: overrides.gold ?? 0,
      trophies: overrides.trophies ?? 0,
    },
  });
}

/** Wipe the tables these tests write, leaving durable seed rows (bots/store) intact. */
export async function truncateAll() {
  await prisma.$executeRawUnsafe(
    `TRUNCATE "Report", "AuditLog", "Message", "ChannelMember", "Channel", "Ticket", "Tournament", "TournamentEntry", "TournamentMatch", "Match", "LedgerEntry" RESTART IDENTITY CASCADE`,
  );
  // remove only test-created users (prefix-scoped) to keep seed accounts
  await prisma.user.deleteMany({ where: { username: { startsWith: "t_user_" } } });
}
