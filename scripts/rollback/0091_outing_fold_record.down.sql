-- ROLLBACK for drizzle/0091_outing_fold_record.sql
-- Not a drizzle migration: drizzle-kit only runs files listed in drizzle/meta/_journal.json.
--
-- Drops the fold record from "Outings". Loses only the hide-record: ended
-- outings list the already-folded line again (the behaviour before #1635).
-- Settlements are untouched. Revert the code PR first or at the same time:
-- code that selects fold_* fails every outing query once the columns are gone.
--
-- To let `db:migrate` re-apply 0091 afterwards, remove its journal row:
--   DELETE FROM drizzle.__drizzle_migrations WHERE created_at = 1784700000000;

ALTER TABLE "Outings" DROP CONSTRAINT IF EXISTS outings_fold_record_check;
ALTER TABLE "Outings"
  DROP COLUMN IF EXISTS fold_from_participant_id,
  DROP COLUMN IF EXISTS fold_to_participant_id,
  DROP COLUMN IF EXISTS fold_amount;
