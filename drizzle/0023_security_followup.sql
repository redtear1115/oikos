-- Follow-up to 0022_security_fixes.sql.
--
-- 1) handle_new_user EXECUTE: 0022 only revoked from anon + authenticated.
--    PUBLIC still had EXECUTE, and PUBLIC is the implicit grant that anon /
--    authenticated inherit from — so the prior REVOKE did not actually block
--    anything. Revoke from PUBLIC and re-grant explicitly to postgres +
--    service_role. The trigger on auth.users does not require the firing
--    role to hold EXECUTE (Postgres docs: "EXECUTE privilege is not required
--    when the trigger is fired"), so signup keeps working.
--
-- 2) Profiles RLS: collapse profiles_select + profiles_self_select +
--    profiles_partner_select into a single optimized policy with
--    (select auth.uid()) so the InitPlan is cached once per query and the
--    "multiple permissive policies" advisor warning clears. The combined
--    USING expression is logically identical to OR-ing the three originals
--    (self OR partner-via-group).

-- ─── 1. handle_new_user — revoke PUBLIC, re-grant service roles ────────────
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO postgres, service_role;

-- ─── 2. Profiles — single permissive SELECT policy, InitPlan-optimized ────
DROP POLICY IF EXISTS "profiles_select"         ON "Profiles";
DROP POLICY IF EXISTS "profiles_self_select"    ON "Profiles";
DROP POLICY IF EXISTS "profiles_partner_select" ON "Profiles";

CREATE POLICY "profiles_select" ON "Profiles" FOR SELECT USING (
  id = (select auth.uid()) OR id IN (
    SELECT member_a FROM "OikosGroups" WHERE member_b = (select auth.uid())
    UNION
    SELECT member_b FROM "OikosGroups" WHERE member_a = (select auth.uid())
  )
);
