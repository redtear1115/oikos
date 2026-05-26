-- v1.2.5 #800 — Composite indexes for CashTransactions + Settlements hot paths.
--
-- Background:
--
-- IncomeTransactions (added in 0012) already has a purpose-built composite
-- index for the feed/list query shape:
--
--     CREATE INDEX income_group_occurred_idx
--       ON "IncomeTransactions" (group_id, occurred_at DESC, created_at DESC)
--       WHERE deleted_at IS NULL;
--
-- CashTransactions — the busier table, hit on every records list page,
-- dashboard feed, balance recalc, stats page, and trip rollup — has no
-- equivalent. Its existing indexes only cover trip_id / fuel_log_id /
-- import_batch_id / invoice uniq. Without a composite on (group_id,
-- transacted_at), Postgres sequential-scans the whole table per group then
-- sorts.
--
-- Settlements has zero indexes today despite being hit on every balance
-- recalc with `WHERE group_id = X AND deleted_at IS NULL` (lib/db/queries/
-- balance.ts), plus `transacted_at`-bounded queries on the currency-change
-- guard (actions/currency.ts) and the settlement list (actions/settlement.ts).
--
-- Both indexes are partial (`WHERE deleted_at IS NULL`) to match the universal
-- filter shape and keep the index small — soft-deleted rows are not visited
-- by any hot path and pg_cron physically removes them after 1 year (see
-- 0012's cleanup-soft-deleted job).

-- Mirrors income_group_occurred_idx for the records feed / dashboard / stats /
-- balance recalc. (group_id, transacted_at DESC, created_at DESC) lets the
-- planner walk the index in physical order for ORDER BY transacted_at DESC,
-- created_at DESC LIMIT N pagination without a sort step.
CREATE INDEX IF NOT EXISTS "cash_group_transacted_idx"
  ON "CashTransactions" (group_id, transacted_at DESC, created_at DESC)
  WHERE deleted_at IS NULL;

-- Settlements is queried by (group_id, deleted_at IS NULL) on every balance
-- recalc, and additionally bounded by settled_at on the currency-change
-- guard / epoch slice. Mirror the cash composite shape so both paths can use
-- the same index.
CREATE INDEX IF NOT EXISTS "settlements_group_settled_idx"
  ON "Settlements" (group_id, settled_at DESC, created_at DESC)
  WHERE deleted_at IS NULL;
