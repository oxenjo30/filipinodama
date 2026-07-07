-- AlterTable: soft-dismiss support for notifications (prototype has a ✕ dismiss per row)
ALTER TABLE "Notification" ADD COLUMN "dismissedAt" TIMESTAMP(3);
