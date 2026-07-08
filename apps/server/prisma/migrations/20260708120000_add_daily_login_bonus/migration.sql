-- Daily Login Bonus: server-authoritative streak state on User.
ALTER TABLE "User" ADD COLUMN "loginStreak" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "lastLoginBonusAt" TIMESTAMP(3);
