-- GROUP_DOUBLE_ELIM ("The International") tournament format.
--
-- PURELY ADDITIVE ON PURPOSE. Prisma wraps each migration file in a
-- transaction, and Postgres will not let a newly added enum value be USED in
-- the same transaction that adds it ("unsafe use of new value ..."). So there
-- is no backfill, no DEFAULT and no INSERT/UPDATE referencing
-- 'GROUP_DOUBLE_ELIM' here — the value is only added. Anything that needs to
-- write it must land in a LATER migration.
--
-- Postgres also has no DROP VALUE: once this ships the enum value is permanent
-- and a rollback leaves it in the type. Harmless, but one-way.
--
-- Every column below is NULLABLE with no default, so each ADD COLUMN is
-- metadata-only — no table rewrite, only a brief ACCESS EXCLUSIVE lock. Safe
-- against the live database with a tournament in progress: existing rows are
-- untouched and every other format leaves these null.
--
-- NOTE: prisma migrate dev also emitted an unrelated
-- `ALTER TABLE "User" ALTER COLUMN "equippedEmotes" DROP DEFAULT;` from
-- pre-existing drift between the dev database and schema.prisma. It was
-- REMOVED by hand — it is nothing to do with this feature, and silently
-- changing a User column's default in a tournament migration is exactly the
-- kind of unintended production change that should never ride along.

-- AlterEnum
ALTER TYPE "TournamentFormat" ADD VALUE 'GROUP_DOUBLE_ELIM';

-- AlterTable: group-stage shape + the persisted playoff bracket size.
-- bracketSize exists because every other format recovers B by counting
-- winners-round-1 slots; this format never seeds that round, so that count
-- would be 0 and the derivation would throw.
ALTER TABLE "Tournament" ADD COLUMN     "bracketSize" INTEGER,
ADD COLUMN     "groupCount" INTEGER,
ADD COLUMN     "qualifiersPerGroup" INTEGER;

-- AlterTable: which group an entrant was drawn into, and where they finished
-- in it (written at the qualification cut).
ALTER TABLE "TournamentEntry" ADD COLUMN     "groupIndex" INTEGER,
ADD COLUMN     "groupPlacement" INTEGER;
