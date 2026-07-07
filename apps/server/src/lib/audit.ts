import type { PrismaClient } from "@prisma/client";

/**
 * Write one append-only audit row. EVERY admin mutation must call this
 * (ADMIN_DASHBOARD.md §1). Never throws into the caller's happy path — audit
 * failure is logged but does not roll back the action's own transaction unless
 * you pass a tx client and await it inside that transaction.
 */
export async function audit(
  db: PrismaClient,
  entry: {
    actorId: string;
    action: string;
    targetType?: string;
    targetId?: string;
    before?: unknown;
    after?: unknown;
    reason?: string;
  },
) {
  await db.auditLog.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      before: entry.before === undefined ? undefined : (entry.before as any),
      after: entry.after === undefined ? undefined : (entry.after as any),
      reason: entry.reason,
    },
  });
}
