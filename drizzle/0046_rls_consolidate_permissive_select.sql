-- #506 — Consolidate multiple permissive SELECT policies flagged by the
-- Supabase performance advisor.
--
-- Three classes of duplication:
--
-- 1. Legacy `_select` policies from db/rls/policies.sql (initial seed) coexist
--    with `_member_select` variants added in 0005 / 0006 for Realtime support.
--    Postgres OR-combines PERMISSIVE policies, so the legacy `_select` (which
--    adds `deleted_at IS NULL`) is fully dominated by the broader variant.
--    Application queries already filter `deleted_at` in app code; same
--    precedent as 0022's `assets_select` drop.
--
-- 2. `invoice_creds_select` (any group member) silently broadens
--    `invoice_credentials_owner_select` (owner-only, added in 0018). 0018
--    spec explicitly says: "partner cannot see your barcode / verification
--    code". Dropping the legacy policy restores the intended security
--    boundary. Cloud invoice feature never shipped (blocked on MoF app_id),
--    no client-side reads exist — risk-free behavior change.
--
-- 3. `profiles_self_select` + `profiles_partner_select` are two semantically
--    distinct policies; OR-combining them in a single policy is behaviorally
--    identical and clears the advisor warning. (0022 briefly shipped a
--    combined `profiles_select`; 0023 reverted to keep names aligned with
--    prod. This migration re-collapses them under a new name.)
--
-- Bonus: also drops `fuel_logs_select` (same A ⊂ B pattern, not in the
-- original issue list but caught in the audit).
--
-- Dev note: on dev, items 1+2 are already absent (legacy seed not present);
-- DROP IF EXISTS makes those operations no-ops. The publication cleanup and
-- Profiles consolidation are the only visible changes on dev. On prod, all
-- three classes apply.
--
-- Idempotent: DROP IF EXISTS everywhere; DO block guards publication.

-- ─── 1. Drop A ⊂ B legacy `_select` variants ──────────────────────────────
DROP POLICY IF EXISTS "transactions_select"      ON "CashTransactions";
DROP POLICY IF EXISTS "settlements_select"       ON "Settlements";
DROP POLICY IF EXISTS "balance_select"           ON "GroupBalance";
DROP POLICY IF EXISTS "car_details_select"       ON "CarDetails";
DROP POLICY IF EXISTS "house_details_select"     ON "HouseDetails";
DROP POLICY IF EXISTS "child_details_select"     ON "ChildDetails";
DROP POLICY IF EXISTS "insurance_details_select" ON "InsuranceDetails";
DROP POLICY IF EXISTS "fuel_logs_select"         ON "FuelLogs";

-- ─── 2. InvoiceCredentials — security tightening ───────────────────────────
DROP POLICY IF EXISTS "invoice_creds_select" ON "InvoiceCredentials";

-- ─── 3. Remove unused invoice tables from realtime publication ─────────────
-- All three were added in 0018 in anticipation of future client subscribers
-- that never materialized. RealtimeProvider doesn't listen; zero
-- `supabase.from('Invoice...')` calls in the codebase. With owner-only RLS
-- (after step 2) the publication entry would only deliver each row to its
-- owner anyway, which is also unused.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication_tables
             WHERE pubname='supabase_realtime' AND schemaname='public'
               AND tablename='InvoiceCredentials') THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE "InvoiceCredentials";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_publication_tables
             WHERE pubname='supabase_realtime' AND schemaname='public'
               AND tablename='InvoiceImportRuns') THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE "InvoiceImportRuns";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_publication_tables
             WHERE pubname='supabase_realtime' AND schemaname='public'
               AND tablename='InvoiceImportSnapshots') THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE "InvoiceImportSnapshots";
  END IF;
END $$;

-- ─── 4. Profiles — collapse self + partner into a single OR policy ─────────
-- InitPlan-optimized form retained from 0023.
DROP POLICY IF EXISTS "profiles_self_select"    ON "Profiles";
DROP POLICY IF EXISTS "profiles_partner_select" ON "Profiles";

CREATE POLICY "profiles_self_or_partner_select" ON "Profiles" FOR SELECT
  USING (
    id = (select auth.uid())
    OR id IN (
      SELECT member_a FROM "OikosGroups" WHERE member_b = (select auth.uid())
      UNION
      SELECT member_b FROM "OikosGroups" WHERE member_a = (select auth.uid())
    )
  );
