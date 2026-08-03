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
// "Payment" joined this list with the account-purge migration. Before it,
// Payment.userId was a required relation defaulting to Restrict, so a payment
// could never outlive its user — the prefix-scoped user delete below took it
// along (or failed loudly). Payments are now SetNull, deliberately, so a
// financial record survives its buyer's erasure. The consequence for tests is
// that orphaned Payment rows persist across files and silently inflate the admin
// revenue dashboard's totals, so the table must be truncated explicitly.
const TRUNCATE_TABLES =
  `"Report", "AuditLog", "Message", "ChannelMember", "Channel", "Ticket", "Tournament", "TournamentEntry", "TournamentMatch", "Match", "LedgerEntry", "LiveEvent", "Order", "Payment"`;

export async function truncateAll() {
  // The TRUNCATE is a point-in-time clear. A test can trigger an ASYNC write
  // that lands AFTER this call — e.g. a socket resign kicks off settleMatch,
  // which inserts a LedgerEntry (FK → User) a beat later. If that late insert
  // arrives between the TRUNCATE and the user deleteMany below, the deleteMany
  // hits a LedgerEntry_userId_fkey P2003 and the whole suite flakes.
  //
  // Guard against it: TRUNCATE, then attempt the prefix-scoped user delete; if
  // a late FK insert makes it fail, re-TRUNCATE the child tables (clearing the
  // straggler) and retry. Deterministic tests (which await their settles) hit
  // the happy path on the first try; only a genuinely-late async write pays for
  // the retry. Bounded to a few attempts so a real, non-transient FK bug still
  // surfaces loudly instead of looping.
  await prisma.$executeRawUnsafe(`TRUNCATE ${TRUNCATE_TABLES} RESTART IDENTITY CASCADE`);
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      // remove only test-created users (prefix-scoped) to keep seed accounts
      await prisma.user.deleteMany({ where: { username: { startsWith: "t_user_" } } });
      lastErr = null;
      break;
    } catch (e) {
      // P2003 = FK violation: a late async write re-referenced a t_user_ row.
      // Re-clear the child tables and try the user delete again.
      lastErr = e;
      await prisma.$executeRawUnsafe(`TRUNCATE ${TRUNCATE_TABLES} RESTART IDENTITY CASCADE`);
    }
  }
  if (lastErr) throw lastErr;
  await flushRealtimeKeys();
}

/** Delete every realtime key (rt:*) from the test Redis without a blanket
 *  flushall — SCAN the rt: namespace and UNLINK in batches. Idempotent + safe to
 *  call from any suite's cleanup.
 *
 *  UNLINK needs Redis >= 4.0. A dev box running an older server (notably the
 *  Windows 3.0.x port) would otherwise fail EVERY suite in its afterEach with
 *  "ERR unknown command 'unlink'" — the tests themselves pass, but the cleanup
 *  hook takes the whole file down with it, which reads like a code failure and
 *  isn't. Fall back to DEL, which every version has: it blocks rather than
 *  reclaiming memory in the background, and for a test keyspace of a few dozen
 *  keys that difference does not matter. The flag is sticky so the fallback
 *  costs one failed command per process, not one per batch. */
let unlinkUnsupported = false;
export async function flushRealtimeKeys(): Promise<void> {
  let cursor = "0";
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", "rt:*", "COUNT", 500);
    cursor = next;
    if (!keys.length) continue;
    if (unlinkUnsupported) {
      await redis.del(...keys);
      continue;
    }
    try {
      await redis.unlink(...keys);
    } catch (e) {
      if (!/unknown command/i.test((e as Error).message)) throw e;
      unlinkUnsupported = true;
      await redis.del(...keys);
    }
  } while (cursor !== "0");
}
