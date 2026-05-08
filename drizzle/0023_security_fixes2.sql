-- Follow-up to 0022_security_fixes.sql.
--
-- 1) handle_new_user EXECUTE: 0022 only revoked from anon + authenticated.
--    PUBLIC still had EXECUTE, and PUBLIC is the implicit grant that anon /
--    authenticated inherit from — so the prior REVOKE was effectively a
--    no-op for the advisor warning. Revoke from PUBLIC and re-grant
--    explicitly to postgres + service_role. The trigger on auth.users
--    does not require the firing role to hold EXECUTE (Postgres docs:
--    "EXECUTE privilege is not required when the trigger is fired"),
--    so signup keeps working.
--
-- 2) Profiles RLS — drop the redundant `profiles_select` that 0022 created
--    on dev (where it didn't previously exist) and InitPlan-optimize the
--    two pre-existing policies (`profiles_self_select`,
--    `profiles_partner_select`) in place by wrapping `auth.uid()` in
--    `(select auth.uid())`. This addresses Issue 1 (Auth RLS InitPlan)
--    at the root for Profiles.
--
-- 3) Assets RLS — same InitPlan optimization for `assets_group_member_select`.

-- ─── 1. handle_new_user — revoke PUBLIC, re-grant service roles ────────────
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO postgres, service_role;

-- ─── 2. Profiles — drop redundant + InitPlan-optimize the rest ─────────────
DROP POLICY IF EXISTS "profiles_select" ON public."Profiles";

DROP POLICY IF EXISTS "profiles_self_select" ON "Profiles";
CREATE POLICY "profiles_self_select" ON "Profiles" FOR SELECT
  USING (id = (select auth.uid()));

DROP POLICY IF EXISTS "profiles_partner_select" ON "Profiles";
CREATE POLICY "profiles_partner_select" ON "Profiles" FOR SELECT
  USING (
    id IN (
      SELECT member_a FROM "OikosGroups" WHERE member_b = (select auth.uid())
      UNION
      SELECT member_b FROM "OikosGroups" WHERE member_a = (select auth.uid())
    )
  );

-- ─── 3. Assets — InitPlan-optimize the group-member SELECT policy ──────────
DROP POLICY IF EXISTS "assets_group_member_select" ON "Assets";
CREATE POLICY "assets_group_member_select" ON "Assets" FOR SELECT
  USING (
    group_id IN (
      SELECT id FROM "OikosGroups"
      WHERE member_a = (select auth.uid()) OR member_b = (select auth.uid())
    )
  );
