-- AlterEnum
-- DAMATH is only referenced by application code, never by the DamathMatch table
-- below (its `variant` is a plain String), so adding the value and creating the
-- table in one migration is safe (no same-transaction use of the new value).
ALTER TYPE "MatchMode" ADD VALUE IF NOT EXISTS 'DAMATH';

-- CreateTable
CREATE TABLE "DamathMatch" (
    "id" TEXT NOT NULL,
    "variant" TEXT NOT NULL,
    "redId" TEXT,
    "blueId" TEXT,
    "redScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "blueScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "winner" TEXT,
    "reason" TEXT,
    "scoreHistory" JSONB NOT NULL DEFAULT '[]',
    "moveHistory" JSONB NOT NULL DEFAULT '[]',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "DamathMatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DamathMatch_redId_idx" ON "DamathMatch"("redId");

-- CreateIndex
CREATE INDEX "DamathMatch_blueId_idx" ON "DamathMatch"("blueId");

-- CreateIndex
CREATE INDEX "DamathMatch_endedAt_idx" ON "DamathMatch"("endedAt");

-- AddForeignKey
ALTER TABLE "DamathMatch" ADD CONSTRAINT "DamathMatch_redId_fkey" FOREIGN KEY ("redId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DamathMatch" ADD CONSTRAINT "DamathMatch_blueId_fkey" FOREIGN KEY ("blueId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
