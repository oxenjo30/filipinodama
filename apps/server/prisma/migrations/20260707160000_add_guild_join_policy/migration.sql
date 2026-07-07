-- AlterTable: guild join policy (prototype create/edit has Open/Request/Invite)
ALTER TABLE "Guild" ADD COLUMN "joinPolicy" TEXT NOT NULL DEFAULT 'open';
