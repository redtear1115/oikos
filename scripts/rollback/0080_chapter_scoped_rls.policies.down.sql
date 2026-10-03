-- ROLLBACK (policies) for drizzle/0080_chapter_scoped_rls.sql — MANUAL ONLY, NEVER RUN AUTOMATICALLY.
-- Not a drizzle migration: drizzle-kit only runs files listed in drizzle/meta/_journal.json.
--
-- Usable on prod. This is the lever for "members stopped getting live updates
-- after 0080" (Realtime silently not delivering a table's events). It undoes
-- the parts of 0080 that Realtime depends on and nothing else:
--   1. Restores the SELECT policy of CashTransactions, IncomeTransactions,
--      Settlements and FuelLogs to 0045's text (copied verbatim from
--      drizzle/0045_rls_auth_uid_initplan.sql): ledger membership only.
--   2. Gives authenticated back table-level SELECT on the 11 tables Realtime /
--      the client use (OikosGroups, GroupBalance, the recurring-rule and
--      pending tables get every column again). PushTokens keeps INSERT,
--      UPDATE (0080 left them).
--   3. Drops public.viewer_in_chapter — after step 1, since 0080's policies
--      depend on it. Never touches 0079's public.frozen_copy_visible or the
--      Assets policy.
--   4. Removes 0080's row from drizzle.__drizzle_migrations, so the next
--      `db:migrate` re-applies 0080 (fix the cause first). Required for the
--      0079 rollback too: drizzle-kit only applies journal entries newer than
--      the newest recorded one, so 0079's row cannot be re-applied while
--      0080's is still recorded. Order: this file before 0079's down.
--
-- What it does NOT restore, on purpose: the step-1 / step-2 revokes (anon on
-- every table; authenticated on Profiles, GroupEpochs, GroupInvites, Trips,
-- …) stay. Nothing in the app or in Realtime reads those tables as
-- authenticated, and re-granting them reopens #1518. The full grant restore
-- is scripts/rollback/0080_chapter_scoped_rls.grants.down.sql — DEV ONLY.
--
-- What comes back: #1518 for the four money tables — a partner who joined a
-- ledger later can read the earlier chapter's expenses / incomes /
-- settlements / fuel logs with their own session and receives Realtime
-- frames for them. Failure look: nothing errors.
--
-- Run inside one transaction:  psql "$DATABASE_URL" -1 -v ON_ERROR_STOP=1 -f <this file>

-- 1. policies (0045)
DROP POLICY IF EXISTS "txns_group_member_select" ON "CashTransactions";
CREATE POLICY "txns_group_member_select" ON "CashTransactions" FOR SELECT
  USING (
    group_id IN (
      SELECT id FROM "OikosGroups"
      WHERE member_a = (select auth.uid()) OR member_b = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "settles_group_member_select" ON "Settlements";
CREATE POLICY "settles_group_member_select" ON "Settlements" FOR SELECT
  USING (
    group_id IN (
      SELECT id FROM "OikosGroups"
      WHERE member_a = (select auth.uid()) OR member_b = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "fuel_logs_member_select" ON "FuelLogs";
CREATE POLICY "fuel_logs_member_select" ON "FuelLogs" FOR SELECT
  USING (
    asset_id IN (
      SELECT id FROM "Assets" WHERE group_id IN (
        SELECT id FROM "OikosGroups"
        WHERE member_a = (select auth.uid()) OR member_b = (select auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "incomes_group_member_select" ON "IncomeTransactions";
CREATE POLICY "incomes_group_member_select" ON "IncomeTransactions" FOR SELECT
  USING (
    group_id IN (
      SELECT id FROM "OikosGroups"
      WHERE member_a = (select auth.uid()) OR member_b = (select auth.uid())
    )
  );

-- 2. table SELECT for Realtime
GRANT SELECT ON TABLE
  "CashTransactions", "IncomeTransactions", "Settlements", "FuelLogs",
  "RecurringExpenseRules", "RecurringIncomeRules",
  "PendingExpenseOccurrences", "PendingIncomeOccurrences",
  "OikosGroups", "GroupBalance", "PushTokens"
  TO authenticated;

-- 3. helper
DROP FUNCTION IF EXISTS public.viewer_in_chapter(uuid, timestamptz);

-- 4. migration bookkeeping
DELETE FROM drizzle.__drizzle_migrations WHERE created_at = 1783700000000;
