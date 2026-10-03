-- ROLLBACK (grants) for drizzle/0080_chapter_scoped_rls.sql — DEV ONLY. NEVER RUN ON PROD.
-- MANUAL ONLY, NEVER RUN AUTOMATICALLY. Not a drizzle migration.
--
-- Run AFTER scripts/rollback/0080_chapter_scoped_rls.policies.down.sql (which
-- restores the policies, drops the helper and removes the bookkeeping row).
-- This file puts back the rest of the pre-0080 privileges — Supabase's default
-- ACL, i.e. ALL for anon and authenticated — on every table 0080 touched
-- except Assets (0080 never touched Assets; 0075 owns its grants).
--
-- Why DEV ONLY: this reopens #1518 in full. With it, any signed-in member can
-- read the ledger's chapters, profiles, invites, imports, reviews, quiz
-- answers and trips through GET /rest/v1/<table>, and anon gets table
-- privileges back. It exists only to return a dev database to exactly the
-- pre-0080 state (e.g. to re-run the before/after comparison). The prod lever
-- for broken Realtime is the policies.down file alone.
-- Failure look if run on prod by mistake: nothing errors and the app looks
-- unchanged — the exposure is back silently. Recovery: re-apply 0080.
--
-- Run inside one transaction:  psql "$DATABASE_URL" -1 -v ON_ERROR_STOP=1 -f <this file>

GRANT ALL ON TABLE
  "CurrencyRates", "GroupEpochs", "GroupInvites", "ImportBatches", "ImportErrors",
  "InvoiceImportRuns", "InvoiceImportSnapshots", "MonthlyReviewMessages",
  "MonthlyReviewSnapshots", "PartnerQuizAnswers", "PartnerQuizSessions",
  "PlantDetails", "Profiles", "TripExpenses", "Trips",
  "CashTransactions", "IncomeTransactions", "Settlements", "FuelLogs",
  "RecurringExpenseRules", "RecurringIncomeRules",
  "PendingExpenseOccurrences", "PendingIncomeOccurrences",
  "OikosGroups", "GroupBalance", "PushTokens"
  TO anon, authenticated;
