-- Account purge: delete cascades for the 30-day hard-delete job.
--
-- Five relations to User carried no onDelete policy, so Prisma defaulted them to
-- Restrict on a required relation. `prisma.user.delete()` therefore THREW, which
-- is why account deletion was only ever a soft delete (deletedAt) with no purge
-- behind it — while the app told the user their data was "permanently erased
-- within 30 days".
--
-- Policy per relation (owner decision, 2026-08-02 — hard delete, wipe all but
-- money and safety):
--
--   LedgerEntry  CASCADE   in-game currency history is the player's own economy
--                          record, not a financial document
--   Order        CASCADE   in-game store purchase (gold-only today)
--   Message      CASCADE   their chat content goes with the account. Moderation
--                          evidence is unaffected: Report stores a denormalised
--                          `excerpt` snapshot, not a Message foreign key
--   Payment      SET NULL  RETAINED. The only real-money record in the schema.
--                          Financial records carry statutory retention that
--                          outlives an erasure request, so the row survives with
--                          no link to a person
--   Tournament   SET NULL  a platform object with entrants, matches and a prize
--                          pool — it must outlive the admin who created it, and
--                          Restrict made an admin's account undeletable
--
-- Match.redId/blueId are ALREADY optional + SetNull and are deliberately left
-- alone: the OPPONENT's match history is not the deleted user's data to erase.
--
-- THIS MIGRATION DELETES NO DATA. It swaps foreign-key constraints and relaxes
-- two NOT NULL columns. Existing rows are untouched.

-- DropForeignKey
ALTER TABLE "LedgerEntry" DROP CONSTRAINT "LedgerEntry_userId_fkey";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_userId_fkey";

-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_userId_fkey";

-- DropForeignKey
ALTER TABLE "Message" DROP CONSTRAINT "Message_authorId_fkey";

-- DropForeignKey
ALTER TABLE "Tournament" DROP CONSTRAINT "Tournament_createdById_fkey";

-- AlterTable
ALTER TABLE "Payment" ALTER COLUMN "userId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Tournament" ALTER COLUMN "createdById" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
