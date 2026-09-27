-- #1288 I3a — store a hash of the invite token next to the token (expand step).
--
-- Invite lookups move from the raw `token` to `token_hash`
-- (= lowercase hex SHA-256 of the token's UTF-8 bytes; `hashToken()` in
-- lib/invite.ts computes the same value). This migration only adds room for
-- the hash and fills it in. The raw column is cleared and dropped by later
-- steps (I3c code, then an I3d migration), each behind its own gate.
--
-- Safe to run before the I3b code is deployed: the code that is live today
-- always writes `token` and looks up by `token`, and nothing here changes that.
-- Rows that code mints after this runs have a NULL `token_hash` until the
-- backfill is re-run; the I3b lookup falls back to `token` for those rows.
--
-- 1. `token_hash` is added nullable.
-- 2. `token` becomes nullable. Nothing writes NULL yet (both the live code and
--    I3b write it); a later code step stops writing it.
-- 3. Backfill. Idempotent: it only touches rows whose hash is still NULL, so a
--    re-run (gate G1) picks up rows minted by older code in the meantime and a
--    second back-to-back run updates 0 rows.
-- 4. Unique index on `token_hash`. NULLs don't collide, so rows not yet
--    backfilled are fine.
--
-- Rollback: scripts/rollback/0070_invite_token_hash_expand.down.sql — only
-- while no deployed code reads `token_hash` (revert the I3b code first).
--
-- Check afterwards (count only, never select token values):
--   SELECT count(*) FROM "GroupInvites" WHERE token_hash IS NULL;
--   -- expected: 0 right after this runs

ALTER TABLE "GroupInvites" ADD COLUMN IF NOT EXISTS "token_hash" text;
--> statement-breakpoint
ALTER TABLE "GroupInvites" ALTER COLUMN "token" DROP NOT NULL;
--> statement-breakpoint
UPDATE "GroupInvites"
SET token_hash = encode(sha256(convert_to(token, 'UTF8')), 'hex')
WHERE token_hash IS NULL
  AND token IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "GroupInvites_token_hash_unique" ON "GroupInvites" ("token_hash");
