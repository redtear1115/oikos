-- Supabase Performance Advisor + Security Lint fixes.
--
-- Issue 1 — Auth RLS InitPlan: profiles_select re-runs auth.uid() per row.
-- Issue 2 — Multiple Permissive Policies: Assets has both assets_select
--           (db/rls/policies.sql) and assets_group_member_select (0006).
-- Issue 3 — Function search_path mutable on public.handle_new_user.
-- Issue 4/5 — anon + authenticated can RPC the SECURITY DEFINER trigger fn.

-- ─── Issue 1: Profiles RLS — cache auth.uid() via InitPlan ──────────────────
-- Wrapping auth.uid() in (select auth.uid()) lets Postgres evaluate it once
-- per query instead of once per row.
DROP POLICY IF EXISTS "profiles_select" ON "Profiles";
CREATE POLICY "profiles_select" ON "Profiles" FOR SELECT USING (
  id = (select auth.uid()) OR id IN (
    SELECT member_a FROM "OikosGroups" WHERE member_b = (select auth.uid())
    UNION
    SELECT member_b FROM "OikosGroups" WHERE member_a = (select auth.uid())
  )
);

-- ─── Issue 2: Drop duplicate assets_select ──────────────────────────────────
-- assets_group_member_select (added in 0006 for realtime) is the
-- intentionally looser policy: soft-delete UPDATE events must pass RLS to
-- reach subscribed clients. Application queries already filter
-- deleted_at IS NULL (lib/db/queries/asset.ts).
DROP POLICY IF EXISTS "assets_select" ON "Assets";

-- ─── Issue 3: Pin search_path on handle_new_user ────────────────────────────
ALTER FUNCTION public.handle_new_user() SET search_path = public, pg_temp;

-- ─── Issue 4 & 5: Revoke RPC access to the SECURITY DEFINER trigger fn ─────
-- handle_new_user is invoked by the on_auth_user_created INSERT trigger on
-- auth.users; it must not be callable via PostgREST /rest/v1/rpc.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
