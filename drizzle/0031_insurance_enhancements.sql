-- v0.15.0 #127 — Insurance asset enhancements.
--
-- Adds a per-policy "renewal reminder window" (in days) used by the asset list
-- card to decide when to escalate the single-year policy badge from warning
-- (≤ 60 days) to urgent / red (≤ reminder_days_before). Defaults to 30 so
-- existing single-year policies pick up the design's default red threshold
-- without a backfill step.
--
-- Multi-year and savings policies ignore this field at render time but it
-- lives on the same table to keep the schema flat (we don't need a discrete
-- "policy reminders" sub-table for a single integer).

ALTER TABLE "InsuranceDetails"
  ADD COLUMN "reminder_days_before" integer NOT NULL DEFAULT 30;
