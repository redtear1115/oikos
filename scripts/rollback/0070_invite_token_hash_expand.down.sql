-- ROLLBACK for drizzle/0070_invite_token_hash_expand.sql — DEV ONLY, NEVER RUN AUTOMATICALLY.
-- Not a drizzle migration: drizzle-kit only runs files listed in drizzle/meta/_journal.json.
--
-- Revert the code first. The #1288 I3b code writes and reads `token_hash`;
-- with the column gone, minting fails and every link reads "invalid or
-- expired". Run this only once the deployed code is from before I3b.
--
-- What it does:
--   1. Drops the unique index on token_hash.
--   2. Drops the token_hash column.
--   3. Restores NOT NULL on token. That only succeeds while every row still
--      has a token, which holds until the I3c code (which stops writing it)
--      has minted anything. If step 3 fails with 23502, a row without a token
--      exists: this rollback no longer applies (the plan rolls forward only
--      after I3c).
--   4. Removes 0070's row from drizzle.__drizzle_migrations so `db:migrate` would re-apply it.
--
-- Run inside one transaction:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f <this file>

-- 1–3. GroupInvites
DROP INDEX IF EXISTS "GroupInvites_token_hash_unique";
ALTER TABLE "GroupInvites" DROP COLUMN IF EXISTS "token_hash";
ALTER TABLE "GroupInvites" ALTER COLUMN "token" SET NOT NULL;

-- 4. migration bookkeeping
DELETE FROM drizzle.__drizzle_migrations
 WHERE hash = 'ac7e80d00d143ece9b618a8e7e0e927813f5f203d8ce3816f444f937287d0da5' OR created_at = 1782800000000;
