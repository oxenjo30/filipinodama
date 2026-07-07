-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('SUPPORT', 'MODERATOR', 'ECONOMY', 'SUPERADMIN');

-- AlterTable
ALTER TABLE "StoreItem" ADD COLUMN     "tag" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "adminRole" "AdminRole",
ADD COLUMN     "bannedUntil" TIMESTAMP(3),
ADD COLUMN     "mutedUntil" TIMESTAMP(3),
ADD COLUMN     "resetExpires" TIMESTAMP(3),
ADD COLUMN     "resetToken" TEXT,
ADD COLUMN     "verifyExpires" TIMESTAMP(3),
ADD COLUMN     "verifyToken" TEXT,
ALTER COLUMN "trophies" SET DEFAULT 0;

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "User_verifyToken_key" ON "User"("verifyToken");

-- CreateIndex
CREATE UNIQUE INDEX "User_resetToken_key" ON "User"("resetToken");

