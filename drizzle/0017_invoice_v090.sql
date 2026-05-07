-- v0.9.0 雲端發票 Phase A — schema additions.
--
-- Three concerns:
--   1. Extend "InvoiceCredentials" with nickname / status / lastSyncedAt
--   2. Create new audit tables InvoiceImportRuns + InvoiceImportSnapshots
--   3. Add partial unique index on CashTransactions(group_id, invoice_number)
--      so dedup is enforced at the DB level (active + has-invoice rows only)
--
-- See docs/superpowers/specs/0_9_0-cloud-invoice-design.md sections 「資料模型」
-- and 「折讓 / 作廢 自動沖銷」 for rationale. RLS lives in 0018_invoice_rls.sql.

-- ─── Enum for credential status ─────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invoice_credential_status') THEN
    CREATE TYPE invoice_credential_status AS ENUM ('active', 'invalid', 'revoked');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invoice_import_run_status') THEN
    CREATE TYPE invoice_import_run_status
      AS ENUM ('fetching', 'preview', 'committed', 'failed', 'cancelled');
  END IF;
END $$;

-- ─── Extend InvoiceCredentials ──────────────────────────────────────────────
ALTER TABLE "InvoiceCredentials"
  ADD COLUMN IF NOT EXISTS nickname text;

ALTER TABLE "InvoiceCredentials"
  ADD COLUMN IF NOT EXISTS status invoice_credential_status NOT NULL DEFAULT 'active';

ALTER TABLE "InvoiceCredentials"
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;

ALTER TABLE "InvoiceCredentials"
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- One barcode per (group, user). Can rebind after soft delete (active rows only).
CREATE UNIQUE INDEX IF NOT EXISTS invoice_credentials_uniq
  ON "InvoiceCredentials" (group_id, user_id, barcode)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS invoice_credentials_group_idx
  ON "InvoiceCredentials" (group_id) WHERE deleted_at IS NULL;

-- ─── InvoiceImportSnapshots ─────────────────────────────────────────────────
-- One row per invoice we've ever imported. Becomes the diff base for future
-- syncs (折讓 / 作廢 沖銷). PK = invoice_number (globally unique nationwide).
-- Never user-mutable; written by server actions only.
CREATE TABLE IF NOT EXISTS "InvoiceImportSnapshots" (
  invoice_number       text PRIMARY KEY,
  group_id             uuid NOT NULL REFERENCES "OikosGroups"(id),
  imported_amount      integer NOT NULL,
  imported_description text NOT NULL,
  imported_category    text NOT NULL,
  invoice_date         date NOT NULL,
  merchant_name        text NOT NULL,
  raw                  jsonb,                     -- full API response payload for forensics
  voided_at            timestamptz,               -- set when MoF reports 作廢
  last_synced_at       timestamptz NOT NULL DEFAULT NOW(),
  imported_at          timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS invoice_snapshots_group_idx
  ON "InvoiceImportSnapshots" (group_id, invoice_date DESC);

CREATE INDEX IF NOT EXISTS invoice_snapshots_active_idx
  ON "InvoiceImportSnapshots" (group_id) WHERE voided_at IS NULL;

-- ─── InvoiceImportRuns ──────────────────────────────────────────────────────
-- Audit log + debounce for each "click 匯入發票" action. No soft delete; cron
-- physically purges rows older than 1 year (extends cleanup-soft-deleted job).
CREATE TABLE IF NOT EXISTS "InvoiceImportRuns" (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id            uuid NOT NULL REFERENCES "OikosGroups"(id),
  credential_id       uuid NOT NULL REFERENCES "InvoiceCredentials"(id),
  user_id             uuid NOT NULL REFERENCES "Profiles"(id),
  range_start         date NOT NULL,
  range_end           date NOT NULL,
  status              invoice_import_run_status NOT NULL DEFAULT 'fetching',
  fetched_count       integer NOT NULL DEFAULT 0,
  committed_count     integer NOT NULL DEFAULT 0,
  skipped_dup_count   integer NOT NULL DEFAULT 0,
  skipped_void_count  integer NOT NULL DEFAULT 0,
  started_at          timestamptz NOT NULL DEFAULT NOW(),
  finished_at         timestamptz,
  error_msg           text
);

CREATE INDEX IF NOT EXISTS invoice_runs_group_idx
  ON "InvoiceImportRuns" (group_id, started_at DESC);

CREATE INDEX IF NOT EXISTS invoice_runs_credential_idx
  ON "InvoiceImportRuns" (credential_id, started_at DESC);

-- ─── CashTransactions partial unique on invoice_number ──────────────────────
-- Enforces "one invoice → at most one live cashTxn per group". Partial so
-- soft-deleted rows don't block re-import of the same invoice number after
-- user deletion.
CREATE UNIQUE INDEX IF NOT EXISTS cash_tx_invoice_uniq
  ON "CashTransactions" (group_id, invoice_number)
  WHERE invoice_number IS NOT NULL AND deleted_at IS NULL;

-- ─── Extend cleanup cron with invoice runs purge ────────────────────────────
DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-soft-deleted');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule('cleanup-soft-deleted', '0 3 * * 0', $$
  DELETE FROM "CashTransactions"          WHERE deleted_at < NOW() - INTERVAL '1 year';
  DELETE FROM "Settlements"               WHERE deleted_at < NOW() - INTERVAL '1 year';
  DELETE FROM "FuelLogs"                  WHERE deleted_at < NOW() - INTERVAL '1 year';
  DELETE FROM "IncomeTransactions"        WHERE deleted_at < NOW() - INTERVAL '1 year';
  DELETE FROM "RecurringIncomeRules"      WHERE deleted_at < NOW() - INTERVAL '1 year';
  DELETE FROM "PendingIncomeOccurrences"  WHERE skipped_at < NOW() - INTERVAL '90 days';
  DELETE FROM "InvoiceCredentials"        WHERE deleted_at < NOW() - INTERVAL '1 year';
  DELETE FROM "InvoiceImportRuns"         WHERE started_at < NOW() - INTERVAL '1 year';
$$);
