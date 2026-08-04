-- Staged email change (see schema.prisma User.pendingEmail).
-- Additive and nullable: no backfill, no rewrite of existing rows.
ALTER TABLE "User" ADD COLUMN "pendingEmail" TEXT;
ALTER TABLE "User" ADD COLUMN "pendingEmailToken" TEXT;
ALTER TABLE "User" ADD COLUMN "pendingEmailExpires" TIMESTAMP(3);

-- Unique on the TOKEN only (the confirm link must resolve to exactly one user).
-- Deliberately NOT unique on pendingEmail: two users may stage the same address,
-- and whoever confirms first wins via the EMAIL_TAKEN check at confirm time.
CREATE UNIQUE INDEX "User_pendingEmailToken_key" ON "User"("pendingEmailToken");
