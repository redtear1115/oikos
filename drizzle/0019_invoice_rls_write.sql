-- v0.9.0 Phase A — RLS write policies for InvoiceImportRuns.
--
-- Spec section 「RLS」 reserves INSERT/UPDATE on InvoiceImportRuns for the
-- credential owner. Server actions go through the postgres role and bypass RLS,
-- so the production write path is unaffected — but without an explicit policy
-- the anon (Supabase JS) write path silently fails, which contradicts the
-- spec's design intent and would surprise anyone wiring up a future
-- client-side trigger. These policies make the contract explicit.
--
-- InvoiceImportSnapshots remains write-restricted to the server (no anon write
-- policy is added — see comment block in 0018_invoice_rls.sql for rationale).

-- ─── InvoiceImportRuns: owner-only INSERT ──────────────────────────────────
DROP POLICY IF EXISTS "invoice_runs_owner_insert" ON "InvoiceImportRuns";
CREATE POLICY "invoice_runs_owner_insert" ON "InvoiceImportRuns" FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND group_id IN (
      SELECT id FROM "OikosGroups" WHERE member_a = auth.uid() OR member_b = auth.uid()
    )
  );

-- ─── InvoiceImportRuns: owner-only UPDATE ──────────────────────────────────
-- (status transitions / finishedAt / counters are owner-driven)
DROP POLICY IF EXISTS "invoice_runs_owner_update" ON "InvoiceImportRuns";
CREATE POLICY "invoice_runs_owner_update" ON "InvoiceImportRuns" FOR UPDATE
  USING (
    user_id = auth.uid()
    AND group_id IN (
      SELECT id FROM "OikosGroups" WHERE member_a = auth.uid() OR member_b = auth.uid()
    )
  );
