-- Tournament ready-check (V1.5): players ready up on their bracket slot, the
-- server auto-starts the match when both are ready, and a no-show forfeits.
-- Additive only — existing rows read as "nobody has readied yet", which is
-- exactly right for a bracket seeded before this shipped.

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN "readyWindowSec" INTEGER NOT NULL DEFAULT 600;

-- AlterTable
ALTER TABLE "TournamentMatch" ADD COLUMN "redReadyAt" TIMESTAMP(3);
ALTER TABLE "TournamentMatch" ADD COLUMN "blueReadyAt" TIMESTAMP(3);
ALTER TABLE "TournamentMatch" ADD COLUMN "readyDeadlineAt" TIMESTAMP(3);

-- CreateIndex (the no-show sweeper range-scans on this)
CREATE INDEX "TournamentMatch_readyDeadlineAt_idx" ON "TournamentMatch"("readyDeadlineAt");
