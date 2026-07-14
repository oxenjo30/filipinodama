-- CreateTable
CREATE TABLE "GuildWarSeason" (
    "id" TEXT NOT NULL,
    "weekIndex" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "GuildWarSeason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuildWarResult" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "guildName" TEXT NOT NULL,
    "guildTag" TEXT NOT NULL,
    "crestKey" TEXT,
    "rank" INTEGER NOT NULL,
    "points" INTEGER NOT NULL,
    "rewardGold" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuildWarResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GuildWarSeason_weekIndex_key" ON "GuildWarSeason"("weekIndex");

-- CreateIndex
CREATE INDEX "GuildWarResult_seasonId_rank_idx" ON "GuildWarResult"("seasonId", "rank");

-- CreateIndex
CREATE INDEX "GuildWarResult_guildId_idx" ON "GuildWarResult"("guildId");

-- AddForeignKey
ALTER TABLE "GuildWarResult" ADD CONSTRAINT "GuildWarResult_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "GuildWarSeason"("id") ON DELETE CASCADE ON UPDATE CASCADE;
