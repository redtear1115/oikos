-- ROLLBACK for drizzle/0079_frozen_copy_visibility.sql — MANUAL ONLY, NEVER RUN AUTOMATICALLY.
-- Not a drizzle migration: drizzle-kit only runs files listed in drizzle/meta/_journal.json.
--
-- What it does:
--   1. Restores assets_group_member_select to 0023's definition (copied
--      verbatim from drizzle/0023_security_fixes2.sql): group membership only.
--      FuelLogs' policy was never changed by 0079, so nothing to restore there
--      (it is still 0045's, and again inherits 0023's rule through its
--      sub-select of "Assets").
--   2. Drops public.frozen_copy_visible — after step 1, since the 0079 policy
--      depends on it.
--   3. Removes 0079's row from drizzle.__drizzle_migrations so `db:migrate`
--      would re-apply it.
--
-- What comes back: #1484 on the Data API / Realtime — a partner who joined a
-- ledger after a leave (or an earlier ex-partner) can read frozen copies'
-- rows and names, and their fuel logs, with their own session. Failure look:
-- nothing errors. The app's own reads keep the rule (it lives in the server
-- queries, not in RLS); roll the app code back separately if needed.
--
-- Run inside one transaction:  psql "$DATABASE_URL" -1 -v ON_ERROR_STOP=1 -f <this file>

-- 1. Assets policy (0023)
DROP POLICY IF EXISTS "assets_group_member_select" ON "Assets";
CREATE POLICY "assets_group_member_select" ON "Assets" FOR SELECT
  USING (
    group_id IN (
      SELECT id FROM "OikosGroups"
      WHERE member_a = (select auth.uid()) OR member_b = (select auth.uid())
    )
  );

-- 2. helper
DROP FUNCTION IF EXISTS public.frozen_copy_visible(uuid, timestamptz);

-- 3. migration bookkeeping
DELETE FROM drizzle.__drizzle_migrations WHERE created_at = 1783600000000;
