import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/index.js";
import { prisma } from "../src/db/client.js";
import { redis } from "../src/realtime/store.js";
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

/** Wipe the tables these tests write, leaving durable seed rows (bots/store) intact.
 *
 *  ALSO resets the realtime Redis keyspace (rt:*). Since the horizontal-scale
 *  migration, realtime state — live matches, private rooms (rt:rooms SET +
 *  rt:room:*), matchmaking queues, presence, the rt:jobs schedule — lives in the
 *  SHARED test Redis, not in per-server in-process Maps. Vitest runs files
 *  SEQUENTIALLY against one Redis, so a socket suite that leaves a room in
 *  rt:rooms (e.g. a slow/dropped resign that never fires clearRoomForMatch) would
 *  bleed into the NEXT suite's listOpenRooms and break its assertions. Every
 *  socket suite already calls truncateAll in afterEach and rebuilds fresh state
 *  per test, so flushing rt:* here gives them Redis isolation the same way the
 *  TRUNCATE gives them DB isolation — at one convention point. Scoped to the rt:
 *  prefix (never flushall/flushdb) so a dev Redis's non-realtime keys are safe;
 *  .env.test points at a dedicated test Redis regardless. */
export async function truncateAll() {
  await prisma.$executeRawUnsafe(
    `TRUNCATE "Report", "AuditLog", "Message", "ChannelMember", "Channel", "Ticket", "Tournament", "TournamentEntry", "TournamentMatch", "Match", "LedgerEntry", "LiveEvent", "Order" RESTART IDENTITY CASCADE`,
  );
  // remove only test-created users (prefix-scoped) to keep seed accounts
  await prisma.user.deleteMany({ where: { username: { startsWith: "t_user_" } } });
  await flushRealtimeKeys();
}

/** Delete every realtime key (rt:*) from the test Redis without a blanket
 *  flushall — SCAN the rt: namespace and UNLINK in batches. Idempotent + safe to
 *  call from any suite's cleanup. */
export async function flushRealtimeKeys(): Promise<void> {
  let cursor = "0";
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", "rt:*", "COUNT", 500);
    cursor = next;
    if (keys.length) await redis.unlink(...keys);
  } while (cursor !== "0");
}
