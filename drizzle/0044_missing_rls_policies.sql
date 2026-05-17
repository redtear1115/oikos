-- #504 — Backfill missing RLS policies on 5 tables flagged by the Supabase
-- security advisor:
--   * CurrencyRates  (created in 0038; group_id directly)
--   * Trips          (created in 0038; group_id directly)
--   * TripExpenses   (created in 0039; group via trip_id → Trips.group_id)
--   * PetDetails     (created in 0010; group via asset_id → Assets.group_id)
--   * PlantDetails   (created in 0011; group via asset_id → Assets.group_id)
--
-- These tables were created without RLS enabled, so the anon role (Supabase
-- JS client + Realtime) couldn't read them — Realtime checks the same RLS as
-- a regular SELECT, so subscribers were silently missing INSERT/UPDATE events.
-- Server-side reads/writes go through Drizzle (postgres role) which bypasses
-- RLS, so server actions were unaffected.
--
-- Pattern mirrors 0023 / 0024 / 0030: ENABLE RLS + a single SELECT policy
-- gated on group membership, with auth.uid() wrapped in (select auth.uid())
-- for the InitPlan optimization. No INSERT/UPDATE/DELETE policies needed —
-- all writes flow through server actions (postgres role).
--
-- Idempotent: ENABLE ROW LEVEL SECURITY is a no-op when already enabled;
-- DROP POLICY IF EXISTS + CREATE POLICY safely replaces any existing policy
-- with the same name. Adding allow-policies can only widen access (Postgres
-- OR-combines RLS policies), never restrict — safe on both dev and prod.

-- ─── CurrencyRates ─────────────────────────────────────────────────────────
ALTER TABLE public."CurrencyRates" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "currency_rates_member_select" ON public."CurrencyRates";
CREATE POLICY "currency_rates_member_select" ON public."CurrencyRates" FOR SELECT
  USING (
    group_id IN (
      SELECT id FROM public."OikosGroups"
      WHERE member_a = (select auth.uid()) OR member_b = (select auth.uid())
    )
  );

-- ─── Trips ─────────────────────────────────────────────────────────────────
ALTER TABLE public."Trips" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trips_member_select" ON public."Trips";
CREATE POLICY "trips_member_select" ON public."Trips" FOR SELECT
  USING (
    group_id IN (
      SELECT id FROM public."OikosGroups"
      WHERE member_a = (select auth.uid()) OR member_b = (select auth.uid())
    )
  );

-- ─── TripExpenses (group via trip_id → Trips) ──────────────────────────────
ALTER TABLE public."TripExpenses" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trip_expenses_member_select" ON public."TripExpenses";
CREATE POLICY "trip_expenses_member_select" ON public."TripExpenses" FOR SELECT
  USING (
    trip_id IN (
      SELECT id FROM public."Trips" WHERE group_id IN (
        SELECT id FROM public."OikosGroups"
        WHERE member_a = (select auth.uid()) OR member_b = (select auth.uid())
      )
    )
  );

-- ─── PetDetails (group via asset_id → Assets), mirrors 0006 pattern ────────
ALTER TABLE public."PetDetails" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pet_details_member_select" ON public."PetDetails";
CREATE POLICY "pet_details_member_select" ON public."PetDetails" FOR SELECT
  USING (
    asset_id IN (
      SELECT id FROM public."Assets" WHERE group_id IN (
        SELECT id FROM public."OikosGroups"
        WHERE member_a = (select auth.uid()) OR member_b = (select auth.uid())
      )
    )
  );

-- ─── PlantDetails (group via asset_id → Assets), mirrors 0006 pattern ──────
ALTER TABLE public."PlantDetails" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "plant_details_member_select" ON public."PlantDetails";
CREATE POLICY "plant_details_member_select" ON public."PlantDetails" FOR SELECT
  USING (
    asset_id IN (
      SELECT id FROM public."Assets" WHERE group_id IN (
        SELECT id FROM public."OikosGroups"
        WHERE member_a = (select auth.uid()) OR member_b = (select auth.uid())
      )
    )
  );
