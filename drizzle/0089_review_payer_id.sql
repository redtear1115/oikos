-- 0089: the monthly review's largest-expense card stores who paid, not their
-- name (#1618).
-- positioning: docs/superpowers/specs/after-leaving-design.md (a deleted
-- account shows 「已離開的夥伴」), account-deletion-design.md (display names are
-- removed). plan: #1618 S5.
--
-- Why: MonthlyReviewSnapshots.largest_expense_paid_by_name froze the payer's
-- live display name when the snapshot was computed. process_account_deletions
-- never touches it and the row had no payer id, so after an account deletion
-- the other person's past months kept showing the deleted user's real name.
-- It also leaked across chapters: a removed partner's future-dated row could be
-- the largest expense of a month inside the NEXT chapter, and the new partner
-- saw the old partner's live name.
-- Failure looks like: nothing errors; open /review/<month> as the partner of a
-- deleted account (or as the next partner) and card 2 carries a real name that
-- should be gone.
--
-- What this migration does:
--   1. MonthlyReviewSnapshots gets largest_expense_paid_by (uuid, NULL, no FK:
--      the id must survive whatever happens to the Profiles row). No grant:
--      0080 revoked every anon / authenticated privilege on this table, ADD
--      COLUMN adds none, and the table is not in supabase_realtime.
--   2. compute_monthly_review_snapshot: CREATE OR REPLACE with 0077's body
--      except: card 2 selects t.paid_by into the new column, the Profiles join
--      is gone, the name column is written NULL (insert and ON CONFLICT), ON
--      CONFLICT sets the new column, and card 2's ORDER BY gains the
--      deterministic tie-breaker `t.created_at ASC, t.id ASC`. The variable
--      v_largest_paid_by_name (text) became v_largest_paid_by (uuid).
--      `SET search_path = public, pg_temp` and 0077's REVOKE / GRANT are kept
--      exactly (0077's header says why). Never DROP + CREATE it: that brings
--      back the default EXECUTE grants.
--   3. Backfill (ids only; a stored name is only ever compared inside SQL,
--      never selected out). For each snapshot that still has a name, it
--      reconstructs the rows that existed when the snapshot was computed (same
--      group and Asia/Taipei month, created_at <= computed_at, not deleted
--      before computed_at, same amount / description / category), ranks them
--      as 0077 did (amount DESC, transacted_at ASC) and:
--        - leaves the id NULL if the top-ranked tie holds more than one payer
--          (same-day rows share UTC noon, lib/validators.ts);
--        - sets it only if that payer's current display_name equals the stored
--          name, or the payer has no auth.users row (deleted). A payer who
--          renamed since gets no id: a missing name beats a wrong one.
--      Rows that moved away with a leaver are not recovered (#1611); those
--      snapshots show the card without a name.
--   4. PII removal: every largest_expense_paid_by_name is set to NULL. The
--      column stays (dropping it is a later cleanup, v2.0.0).
--
-- ORDER (hard): after 0088 (journal order). On prod, apply IMMEDIATELY BEFORE
-- the code deploy, in the same release window. Old code on the new schema is
-- safe: it ignores the id and reads a NULL name, so card 2 loses its name chip
-- until the deploy. New code on the old schema fails: lib/db/schema.ts lists
-- the new column, so every snapshot read errors with "column does not exist"
-- (the review page and the dashboard 月回顧 cell break).
-- Apply window: OUTSIDE 16:00-17:30 UTC (deletion cron 16:30 UTC; monthly
-- snapshot cron `5 16 1 * *` UTC).
-- Right after applying, and after the next 1st-of-month cron, this must be 0:
--   SELECT count(*) FROM "MonthlyReviewSnapshots" WHERE largest_expense_paid_by_name IS NOT NULL;
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE, the backfill only
-- touches rows whose id is NULL and whose name is not NULL, and step 4 leaves
-- no name behind, so a second run changes 0 rows.
--
-- Backup restore: a backup taken before this migration still holds the names.
-- After restoring one, re-apply this migration before the app opens (drizzle
-- re-runs it, since the restored journal predates it) and check the invariant
-- above (ops-runbook › 真正還原, step 7).
--
-- Rollback: the standard rollback is reverting the CODE only; old code works
-- against this schema. If the function itself must go back,
-- scripts/rollback/0089_review_payer_id.down.sql restores the 0077 body with
-- the name still written NULL and no Profiles join. Names are never written
-- again and removed names are not restored (they are PII). The id column
-- stays. Snapshots computed while rolled back have neither a name nor an id,
-- and re-applying this file cannot fill them (no name left to verify against):
-- they show card 2 without a name.

ALTER TABLE "MonthlyReviewSnapshots" ADD COLUMN IF NOT EXISTS "largest_expense_paid_by" uuid;
--> statement-breakpoint
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
  v_largest_paid_by        uuid;
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

  -- card 2: largest single expense (any split_type). Stores WHO paid (the
  -- payer id), never their name (#1618): the review page resolves the name
  -- within the viewed chapter. Tie-breaker is deterministic.
  SELECT t.amount,
         t.description,
         t.category,
         t.paid_by
    INTO v_largest_amount,
         v_largest_description,
         v_largest_category,
         v_largest_paid_by
    FROM "CashTransactions" t
    WHERE t.group_id = p_group_id
      AND t.deleted_at IS NULL
      AND t.transacted_at >= v_month_start
      AND t.transacted_at <  v_next_month_start
    ORDER BY t.amount DESC, t.transacted_at ASC, t.created_at ASC, t.id ASC
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
    largest_expense_category, largest_expense_paid_by, largest_expense_paid_by_name,
    recurring_events, recurring_total_income, recurring_total_expense,
    asset_breakdown
  ) VALUES (
    p_group_id, p_year, p_month,
    v_top_category, v_top_category_total,
    v_largest_amount, v_largest_description,
    v_largest_category, v_largest_paid_by, NULL,
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
    largest_expense_paid_by      = EXCLUDED.largest_expense_paid_by,
    largest_expense_paid_by_name = NULL,
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
--> statement-breakpoint
-- 3. Backfill the payer id (rules in the header).
WITH cand AS (
  SELECT s.id AS snapshot_id,
         t.paid_by,
         t.transacted_at,
         s.largest_expense_paid_by_name AS stored_name
    FROM "MonthlyReviewSnapshots" s
    JOIN "CashTransactions" t
      ON t.group_id = s.group_id
     AND t.transacted_at >= make_timestamptz(s.year, s.month, 1, 0, 0, 0, 'Asia/Taipei')
     AND t.transacted_at <  make_timestamptz(s.year, s.month, 1, 0, 0, 0, 'Asia/Taipei') + INTERVAL '1 month'
     AND t.created_at <= s.computed_at
     AND (t.deleted_at IS NULL OR t.deleted_at > s.computed_at)
     AND t.amount = s.largest_expense_amount
     AND t.description IS NOT DISTINCT FROM s.largest_expense_description
     AND t.category IS NOT DISTINCT FROM s.largest_expense_category
   WHERE s.largest_expense_amount > 0
     AND s.largest_expense_paid_by IS NULL
     AND s.largest_expense_paid_by_name IS NOT NULL
),
ranked AS (
  -- 0077's order is amount DESC, transacted_at ASC; the amount is fixed above.
  SELECT c.*, rank() OVER (PARTITION BY c.snapshot_id ORDER BY c.transacted_at ASC) AS rk
    FROM cand c
),
resolved AS (
  -- More than one payer in the top-ranked tie → ambiguous → no id.
  SELECT snapshot_id,
         (array_agg(paid_by))[1] AS paid_by,
         (array_agg(stored_name))[1] AS stored_name
    FROM ranked
   WHERE rk = 1
   GROUP BY snapshot_id
  HAVING count(DISTINCT paid_by) = 1
)
UPDATE "MonthlyReviewSnapshots" s
   SET largest_expense_paid_by = r.paid_by
  FROM resolved r
 WHERE s.id = r.snapshot_id
   AND s.largest_expense_paid_by IS NULL
   AND (
         EXISTS (SELECT 1 FROM "Profiles" p WHERE p.id = r.paid_by AND p.display_name = r.stored_name)
      OR NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = r.paid_by)
   );
--> statement-breakpoint
-- 4. PII removal: no snapshot keeps a display name.
UPDATE "MonthlyReviewSnapshots"
   SET largest_expense_paid_by_name = NULL
 WHERE largest_expense_paid_by_name IS NOT NULL;
