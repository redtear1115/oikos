-- #1243 — generate-pending-expense never snapshotted the weighted split ratio.
--
-- 0027 added "RecurringExpenseRules".split_ratio_a and
-- "PendingExpenseOccurrences".proposed_split_ratio_a, but the cron job body
-- lives inside cron.schedule('generate-pending-expense', ...) from 0021 and was
-- never re-scheduled. Its INSERT column list still ends at
-- proposed_split_type, so every pending row generated for a `weighted` rule
-- carried proposed_split_ratio_a = NULL.
--
-- How it failed: nothing errored. The card appeared, confirm succeeded, and the
-- resulting CashTransaction landed with split_type = 'weighted' and
-- split_ratio_a NULL — a combination no consumer agrees on, and none of them
-- complains:
--   * lib/balance.ts:26 `splitRatioA ?? 50`        → reads it as an even split
--   * CompactRow.tsx:74 requires splitRatioA != null → shows share 0, i.e. the
--     feed renders it as if the payer carried all of it
--   * lib/db/queries/balance.ts:77 (recalcGroupBalance) → the CASE yields NULL,
--     SUM skips the row, so the expense contributes nothing to the balance
-- So a 30/70 rule produced a record that reads three different ways and is
-- worth 0 in the number the couple actually settles on.
--
-- Two parts below:
--   1. Re-schedule the cron with proposed_split_ratio_a <- r.split_ratio_a.
--   2. One-off backfill of the pendings that are still un-actioned.
--
-- NOT touched here: pendings that were already confirmed (resolved_tx_id IS NOT
-- NULL) and the CashTransactions they produced. Rewriting a recorded
-- transaction would move the couple's balance behind their back, and this
-- codebase has no in-place UPDATE path for records by design (CLAUDE.md,
-- 「編輯模式」= soft delete + insert). Those rows stay as they settled; the user
-- can re-record them by hand if they care.

-- ─── 1. Re-schedule generate-pending-expense ───────────────────────────────
-- Body is 0021's verbatim, with the ratio added to the INSERT/SELECT pair.
-- cron.schedule() with an existing jobname replaces the command in place, so no
-- unschedule is needed; the schedule string stays '0 16 * * *' (= 台北 00:00).
--
-- The CURRENT_DATE comparisons below are copied unchanged on purpose. They have
-- a separate suspected off-by-one-day problem (#1243 second half: at 16:00 UTC
-- a UTC-session CURRENT_DATE is still the previous Taipei day), which is a
-- different failure with a different blast radius — fixing it here would make
-- this migration impossible to verify one behaviour at a time.
SELECT cron.schedule('generate-pending-expense', '0 16 * * *', $$
  INSERT INTO "PendingExpenseOccurrences"
    (group_id, rule_id, period_start, proposed_amount, proposed_date,
     proposed_description, proposed_paid_by, proposed_split_type,
     proposed_split_ratio_a)
  SELECT r.group_id, r.id, r.next_occurrence_at, r.amount, r.next_occurrence_at,
         r.description, r.paid_by, r.split_type, r.split_ratio_a
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

-- ─── 2. Backfill un-actioned pendings ──────────────────────────────────────
-- Only rows the user has not acted on yet: not skipped, not resolved. Those are
-- still cards on the dashboard, so writing the ratio now is the same as the
-- cron having written it at generation time.
--
-- The ratio comes from the rule as it stands today, which is not necessarily
-- the ratio at generation time (the rule may have been edited since — and
-- #1240's editEffectHint promises existing cards keep their split). That
-- history is not recoverable: nothing ever recorded it. Today's rule ratio is
-- the closest available truth and is strictly better than NULL, which renders
-- as 50/50.
--
-- Rows left alone: rule.split_ratio_a itself NULL (a 'weighted' rule with no
-- ratio — nothing to copy; behaviour is unchanged, still 50/50), and any
-- pending whose snapshot split_type is not 'weighted' (the ratio is
-- meaningless there).
UPDATE "PendingExpenseOccurrences" p
SET proposed_split_ratio_a = r.split_ratio_a
FROM "RecurringExpenseRules" r
WHERE r.id = p.rule_id
  AND p.proposed_split_type = 'weighted'
  AND p.proposed_split_ratio_a IS NULL
  AND r.split_ratio_a IS NOT NULL
  AND p.skipped_at IS NULL
  AND p.resolved_tx_id IS NULL;
