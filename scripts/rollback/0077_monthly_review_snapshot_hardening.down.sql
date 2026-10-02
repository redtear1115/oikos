-- ROLLBACK for drizzle/0077_monthly_review_snapshot_hardening.sql — MANUAL ONLY, NEVER RUN AUTOMATICALLY.
-- Not a drizzle migration: drizzle-kit only runs files listed in drizzle/meta/_journal.json.
--
-- What it does:
--   1. Restores compute_monthly_review_snapshot to 0061's body (copied
--      verbatim from drizzle/0061_fix_monthly_review_month_calc.sql), i.e.
--      without the three `group_id = p_group_id` join conditions.
--   2. Removes 0077's row from drizzle.__drizzle_migrations so `db:migrate`
--      would re-apply it.
--
-- What it deliberately does NOT restore:
--   - The missing search_path pin. 0061 dropped 0042's pin by accident; this
--     rollback keeps `SET search_path = public, pg_temp`.
--   - EXECUTE for PUBLIC / anon / authenticated. Nothing needs it (callers
--     are the pg_cron job as postgres and 0062's backfill), so 0077's REVOKE
--     stays. No ACL statement here.
-- So this is not "0061 exactly"; it only takes the join conditions back out.
--
-- CREATE OR REPLACE keeps the OID and ACL. Never DROP + CREATE (that would
-- re-apply the default grants).
--
-- Run inside one transaction:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f <this file>

-- 1. compute_monthly_review_snapshot (0061 body, pinned)
CREATE OR REPLACE FUNCTION public.compute_monthly_review_snapshot(
  p_group_id  uuid,
  p_year      integer,
  p_month     integer
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
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

-- 2. migration bookkeeping
DELETE FROM drizzle.__drizzle_migrations WHERE created_at = 1783400000000;
