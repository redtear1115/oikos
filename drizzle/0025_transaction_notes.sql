-- Issue #34 — Add freeform shared notes/memo to CashTransactions.
--
-- Single nullable text column. Both partners can read and write it from the
-- AddSheet. Treated as part of the immutable transaction "row" — the existing
-- soft-delete-and-insert edit pattern (Phase 1 editTransaction) carries the
-- new notes value over.

ALTER TABLE "CashTransactions" ADD COLUMN "notes" text;
