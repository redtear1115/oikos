-- v0.9.0 雲端發票 Phase A — RLS policies + Realtime publication.
--
-- Per spec section 「RLS」:
--   InvoiceCredentials  — owner-only (userId = auth.uid()) AND group-bound.
--                         partner cannot see your barcode / verification code.
--   InvoiceImportRuns   — group members SELECT (audit visible to both),
--                         INSERT/UPDATE limited to owner.
--   InvoiceImportSnapshots — group members SELECT (sync diff base used by both),
--                            INSERT/UPDATE only via server (no anon write policy).
--
-- Server-side reads/writes go through Drizzle (postgres role) which bypasses RLS.
-- These policies only affect anon (Supabase JS client) + Realtime delivery.

-- ─── InvoiceCredentials ─────────────────────────────────────────────────────
ALTER TABLE "InvoiceCredentials" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoice_credentials_owner_select" ON "InvoiceCredentials";
CREATE POLICY "invoice_credentials_owner_select" ON "InvoiceCredentials" FOR SELECT
  USING (
    user_id = auth.uid()
    AND group_id IN (
      SELECT id FROM "OikosGroups" WHERE member_a = auth.uid() OR member_b = auth.uid()
    )
  );

-- ─── InvoiceImportRuns ──────────────────────────────────────────────────────
ALTER TABLE "InvoiceImportRuns" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoice_runs_group_member_select" ON "InvoiceImportRuns";
CREATE POLICY "invoice_runs_group_member_select" ON "InvoiceImportRuns" FOR SELECT
  USING (
    group_id IN (
      SELECT id FROM "OikosGroups" WHERE member_a = auth.uid() OR member_b = auth.uid()
    )
  );

-- ─── InvoiceImportSnapshots ─────────────────────────────────────────────────
ALTER TABLE "InvoiceImportSnapshots" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoice_snapshots_group_member_select" ON "InvoiceImportSnapshots";
CREATE POLICY "invoice_snapshots_group_member_select" ON "InvoiceImportSnapshots" FOR SELECT
  USING (
    group_id IN (
      SELECT id FROM "OikosGroups" WHERE member_a = auth.uid() OR member_b = auth.uid()
    )
  );
-- INSERT/UPDATE on InvoiceImportSnapshots is intentionally NOT exposed to anon.
-- Snapshots are the diff base for 折讓 / 作廢 沖銷 and must only be written by
-- the commit-import server action (postgres role bypasses RLS). Surfacing a
-- client-side write policy would let a Supabase JS client poison the diff
-- base. See spec §「折讓 / 作廢 自動沖銷」 for the invariant.

-- (Phase A note: InvoiceImportRuns INSERT/UPDATE policies live in
-- 0019_invoice_rls_write.sql — added after RLS audit found the write side
-- missing.)

-- ─── Realtime publication ──────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
      AND tablename = 'InvoiceCredentials'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE "InvoiceCredentials";
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
      AND tablename = 'InvoiceImportRuns'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE "InvoiceImportRuns";
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
      AND tablename = 'InvoiceImportSnapshots'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE "InvoiceImportSnapshots";
  END IF;
END $$;
