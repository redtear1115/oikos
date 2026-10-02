-- #1288 I1b — at most one open invite per group, enforced by the database.
--
-- "Open" = not accepted and not revoked. Since I1a (#1385, live since v1.5.x)
-- createInvite supersedes (revokes) every earlier open invite of the group in
-- the same transaction that inserts the new one, under a FOR UPDATE lock on the
-- group row. This migration makes that invariant a constraint:
--
-- 1. Expired rows that were never accepted or revoked get `revoked_at`. They
--    are dead already; this keeps "open" meaning exactly what the index below
--    covers. The UI is unchanged: validateInviteAcceptance reports `expired`
--    before `revoked`, so such a link still reads "expired".
-- 2. A group that still has more than one open invite keeps only the newest
--    (created_at, then id); the others are revoked. 0 groups in prod at the
--    time of writing; this step exists so the index below cannot fail to
--    build.
-- 3. A partial unique index on group_id over open rows.
--
-- Run it only after the I1a code is live in Production (it is, since v1.5.x)
-- and the rollback floor is recorded at I1a or later. Code from before I1a
-- mints a new invite without revoking the earlier one: with this index in
-- place, that INSERT fails with 23505 for any group that already has an open
-- invite.
--
-- Failure looks like: if deployed code (including an old Preview) predates
-- I1a, tapping "Invite" a second time shows only the generic error and no new
-- link is made; nothing else errors. With I1a code, a 23505 here is reported
-- as `invite_conflict`, which should never happen (the group row lock
-- serialises mints).
--
-- Idempotent: steps 1 and 2 only touch rows that are still open, and the
-- index is IF NOT EXISTS. A second back-to-back run changes 0 rows (barring a
-- row that expires in between, which step 1 then stamps).
--
-- Rollback: scripts/rollback/0076_invite_one_open_per_group.down.sql
-- (`DROP INDEX`). Drop the index first, then revert any code. The revoked_at
-- stamps from steps 1 and 2 are not undone: those rows were expired or
-- superseded and cannot be accepted either way.
--
-- Check afterwards (count only, never select token values):
--   SELECT count(*) FROM (
--     SELECT group_id FROM "GroupInvites"
--     WHERE accepted_at IS NULL AND revoked_at IS NULL
--     GROUP BY group_id HAVING count(*) > 1
--   ) t;
--   -- expected: 0
--   SELECT count(*) FROM pg_indexes
--   WHERE schemaname = 'public' AND indexname = 'GroupInvites_one_open_per_group';
--   -- expected: 1

UPDATE "GroupInvites"
SET revoked_at = now()
WHERE accepted_at IS NULL
  AND revoked_at IS NULL
  AND expires_at <= now();
--> statement-breakpoint
UPDATE "GroupInvites" gi
SET revoked_at = now()
FROM (
  SELECT id,
         row_number() OVER (PARTITION BY group_id ORDER BY created_at DESC, id DESC) AS rn
  FROM "GroupInvites"
  WHERE accepted_at IS NULL
    AND revoked_at IS NULL
) ranked
WHERE gi.id = ranked.id
  AND ranked.rn > 1;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "GroupInvites_one_open_per_group"
  ON "GroupInvites" ("group_id")
  WHERE accepted_at IS NULL AND revoked_at IS NULL;
