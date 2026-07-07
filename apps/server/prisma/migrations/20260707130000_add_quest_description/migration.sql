-- AlterTable: add nullable description subtitle to Quest (prototype quest rows show a desc line)
ALTER TABLE "Quest" ADD COLUMN "description" TEXT;
