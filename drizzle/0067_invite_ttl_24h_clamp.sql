-- #1288 I2 — clamp open invite links to the new 24-hour TTL (decision D2).
--
-- New invites last 24 h (`INVITE_TTL_MS`, lib/invite.ts; stamped as
-- `now() + 24 h` on the DB clock). Links minted before that change were given
-- 7 days. This caps every still-open one at `created_at + 24 h`, so a link
-- older than a day stops working now instead of days from now. Links younger
-- than a day keep working until their 24 h are up.
--
-- Run it only after the 24 h code is live in Production (the plan's I2 order).
-- Run before that, the old code keeps minting 7-day links, and those are not
-- clamped until the next run.
--
-- Scope: open rows only (not accepted, not revoked). Accepted and revoked rows
-- are history and are left as they are. Rows that already expired also match
-- the WHERE only if their `expires_at` is still beyond `created_at + 24 h`;
-- LEAST() moves those to an earlier moment that is also in the past, so they
-- stay expired and nothing that was dead comes back.
--
-- Idempotent: once a row is clamped, `expires_at <= created_at + 24 h` and it
-- no longer matches, so a second run updates 0 rows.
--
-- Not reversible: the original 7-day expiry is not kept. Rolling back the code
-- leaves clamped rows clamped; an inviter whose link ran out mints a new one.
--
-- Check afterwards (count only, no token values):
--   SELECT count(*) FROM "GroupInvites"
--   WHERE accepted_at IS NULL AND revoked_at IS NULL
--     AND expires_at > created_at + interval '24 hours';
--   -- expected: 0

UPDATE "GroupInvites"
SET expires_at = LEAST(expires_at, created_at + interval '24 hours')
WHERE accepted_at IS NULL
  AND revoked_at IS NULL
  AND expires_at > created_at + interval '24 hours';
