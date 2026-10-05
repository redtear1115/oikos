-- ROLLBACK for drizzle/0083_outing_link_join.sql — MANUAL ONLY, NEVER RUN AUTOMATICALLY.
-- Not a drizzle migration: drizzle-kit only runs files listed in drizzle/meta/_journal.json.
--
-- What it does:
--   1. Restores process_account_deletions to 0074's definition: run the
--      CREATE OR REPLACE FUNCTION block of
--      drizzle/0074_account_deletion_profile_lock.sql (from
--      "CREATE OR REPLACE FUNCTION public.process_account_deletions()" through
--      its REVOKE / GRANT) BEFORE this file — step 2 drops a column the 0083
--      body writes, and every run of the job fails per user (WARNING only)
--      until the function stops naming it.
--   2. Drops the five #1558 columns and their indexes. Share links and claims
--      are lost: every shared outing link stops working, every claimed
--      friend loses their slot.
--   3. Removes 0083's row from drizzle.__drizzle_migrations.
--
-- Roll the app code back FIRST: anything that selects these columns fails
-- once they are gone.
--
-- Run inside one transaction:  psql "$DATABASE_URL" -1 -v ON_ERROR_STOP=1 -f <this file>

DROP INDEX IF EXISTS "uq_outings_share_token_hash";
DROP INDEX IF EXISTS "uq_outing_participants_claim_token_hash";
ALTER TABLE "Outings" DROP COLUMN IF EXISTS "share_token_hash";
ALTER TABLE "Outings" DROP COLUMN IF EXISTS "share_token_encrypted";
ALTER TABLE "Outings" DROP COLUMN IF EXISTS "share_token_rotated_at";
ALTER TABLE "OutingParticipants" DROP COLUMN IF EXISTS "claim_token_hash";
ALTER TABLE "OutingParticipants" DROP COLUMN IF EXISTS "claimed_at";

DELETE FROM drizzle.__drizzle_migrations
WHERE created_at = 1783900000000;
