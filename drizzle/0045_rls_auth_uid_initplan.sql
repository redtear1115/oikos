-- perf(db): wrap auth.uid() in (select auth.uid()) across all remaining RLS
-- policies — addresses the Supabase advisor "auth_rls_initplan" warning.
--
-- When a RLS USING / WITH CHECK clause references `auth.uid()` directly,
-- PostgreSQL evaluates the function once per row. Wrapping it in
-- `(select auth.uid())` turns the call into a sub-SELECT, which the planner
-- hoists into an InitPlan that runs exactly once per query — a measurable
-- win on tables with many rows.
--
-- This is a purely mechanical rewrite: USING / WITH CHECK logic is preserved
-- verbatim, only `auth.uid()` is replaced. Behavior is identical.
--
-- Earlier migrations already handled a subset of the policies:
--   - 0022/0023 — Profiles + Assets
--   - 0024 — OikosGroups (groups_member_select)
--   - 0030 — GroupEpochs (group_epochs_select_members)
--
-- This migration covers every remaining policy that still uses bare
-- `auth.uid()`. Idempotent (DROP IF EXISTS + CREATE), safe on dev + prod.

-- ─── CashTransactions ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "txns_group_member_select" ON "CashTransactions";--> statement-breakpoint
CREATE POLICY "txns_group_member_select" ON "CashTransactions" FOR SELECT
  USING (
    group_id IN (
      SELECT id FROM "OikosGroups"
      WHERE member_a = (select auth.uid()) OR member_b = (select auth.uid())
    )
  );--> statement-breakpoint

-- ─── Settlements ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "settles_group_member_select" ON "Settlements";--> statement-breakpoint
CREATE POLICY "settles_group_member_select" ON "Settlements" FOR SELECT
  USING (
    group_id IN (
      SELECT id FROM "OikosGroups"
      WHERE member_a = (select auth.uid()) OR member_b = (select auth.uid())
    )
  );--> statement-breakpoint

-- ─── GroupBalance ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "balance_group_member_select" ON "GroupBalance";--> statement-breakpoint
CREATE POLICY "balance_group_member_select" ON "GroupBalance" FOR SELECT
  USING (
    group_id IN (
      SELECT id FROM "OikosGroups"
      WHERE member_a = (select auth.uid()) OR member_b = (select auth.uid())
    )
  );--> statement-breakpoint

-- ─── CarDetails ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "car_details_member_select" ON "CarDetails";--> statement-breakpoint
CREATE POLICY "car_details_member_select" ON "CarDetails" FOR SELECT
  USING (
    asset_id IN (
      SELECT id FROM "Assets" WHERE group_id IN (
        SELECT id FROM "OikosGroups"
        WHERE member_a = (select auth.uid()) OR member_b = (select auth.uid())
      )
    )
  );--> statement-breakpoint

-- ─── HouseDetails ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "house_details_member_select" ON "HouseDetails";--> statement-breakpoint
CREATE POLICY "house_details_member_select" ON "HouseDetails" FOR SELECT
  USING (
    asset_id IN (
      SELECT id FROM "Assets" WHERE group_id IN (
        SELECT id FROM "OikosGroups"
        WHERE member_a = (select auth.uid()) OR member_b = (select auth.uid())
      )
    )
  );--> statement-breakpoint

-- ─── ChildDetails ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "child_details_member_select" ON "ChildDetails";--> statement-breakpoint
CREATE POLICY "child_details_member_select" ON "ChildDetails" FOR SELECT
  USING (
    asset_id IN (
      SELECT id FROM "Assets" WHERE group_id IN (
        SELECT id FROM "OikosGroups"
        WHERE member_a = (select auth.uid()) OR member_b = (select auth.uid())
      )
    )
  );--> statement-breakpoint

-- ─── InsuranceDetails ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "insurance_details_member_select" ON "InsuranceDetails";--> statement-breakpoint
CREATE POLICY "insurance_details_member_select" ON "InsuranceDetails" FOR SELECT
  USING (
    asset_id IN (
      SELECT id FROM "Assets" WHERE group_id IN (
        SELECT id FROM "OikosGroups"
        WHERE member_a = (select auth.uid()) OR member_b = (select auth.uid())
      )
    )
  );--> statement-breakpoint

-- ─── FuelLogs ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "fuel_logs_member_select" ON "FuelLogs";--> statement-breakpoint
CREATE POLICY "fuel_logs_member_select" ON "FuelLogs" FOR SELECT
  USING (
    asset_id IN (
      SELECT id FROM "Assets" WHERE group_id IN (
        SELECT id FROM "OikosGroups"
        WHERE member_a = (select auth.uid()) OR member_b = (select auth.uid())
      )
    )
  );--> statement-breakpoint

-- ─── IncomeTransactions ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "incomes_group_member_select" ON "IncomeTransactions";--> statement-breakpoint
CREATE POLICY "incomes_group_member_select" ON "IncomeTransactions" FOR SELECT
  USING (
    group_id IN (
      SELECT id FROM "OikosGroups"
      WHERE member_a = (select auth.uid()) OR member_b = (select auth.uid())
    )
  );--> statement-breakpoint

-- ─── RecurringIncomeRules ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "rules_group_member_select" ON "RecurringIncomeRules";--> statement-breakpoint
CREATE POLICY "rules_group_member_select" ON "RecurringIncomeRules" FOR SELECT
  USING (group_id IN (
    SELECT id FROM "OikosGroups"
    WHERE member_a = (select auth.uid()) OR member_b = (select auth.uid())
  ));--> statement-breakpoint

