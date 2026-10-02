-- ROLLBACK for drizzle/0076_invite_one_open_per_group.sql — NEVER RUN AUTOMATICALLY.
-- Not a drizzle migration: drizzle-kit only runs files listed in drizzle/meta/_journal.json.
--
-- Order: run this BEFORE reverting the code to anything older than I1a
-- (#1385). Code from before I1a does not supersede earlier invites, so with
-- the index still in place its second mint for a group fails with 23505 and
-- the inviter sees only the generic error.
--
-- What it does:
--   1. Drops the one-open-invite-per-group partial unique index.
--   2. Removes 0076's row from drizzle.__drizzle_migrations so `db:migrate`
--      would re-apply it.
--
-- Not undone: the revoked_at stamps 0076 wrote. Those rows were expired or
-- superseded; un-revoking them would not make any of them usable again.
--
-- Run inside one transaction:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f <this file>

-- 1. GroupInvites
DROP INDEX IF EXISTS "GroupInvites_one_open_per_group";

-- 2. migration bookkeeping
DELETE FROM drizzle.__drizzle_migrations
 WHERE created_at = 1783300000000;
