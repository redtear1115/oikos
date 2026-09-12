-- #1049 — Monthly review is permanently empty: cron computed the wrong
-- month, and ON CONFLICT DO NOTHING made the resulting empty rows
-- unrecoverable. This migration fixes both. See also 0062 for the backfill
-- of the empty rows already created by the broken cron.
--
-- Bug 1 — wrong month:
--   The old target-month calc was:
--     (NOW() AT TIME ZONE 'Asia/Taipei') - INTERVAL '1 day'
--   with a comment claiming "16:05 UTC on day 1 = 00:05 Asia/Taipei on day 1".
--   That's backwards — Asia/Taipei is UTC+8, so 16:05 UTC on day 1 is
--   already 00:05 Asia/Taipei on day *2*. Subtracting 1 day only walked
--   back to day 1, still inside the just-started month, not the completed
--   one. So every run computed the CURRENT (barely-begun) month instead of
--   the previous (completed) one, and got near-empty results.
--
--   Fixed calc:
--     date_trunc('month', NOW() AT TIME ZONE 'Asia/Taipei') - INTERVAL '1 day'
--   `date_trunc('month', ...)` always lands on day 1 00:00 of whatever
--   month "now" falls in (Taipei wall-clock), regardless of what
--   day/hour "now" actually is. Subtracting 1 day from day-1-00:00 always
--   lands on the last day of the PREVIOUS month, no matter when this runs.
--   That's what makes it independent of the trigger time — the old calc's
--   bug was fundamentally that it depended on being invoked on day 1 at a
--   specific hour; this calc is correct even invoked mid-month, at year
--   boundaries, or from a manual backfill. EXTRACT(YEAR/MONTH FROM ...)
--   then reads off the correct year/month, including the Dec→Jan carry at
--   year boundaries (Postgres EXTRACT handles that natively).
--
--   The cron schedule itself ('5 16 1 * *', i.e. day 1 16:05 UTC = day 2
--   00:05 Asia/Taipei) was already correct — it fires safely after the
--   previous month has fully ended in Taipei. Only the in-job month calc
--   and its comment were wrong; schedule unchanged here.
--
-- Bug 2 — ON CONFLICT DO NOTHING:
--   Once Bug 1 created an empty row for (group, year, month), it could
--   never be corrected — DO NOTHING means a later, correct recompute for
--   the same key is silently dropped. Changed to DO UPDATE, but gated so
--   it only overwrites rows that never got real content in the first
--   place: WHERE the existing row's top_category AND largest_expense_amount
--   are both NULL. Both fields are computed from independent queries (one
--   filtered to `half`-split rows, one over any split_type), so both being
--   NULL together means either (a) the row was never populated by a
--   correct run (the bug this ticket fixes), or (b) the month genuinely
--   had zero transactions — in which case recomputing still yields NULL
--   and changes nothing. Neither case overwrites a snapshot that already
--   froze real numbers, which preserves the "freeze on first correct
--   compute" guarantee for every row that got it right the first time.
CREATE OR REPLACE FUNCTION compute_monthly_review_snapshot(
  p_group_id  uuid,
  p_year      integer,
  p_month     integer
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_member_a               uuid;
  v_member_b               uuid;
  v_is_solo                boolean;
  v_month_start            timestamptz;
  v_next_month_start       timestamptz;
  v_top_category           text;
  v_top_category_total     integer;
  v_largest_amount         integer;
  v_largest_description    text;
  v_largest_category       text;
  v_largest_paid_by_name   text;
  v_recurring_events       jsonb;
  v_recurring_in_total     integer;
  v_recurring_ex_total     integer;
  v_asset_breakdown        jsonb;
BEGIN
  SELECT member_a, member_b INTO v_member_a, v_member_b
    FROM "OikosGroups" WHERE id = p_group_id;
  IF v_member_a IS NULL THEN RETURN; END IF;
  v_is_solo := v_member_b IS NULL;

  v_month_start      := make_timestamptz(p_year, p_month, 1, 0, 0, 0, 'Asia/Taipei');
  v_next_month_start := v_month_start + INTERVAL '1 month';

  -- card 1: top category. Dyad → only `half` rows (joint spend); solo → all.
  SELECT category, SUM(amount)::integer
    INTO v_top_category, v_top_category_total
    FROM "CashTransactions"
    WHERE group_id = p_group_id
      AND deleted_at IS NULL
      AND transacted_at >= v_month_start
      AND transacted_at <  v_next_month_start
      AND (v_is_solo OR split_type = 'half')
    GROUP BY category
    ORDER BY SUM(amount) DESC
    LIMIT 1;

  -- card 2: largest single expense (any split_type). Snapshot the payer's
  -- display name so a future rename/leave doesn't dangle.
  SELECT t.amount,
         t.description,
         t.category,
         p.display_name
    INTO v_largest_amount,
         v_largest_description,
         v_largest_category,
         v_largest_paid_by_name
    FROM "CashTransactions" t
    LEFT JOIN "Profiles" p ON p.id = t.paid_by
    WHERE t.group_id = p_group_id
      AND t.deleted_at IS NULL
      AND t.transacted_at >= v_month_start
      AND t.transacted_at <  v_next_month_start
    ORDER BY t.amount DESC, t.transacted_at ASC
    LIMIT 1;

  -- card 3: recurring events (resolved pendings → tx). Aggregate into a list
  -- and totals. Direction is set per-source.
  WITH expense_evts AS (
    SELECT r.description AS name,
           t.amount AS amount,
           'expense'::text AS direction,
           t.transacted_at AS occurred_at
      FROM "PendingExpenseOccurrences" p
      JOIN "CashTransactions" t ON t.id = p.resolved_tx_id
      JOIN "RecurringExpenseRules" r ON r.id = p.rule_id
     WHERE p.group_id = p_group_id
       AND t.deleted_at IS NULL
       AND t.transacted_at >= v_month_start
       AND t.transacted_at <  v_next_month_start
  ),
  income_evts AS (
    SELECT COALESCE(NULLIF(r.source, ''), r.category) AS name,
           t.amount AS amount,
           'income'::text AS direction,
           (t.occurred_at::timestamp AT TIME ZONE 'Asia/Taipei') AS occurred_at
      FROM "PendingIncomeOccurrences" p
      JOIN "IncomeTransactions" t ON t.id = p.resolved_tx_id
      JOIN "RecurringIncomeRules" r ON r.id = p.rule_id
     WHERE p.group_id = p_group_id
       AND t.deleted_at IS NULL
       AND t.occurred_at >= (v_month_start AT TIME ZONE 'Asia/Taipei')::date
       AND t.occurred_at <  (v_next_month_start AT TIME ZONE 'Asia/Taipei')::date
  ),
  all_evts AS (
    SELECT * FROM expense_evts UNION ALL SELECT * FROM income_evts
  )
  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'name', name,
             'amount', amount,
             'direction', direction,
             'occurredAt', to_char(occurred_at AT TIME ZONE 'Asia/Taipei', 'YYYY-MM-DD')
           )
           ORDER BY occurred_at ASC, name ASC
         ), '[]'::jsonb),
         COALESCE(SUM(amount) FILTER (WHERE direction = 'income'), 0)::integer,
         COALESCE(SUM(amount) FILTER (WHERE direction = 'expense'), 0)::integer
    INTO v_recurring_events, v_recurring_in_total, v_recurring_ex_total
    FROM all_evts;

  -- card 4: top-3 愛物 by spend; NULL asset_id is excluded (spec: 「愛物進度」).
  WITH per_asset AS (
    SELECT t.asset_id,
           SUM(t.amount)::integer AS total
      FROM "CashTransactions" t
     WHERE t.group_id = p_group_id
       AND t.deleted_at IS NULL
       AND t.asset_id IS NOT NULL
       AND t.transacted_at >= v_month_start
       AND t.transacted_at <  v_next_month_start
     GROUP BY t.asset_id
     ORDER BY SUM(t.amount) DESC
     LIMIT 3
  )
  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'assetName', COALESCE(a.name, ''),
             'total', pa.total
           )
           ORDER BY pa.total DESC
         ), '[]'::jsonb)
    INTO v_asset_breakdown
    FROM per_asset pa
    LEFT JOIN "Assets" a ON a.id = pa.asset_id;

  INSERT INTO "MonthlyReviewSnapshots" (
    group_id, year, month,
    top_category, top_category_total,
    largest_expense_amount, largest_expense_description,
    largest_expense_category, largest_expense_paid_by_name,
    recurring_events, recurring_total_income, recurring_total_expense,
    asset_breakdown
  ) VALUES (
    p_group_id, p_year, p_month,
    v_top_category, v_top_category_total,
    v_largest_amount, v_largest_description,
    v_largest_category, v_largest_paid_by_name,
    v_recurring_events, v_recurring_in_total, v_recurring_ex_total,
    v_asset_breakdown
  )
  ON CONFLICT (group_id, year, month) DO UPDATE SET
    computed_at                  = NOW(),
    top_category                 = EXCLUDED.top_category,
    top_category_total           = EXCLUDED.top_category_total,
    largest_expense_amount       = EXCLUDED.largest_expense_amount,
    largest_expense_description  = EXCLUDED.largest_expense_description,
    largest_expense_category     = EXCLUDED.largest_expense_category,
    largest_expense_paid_by_name = EXCLUDED.largest_expense_paid_by_name,
    recurring_events             = EXCLUDED.recurring_events,
    recurring_total_income        = EXCLUDED.recurring_total_income,
    recurring_total_expense      = EXCLUDED.recurring_total_expense,
    asset_breakdown              = EXCLUDED.asset_breakdown
  WHERE "MonthlyReviewSnapshots".top_category IS NULL
    AND "MonthlyReviewSnapshots".largest_expense_amount IS NULL;