-- ─── PendingIncomeOccurrences ──────────────────────────────────────────────
DROP POLICY IF EXISTS "pendings_group_member_select" ON "PendingIncomeOccurrences";--> statement-breakpoint
CREATE POLICY "pendings_group_member_select" ON "PendingIncomeOccurrences" FOR SELECT
  USING (group_id IN (
    SELECT id FROM "OikosGroups"
    WHERE member_a = (select auth.uid()) OR member_b = (select auth.uid())
  ));--> statement-breakpoint

-- ─── RecurringExpenseRules ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "expense_rules_group_member_select" ON "RecurringExpenseRules";--> statement-breakpoint
CREATE POLICY "expense_rules_group_member_select" ON "RecurringExpenseRules" FOR SELECT
  USING (group_id IN (
    SELECT id FROM "OikosGroups"
    WHERE member_a = (select auth.uid()) OR member_b = (select auth.uid())
  ));--> statement-breakpoint

-- ─── PendingExpenseOccurrences ─────────────────────────────────────────────
DROP POLICY IF EXISTS "expense_pendings_group_member_select" ON "PendingExpenseOccurrences";--> statement-breakpoint
CREATE POLICY "expense_pendings_group_member_select" ON "PendingExpenseOccurrences" FOR SELECT
  USING (group_id IN (
    SELECT id FROM "OikosGroups"
    WHERE member_a = (select auth.uid()) OR member_b = (select auth.uid())
  ));--> statement-breakpoint

-- ─── InvoiceCredentials ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "invoice_credentials_owner_select" ON "InvoiceCredentials";--> statement-breakpoint
CREATE POLICY "invoice_credentials_owner_select" ON "InvoiceCredentials" FOR SELECT
  USING (
    user_id = (select auth.uid())
    AND group_id IN (
      SELECT id FROM "OikosGroups"
      WHERE member_a = (select auth.uid()) OR member_b = (select auth.uid())
    )
  );--> statement-breakpoint

-- ─── InvoiceImportRuns ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "invoice_runs_group_member_select" ON "InvoiceImportRuns";--> statement-breakpoint
CREATE POLICY "invoice_runs_group_member_select" ON "InvoiceImportRuns" FOR SELECT
  USING (
    group_id IN (
      SELECT id FROM "OikosGroups"
      WHERE member_a = (select auth.uid()) OR member_b = (select auth.uid())
    )
  );--> statement-breakpoint

DROP POLICY IF EXISTS "invoice_runs_owner_insert" ON "InvoiceImportRuns";--> statement-breakpoint
CREATE POLICY "invoice_runs_owner_insert" ON "InvoiceImportRuns" FOR INSERT
  WITH CHECK (
    user_id = (select auth.uid())
    AND group_id IN (
      SELECT id FROM "OikosGroups"
      WHERE member_a = (select auth.uid()) OR member_b = (select auth.uid())
    )
  );--> statement-breakpoint

DROP POLICY IF EXISTS "invoice_runs_owner_update" ON "InvoiceImportRuns";--> statement-breakpoint
CREATE POLICY "invoice_runs_owner_update" ON "InvoiceImportRuns" FOR UPDATE
  USING (
    user_id = (select auth.uid())
    AND group_id IN (
      SELECT id FROM "OikosGroups"
      WHERE member_a = (select auth.uid()) OR member_b = (select auth.uid())
    )
  );--> statement-breakpoint

-- ─── InvoiceImportSnapshots ────────────────────────────────────────────────
DROP POLICY IF EXISTS "invoice_snapshots_group_member_select" ON "InvoiceImportSnapshots";--> statement-breakpoint
CREATE POLICY "invoice_snapshots_group_member_select" ON "InvoiceImportSnapshots" FOR SELECT
  USING (
    group_id IN (
      SELECT id FROM "OikosGroups"
      WHERE member_a = (select auth.uid()) OR member_b = (select auth.uid())
    )
  );--> statement-breakpoint

-- ─── MonthlyReviewSnapshots ────────────────────────────────────────────────
DROP POLICY IF EXISTS "monthly_review_snapshot_member_select" ON "MonthlyReviewSnapshots";--> statement-breakpoint
CREATE POLICY "monthly_review_snapshot_member_select" ON "MonthlyReviewSnapshots" FOR SELECT
  USING (group_id IN (
    SELECT id FROM "OikosGroups"
    WHERE member_a = (select auth.uid()) OR member_b = (select auth.uid())
  ));--> statement-breakpoint

-- ─── MonthlyReviewMessages ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "monthly_review_message_member_select" ON "MonthlyReviewMessages";--> statement-breakpoint
CREATE POLICY "monthly_review_message_member_select" ON "MonthlyReviewMessages" FOR SELECT
  USING (group_id IN (
    SELECT id FROM "OikosGroups"
    WHERE member_a = (select auth.uid()) OR member_b = (select auth.uid())
  ));--> statement-breakpoint

-- ─── PartnerQuizSessions ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "partner_quiz_session_member_select" ON "PartnerQuizSessions";--> statement-breakpoint
CREATE POLICY "partner_quiz_session_member_select" ON "PartnerQuizSessions" FOR SELECT
  USING (group_id IN (
    SELECT id FROM "OikosGroups"
    WHERE member_a = (select auth.uid()) OR member_b = (select auth.uid())
  ));--> statement-breakpoint

-- ─── PartnerQuizAnswers ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "partner_quiz_answer_member_select" ON "PartnerQuizAnswers";--> statement-breakpoint
CREATE POLICY "partner_quiz_answer_member_select" ON "PartnerQuizAnswers" FOR SELECT
  USING (session_id IN (
    SELECT s.id FROM "PartnerQuizSessions" s
    JOIN "OikosGroups" g ON g.id = s.group_id
    WHERE g.member_a = (select auth.uid()) OR g.member_b = (select auth.uid())
  ));
