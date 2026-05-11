-- Issue #49 — pending / settled status for CashTransactions.
--
-- A pending record is "已承諾但未扣款" (e.g. credit-card slip not yet billed,
-- pre-authorisation, IOU). It shows up in the feed at lower opacity with a
-- 「待扣款」 badge but is excluded from GroupBalance until promoted to settled.
--
-- Default 'settled' so every existing row keeps the historic "已實際移動金錢"
-- semantics with no backfill required.
--
-- Status transitions (settled ⇄ pending) flow through the existing edit path
-- (soft-delete + insert), so no separate transition timestamp column is needed
-- for v1 — the new row's createdAt captures the moment.

CREATE TYPE record_status AS ENUM ('settled', 'pending');

ALTER TABLE "CashTransactions"
  ADD COLUMN "status" record_status NOT NULL DEFAULT 'settled';
