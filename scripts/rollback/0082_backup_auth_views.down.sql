-- ROLLBACK for drizzle/0082_backup_auth_views.sql — MANUAL ONLY, NEVER RUN AUTOMATICALLY.
-- Not a drizzle migration: drizzle-kit only runs files listed in drizzle/meta/_journal.json.
--
-- What it does:
--   1. Drops schema backup_auth with its two views. They hold no data (views
--      over auth.users / auth.identities), so nothing is lost; futari_backup's
--      grants on them go with them.
--   2. Removes 0082's row from drizzle.__drizzle_migrations (0 rows where it
--      was applied by hand, as on dev). Re-running `db:migrate` will NOT
--      re-apply 0082 once any later migration is recorded: drizzle skips an
--      entry older than the newest applied one. To bring it back, run the body
--      of drizzle/0082_backup_auth_views.sql by hand as postgres.
--
-- What comes back: the nightly backup cannot read sign-in identities. Failure
-- look: the next run fails at its privilege preflight with
-- `relation "backup_auth.users" does not exist` (macOS notification + FAILED
-- marker); the app is not affected. Stop the nightly job first if the backup
-- is being taken down on purpose (ops-runbook §「Prod backup (futari_backup)」,
-- Rollback).
--
-- Run inside one transaction:  psql "$DATABASE_URL" -1 -v ON_ERROR_STOP=1 -f <this file>

-- 1. schema + views
DROP SCHEMA IF EXISTS backup_auth CASCADE;

-- 2. migration bookkeeping
DELETE FROM drizzle.__drizzle_migrations WHERE created_at = 1783850000000;
