-- #1288 I3d — drop the plaintext GroupInvites.token column (contract step).
--
-- 0070 (I3a) added `token_hash` and backfilled it; I3b (v1.6.3) wrote both
-- columns; I3c (#1498, v1.6.6) stopped writing and reading `token` and took it
-- out of the Drizzle schema. This migration finishes the job:
--   1. A guard aborts the whole migration, before anything changes, if any row
--      has no `token_hash` or if the unique index on `token_hash` is missing
--      or invalid (the lookup key must be complete and enforced before the
--      only other copy of the token goes). It only counts rows; it never
--      selects token values.
--   2. `token_hash` becomes NOT NULL.
--   3. The unique constraint on `token`, then the column itself, are dropped.
-- Every step is idempotent: a second run passes the guard and changes nothing.
-- If the guard fires under `drizzle-kit migrate`, the tool exits 1 with no
-- error text (only the "applying migrations" spinner) and nothing is applied;
-- re-run this file with psql (below) to see which check failed.
--
-- Rollback floor: v1.6.6. Builds before #1498 still declare `token` in their
-- Drizzle schema, so every `select().from(groupInvites)` names the column.
-- Failure look on such a build: every invite link fails — minting, the
-- landing page and accepting all return the generic error — and nothing else
-- in the app errors. Do not roll Production (or promote a deployment) below
-- v1.6.6 after this runs.
--
-- Preview deployments use the prod database. Any Preview built before #1498
-- (including throwaway admin-route previews) breaks the same way once this
-- runs on prod: delete those deployments or accept the breakage.
--
-- What "dropped" means for the plaintext values: DROP COLUMN removes them
-- logically. The bytes stay in the table's pages until a table rewrite or
-- vacuum reuses them, and in backups / PITR until those expire. Every
-- plaintext value is already an expired invite (24h TTL since 0067), as long
-- as this runs at least 24h after v1.6.6 went live (2026-10-03T16:30Z), so
-- nothing still redeemable is left behind.
--
-- After this runs, drizzle/0070_invite_token_hash_expand.sql and
-- scripts/rollback/0070_invite_token_hash_expand.down.sql can no longer be
-- re-run: both name the `token` column and fail.
--
-- Manual runs (outside `drizzle-kit migrate`, which already wraps everything
-- in one transaction) must be a single transaction, or SET LOCAL does nothing
-- and a guard failure would not undo earlier statements:
--   psql "$DATABASE_URL" -1 -v ON_ERROR_STOP=1 -f drizzle/0078_invite_drop_plaintext_token.sql
--
-- Rollback: scripts/rollback/0078_invite_drop_plaintext_token.down.sql
-- (re-adds an empty, nullable `token`; the plaintext cannot be restored).
--
-- Check afterwards (by data, not by the tool's success message):
--   SELECT column_name, is_nullable FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'GroupInvites' AND column_name LIKE 'token%';
--   -- expected: one row, token_hash | NO
--   SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'GroupInvites' ORDER BY 1;
--   -- expected: GroupInvites_one_open_per_group, GroupInvites_pkey, GroupInvites_token_hash_unique

SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
DO $$
DECLARE
  v_missing bigint;
  v_valid   boolean;
BEGIN
  SELECT count(*) INTO v_missing FROM "GroupInvites" WHERE token_hash IS NULL;
  IF v_missing > 0 THEN
    RAISE EXCEPTION '0078: % GroupInvites row(s) have no token_hash; not dropping token', v_missing;
  END IF;

  SELECT i.indisvalid INTO v_valid
    FROM pg_index i
   WHERE i.indexrelid = to_regclass('"GroupInvites_token_hash_unique"');
  IF v_valid IS NULL THEN
    RAISE EXCEPTION '0078: index GroupInvites_token_hash_unique is missing; not dropping token';
  ELSIF NOT v_valid THEN
    RAISE EXCEPTION '0078: index GroupInvites_token_hash_unique is not valid; not dropping token';
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "GroupInvites" ALTER COLUMN "token_hash" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "GroupInvites" DROP CONSTRAINT IF EXISTS "GroupInvites_token_unique";
--> statement-breakpoint
ALTER TABLE "GroupInvites" DROP COLUMN IF EXISTS "token";
