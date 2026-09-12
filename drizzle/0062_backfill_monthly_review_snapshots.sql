-- #1049 — Backfill the empty MonthlyReviewSnapshots rows created by the
-- broken cron (see 0061 for the underlying month-calc + ON CONFLICT fix).
--
-- Targets every row where top_category AND largest_expense_amount are both
-- NULL — the same "never got real content" gate used by the fixed
-- ON CONFLICT DO UPDATE in 0061, so this backfill and the cron's own
-- self-healing behave identically.
--
-- Excludes the current, still-in-progress Taipei month: a row for the
-- current month is (by construction, since it can only exist while the
-- month is incomplete — see 0061) not a completed month yet, and computing
-- it now would freeze a partial result. It will be correctly computed by
-- the fixed cron once the month actually ends. Every other empty row is a
-- completed month and safe to compute for real.
--
-- Idempotent: reruns are a no-op for any row that already got real content
-- (from a previous run of this migration, or from the fixed cron), because
-- the gate in compute_monthly_review_snapshot's ON CONFLICT only overwrites
-- rows still NULL on both fields. Safe to run any number of times, on dev
-- or prod, regardless of how many empty rows exist.
DO $$
DECLARE
  r RECORD;
  v_current_year  integer;
  v_current_month integer;
BEGIN
  SELECT EXTRACT(YEAR  FROM NOW() AT TIME ZONE 'Asia/Taipei')::integer,
         EXTRACT(MONTH FROM NOW() AT TIME ZONE 'Asia/Taipei')::integer
    INTO v_current_year, v_current_month;

  FOR r IN
    SELECT group_id, year, month
      FROM "MonthlyReviewSnapshots"
     WHERE top_category IS NULL
       AND largest_expense_amount IS NULL
       AND (year, month) < (v_current_year, v_current_month)
  LOOP
    PERFORM compute_monthly_review_snapshot(r.group_id, r.year, r.month);
  END LOOP;
END $$;
