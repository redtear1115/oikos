-- Phase 2 Slice 5 — IncomeTransactions parallel table.
-- Income records are isolated from balance / settlement / split. They simply
-- represent money flowing INTO the household; the system never debits anyone.
-- assetId can FK an Asset (typically type='insurance' for maturity/claim) but
-- is independent of the cashTransactions.assetId space.

CREATE TABLE IF NOT EXISTS "IncomeTransactions" (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id      uuid NOT NULL REFERENCES "OikosGroups"(id),
  recipient_id  uuid NOT NULL REFERENCES "Profiles"(id),
  amount        integer NOT NULL CHECK (amount > 0),
  category      text NOT NULL,                       -- IncomeCategoryId
  source        text,                                -- free text ("五月薪水")
  asset_id      uuid REFERENCES "Assets"(id),        -- nullable; typically insurance policy
  occurred_at   date NOT NULL,
  deleted_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "income_group_occurred_idx"
  ON "IncomeTransactions" (group_id, occurred_at DESC, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS "income_asset_idx"
  ON "IncomeTransactions" (asset_id) WHERE asset_id IS NOT NULL AND deleted_at IS NULL;

-- ─── RLS: group members can SELECT their group's incomes ───────────────────
ALTER TABLE "IncomeTransactions" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "incomes_group_member_select" ON "IncomeTransactions";
CREATE POLICY "incomes_group_member_select" ON "IncomeTransactions" FOR SELECT
  USING (
    group_id IN (
      SELECT id FROM "OikosGroups" WHERE member_a = auth.uid() OR member_b = auth.uid()
    )
  );

-- ─── Realtime publication ─────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'IncomeTransactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE "IncomeTransactions";
  END IF;
END $$;

-- ─── pg_cron weekly cleanup (extend existing job) ─────────────────────────
-- Reschedule the unified cleanup job to also purge income rows soft-deleted >1yr.
DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-soft-deleted');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule('cleanup-soft-deleted', '0 3 * * 0', $$
  DELETE FROM "CashTransactions"   WHERE deleted_at < NOW() - INTERVAL '1 year';
  DELETE FROM "Settlements"        WHERE deleted_at < NOW() - INTERVAL '1 year';
  DELETE FROM "FuelLogs"           WHERE deleted_at < NOW() - INTERVAL '1 year';
  DELETE FROM "IncomeTransactions" WHERE deleted_at < NOW() - INTERVAL '1 year';
$$);
