-- Phase 2 Slice 1: Assets + CarDetails RLS + Realtime publication
--
-- RLS SELECT policies for Assets (and per-type Detail tables) so the anon role
-- can read them via the Supabase JS client + Realtime. Mirrors the pattern from
-- 0005_rls_policies_phase1.sql (DROP IF EXISTS + CREATE, OR-combines with any
-- existing policies — never restricts).
--
-- Realtime publication for Assets so postgres_changes events reach the
-- RealtimeProvider channel. Mirrors 0004 (IF NOT EXISTS guard for prod safety).
--
-- Per-Detail policies are added now even though only CarDetails is consumed in
-- slice 1 — the policies are cheap and let later slices skip a migration.

-- ─── RLS: Assets ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "assets_group_member_select" ON "Assets";
CREATE POLICY "assets_group_member_select" ON "Assets" FOR SELECT
  USING (
    group_id IN (
      SELECT id FROM "OikosGroups" WHERE member_a = auth.uid() OR member_b = auth.uid()
    )
  );

-- ─── RLS: CarDetails (and other per-type detail tables) ─────────────────────
-- All detail tables share the same parent-asset ownership check.

DROP POLICY IF EXISTS "car_details_member_select" ON "CarDetails";
CREATE POLICY "car_details_member_select" ON "CarDetails" FOR SELECT
  USING (
    asset_id IN (
      SELECT id FROM "Assets" WHERE group_id IN (
        SELECT id FROM "OikosGroups" WHERE member_a = auth.uid() OR member_b = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "house_details_member_select" ON "HouseDetails";
CREATE POLICY "house_details_member_select" ON "HouseDetails" FOR SELECT
  USING (
    asset_id IN (
      SELECT id FROM "Assets" WHERE group_id IN (
        SELECT id FROM "OikosGroups" WHERE member_a = auth.uid() OR member_b = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "child_details_member_select" ON "ChildDetails";
CREATE POLICY "child_details_member_select" ON "ChildDetails" FOR SELECT
  USING (
    asset_id IN (
      SELECT id FROM "Assets" WHERE group_id IN (
        SELECT id FROM "OikosGroups" WHERE member_a = auth.uid() OR member_b = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "insurance_details_member_select" ON "InsuranceDetails";
CREATE POLICY "insurance_details_member_select" ON "InsuranceDetails" FOR SELECT
  USING (
    asset_id IN (
      SELECT id FROM "Assets" WHERE group_id IN (
        SELECT id FROM "OikosGroups" WHERE member_a = auth.uid() OR member_b = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "fuel_logs_member_select" ON "FuelLogs";
CREATE POLICY "fuel_logs_member_select" ON "FuelLogs" FOR SELECT
  USING (
    asset_id IN (
      SELECT id FROM "Assets" WHERE group_id IN (
        SELECT id FROM "OikosGroups" WHERE member_a = auth.uid() OR member_b = auth.uid()
      )
    )
  );

-- ─── Realtime publication: Assets ───────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'Assets'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE "Assets";
  END IF;
END $$;
