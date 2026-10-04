-- 0080 — Data API / Realtime reads stop at the chapter, not the ledger (#1518)
--
-- The app reads everything server-side (Drizzle on futari_app, BYPASSRLS,
-- 0072) and scopes money rows to the chapters the viewer was in
-- (lib/db/queries/_predicates.ts › viewerChaptersClause). The database's own
-- read path for signed-in users did not: Supabase's default ACL gave `anon`
-- and `authenticated` full privileges on every public table, and each table's
-- SELECT policy is "member of the ledger now". So a partner who joined a
-- ledger later could, with their own session, read the earlier chapter's
-- expenses / incomes / settlements / fuel logs — and the profile, invite,
-- import, review, quiz, trip and chapter rows of the ledger — through
-- GET /rest/v1/<table>, and Realtime delivered the earlier chapter's rows on
-- any UPDATE (e.g. a whole-ledger split-ratio swap). Read-only check
-- 2026-10-03: dev and prod had exactly this grant / policy shape.
--
-- What this does
--   1. anon: nothing on any public table (REVOKE ALL ON ALL TABLES). anon
--      never has a session; RLS already returned 0 rows — defence in depth.
--   2. authenticated loses every privilege on the tables that are neither
--      subscribed through Realtime nor used by the client:
--        CurrencyRates, GroupEpochs, GroupInvites, ImportBatches, ImportErrors,
--        InvoiceImportRuns, InvoiceImportSnapshots, MonthlyReviewMessages,
--        MonthlyReviewSnapshots, PartnerQuizAnswers, PartnerQuizSessions,
--        PlantDetails, Profiles, TripExpenses, Trips.
--      No policy of a table that keeps a grant sub-selects any of them, and
--      GroupEpochs is read only by the SECURITY DEFINER helpers
--      (frozen_copy_visible, viewer_in_chapter).
--   3. The 11 tables Realtime / the client still use keep exactly what they
--      need (REVOKE ALL first, so INSERT / UPDATE / DELETE / TRUNCATE /
--      REFERENCES / TRIGGER from the default ACL are gone):
--        CashTransactions, IncomeTransactions, Settlements, FuelLogs
--          table SELECT — RealtimeProvider parses the whole payload
--          (lib/realtime/payload-schema.ts).
--        RecurringExpenseRules, RecurringIncomeRules,
--        PendingExpenseOccurrences, PendingIncomeOccurrences
--          SELECT (id, group_id) — the handlers only refresh; group_id is the
--          subscription filter, id the key realtime.apply_rls looks up.
--        OikosGroups  SELECT (id, member_a, member_b) — the handler only
--          refreshes; every member-check policy sub-selects these columns.
--        GroupBalance SELECT (group_id, balance, version) — parseBalanceUpdate
--          reads balance + version; group_id is the filter and the key.
--        PushTokens   SELECT, INSERT, UPDATE — lib/pushNotifications.ts
--          upserts (INSERT … ON CONFLICT DO UPDATE). DELETE is used only by
--          the send-recurring-push edge function, as service_role.
--      Assets keeps 0075's column grants (not touched here). The *Details,
--      InvoiceCredentials and Outing* tables already had nothing.
--      A table-level REVOKE ALL also removes column-level grants (checked on
--      the PG 17 stand-in), so no hand-made column grant survives step 2 / 3.
--   4. public.viewer_in_chapter(group_id, at): true iff the CALLER
--      (auth.uid()) is listed on a GroupEpochs row of that ledger whose
--      [started_at, ended_at) contains `at`; the ledger's first chapter also
--      covers rows older than it. This is viewerChaptersClause, verbatim.
--      SECURITY DEFINER with an empty search_path (authenticated has no grant
--      on GroupEpochs any more); no viewer argument, so as a Data API RPC it
--      only ever answers about the caller. Owned by postgres; EXECUTE for
--      authenticated only. Same shape as 0079's frozen_copy_visible.
--   5. REPLACES (DROP + CREATE, not an added policy — permissive policies are
--      OR-ed, so an extra one could only widen access) the SELECT policy of
--      CashTransactions, IncomeTransactions, Settlements and FuelLogs with
--      0045's member condition AND viewer_in_chapter(group_id, created_at).
--      FuelLogs has no group_id: the chapter check sits inside its "Assets"
--      sub-select and takes the ledger from the asset and the time from
--      "FuelLogs"."created_at"; the sub-select still runs as the caller, so
--      0079's frozen-copy rule on Assets still applies. Every column is
--      table-qualified (an unqualified created_at inside the Assets sub-select
--      would bind to Assets' own column, with no error).
--   Not chapter-scoped, by product design (ledger-scoped — a later partner
--   sees them in the app too): Assets (0079 handles frozen copies), recurring
--   rules, pending occurrences, GroupBalance, OikosGroups, PushTokens.
--   Server Drizzle (futari_app, BYPASSRLS), service_role and the SECURITY
--   DEFINER jobs (owner postgres) are unaffected.
--
-- What failure looks like
--   * Too tight (a grant missing, or the helper losing EXECUTE): nothing
--     errors and nothing shows in the UI — Realtime just stops delivering that
--     table's events (or delivers "Error 401" frames), so the list stops
--     live-updating until a reload (reloads read server-side and are fine).
--     The dev realtime check is the gate for this.
--   * A column added later to a column-trimmed table (OikosGroups,
--     GroupBalance, recurring rules, pending occurrences) is NOT granted:
--     Realtime frames simply lack it (same caveat as 0075). Only matters if a
--     handler starts reading the payload; then grant that column explicitly.
--   * Too loose (a later migration adds a permissive SELECT policy on a money
--     table, or re-grants a table in step 2): nothing errors; a later partner
--     reads an earlier chapter again. New tables get Supabase's default ACL
--     (anon + authenticated ALL) — tests/migration-grant-guard.test.ts fails a
--     later migration that creates a table / function without revoking it,
--     and __tests__/actions/dataApiGrants1518.test.ts compares the live
--     catalog to the allowlist.
--   * A ledger with no GroupEpochs row: viewer_in_chapter is false for all its
--     rows, so its members get no Realtime money events (fails closed).
--
-- Pre-check (read-only, run first; any non-zero / unexpected row → stop):
--   SELECT count(*) FROM "OikosGroups" g
--    WHERE NOT EXISTS (SELECT 1 FROM "GroupEpochs" e WHERE e.group_id = g.id);   → 0
--   SELECT count(*) FROM (SELECT g.id FROM "OikosGroups" g
--     LEFT JOIN "GroupEpochs" e ON e.group_id = g.id AND e.ended_at IS NULL
--     GROUP BY g.id HAVING count(e.id) <> 1) x;                                     → 0
--   SELECT viewname FROM pg_views WHERE schemaname = 'public';                     → none
--   SELECT p.oid::regprocedure FROM pg_proc p
--    WHERE p.pronamespace = 'public'::regnamespace AND NOT p.prosecdef
--      AND has_function_privilege('authenticated', p.oid, 'EXECUTE');
--     → only compute_next_occurrence(date,integer,integer) (pure date math)
--
-- Order: runs after 0079 (journal: 0078 < 0079 < 0080, strictly increasing
-- `when`). Independent of the app code: the app does not read these tables
-- through RLS, so deploy order does not matter.
--
-- Manual apply (dev):  psql "$DATABASE_URL_DIRECT" -1 -v ON_ERROR_STOP=1 -f drizzle/0080_chapter_scoped_rls.sql
-- Post-check (read the catalog, not tool output):
--   SELECT c.relname, r.role,
--          has_table_privilege(r.role, c.oid, 'SELECT') AS t_sel,
--          has_table_privilege(r.role, c.oid, 'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') AS t_other,
--          (SELECT string_agg(a.attname, ',' ORDER BY a.attname) FROM pg_attribute a
--            WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
--              AND has_column_privilege(r.role, c.oid, a.attnum, 'SELECT')) AS sel_cols
--     FROM pg_class c CROSS JOIN (VALUES ('anon'), ('authenticated')) r(role)
--    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
--      AND has_any_column_privilege(r.role, c.oid, 'SELECT, INSERT, UPDATE, REFERENCES')
--    ORDER BY 1, 2;
--     → anon: no rows. authenticated: exactly Assets (0075's 10 columns),
--       CashTransactions / FuelLogs / IncomeTransactions / Settlements
--       (t_sel), GroupBalance (balance,group_id,version), OikosGroups
--       (id,member_a,member_b), the two recurring-rule and two pending tables
--       (group_id,id), PushTokens (t_sel; t_other true = INSERT, UPDATE).
--   SELECT tablename, policyname, cmd, permissive, qual FROM pg_policies
--    WHERE tablename IN ('CashTransactions', 'IncomeTransactions', 'Settlements', 'FuelLogs')
--    ORDER BY 1, 2;
--     → exactly one SELECT policy per table (txns_group_member_select,
--       incomes_group_member_select, settles_group_member_select,
--       fuel_logs_member_select), PERMISSIVE, qual mentions viewer_in_chapter.
--   SELECT prosecdef, proconfig, pg_get_userbyid(proowner),
--          has_function_privilege('authenticated', oid, 'EXECUTE'),
--          has_function_privilege('anon', oid, 'EXECUTE')
--     FROM pg_proc WHERE oid = 'public.viewer_in_chapter(uuid, timestamptz)'::regprocedure;
--     → t, {search_path=""}, postgres, t, f
--   Then the realtime check on dev (manual): A and the later partner both get
--   a new expense, a balance update, a recurring-rule change and an Assets
--   change; the later partner gets no frame for a swap UPDATE of a row from
--   before they joined.
--
-- Rollback (two files, see each header):
--   scripts/rollback/0080_chapter_scoped_rls.policies.down.sql — usable on prod
--     (restores 0045's four policies and the kept tables' table SELECT for
--     Realtime; the step-2 revokes stay).
--   scripts/rollback/0080_chapter_scoped_rls.grants.down.sql — DEV ONLY
--     (re-grants ALL to anon / authenticated, i.e. reopens #1518).
--   Roll 0080 back before 0079.
-- Idempotent: safe to re-apply.

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
--> statement-breakpoint
REVOKE ALL ON TABLE
  "CurrencyRates", "GroupEpochs", "GroupInvites", "ImportBatches", "ImportErrors",
  "InvoiceImportRuns", "InvoiceImportSnapshots", "MonthlyReviewMessages",
  "MonthlyReviewSnapshots", "PartnerQuizAnswers", "PartnerQuizSessions",
  "PlantDetails", "Profiles", "TripExpenses", "Trips"
  FROM anon, authenticated;
--> statement-breakpoint
REVOKE ALL ON TABLE
  "CashTransactions", "IncomeTransactions", "Settlements", "FuelLogs",
  "RecurringExpenseRules", "RecurringIncomeRules",
  "PendingExpenseOccurrences", "PendingIncomeOccurrences",
  "OikosGroups", "GroupBalance", "PushTokens"
  FROM anon, authenticated;
--> statement-breakpoint
GRANT SELECT ON TABLE "CashTransactions", "IncomeTransactions", "Settlements", "FuelLogs" TO authenticated;
--> statement-breakpoint
GRANT SELECT ("id", "group_id") ON TABLE "RecurringExpenseRules" TO authenticated;
--> statement-breakpoint
GRANT SELECT ("id", "group_id") ON TABLE "RecurringIncomeRules" TO authenticated;
--> statement-breakpoint
GRANT SELECT ("id", "group_id") ON TABLE "PendingExpenseOccurrences" TO authenticated;
--> statement-breakpoint
GRANT SELECT ("id", "group_id") ON TABLE "PendingIncomeOccurrences" TO authenticated;
--> statement-breakpoint
GRANT SELECT ("id", "member_a", "member_b") ON TABLE "OikosGroups" TO authenticated;
--> statement-breakpoint
GRANT SELECT ("group_id", "balance", "version") ON TABLE "GroupBalance" TO authenticated;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE "PushTokens" TO authenticated;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.viewer_in_chapter(p_group_id uuid, p_at timestamptz)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public."GroupEpochs" ve
     WHERE ve.group_id = p_group_id
       AND (ve.member_a_id = (SELECT auth.uid()) OR ve.member_b_id = (SELECT auth.uid()))
       AND (ve.ended_at IS NULL OR p_at < ve.ended_at)
       AND (
         p_at >= ve.started_at
         OR ve.started_at = (
           SELECT min(fe.started_at) FROM public."GroupEpochs" fe
            WHERE fe.group_id = p_group_id
         )
       )
  )
$fn$;
--> statement-breakpoint
ALTER FUNCTION public.viewer_in_chapter(uuid, timestamptz) OWNER TO postgres;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.viewer_in_chapter(uuid, timestamptz) FROM PUBLIC, anon, authenticated, service_role;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.viewer_in_chapter(uuid, timestamptz) TO authenticated;
--> statement-breakpoint
DROP POLICY IF EXISTS "txns_group_member_select" ON "CashTransactions";
--> statement-breakpoint
CREATE POLICY "txns_group_member_select" ON "CashTransactions" FOR SELECT
  USING (
    "CashTransactions"."group_id" IN (
      SELECT "OikosGroups"."id" FROM "OikosGroups"
      WHERE "OikosGroups"."member_a" = (select auth.uid()) OR "OikosGroups"."member_b" = (select auth.uid())
    )
    AND public.viewer_in_chapter("CashTransactions"."group_id", "CashTransactions"."created_at")
  );
--> statement-breakpoint
DROP POLICY IF EXISTS "incomes_group_member_select" ON "IncomeTransactions";
--> statement-breakpoint
CREATE POLICY "incomes_group_member_select" ON "IncomeTransactions" FOR SELECT
  USING (
    "IncomeTransactions"."group_id" IN (
      SELECT "OikosGroups"."id" FROM "OikosGroups"
      WHERE "OikosGroups"."member_a" = (select auth.uid()) OR "OikosGroups"."member_b" = (select auth.uid())
    )
    AND public.viewer_in_chapter("IncomeTransactions"."group_id", "IncomeTransactions"."created_at")
  );
--> statement-breakpoint
DROP POLICY IF EXISTS "settles_group_member_select" ON "Settlements";
--> statement-breakpoint
CREATE POLICY "settles_group_member_select" ON "Settlements" FOR SELECT
  USING (
    "Settlements"."group_id" IN (
      SELECT "OikosGroups"."id" FROM "OikosGroups"
      WHERE "OikosGroups"."member_a" = (select auth.uid()) OR "OikosGroups"."member_b" = (select auth.uid())
    )
    AND public.viewer_in_chapter("Settlements"."group_id", "Settlements"."created_at")
  );
--> statement-breakpoint
DROP POLICY IF EXISTS "fuel_logs_member_select" ON "FuelLogs";
--> statement-breakpoint
CREATE POLICY "fuel_logs_member_select" ON "FuelLogs" FOR SELECT
  USING (
    "FuelLogs"."asset_id" IN (
      SELECT "Assets"."id" FROM "Assets"
      WHERE "Assets"."group_id" IN (
        SELECT "OikosGroups"."id" FROM "OikosGroups"
        WHERE "OikosGroups"."member_a" = (select auth.uid()) OR "OikosGroups"."member_b" = (select auth.uid())
      )
      AND public.viewer_in_chapter("Assets"."group_id", "FuelLogs"."created_at")
    )
  );
