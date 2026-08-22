-- Persist how a match was created so admin analytics can distinguish queue
-- matchmaking from rooms, tournaments, rematches, and local/offline games.
-- Existing rows remain LEGACY because their origin cannot be reconstructed
-- reliably from Match.mode alone.
CREATE TYPE "MatchOrigin" AS ENUM ('LEGACY', 'MATCHMAKING', 'ROOM', 'TOURNAMENT', 'REMATCH', 'LOCAL');

ALTER TABLE "Match"
ADD COLUMN "origin" "MatchOrigin" NOT NULL DEFAULT 'LEGACY';

CREATE INDEX "Match_origin_startedAt_idx" ON "Match"("origin", "startedAt");
