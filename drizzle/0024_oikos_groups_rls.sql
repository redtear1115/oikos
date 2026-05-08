-- OikosGroups RLS cleanup. Mirrors the Profiles + Assets work in 0023.
--
-- Prod (and likely dev) has two permissive SELECT policies on OikosGroups:
--   * groups_select        — created in db/rls/policies.sql
--   * groups_member_select — created in 0005_rls_policies_phase1.sql
-- Both check the same "auth.uid() is member_a or member_b" condition, so
-- one is redundant. Drop groups_select and InitPlan-optimize the survivor
-- by wrapping auth.uid() in (select auth.uid()).

DROP POLICY IF EXISTS "groups_select" ON "OikosGroups";

DROP POLICY IF EXISTS "groups_member_select" ON "OikosGroups";
CREATE POLICY "groups_member_select" ON "OikosGroups" FOR SELECT
  USING (
    member_a = (select auth.uid()) OR member_b = (select auth.uid())
  );
