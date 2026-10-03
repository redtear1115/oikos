-- 0079 — frozen 愛物 copies resolve only for members at freeze time (#1484)
--
-- leaveGroup (#1442) leaves frozen copies of 愛物 (Assets.frozen_at IS NOT
-- NULL) in a ledger so that records keep their linked name. The Assets RLS
-- policy (assets_group_member_select, last defined in 0023) is group-
-- membership only: a partner who joins that ledger later — or an earlier
-- ex-partner pinned on an old chapter — can read the copy's row and name
-- through the Data API (GET /rest/v1/Assets with their own session; 0075
-- left authenticated SELECT on `name`) and through Realtime (Assets is in
-- supabase_realtime; realtime.apply_rls evaluates this policy as the
-- subscriber). The app's own reads are server-side Drizzle on futari_app
-- (BYPASSRLS, 0072) and get the same rule in SQL
-- (lib/db/queries/_predicates.ts › frozenCopyVisibleClause).
--
-- Rule: a frozen copy is visible iff the viewer was a member of the copy's
-- ledger AT the freeze moment — some GroupEpochs row of that ledger lists them
-- (member_a_id / member_b_id) and started_at <= frozen_at <= ended_at (open
-- chapter: no upper bound). Rows with frozen_at IS NULL are unchanged.
--
-- What this does
--   1. public.frozen_copy_visible(group_id, frozen_at): the rule above for the
--      CALLER (auth.uid()). SECURITY DEFINER with an empty search_path, so it
--      does not depend on authenticated's grant on / RLS of GroupEpochs.
--      It takes no viewer argument on purpose: exposed as a Data API RPC, it
--      can only answer about the caller's own chapters, never "was user X in
--      group G". Owned by postgres; EXECUTE for authenticated only.
--   2. REPLACES assets_group_member_select (not an added policy: permissive
--      policies are OR-ed, so an extra one could only widen access) with
--      0023's group-member condition AND (frozen_at IS NULL OR the helper).
--      Every outer column is table-qualified.
--   FuelLogs (fuel_logs_member_select, 0045) and the *Details policies are
--   unchanged: they sub-select "Assets" as the caller, so this policy applies
--   inside them — a fuel log on a copy the caller may not see is hidden too.
--   Server Drizzle (futari_app, BYPASSRLS) and the SECURITY DEFINER jobs
--   (owner postgres) do not evaluate RLS and are unaffected.
--
-- What failure looks like
--   * Too tight (e.g. the helper loses EXECUTE for authenticated, or a later
--     migration redefines the policy wrongly): every Data API / Realtime read
--     of Assets by a member fails or returns nothing, nothing surfaces in the
--     UI — the dashboard just stops live-updating Assets (frames silently
--     stop; a refresh still shows the data, which is read server-side).
--   * Too loose (this policy dropped or OR-ed with another permissive SELECT
--     policy): nothing errors; a later partner can read the leaver's copied
--     car / child name and its fuel logs with their own session.
--
-- Order: runs after 0078 (journal: 0077 < 0078 < 0079, strictly increasing
-- `when`). Independent of the app code: the app does not read Assets through
-- RLS, so deploy order does not matter.
--
-- Manual apply (dev):  psql "$DATABASE_URL_DIRECT" -1 -v ON_ERROR_STOP=1 -f drizzle/0079_frozen_copy_visibility.sql
-- Post-check (read pg_policies, not tool output):
--   SELECT tablename, policyname, cmd, permissive, qual FROM pg_policies
--    WHERE tablename IN ('Assets', 'FuelLogs') ORDER BY 1, 2;
--     → exactly assets_group_member_select (SELECT, its qual mentions
--       frozen_copy_visible) and fuel_logs_member_select (SELECT); no ALL;
--       the legacy assets_select / fuel_logs_select are absent.
--   SELECT relrowsecurity FROM pg_class WHERE oid = '"Assets"'::regclass;  → t
--   As authenticated with a later partner's claims: 0 rows for the copy and
--   for its FuelLogs; with the stayer's claims: 1. Realtime still delivers
--   Assets events to a member (manual).
--
-- Rollback: scripts/rollback/0079_frozen_copy_visibility.down.sql (restores
-- 0023's policy, drops the helper).
-- Idempotent: safe to re-apply.

CREATE OR REPLACE FUNCTION public.frozen_copy_visible(p_group_id uuid, p_frozen_at timestamptz)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT p_frozen_at IS NULL OR EXISTS (
    SELECT 1 FROM public."GroupEpochs" e
     WHERE e.group_id = p_group_id
       AND (e.member_a_id = (SELECT auth.uid()) OR e.member_b_id = (SELECT auth.uid()))
       AND e.started_at <= p_frozen_at
       AND (e.ended_at IS NULL OR e.ended_at >= p_frozen_at)
  )
$fn$;
--> statement-breakpoint
ALTER FUNCTION public.frozen_copy_visible(uuid, timestamptz) OWNER TO postgres;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.frozen_copy_visible(uuid, timestamptz) FROM PUBLIC, anon, authenticated, service_role;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.frozen_copy_visible(uuid, timestamptz) TO authenticated;
--> statement-breakpoint
DROP POLICY IF EXISTS "assets_group_member_select" ON "Assets";
--> statement-breakpoint
CREATE POLICY "assets_group_member_select" ON "Assets" FOR SELECT
  USING (
    "Assets"."group_id" IN (
      SELECT "OikosGroups"."id" FROM "OikosGroups"
      WHERE "OikosGroups"."member_a" = (select auth.uid()) OR "OikosGroups"."member_b" = (select auth.uid())
    )
    AND (
      "Assets"."frozen_at" IS NULL
      OR public.frozen_copy_visible("Assets"."group_id", "Assets"."frozen_at")
    )
  );
