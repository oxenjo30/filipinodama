ALTER TABLE "Campaign" ADD COLUMN "channel" TEXT NOT NULL DEFAULT 'in-app';
ALTER TABLE "Campaign" ADD COLUMN "scheduledFor" TIMESTAMP(3);
