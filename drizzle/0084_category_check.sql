-- 0084: category CHECK constraints (#1541).
-- spec: docs/superpowers/specs/domain-model-design.md
--
-- The category columns were free text; the only guard was app-side validation,
-- and a write path that skipped it (trip expenses stored whatever the client
-- sent, CSV import passed 'settle' through) left rows no chip could render.
-- This pins each column to the ids in lib/categories.ts (expense, without the
-- display-only 'settle') and lib/incomeCategories.ts (income):
--   CashTransactions, RecurringExpenseRules, TripExpenses  -> expense ids
--   IncomeTransactions, RecurringIncomeRules               -> income ids
-- Out of scope: OutingExpenses.category (free-text hint by design),
-- InvoiceImportSnapshots.imported_category (raw provider text), and the
-- MonthlyReviewSnapshots category columns (copied from CashTransactions).
--
-- Steps per table: (1) UPDATE any non-conforming row to 'other' (soft-deleted
-- rows included, the CHECK applies to them too; the 2026-10-07 prod audit
-- found exactly one, a deleted CashTransactions row with 'food'), (2) ADD the
-- constraint NOT VALID inside an IF NOT EXISTS guard, (3) VALIDATE it.
--
-- Trade-off: every new category id now needs a migration that widens these
-- lists (__tests__/categoryCheckDrift.test.ts fails CI when code and SQL
-- disagree). Failure looks like: the new id works wherever the DB is not hit,
-- then every insert with it fails in prod with a 23514 check violation that
-- surfaces as a generic error.
--
-- Deploy order: code first (it no longer produces invalid values), then this.
-- Rollback: scripts/rollback/0084_category_check.down.sql
-- Idempotent: safe to re-apply.

UPDATE "CashTransactions" SET "category" = 'other' WHERE "category" NOT IN ('dining', 'clothing', 'housing', 'transit', 'education', 'entertainment', 'health', 'financial', 'other');
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CashTransactions_category_valid') THEN
    ALTER TABLE "CashTransactions" ADD CONSTRAINT "CashTransactions_category_valid"
      CHECK ("category" IN ('dining', 'clothing', 'housing', 'transit', 'education', 'entertainment', 'health', 'financial', 'other')) NOT VALID;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "CashTransactions" VALIDATE CONSTRAINT "CashTransactions_category_valid";
--> statement-breakpoint
UPDATE "RecurringExpenseRules" SET "category" = 'other' WHERE "category" NOT IN ('dining', 'clothing', 'housing', 'transit', 'education', 'entertainment', 'health', 'financial', 'other');
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RecurringExpenseRules_category_valid') THEN
    ALTER TABLE "RecurringExpenseRules" ADD CONSTRAINT "RecurringExpenseRules_category_valid"
      CHECK ("category" IN ('dining', 'clothing', 'housing', 'transit', 'education', 'entertainment', 'health', 'financial', 'other')) NOT VALID;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "RecurringExpenseRules" VALIDATE CONSTRAINT "RecurringExpenseRules_category_valid";
--> statement-breakpoint
UPDATE "TripExpenses" SET "category" = 'other' WHERE "category" NOT IN ('dining', 'clothing', 'housing', 'transit', 'education', 'entertainment', 'health', 'financial', 'other');
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TripExpenses_category_valid') THEN
    ALTER TABLE "TripExpenses" ADD CONSTRAINT "TripExpenses_category_valid"
      CHECK ("category" IN ('dining', 'clothing', 'housing', 'transit', 'education', 'entertainment', 'health', 'financial', 'other')) NOT VALID;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "TripExpenses" VALIDATE CONSTRAINT "TripExpenses_category_valid";
--> statement-breakpoint
UPDATE "IncomeTransactions" SET "category" = 'other' WHERE "category" NOT IN ('salary', 'bonus', 'maturity', 'dividend', 'survival_annuity', 'claim', 'gift', 'refund', 'sidehustle', 'other');
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'IncomeTransactions_category_valid') THEN
    ALTER TABLE "IncomeTransactions" ADD CONSTRAINT "IncomeTransactions_category_valid"
      CHECK ("category" IN ('salary', 'bonus', 'maturity', 'dividend', 'survival_annuity', 'claim', 'gift', 'refund', 'sidehustle', 'other')) NOT VALID;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "IncomeTransactions" VALIDATE CONSTRAINT "IncomeTransactions_category_valid";
--> statement-breakpoint
UPDATE "RecurringIncomeRules" SET "category" = 'other' WHERE "category" NOT IN ('salary', 'bonus', 'maturity', 'dividend', 'survival_annuity', 'claim', 'gift', 'refund', 'sidehustle', 'other');
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RecurringIncomeRules_category_valid') THEN
    ALTER TABLE "RecurringIncomeRules" ADD CONSTRAINT "RecurringIncomeRules_category_valid"
      CHECK ("category" IN ('salary', 'bonus', 'maturity', 'dividend', 'survival_annuity', 'claim', 'gift', 'refund', 'sidehustle', 'other')) NOT VALID;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "RecurringIncomeRules" VALIDATE CONSTRAINT "RecurringIncomeRules_category_valid";
