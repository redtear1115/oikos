-- v0.14.0 #44 — MonthlyReviewSnapshots + MonthlyReviewMessages (2026-05-10).
-- Cron at 00:05 Asia/Taipei on the 1st of each month freezes the previous
-- month's snapshot and locks any messages addressed to that month so they
-- are read-only thereafter.
--
-- Design notes:
--   * Snapshot row is the source of truth for /review/[YYYY-MM]; readers do
--     not recompute. Soft-deleting a transaction after cron does NOT update
--     the snapshot — this is the freeze guarantee from the spec.
--   * `recurring_events` and `asset_breakdown` are jsonb so the snapshot is
--     self-contained even after rules/assets are renamed or soft-deleted.
--   * `banner_dismissed_by_member_*_at` lives on the snapshot row so two
--     members can dismiss independently and dismiss state persists across
--     devices for free.

-- ─── MonthlyReviewSnapshots ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "MonthlyReviewSnapshots" (
  id                                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id                          uuid NOT NULL REFERENCES "OikosGroups"(id),
  year                              integer NOT NULL CHECK (year BETWEEN 2000 AND 2999),
  month                             integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  computed_at                       timestamptz NOT NULL DEFAULT NOW(),

  top_category                      text,
  top_category_total                integer,

  largest_expense_amount            integer,
  largest_expense_description       text,
  largest_expense_category          text,
  largest_expense_paid_by_name      text,

  recurring_events                  jsonb,
  recurring_total_income            integer,
  recurring_total_expense           integer,

  asset_breakdown                   jsonb,

  banner_dismissed_by_member_a_at   timestamptz,
  banner_dismissed_by_member_b_at   timestamptz,

  CONSTRAINT monthly_review_snapshot_unique UNIQUE (group_id, year, month)
);

CREATE INDEX IF NOT EXISTS "monthly_review_snapshot_lookup_idx"
  ON "MonthlyReviewSnapshots" (group_id, year DESC, month DESC);

-- ─── MonthlyReviewMessages ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "MonthlyReviewMessages" (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    uuid NOT NULL REFERENCES "OikosGroups"(id),
  member_id   uuid NOT NULL REFERENCES "Profiles"(id),
  year        integer NOT NULL CHECK (year BETWEEN 2000 AND 2999),
  month       integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  body        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT NOW(),
  updated_at  timestamptz NOT NULL DEFAULT NOW(),
  locked_at   timestamptz,
  CONSTRAINT monthly_review_message_unique UNIQUE (group_id, member_id, year, month)
);

CREATE INDEX IF NOT EXISTS "monthly_review_message_lookup_idx"
  ON "MonthlyReviewMessages" (group_id, year, month);

-- ─── RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE "MonthlyReviewSnapshots" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "monthly_review_snapshot_member_select" ON "MonthlyReviewSnapshots";
CREATE POLICY "monthly_review_snapshot_member_select" ON "MonthlyReviewSnapshots" FOR SELECT
  USING (group_id IN (
    SELECT id FROM "OikosGroups" WHERE member_a = auth.uid() OR member_b = auth.uid()
  ));

ALTER TABLE "MonthlyReviewMessages" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "monthly_review_message_member_select" ON "MonthlyReviewMessages";
CREATE POLICY "monthly_review_message_member_select" ON "MonthlyReviewMessages" FOR SELECT
  USING (group_id IN (
    SELECT id FROM "OikosGroups" WHERE member_a = auth.uid() OR member_b = auth.uid()
  ));

-- Realtime publication: messages only — snapshots are written once/month by
-- cron with no UI surface that needs reactivity, while messages benefit from
-- the partner seeing each other's writes on next refresh.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
      AND tablename = 'MonthlyReviewMessages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE "MonthlyReviewMessages";
  END IF;
END $$;

-- ─── snapshot computation function ────────────────────────────────────────
-- Takes target_year/target_month for the month being summarised. Idempotent:
-- ON CONFLICT DO NOTHING means a re-run is safe and preserves the first
-- snapshot's frozen values.
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
  ON CONFLICT (group_id, year, month) DO NOTHING;
END;
$$;

-- ─── monthly-review-snapshot cron job ────────────────────────────────────
DO $$
BEGIN
  PERFORM cron.unschedule('monthly-review-snapshot');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 16:05 UTC on day 1 = 00:05 Asia/Taipei on day 1, mirroring the recurring
-- generators' 16:00-UTC daily slot. The 5-minute buffer lets timezone-edge
-- transactions (e.g. recorded right around midnight Taipei) settle.
SELECT cron.schedule('monthly-review-snapshot', '5 16 1 * *', $$
  WITH target AS (
    SELECT EXTRACT(YEAR  FROM ((NOW() AT TIME ZONE 'Asia/Taipei') - INTERVAL '1 day'))::integer AS y,
           EXTRACT(MONTH FROM ((NOW() AT TIME ZONE 'Asia/Taipei') - INTERVAL '1 day'))::integer AS m
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
      SELECT EXTRACT(YEAR  FROM ((NOW() AT TIME ZONE 'Asia/Taipei') - INTERVAL '1 day'))::integer AS y,
             EXTRACT(MONTH FROM ((NOW() AT TIME ZONE 'Asia/Taipei') - INTERVAL '1 day'))::integer AS m
    ) target
   WHERE m.year = target.y
     AND m.month = target.m
     AND m.locked_at IS NULL;
$$);

-- ─── extend cleanup-soft-deleted (no-op; nothing to delete here) ──────────
-- Snapshots and messages are kept indefinitely (small per-row cost; archival
-- value > storage). If we ever want a retention window, add it here.
