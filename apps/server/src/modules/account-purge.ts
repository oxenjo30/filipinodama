import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../db/client.js";

/**
 * Account purge — the hard delete behind `DELETE /api/users/me`.
 *
 * `DELETE /api/users/me` sets `deletedAt` and kills every session. That is the
 * user-visible half. This job is the other half: once the disclosed grace period
 * has elapsed, the account is DESTROYED.
 *
 * It exists because the app promises, in three places
 * (Android DeleteAccountDialog, LegalContent, and the web LegalLayout), that
 * deletion "permanently erases" the account and "completes within 30 days" —
 * and until now nothing behind that promise ever ran. A soft delete that never
 * hardens is a disclosure mismatch, which is both a Play Data-Safety problem
 * and simply untrue to the user.
 *
 * WHAT SURVIVES (owner decision, 2026-08-02 — "hard delete, permanent wipe",
 * scoped to "wipe all but money and safety"):
 *
 *   Payment    RETAINED with `userId` nulled. The only real-money record in the
 *              schema; financial records carry statutory retention that outlives
 *              an erasure request. The transaction survives for accounting with
 *              no link back to a person.
 *
 *   Report     RETAINED with identity scrubbed — so a repeat abuser cannot
 *              launder their history by deleting the account and re-registering.
 *              See scrubReports below for the asymmetry that matters: when the
 *              purged user is the ACCUSED we destroy the cited excerpt (their
 *              content); when they are the REPORTER we keep it, because it is
 *              somebody else's message and still-live evidence.
 *
 *   Match      RETAINED with the player slot nulled (already the schema's
 *              behaviour — Match.redId/blueId are optional + SetNull). The
 *              OPPONENT's match history is not the deleted user's data to erase.
 *
 * Everything else is destroyed: profile, email, password, OAuth links, bio,
 * avatar, sessions, inventory, friendships, blocks, guild membership, quest and
 * season progress, notifications, chat messages, orders and gold ledger,
 * tournament entries.
 */

/** Disclosed grace period. MUST match the copy in LegalContent/DeleteAccountDialog. */
export const PURGE_AFTER_DAYS = 30;

/** Batch size per tick — bounded so one tick can never hold a long transaction. */
const BATCH = 50;

const ANON = "[deleted user]";

export type PurgeResult = {
  purged: number;
  /** Ids purged this tick — returned for logging/tests, never persisted. */
  ids: string[];
};

/**
 * Scrub the purged user's identity out of Report rows, preserving the record.
 *
 * The asymmetry here is deliberate and easy to get wrong:
 *
 *  - As ACCUSED, `excerpt` is a snapshot of THEIR message and `profileSnapshot`
 *    is THEIR profile — both are their content, so both are destroyed. The
 *    report itself survives (reason, verdict, resolution) so the moderation
 *    history is intact.
 *
 *  - As REPORTER, `excerpt` is a snapshot of the ACCUSED's message. That is a
 *    different, probably still-active user's content and live evidence against
 *    them. Destroying it would let anyone erase evidence against someone else by
 *    deleting their own account. Only the reporter's NAME is scrubbed.
 *
 * The `*Id` columns are nulled by the schema's SetNull; this handles the
 * denormalised copies, which SetNull cannot reach.
 */
async function scrubReports(tx: PrismaClient, userId: string): Promise<void> {
  await tx.report.updateMany({
    where: { accusedId: userId },
    // Prisma.DbNull writes a SQL NULL to a Json? column. Plain `null` would be
    // rejected and `undefined` is silently a no-op — the exact shape of bug that
    // leaves PII behind while the code reads as if it scrubbed it.
    data: { accusedName: ANON, excerpt: null, profileSnapshot: Prisma.DbNull },
  });
  await tx.report.updateMany({
    where: { reporterId: userId },
    data: { reporterName: ANON },
  });
}

/**
 * Delete rows that reference the user by id but have NO foreign key, so the
 * database cannot cascade them.
 *
 * `ChannelMember.userId` and `GuildJoinRequest.userId` are plain String columns
 * (verified against the schema — 34 id columns vs 32 declared User relations).
 * Without this, a purged account silently remains a member of every DM and guild
 * channel it ever joined, keeping an identifier attached to those conversations.
 */
async function deleteUnlinkedRows(tx: PrismaClient, userId: string): Promise<void> {
  await tx.channelMember.deleteMany({ where: { userId } });
  await tx.guildJoinRequest.deleteMany({ where: { userId } });
}

/**
 * Purge ONE account. Exported for the admin path and for tests; the poller calls
 * [runAccountPurge] instead.
 *
 * Everything runs in a single transaction: a partial purge would leave an
 * account that is half-erased and half-alive, which is worse than either state.
 */
export async function purgeAccount(userId: string, client: PrismaClient = defaultPrisma): Promise<void> {
  await client.$transaction(async (tx) => {
    const t = tx as unknown as PrismaClient;
    await scrubReports(t, userId);
    await deleteUnlinkedRows(t, userId);
    // Cascades handle the rest; Payment/Report/Match/Tournament SetNull.
    await t.user.delete({ where: { id: userId } });
  });
}

/**
 * One poller tick: purge every account whose grace period has elapsed.
 *
 * Bounded to [BATCH] per tick and each account is committed independently, so a
 * single bad row cannot stall the queue — it is logged and skipped, and the next
 * tick retries it.
 */
export async function runAccountPurge(
  client: PrismaClient = defaultPrisma,
  now: Date = new Date()
): Promise<PurgeResult> {
  const cutoff = new Date(now.getTime() - PURGE_AFTER_DAYS * 24 * 60 * 60 * 1000);

  const due = await client.user.findMany({
    where: { deletedAt: { not: null, lt: cutoff } },
    select: { id: true },
    take: BATCH,
    orderBy: { deletedAt: "asc" },
  });

  const ids: string[] = [];
  for (const { id } of due) {
    try {
      await purgeAccount(id, client);
      ids.push(id);
    } catch (e) {
      // Do not let one undeletable account block the rest of the batch.
      console.error("[account-purge] failed to purge", id, e);
    }
  }

  if (ids.length > 0) console.info(`[account-purge] purged ${ids.length} account(s)`);
  return { purged: ids.length, ids };
}
