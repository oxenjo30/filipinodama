-- One OAuth identity per provider per user.
--
-- Dedupe first: keep the OLDEST row per (userId, provider) so an account that
-- somehow accumulated two Google identities keeps the original one, then add the
-- constraint. Without the dedupe the CREATE UNIQUE INDEX would fail on any such row.
DELETE FROM "OAuthAccount" a
USING "OAuthAccount" b
WHERE a."userId" = b."userId"
  AND a."provider" = b."provider"
  AND a."ctid" > b."ctid";

CREATE UNIQUE INDEX "OAuthAccount_userId_provider_key" ON "OAuthAccount"("userId", "provider");
