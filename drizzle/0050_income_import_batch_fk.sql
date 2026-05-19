-- v1.1.1 #607 — Parallel `import_batch_id` FK on IncomeTransactions.
--
-- v1.1.0 #556 (migration 0049) added `import_batch_id` to CashTransactions
-- only, because the spec hadn't settled how income rows would flow through
-- the importer. v1.1.1 ships the auth-side wizard, which routes Honeydue /
-- Spendee / CWMoney income rows to IncomeTransactions. To keep batch rollback
-- consistent (one button undoes everything the user just wrote), income
-- transactions need the same nullable FK + partial index.

ALTER TABLE "IncomeTransactions"
  ADD COLUMN "import_batch_id" uuid REFERENCES "ImportBatches"("id");

COMMENT ON COLUMN "IncomeTransactions"."import_batch_id" IS
  '#607 來自哪次 CSV 匯入；NULL = 非匯入產生。rollback 時 DELETE WHERE 此欄。';

-- Mirror the partial index from CashTransactions: hot reads stay cheap when
-- the column is NULL (the common case), while batch rollback / batch listing
-- scans use the index path.
CREATE INDEX "IncomeTransactions_import_batch_idx"
  ON "IncomeTransactions" ("import_batch_id")
  WHERE import_batch_id IS NOT NULL;
