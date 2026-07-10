import type { Prisma } from "@prisma/client";
import { applyLedgerTx } from "./ledger.js";

/** A Prisma transaction client (what $transaction(cb) hands the callback). */
type Tx = Prisma.TransactionClient;

type EntryLike = { id: string; userId: string };

/**
 * Thin `applyLedgerTx` wrappers for the three tournament gold movements.
 * Fixed `refType:"tournament"` / `reason` per the ledger table in the design
 * doc, and — critically — `refId = entry.id`, NEVER `tournamentId` (see the
 * keying note under "Economy / ledger flows": a hard-delete leave + rejoin
 * must produce a fresh idempotency slot, which only works if refId is scoped
 * to the specific TournamentEntry row, not the tournament).
 *
 * These are thin `applyLedgerTx` wrappers, NOT `applyLedger` wrappers —
 * callers (join/leave/cancel/complete) remain responsible for catching P2002
 * around the `$transaction` that calls them, since `applyLedgerTx` itself
 * does not swallow it.
 */
export function chargeEntryFeeTx(tx: Tx, entry: EntryLike, amountGold: number) {
  return applyLedgerTx(tx, {
    userId: entry.userId,
    currency: "GOLD",
    amount: -amountGold,
    reason: "tournament-entry",
    refType: "tournament",
    refId: entry.id,
  });
}

export function refundEntryFeeTx(tx: Tx, entry: EntryLike, amountGold: number) {
  return applyLedgerTx(tx, {
    userId: entry.userId,
    currency: "GOLD",
    amount: amountGold,
    reason: "tournament-refund",
    refType: "tournament",
    refId: entry.id,
  });
}

export function payPrizeTx(tx: Tx, entry: EntryLike, amountGold: number) {
  return applyLedgerTx(tx, {
    userId: entry.userId,
    currency: "GOLD",
    amount: amountGold,
    reason: "tournament-prize",
    refType: "tournament",
    refId: entry.id,
  });
}
