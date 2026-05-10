-- v0.15.0 — Weighted split support
-- Adds 'weighted' enum value to split_type and split_ratio_a columns
-- to support custom split ratios (e.g., 30:70 instead of just 50:50).

-- ─── Enum Extension ──────────────────────────────────────────────────────────
-- Add 'weighted' to split_type enum (postgres requires this outside transaction)
ALTER TYPE "public"."split_type" ADD VALUE 'weighted';

-- ─── OikosGroups ─────────────────────────────────────────────────────────────
-- Default split ratio for weighted splits: member A's share (1–99)
ALTER TABLE "OikosGroups" ADD COLUMN "default_split_ratio_a" integer;

-- ─── CashTransactions ────────────────────────────────────────────────────────
-- Split ratio for weighted splits: member A's share (1–99)
ALTER TABLE "CashTransactions" ADD COLUMN "split_ratio_a" integer;

-- ─── RecurringExpenseRules ───────────────────────────────────────────────────
-- Split ratio for weighted splits: member A's share (1–99)
ALTER TABLE "RecurringExpenseRules" ADD COLUMN "split_ratio_a" integer;

-- ─── PendingExpenseOccurrences ───────────────────────────────────────────────
-- Proposed split ratio for weighted splits: member A's share (1–99)
ALTER TABLE "PendingExpenseOccurrences" ADD COLUMN "proposed_split_ratio_a" integer;
