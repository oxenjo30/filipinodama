-- Organiser-settable START TIMER.
--
-- readyWindowSec only arms when somebody presses Ready, so a fixture where
-- NEITHER player turns up has no clock and never resolves — blocking its round
-- and, with it, the whole tournament. This lets an organiser have the clock
-- start from the moment a fixture becomes playable instead.
--
-- Nullable with no default, so this is metadata-only: no table rewrite, only a
-- brief ACCESS EXCLUSIVE lock, and existing tournaments read null = off, which
-- is exactly their current behaviour.
--
-- NOTE: prisma migrate dev also emitted an unrelated
-- `ALTER TABLE "User" ALTER COLUMN "equippedEmotes" DROP DEFAULT;` from
-- pre-existing drift between the dev database and schema.prisma. Removed by
-- hand — it has nothing to do with this change and must not ride along into a
-- production migration.

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "startWindowSec" INTEGER;
