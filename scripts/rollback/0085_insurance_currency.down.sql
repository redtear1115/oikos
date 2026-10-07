-- Rollback for 0085_insurance_currency. Drops the per-policy currency; amounts stay,
-- and every policy is read as the ledger's base currency again.

ALTER TABLE "InsuranceDetails" DROP COLUMN IF EXISTS "currency";
