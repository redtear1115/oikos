-- ROLLBACK for drizzle/0078_invite_drop_plaintext_token.sql — MANUAL ONLY, NEVER RUN AUTOMATICALLY.
-- Not a drizzle migration: drizzle-kit only runs files listed in drizzle/meta/_journal.json.
--
-- Prefer rolling code forward. This exists only to let a build from before
-- #1498 (v1.6.3–v1.6.5) run again; v1.6.6+ does not need it.
--
-- What it does:
--   1. Re-adds `token` as an empty, nullable text column. The plaintext values
--      cannot be restored; existing links keep working through token_hash.
--   2. Removes 0078's row from drizzle.__drizzle_migrations.
--
-- What it deliberately does NOT restore:
--   - NOT NULL on token_hash. Every build from v1.6.3 on writes token_hash, so
--     it stays enforced.
--   - The unique constraint on token. Nothing looks up by token any more.
--
-- After this runs:
--   - Rollback floor becomes v1.6.3 (the first build that writes token_hash).
--   - v1.6.3–v1.6.5 write the plaintext token again on every mint, until 0078
--     is re-run. Failure look: nothing errors; new rows carry the raw join link
--     in `token` again.
--   - The next `drizzle-kit migrate` re-applies 0078 (its row is gone), which
--     breaks invites on any pre-#1498 build again. Roll code forward to v1.6.6+
--     before the next migrate.
--
-- Run inside one transaction:  psql "$DATABASE_URL" -1 -v ON_ERROR_STOP=1 -f <this file>

-- 1. GroupInvites
ALTER TABLE "GroupInvites" ADD COLUMN IF NOT EXISTS "token" text;

-- 2. migration bookkeeping
DELETE FROM drizzle.__drizzle_migrations WHERE created_at = 1783500000000;
