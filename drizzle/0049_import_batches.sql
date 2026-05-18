-- v1.1.0 #556 — CSV import metadata + per-row error log.
--
-- Two new tables and one new column on CashTransactions:
--
--   1. ImportBatches — one row per "用戶按匯入" action. Sibling to
--      InvoiceImportRuns (0017) but kept separate: invoice imports have
--      voiding / debounce semantics that CSV imports don't share, and CSV
--      batches need rollback (delete all rows tagged by import_batch_id),
--      which invoice imports don't support.
--
--   2. ImportErrors — per-row failure log. Lets the result page render
--      "下載失敗行 CSV" without re-parsing. raw_row preserves the original
--      CSV cells as jsonb so the user can fix and re-upload.
--
--   3. CashTransactions.import_batch_id — nullable FK back to ImportBatches.
--      NULL = not from an import. Lets a batch be undone by deleting rows
--      that share this id and recomputing balance.
--
-- `source` / `status` are free-text for now — values stabilise once #552
-- (feature spec) lands; promote to pgEnum at that point.

-- ─── ImportBatches ─────────────────────────────────────────────────────────
CREATE TABLE "ImportBatches" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "group_id"        uuid NOT NULL REFERENCES "OikosGroups"("id"),
  "imported_by"     uuid NOT NULL REFERENCES "Profiles"("id"),
  "source"          text NOT NULL,
  "file_name"       text NOT NULL,
  "total_rows"      integer NOT NULL,
  "imported_count"  integer NOT NULL DEFAULT 0,
  "skipped_count"   integer NOT NULL DEFAULT 0,
  "error_count"     integer NOT NULL DEFAULT 0,
  "status"          text NOT NULL DEFAULT 'pending',
  "created_at"      timestamptz NOT NULL DEFAULT now(),
  "rolled_back_at"  timestamptz,
  CONSTRAINT "ImportBatches_status_valid"
    CHECK (status IN ('pending', 'completed', 'rolled_back')),
  CONSTRAINT "ImportBatches_rollback_consistent"
    CHECK (
      (status = 'rolled_back') = (rolled_back_at IS NOT NULL)
    ),
  CONSTRAINT "ImportBatches_counts_nonnegative"
    CHECK (
      total_rows >= 0
      AND imported_count >= 0
      AND skipped_count >= 0
      AND error_count >= 0
    )
);

COMMENT ON TABLE "ImportBatches" IS
  '#556 CSV 匯入 metadata。每次「按匯入」一筆 row，供 audit + rollback。';
COMMENT ON COLUMN "ImportBatches"."source" IS
  'CSV 來源類型 (cwmoney / spendee / honeydue / generic 等)。spec #552 鎖定後改 enum。';
COMMENT ON COLUMN "ImportBatches"."status" IS
  'pending = 寫入中；completed = 成功落地；rolled_back = 整批已回滾。';

CREATE INDEX "ImportBatches_group_created_idx"
  ON "ImportBatches" ("group_id", "created_at" DESC);

-- ─── ImportErrors ──────────────────────────────────────────────────────────
CREATE TABLE "ImportErrors" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "batch_id"      uuid NOT NULL REFERENCES "ImportBatches"("id") ON DELETE CASCADE,
  "row_number"    integer NOT NULL,
  "raw_row"       jsonb NOT NULL,
  "error_type"    text NOT NULL,
  "error_detail"  text,
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "ImportErrors_error_type_valid"
    CHECK (error_type IN (
      'parse_error', 'missing_field', 'invalid_date',
      'invalid_amount', 'duplicate'
    )),
  CONSTRAINT "ImportErrors_row_number_positive"
    CHECK (row_number > 0)
);

COMMENT ON TABLE "ImportErrors" IS
  '#556 CSV 匯入失敗行紀錄。raw_row 存原始 CSV 欄位 jsonb，供使用者修正後再匯入。';

CREATE INDEX "ImportErrors_batch_idx"
  ON "ImportErrors" ("batch_id", "row_number");

-- ─── CashTransactions: import_batch_id ─────────────────────────────────────
ALTER TABLE "CashTransactions"
  ADD COLUMN "import_batch_id" uuid REFERENCES "ImportBatches"("id");

COMMENT ON COLUMN "CashTransactions"."import_batch_id" IS
  '#556 來自哪次 CSV 匯入；NULL = 非匯入產生。rollback 時 DELETE WHERE 此欄。';

-- Partial index speeds up "rollback this batch" (DELETE) + "list imported
-- rows for batch X" reads without bloating the main hot-path on regular
-- writes where the column is NULL.
CREATE INDEX "CashTransactions_import_batch_idx"
  ON "CashTransactions" ("import_batch_id")
  WHERE import_batch_id IS NOT NULL;

-- ─── RLS ───────────────────────────────────────────────────────────────────
-- Mirror InvoiceImportRuns (0018): SELECT only for group members. All writes
-- go through service_role Server Actions (actions/importCsv.ts in #556 follow-up).
-- auth.uid() wrapped in (select ...) per 0045's initplan optimisation.

ALTER TABLE "ImportBatches" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "import_batches_group_member_select" ON "ImportBatches";
CREATE POLICY "import_batches_group_member_select" ON "ImportBatches" FOR SELECT
  USING (
    group_id IN (
      SELECT id FROM "OikosGroups"
      WHERE member_a = (select auth.uid()) OR member_b = (select auth.uid())
    )
  );

ALTER TABLE "ImportErrors" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "import_errors_group_member_select" ON "ImportErrors";
CREATE POLICY "import_errors_group_member_select" ON "ImportErrors" FOR SELECT
  USING (
    batch_id IN (
      SELECT b.id FROM "ImportBatches" b
      JOIN "OikosGroups" g ON g.id = b.group_id
      WHERE g.member_a = (select auth.uid()) OR g.member_b = (select auth.uid())
    )
  );
