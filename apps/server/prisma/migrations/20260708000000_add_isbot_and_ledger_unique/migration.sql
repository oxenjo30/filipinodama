-- Add User.isBot (matchmaking NPCs, excluded from leaderboard + season ranking)
ALTER TABLE "User" ADD COLUMN "isBot" BOOLEAN NOT NULL DEFAULT false;

-- Ledger idempotency: a given (user, currency, reason, ref) credit applies once.
-- NULL refType/refId are distinct in Postgres, so unref'd adjustments are free.
CREATE UNIQUE INDEX "LedgerEntry_userId_currency_reason_refType_refId_key"
  ON "LedgerEntry"("userId", "currency", "reason", "refType", "refId");