END;
$$;

-- ─── monthly-review-snapshot cron job (fixed month calc) ─────────────────
DO $$
BEGIN
  PERFORM cron.unschedule('monthly-review-snapshot');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Schedule unchanged: day 1 16:05 UTC = day 2 00:05 Asia/Taipei, which is
-- safely after the previous month has fully ended in Taipei wall-clock.
-- The 5-minute buffer lets timezone-edge transactions (e.g. recorded right
-- around midnight Taipei) settle. Only the target-month calc below changed
-- (see the function comment above for why `date_trunc(...) - 1 day` is
-- correct independent of trigger time, unlike the old calc it replaces).
SELECT cron.schedule('monthly-review-snapshot', '5 16 1 * *', $$
  WITH target AS (
    SELECT EXTRACT(YEAR  FROM (date_trunc('month', NOW() AT TIME ZONE 'Asia/Taipei') - INTERVAL '1 day'))::integer AS y,
           EXTRACT(MONTH FROM (date_trunc('month', NOW() AT TIME ZONE 'Asia/Taipei') - INTERVAL '1 day'))::integer AS m
  ),
  computed AS (
    SELECT compute_monthly_review_snapshot(g.id, target.y, target.m)
      FROM "OikosGroups" g, target
  )
  SELECT 1 FROM computed;

  -- Lock all messages addressed to the just-completed month. Idempotent:
  -- WHERE locked_at IS NULL.
  UPDATE "MonthlyReviewMessages" m
     SET locked_at = NOW()
    FROM (
      SELECT EXTRACT(YEAR  FROM (date_trunc('month', NOW() AT TIME ZONE 'Asia/Taipei') - INTERVAL '1 day'))::integer AS y,
             EXTRACT(MONTH FROM (date_trunc('month', NOW() AT TIME ZONE 'Asia/Taipei') - INTERVAL '1 day'))::integer AS m
    ) target
   WHERE m.year = target.y
     AND m.month = target.m
     AND m.locked_at IS NULL;
$$);
