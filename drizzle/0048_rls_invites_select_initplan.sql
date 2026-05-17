-- #517 — Wrap auth.uid() in (select auth.uid()) on GroupInvites.invites_select.
--
-- 0045 swept all RLS policies for the auth_rls_initplan advisor warning but
-- missed `invites_select` (defined in db/rls/policies.sql:111, never re-touched
-- by any drizzle migration). Postgres re-evaluates the bare auth.uid() for
-- every row; wrapping it in a sub-SELECT lets the planner hoist it into a
-- single InitPlan execution per query.
--
-- Behavior identical (USING predicate unchanged modulo the wrapper).

DROP POLICY IF EXISTS "invites_select" ON "GroupInvites";
CREATE POLICY "invites_select" ON "GroupInvites" FOR SELECT
  USING ( invited_by = (select auth.uid()) );
