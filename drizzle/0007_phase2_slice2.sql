-- Phase 2 Slice 2: FuelLog dual-write + 購車雙寫 + NewCarForm 擴充
--
-- DDL: carDetails 加 primary_user_id + fuel_type; fuelLogs 重塑（liters numeric,
-- drop price_per_liter, add station）; cashTransactions 加 fuel_log_id FK.
-- RLS: SELECT policy for FuelLogs (透過 Assets join 檢查 OikosGroups membership).
-- Realtime: ALTER PUBLICATION ADD TABLE FuelLogs.
-- pg_cron: 加 FuelLogs 進 weekly cleanup（沿用 0001 既有 cleanup-soft-deleted job）.
--
-- 全部 idempotent；dev + prod 都跑（per memory project_supabase_envs.md）.
-- friend-test prod 還沒 fuelLogs 資料，所以 ALTER COLUMN liters TYPE numeric 安全.

-- ─── 0. Ensure 'electric' in fuel_type enum ─────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'electric'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'fuel_type')
  ) THEN
    ALTER TYPE "public"."fuel_type" ADD VALUE 'electric';
  END IF;
END $$;

-- ─── 1. CarDetails: add primary_user_id + fuel_type ─────────────────────────
-- Existing Slice 1 cars: primary_user_id stays NULL (per spec Q5 X);
-- fuel_type backfilled to '95' via DEFAULT (per spec Q15 M1).
ALTER TABLE "CarDetails"
  ADD COLUMN IF NOT EXISTS "primary_user_id" uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'CarDetails'
      AND constraint_name = 'CarDetails_primary_user_id_Profiles_id_fk'
  ) THEN
    ALTER TABLE "CarDetails"
      ADD CONSTRAINT "CarDetails_primary_user_id_Profiles_id_fk"
      FOREIGN KEY ("primary_user_id") REFERENCES "public"."Profiles"("id")
      ON DELETE no action ON UPDATE no action;
  END IF;
END $$;

ALTER TABLE "CarDetails"
  ADD COLUMN IF NOT EXISTS "fuel_type" "public"."fuel_type" NOT NULL DEFAULT '95';

-- ─── 2. FuelLogs: reshape ───────────────────────────────────────────────────
-- friend-test prod has no fuel_logs rows yet (Phase 0 created the table but it's
-- never been used), so the integer→numeric cast is safe and won't lose data.
ALTER TABLE "FuelLogs"
  ALTER COLUMN "liters" SET DATA TYPE numeric(6, 2) USING "liters"::numeric;

ALTER TABLE "FuelLogs"
  DROP COLUMN IF EXISTS "price_per_liter";

ALTER TABLE "FuelLogs"
  ADD COLUMN IF NOT EXISTS "station" text;

-- ─── 3. CashTransactions: add fuel_log_id FK + index ────────────────────────
ALTER TABLE "CashTransactions"
  ADD COLUMN IF NOT EXISTS "fuel_log_id" uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'CashTransactions'
      AND constraint_name = 'CashTransactions_fuel_log_id_FuelLogs_id_fk'
  ) THEN
    ALTER TABLE "CashTransactions"
      ADD CONSTRAINT "CashTransactions_fuel_log_id_FuelLogs_id_fk"
      FOREIGN KEY ("fuel_log_id") REFERENCES "public"."FuelLogs"("id")
      ON DELETE no action ON UPDATE no action;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_cash_transactions_fuel_log_id"
  ON "CashTransactions"("fuel_log_id")
  WHERE "fuel_log_id" IS NOT NULL;

-- ─── 4. RLS: FuelLogs ───────────────────────────────────────────────────────
-- Mirror 0006 pattern (asset_id → Assets → OikosGroups membership). Server
-- writes go through service role (bypasses RLS); only the SELECT policy is
-- needed for the anon role + Realtime subscriptions.
DROP POLICY IF EXISTS "fuel_logs_member_select" ON "FuelLogs";
CREATE POLICY "fuel_logs_member_select" ON "FuelLogs" FOR SELECT
  USING (
    asset_id IN (
      SELECT id FROM "Assets" WHERE group_id IN (
        SELECT id FROM "OikosGroups"
        WHERE member_a = auth.uid() OR member_b = auth.uid()
      )
    )
  );

-- ─── 5. Realtime publication: FuelLogs ──────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'FuelLogs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE "FuelLogs";
  END IF;
END $$;

-- ─── 6. pg_cron: extend weekly cleanup to include FuelLogs ──────────────────
-- Re-schedule the existing 'cleanup-soft-deleted' job (from 0001) with the
-- augmented body that also DELETEs old soft-deleted FuelLogs. cron.schedule
-- with the same name replaces the prior schedule; the unschedule first makes
-- it idempotent on dev/prod where the prior schedule already exists.
DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-soft-deleted');
EXCEPTION WHEN OTHERS THEN
  -- Job didn't exist; ignore.
  NULL;
END $$;

SELECT cron.schedule('cleanup-soft-deleted', '0 3 * * 0', $$
  DELETE FROM "CashTransactions" WHERE deleted_at < NOW() - INTERVAL '1 year';
  DELETE FROM "Settlements" WHERE deleted_at < NOW() - INTERVAL '1 year';
  DELETE FROM "FuelLogs" WHERE deleted_at < NOW() - INTERVAL '1 year';
$$);
