-- CreateEnum
CREATE TYPE "AnalysisStatus" AS ENUM ('CLEAR', 'FLAGGED', 'CONFIRMED', 'DISMISSED');

-- CreateTable
CREATE TABLE "MatchAnalysis" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "moveCount" INTEGER NOT NULL,
    "decisionCount" INTEGER NOT NULL,
    "engineMatchCount" INTEGER NOT NULL,
    "engineMatchRate" DOUBLE PRECISION,
    "suspicion" INTEGER,
    "reasons" TEXT[],
    "status" "AnalysisStatus" NOT NULL DEFAULT 'CLEAR',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MatchAnalysis_status_suspicion_idx" ON "MatchAnalysis"("status", "suspicion");

-- CreateIndex
CREATE INDEX "MatchAnalysis_userId_status_idx" ON "MatchAnalysis"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MatchAnalysis_matchId_userId_key" ON "MatchAnalysis"("matchId", "userId");

-- AddForeignKey
ALTER TABLE "MatchAnalysis" ADD CONSTRAINT "MatchAnalysis_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchAnalysis" ADD CONSTRAINT "MatchAnalysis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchAnalysis" ADD CONSTRAINT "MatchAnalysis_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

