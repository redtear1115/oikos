-- v0.15.2 #166 — Insurance 投資型保單目前帳戶價值
--
-- For investment-linked savings policies (投資型保單), the "current account
-- value" is the present market value of the underlying portfolio — distinct
-- from both `expected_maturity_amount` (user-set projection) and 已拿回 returns
-- (realised IncomeTransactions). SavingsView surfaces it as an informational
-- row beneath the hero bars so users can see current value without conflating
-- it with cashflow.
--
-- Nullable: only relevant for investment-linked policies; traditional savings
-- policies have no concept of "account value" and leave it null.
--
-- Snapshotting policy: the value is user-entered (statement-based) and is not
-- recomputed by the app. Users update it on next edit when they see a new
-- statement; we don't try to model the underlying fund pricing.

ALTER TABLE "InsuranceDetails"
  ADD COLUMN "account_value" integer;

COMMENT ON COLUMN "InsuranceDetails"."account_value" IS
  'User-set current account value for investment-linked savings policies (TWD). null = unset or not applicable.';
