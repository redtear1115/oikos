-- v0.12.0 PR #1 — RecurringExpenseRules + PendingExpenseOccurrences (2026-05-08).
-- Mirrors drizzle/0016_recurring_income.sql for the expense side. Cron job
-- generates pending occurrences daily; user confirms each via Dashboard card,
-- which atomically INSERTs CashTransaction + UPDATEs pending.resolved_tx_id.
--
-- Key diffs vs the income migration:
--   * Expense rules carry paid_by + split_type + description (NOT NULL) instead
--     of recipient_id + source.
--   * Pending rows snapshot proposed_description / proposed_paid_by /
--     proposed_split_type so rule edits don't retroactively shift already-
--     generated pendings.
--   * Cron join checks Assets.deleted_at — soft-deleted asset auto-pauses the
--     rule (sets paused_at) so a dangling FK can never produce a pending.
--   * compute_next_occurrence helper from 0016 is reused as-is.

-- ─── RecurringExpenseRules ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "RecurringExpenseRules" (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id            uuid NOT NULL REFERENCES "OikosGroups"(id),
  paid_by             uuid NOT NULL REFERENCES "Profiles"(id),
  amount              integer NOT NULL CHECK (amount > 0),
  split_type          split_type NOT NULL,
  description         text NOT NULL,
  category            text NOT NULL,
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

CREATE INDEX IF NOT EXISTS "recurring_expense_due_idx"
  ON "RecurringExpenseRules" (next_occurrence_at)
  WHERE deleted_at IS NULL AND paused_at IS NULL;

CREATE INDEX IF NOT EXISTS "recurring_expense_group_idx"
  ON "RecurringExpenseRules" (group_id) WHERE deleted_at IS NULL;

-- ─── PendingExpenseOccurrences ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "PendingExpenseOccurrences" (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id              uuid NOT NULL REFERENCES "OikosGroups"(id),
  rule_id               uuid NOT NULL REFERENCES "RecurringExpenseRules"(id) ON DELETE CASCADE,
  period_start          date NOT NULL,
  proposed_amount       integer NOT NULL CHECK (proposed_amount > 0),
  proposed_date         date NOT NULL,
  proposed_description  text NOT NULL,
  proposed_paid_by      uuid NOT NULL REFERENCES "Profiles"(id),
  proposed_split_type   split_type NOT NULL,
  skipped_at            timestamptz,
  resolved_tx_id        uuid REFERENCES "CashTransactions"(id),
  created_at            timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT pending_expense_unique_per_period UNIQUE (rule_id, period_start)
);

CREATE INDEX IF NOT EXISTS "pending_expense_active_idx"
  ON "PendingExpenseOccurrences" (group_id, proposed_date DESC)
  WHERE skipped_at IS NULL AND resolved_tx_id IS NULL;

-- ─── RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE "RecurringExpenseRules" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "expense_rules_group_member_select" ON "RecurringExpenseRules";
CREATE POLICY "expense_rules_group_member_select" ON "RecurringExpenseRules" FOR SELECT
  USING (group_id IN (
    SELECT id FROM "OikosGroups" WHERE member_a = auth.uid() OR member_b = auth.uid()
  ));

ALTER TABLE "PendingExpenseOccurrences" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "expense_pendings_group_member_select" ON "PendingExpenseOccurrences";
CREATE POLICY "expense_pendings_group_member_select" ON "PendingExpenseOccurrences" FOR SELECT
  USING (group_id IN (
    SELECT id FROM "OikosGroups" WHERE member_a = auth.uid() OR member_b = auth.uid()
  ));

-- ─── Realtime publication ─────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
      AND tablename = 'RecurringExpenseRules'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE "RecurringExpenseRules";
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
      AND tablename = 'PendingExpenseOccurrences'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE "PendingExpenseOccurrences";
  END IF;
END $$;

-- ─── generate-pending-expense cron job ────────────────────────────────────
DO $$
BEGIN
  PERFORM cron.unschedule('generate-pending-expense');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 16:00 UTC = 台北 00:00, mirroring generate-pending-income.
SELECT cron.schedule('generate-pending-expense', '0 16 * * *', $$
  INSERT INTO "PendingExpenseOccurrences"
    (group_id, rule_id, period_start, proposed_amount, proposed_date,
     proposed_description, proposed_paid_by, proposed_split_type)
  SELECT r.group_id, r.id, r.next_occurrence_at, r.amount, r.next_occurrence_at,
         r.description, r.paid_by, r.split_type
  FROM "RecurringExpenseRules" r
  LEFT JOIN "Assets" a ON a.id = r.asset_id
  WHERE r.deleted_at IS NULL
    AND r.paused_at IS NULL
    AND r.next_occurrence_at <= CURRENT_DATE
    AND (r.ends_on IS NULL OR r.next_occurrence_at <= r.ends_on)
    AND (r.asset_id IS NULL OR a.deleted_at IS NULL)
  ON CONFLICT (rule_id, period_start) DO NOTHING;

  UPDATE "RecurringExpenseRules"
  SET next_occurrence_at = compute_next_occurrence(next_occurrence_at, interval_months, day_of_month)
  WHERE deleted_at IS NULL
    AND paused_at IS NULL
    AND next_occurrence_at <= CURRENT_DATE
    AND (ends_on IS NULL OR next_occurrence_at <= ends_on);

  -- Asset soft-deleted → auto-pause the rule. User can edit the rule (clear or
  -- re-link asset) and resume from the settings page; we keep asset_id as an
  -- audit trail rather than nulling it out.
  UPDATE "RecurringExpenseRules" r
  SET paused_at = NOW()
  FROM "Assets" a
  WHERE r.asset_id = a.id
    AND r.deleted_at IS NULL
    AND r.paused_at IS NULL
    AND a.deleted_at IS NOT NULL;
$$);

-- ─── extend cleanup-soft-deleted with expense purge ───────────────────────
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
  DELETE FROM "RecurringExpenseRules"     WHERE deleted_at < NOW() - INTERVAL '1 year';
  DELETE FROM "PendingExpenseOccurrences" WHERE skipped_at < NOW() - INTERVAL '90 days';
$$);
