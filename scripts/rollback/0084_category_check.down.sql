-- Rollback for 0084_category_check. The UPDATE of non-conforming rows to 'other' is not reverted.

ALTER TABLE "CashTransactions" DROP CONSTRAINT IF EXISTS "CashTransactions_category_valid";
ALTER TABLE "RecurringExpenseRules" DROP CONSTRAINT IF EXISTS "RecurringExpenseRules_category_valid";
ALTER TABLE "TripExpenses" DROP CONSTRAINT IF EXISTS "TripExpenses_category_valid";
ALTER TABLE "IncomeTransactions" DROP CONSTRAINT IF EXISTS "IncomeTransactions_category_valid";
ALTER TABLE "RecurringIncomeRules" DROP CONSTRAINT IF EXISTS "RecurringIncomeRules_category_valid";
