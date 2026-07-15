-- CreateTable
CREATE TABLE "DailyActivity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyActivity_day_idx" ON "DailyActivity"("day");

-- CreateIndex
CREATE UNIQUE INDEX "DailyActivity_userId_day_key" ON "DailyActivity"("userId", "day");

-- AddForeignKey
ALTER TABLE "DailyActivity" ADD CONSTRAINT "DailyActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
