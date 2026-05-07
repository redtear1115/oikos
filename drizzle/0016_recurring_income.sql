-- Phase 3 Slice 1 — RecurringIncomeRules + PendingIncomeOccurrences.
-- Preview→commit model: cron produces pending occurrences daily; user confirms
-- each one via Dashboard card → atomic INSERT IncomeTx + UPDATE pending.

-- ─── compute_next_occurrence helper ───────────────────────────────────────
-- Returns the anchor date in `curr_date + interval_months` months at day_of_month,
-- clamped to the last day of that month if day_of_month exceeds the month length.
CREATE OR REPLACE FUNCTION compute_next_occurrence(
  curr_date date, interval_months integer, day_of_month integer
) RETURNS date AS $$
DECLARE
  target_month date;
  last_day integer;
BEGIN
  target_month := date_trunc('month', curr_date + (interval_months || ' months')::interval)::date;
  last_day := EXTRACT(day FROM (target_month + interval '1 month' - interval '1 day'))::integer;
  RETURN target_month + (LEAST(day_of_month, last_day) - 1);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ─── RecurringIncomeRules ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "RecurringIncomeRules" (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id            uuid NOT NULL REFERENCES "OikosGroups"(id),
  recipient_id        uuid NOT NULL REFERENCES "Profiles"(id),
  amount              integer NOT NULL CHECK (amount > 0),
  category            text NOT NULL,
  source              text,
  asset_id            uuid REFERENCES "Assets"(id),
  interval_months     integer NOT NULL DEFAULT 1 CHECK (interval_months > 0),
  day_of_month        integer NOT NULL CHECK (day_of_month BETWEEN 1 AND 31),
  starts_on           date NOT NULL,
  ends_on             date,
  next_occurrence_at  date NOT NULL,
  paused_at           timestamptz,
  deleted_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "recurring_income_due_idx"
  ON "RecurringIncomeRules" (next_occurrence_at)
  WHERE deleted_at IS NULL AND paused_at IS NULL;

CREATE INDEX IF NOT EXISTS "recurring_income_group_idx"
  ON "RecurringIncomeRules" (group_id) WHERE deleted_at IS NULL;

-- ─── PendingIncomeOccurrences ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "PendingIncomeOccurrences" (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id          uuid NOT NULL REFERENCES "OikosGroups"(id),
  rule_id           uuid NOT NULL REFERENCES "RecurringIncomeRules"(id) ON DELETE CASCADE,
  period_start      date NOT NULL,
  proposed_amount   integer NOT NULL CHECK (proposed_amount > 0),
  proposed_date     date NOT NULL,
  skipped_at        timestamptz,
  resolved_tx_id    uuid REFERENCES "IncomeTransactions"(id),
  created_at        timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT pending_unique_per_period UNIQUE (rule_id, period_start)
);

CREATE INDEX IF NOT EXISTS "pending_income_active_idx"
  ON "PendingIncomeOccurrences" (group_id, proposed_date DESC)
  WHERE skipped_at IS NULL AND resolved_tx_id IS NULL;

-- ─── RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE "RecurringIncomeRules" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rules_group_member_select" ON "RecurringIncomeRules";
CREATE POLICY "rules_group_member_select" ON "RecurringIncomeRules" FOR SELECT
  USING (group_id IN (
    SELECT id FROM "OikosGroups" WHERE member_a = auth.uid() OR member_b = auth.uid()
  ));

ALTER TABLE "PendingIncomeOccurrences" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pendings_group_member_select" ON "PendingIncomeOccurrences";
CREATE POLICY "pendings_group_member_select" ON "PendingIncomeOccurrences" FOR SELECT
  USING (group_id IN (
    SELECT id FROM "OikosGroups" WHERE member_a = auth.uid() OR member_b = auth.uid()
  ));

-- ─── Realtime publication ─────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
      AND tablename = 'RecurringIncomeRules'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE "RecurringIncomeRules";
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
      AND tablename = 'PendingIncomeOccurrences'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE "PendingIncomeOccurrences";
  END IF;
END $$;

-- ─── generate-pending-income cron job ─────────────────────────────────────
DO $$
BEGIN
  PERFORM cron.unschedule('generate-pending-income');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule('generate-pending-income', '0 16 * * *', $$
  INSERT INTO "PendingIncomeOccurrences"
    (group_id, rule_id, period_start, proposed_amount, proposed_date)
  SELECT r.group_id, r.id, r.next_occurrence_at, r.amount, r.next_occurrence_at
  FROM "RecurringIncomeRules" r
  WHERE r.deleted_at IS NULL
    AND r.paused_at IS NULL
    AND r.next_occurrence_at <= CURRENT_DATE
    AND (r.ends_on IS NULL OR r.next_occurrence_at <= r.ends_on)
  ON CONFLICT (rule_id, period_start) DO NOTHING;

  UPDATE "RecurringIncomeRules"
  SET next_occurrence_at = compute_next_occurrence(next_occurrence_at, interval_months, day_of_month)
  WHERE deleted_at IS NULL
    AND paused_at IS NULL
    AND next_occurrence_at <= CURRENT_DATE
    AND (ends_on IS NULL OR next_occurrence_at <= ends_on);
$$);

-- ─── extend cleanup-soft-deleted with pending purge ───────────────────────
DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-soft-deleted');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule('cleanup-soft-deleted', '0 3 * * 0', $$
  DELETE FROM "CashTransactions"          WHERE deleted_at < NOW() - INTERVAL '1 year';
  DELETE FROM "Settlements"               WHERE deleted_at < NOW() - INTERVAL '1 year';
  DELETE FROM "FuelLogs"                  WHERE deleted_at < NOW() - INTERVAL '1 year';
  DELETE FROM "IncomeTransactions"        WHERE deleted_at < NOW() - INTERVAL '1 year';
  DELETE FROM "RecurringIncomeRules"      WHERE deleted_at < NOW() - INTERVAL '1 year';
  DELETE FROM "PendingIncomeOccurrences"  WHERE skipped_at < NOW() - INTERVAL '90 days';
$$);
