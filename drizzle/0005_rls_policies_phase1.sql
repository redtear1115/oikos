-- RLS SELECT policies for Phase 1 tables. Required for Supabase Realtime to
-- deliver postgres_changes events to authenticated clients (anon role with
-- auth.uid()): realtime checks the same RLS as a regular SELECT, so a
-- subscriber must be able to SELECT the row to receive its INSERT/UPDATE event.
--
-- These policies only affect the anon role (Supabase JS client + Realtime).
-- Server-side reads/writes go through Drizzle (postgres role) which bypasses RLS.
--
-- Idempotent: DROP IF EXISTS + CREATE. On prod (where some policies may already
-- exist with different names) this only ADDS more allow-policies — Postgres
-- OR-combines RLS policies, so additional policies can only widen access,
-- never restrict. Safe on both dev and prod.

-- Profiles: viewer can read self + group partner
DROP POLICY IF EXISTS "profiles_self_select" ON "Profiles";
CREATE POLICY "profiles_self_select" ON "Profiles" FOR SELECT
  USING (id = auth.uid());

DROP POLICY IF EXISTS "profiles_partner_select" ON "Profiles";
CREATE POLICY "profiles_partner_select" ON "Profiles" FOR SELECT
  USING (
    id IN (
      SELECT member_a FROM "OikosGroups" WHERE member_b = auth.uid()
      UNION
      SELECT member_b FROM "OikosGroups" WHERE member_a = auth.uid()
    )
  );

-- OikosGroups: members can read their group
DROP POLICY IF EXISTS "groups_member_select" ON "OikosGroups";
CREATE POLICY "groups_member_select" ON "OikosGroups" FOR SELECT
  USING (member_a = auth.uid() OR member_b = auth.uid());

-- CashTransactions: group members can read their group's transactions
DROP POLICY IF EXISTS "txns_group_member_select" ON "CashTransactions";
CREATE POLICY "txns_group_member_select" ON "CashTransactions" FOR SELECT
  USING (
    group_id IN (
      SELECT id FROM "OikosGroups" WHERE member_a = auth.uid() OR member_b = auth.uid()
    )
  );

-- Settlements: group members can read their group's settlements
DROP POLICY IF EXISTS "settles_group_member_select" ON "Settlements";
CREATE POLICY "settles_group_member_select" ON "Settlements" FOR SELECT
  USING (
    group_id IN (
      SELECT id FROM "OikosGroups" WHERE member_a = auth.uid() OR member_b = auth.uid()
    )
  );

-- GroupBalance: group members can read their group's balance
DROP POLICY IF EXISTS "balance_group_member_select" ON "GroupBalance";
CREATE POLICY "balance_group_member_select" ON "GroupBalance" FOR SELECT
  USING (
    group_id IN (
      SELECT id FROM "OikosGroups" WHERE member_a = auth.uid() OR member_b = auth.uid()
    )
  );
