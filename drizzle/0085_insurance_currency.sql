-- 0085: each insurance policy records its own currency (#1600).
-- spec: docs/superpowers/specs/insurance-design.md
--
-- InsuranceDetails amounts (annual_premium, sum_insured, expected_maturity_amount,
-- account_value) were whole units with no currency; the UI printed them as NT$
-- whatever the ledger used. A policy bought in USD now says so. Failure looks
-- like: a USD policy shown as NT$, or a policy's amounts compared against the
-- ledger's paid/returned totals as if they were the same currency.
--
-- The column is NULLABLE with no default, on purpose:
--   * old code ignores it on read and inserts NULL on create;
--   * new code reads NULL as "the ledger's base currency" (today's behaviour)
--     and always writes a value, so NULL rows stop appearing after deploy.
-- A later migration sets NOT NULL once a prod count shows 0 NULL rows.
--
-- Backfill: the owning group's base currency (what the amounts were de facto
-- entered in); an orphan row with no group falls back to 'twd'.
--
-- Deploy order: apply this (after 0084) BEFORE deploying the code that reads
-- `currency`. Old code is unaffected by the extra column; new code selects it,
-- so code-first fails every insurance read with "column does not exist".
-- Rollback: scripts/rollback/0085_insurance_currency.down.sql
-- Idempotent: safe to re-apply (ADD COLUMN IF NOT EXISTS, backfill only NULLs).

ALTER TABLE "InsuranceDetails" ADD COLUMN IF NOT EXISTS "currency" "currency_code";
--> statement-breakpoint
UPDATE "InsuranceDetails" d
SET "currency" = g."base_currency"
FROM "Assets" a
JOIN "OikosGroups" g ON g."id" = a."group_id"
WHERE a."id" = d."asset_id" AND d."currency" IS NULL;
--> statement-breakpoint
UPDATE "InsuranceDetails" SET "currency" = 'twd' WHERE "currency" IS NULL;
