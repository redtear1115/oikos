-- 0077 — compute_monthly_review_snapshot: ledger-scoped joins, search_path
-- pin restored, EXECUTE only for postgres / service_role (#1494)
--
-- The body below is 0061's function, verbatim, except for:
--   1. `public.`-qualified name and `SET search_path = public, pg_temp`.
--   2. Card 3: the joins to the resolved transaction now also require
--      `t.group_id = p_group_id` (CashTransactions and IncomeTransactions).
--      A pending can point at a transaction in another ledger after a leave
--      when the transaction's payer differs from the rule's payer; such a
--      transaction is not part of this ledger's month.
--      The rule joins (`r.id = p.rule_id`) are left as they are: a pending
--      takes its group_id from its rule and moves with it, so they cannot
--      diverge. The Profiles join on paid_by is also left as it is: Profiles
--      are not owned by a ledger, and scoping it to current members would
--      drop former members' names from history.
--   3. Card 4: the Assets join also requires `a.group_id = p_group_id`. A
--      transaction linked to another ledger's asset still takes its top-3
--      slot (LIMIT runs before the join) and renders as '—', the same as a
--      deleted asset and the same as monthlyStatsByAsset after #1485.
--   Only the function is redefined here; 0061's cron job is not touched.
--   Failure look of the unscoped joins: no error; a snapshot shows another
--   ledger's asset name, or another ledger's transaction in card 3.
--
-- Why the search_path pin is back: 0042 pinned it with ALTER FUNCTION, on
-- the reasoning that this keeps the body owned by its original migration.
-- That did not hold — 0061's CREATE OR REPLACE without a SET clause reset
-- proconfig to NULL, silently. Confirmed on dev and prod (2026-10-02).
-- Failure look: nothing fails at runtime; the Supabase advisor
-- `function_search_path_mutable` comes back for this function. Any later
-- CREATE OR REPLACE of this function must carry the SET clause itself.
--
-- Why the REVOKE: the function is SECURITY INVOKER and its only callers are
-- the pg_cron job (runs as postgres) and 0062's backfill. EXECUTE was held
-- by PUBLIC, anon and authenticated (Supabase defaults), which exposes it as
-- a PostgREST rpc. Nothing is reachable through it today (RLS on
-- MonthlyReviewSnapshots has no INSERT/UPDATE policy), but it would become
-- reachable the day the function turns DEFINER or such a policy is added.
-- anon / authenticated are named explicitly: Supabase grants them directly,
-- so revoking from PUBLIC alone leaves them in place.
-- Failure look if this is undone: nothing breaks;
-- has_function_privilege('anon', …, 'EXECUTE') is true again.
--
-- CREATE OR REPLACE keeps the function's OID and ACL. Never DROP + CREATE
-- it: that re-applies the default grants to PUBLIC / anon / authenticated.
--
-- Rollback: scripts/rollback/0077_monthly_review_snapshot_hardening.down.sql
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
      JOIN "CashTransactions" t ON t.id = p.resolved_tx_id AND t.group_id = p_group_id
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
      JOIN "IncomeTransactions" t ON t.id = p.resolved_tx_id AND t.group_id = p_group_id
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
    LEFT JOIN "Assets" a ON a.id = pa.asset_id AND a.group_id = p_group_id;

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
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.compute_monthly_review_snapshot(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.compute_monthly_review_snapshot(uuid, integer, integer) TO postgres, service_role;
