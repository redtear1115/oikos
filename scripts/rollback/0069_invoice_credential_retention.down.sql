-- ROLLBACK for drizzle/0069_invoice_credential_retention.sql — DEV ONLY, NEVER RUN AUTOMATICALLY.
-- Not a drizzle migration: drizzle-kit only runs files listed in drizzle/meta/_journal.json.
--
-- What it does:
--   1. Restores process_account_deletions to 0068's definition (copied verbatim
--      below), with its REVOKE/GRANT lines. This also undoes the #1427 lock
--      order.
--   2. Re-schedules cleanup-soft-deleted with 0066's command (copied verbatim
--      below): no invoice purge at all, which is the pre-0069 state (#1376).
--   3. Restores the InvoiceImportRuns credential FK to NO ACTION.
--   4. Drops the CHECK invoice_credentials_secret_iff_live.
--   5. Restores NOT NULL on InvoiceImportRuns.credential_id and on
--      InvoiceCredentials.verification_code_encrypted — each ONLY if no row
--      holds a NULL there. After 0069 has run for a while, runs whose
--      credential was purged and soft-deleted credentials both hold NULLs by
--      design; those columns then stay nullable and a NOTICE says so. The
--      cleared ciphertext is not restorable either way.
--   6. Removes 0069's row from drizzle.__drizzle_migrations so `db:migrate`
--      would re-apply it.
--
-- Run inside one transaction:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f <this file>

-- 1. process_account_deletions (0068)
CREATE OR REPLACE FUNCTION public.process_account_deletions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_uid uuid;
  v_gid uuid;
  v_grp "OikosGroups"%ROWTYPE;
  v_partner uuid;
  v_boundary timestamptz;
  v_count integer := 0;
BEGIN
  FOR v_uid IN
    SELECT id FROM "Profiles"
    WHERE deletion_requested_at IS NOT NULL
      AND deletion_requested_at < now() - interval '14 days'
  LOOP
    BEGIN
      FOR v_gid IN
        SELECT id FROM "OikosGroups" WHERE member_a = v_uid OR member_b = v_uid ORDER BY id
      LOOP
        -- Lock, then decide from the locked row: membership may have changed
        -- since the unlocked scan above.
        SELECT * INTO v_grp FROM "OikosGroups" WHERE id = v_gid FOR NO KEY UPDATE;
        CONTINUE WHEN NOT FOUND
          OR (v_grp.member_a IS DISTINCT FROM v_uid AND v_grp.member_b IS DISTINCT FROM v_uid);

        IF v_grp.member_b IS NULL THEN
          PERFORM public._delete_group_cascade(v_grp.id);
        ELSE
          PERFORM 1 FROM "GroupEpochs"
            WHERE group_id = v_grp.id AND ended_at IS NULL
            FOR NO KEY UPDATE;
          v_boundary := clock_timestamp();
          v_partner := CASE WHEN v_grp.member_a = v_uid THEN v_grp.member_b ELSE v_grp.member_a END;

          IF v_grp.member_a = v_uid THEN
            UPDATE "OikosGroups"
            SET member_a = v_partner,
                member_b = NULL,
                default_split_ratio_a = CASE WHEN default_split_ratio_a IS NOT NULL
                                             THEN 100 - default_split_ratio_a ELSE NULL END,
                pending_swap_proposed_by = NULL,
                pending_swap_expires_at = NULL,
                current_epoch_started_at = v_boundary
            WHERE id = v_grp.id;

            UPDATE "CashTransactions"      SET split_ratio_a = 100 - split_ratio_a
              WHERE group_id = v_grp.id AND split_ratio_a IS NOT NULL;
            UPDATE "RecurringExpenseRules" SET split_ratio_a = 100 - split_ratio_a
              WHERE group_id = v_grp.id AND split_ratio_a IS NOT NULL;
            UPDATE "PendingExpenseOccurrences" SET proposed_split_ratio_a = 100 - proposed_split_ratio_a
              WHERE group_id = v_grp.id AND proposed_split_ratio_a IS NOT NULL;
          ELSE
            UPDATE "OikosGroups"
            SET member_b = NULL,
                pending_swap_proposed_by = NULL,
                pending_swap_expires_at = NULL,
                current_epoch_started_at = v_boundary
            WHERE id = v_grp.id;
          END IF;

          UPDATE "GroupEpochs" SET ended_at = v_boundary
            WHERE group_id = v_grp.id AND ended_at IS NULL;
          INSERT INTO "GroupEpochs" (group_id, started_at, member_a_id, member_b_id)
            VALUES (v_grp.id, v_boundary, v_partner, NULL);

          UPDATE "GroupInvites" SET revoked_at = v_boundary
            WHERE group_id = v_grp.id AND accepted_at IS NULL AND revoked_at IS NULL;

          UPDATE "GroupBalance" SET balance = 0, version = version + 1 WHERE group_id = v_grp.id;
        END IF;
      END LOOP;

      DELETE FROM "PushTokens" WHERE user_id = v_uid;
      UPDATE "OutingParticipants" SET profile_id = NULL, display_name = '已離開的夥伴'
        WHERE profile_id = v_uid;

      DELETE FROM auth.users WHERE id = v_uid;

      -- Delete the profile if nothing references it any more; otherwise keep a
      -- scrubbed tombstone so the partner's ledger still resolves. Own block:
      -- the FK error must roll back only this DELETE, not the user's deletion.
      BEGIN
        DELETE FROM "Profiles" WHERE id = v_uid;
      EXCEPTION WHEN foreign_key_violation THEN
        UPDATE "Profiles"
        SET display_name = '已離開的夥伴', avatar_url = NULL, deletion_requested_at = NULL
        WHERE id = v_uid;
      END;

      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'process_account_deletions: failed for %: %', v_uid, SQLERRM;
    END;
  END LOOP;

  RETURN v_count;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.process_account_deletions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_account_deletions() TO postgres, service_role;

-- 2. cleanup-soft-deleted (0066)
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
  DELETE FROM "RecurringExpenseRules"     WHERE deleted_at < NOW() - INTERVAL '1 year';
  DELETE FROM "PendingExpenseOccurrences" WHERE skipped_at < NOW() - INTERVAL '90 days';
  DELETE FROM "OutingExpenseShares" WHERE expense_id IN (
    SELECT e.id FROM "OutingExpenses" e JOIN "Outings" o ON o.id = e.outing_id
    WHERE e.deleted_at < NOW() - INTERVAL '1 year' OR o.deleted_at < NOW() - INTERVAL '1 year');
  DELETE FROM "OutingExpenses" WHERE deleted_at < NOW() - INTERVAL '1 year'
    OR outing_id IN (SELECT id FROM "Outings" WHERE deleted_at < NOW() - INTERVAL '1 year');
  DELETE FROM "OutingSettlements" WHERE deleted_at < NOW() - INTERVAL '1 year'
    OR outing_id IN (SELECT id FROM "Outings" WHERE deleted_at < NOW() - INTERVAL '1 year');
  DELETE FROM "OutingParticipants"
    WHERE outing_id IN (SELECT id FROM "Outings" WHERE deleted_at < NOW() - INTERVAL '1 year');
  DELETE FROM "Outings"                   WHERE deleted_at < NOW() - INTERVAL '1 year';
$$);

-- 3. InvoiceImportRuns credential FK back to NO ACTION
ALTER TABLE "InvoiceImportRuns" DROP CONSTRAINT IF EXISTS "InvoiceImportRuns_credential_id_fkey";
ALTER TABLE "InvoiceImportRuns"
  ADD CONSTRAINT "InvoiceImportRuns_credential_id_fkey"
  FOREIGN KEY (credential_id) REFERENCES "InvoiceCredentials"(id);

-- 4. the liveness CHECK
ALTER TABLE "InvoiceCredentials" DROP CONSTRAINT IF EXISTS invoice_credentials_secret_iff_live;

-- 5. NOT NULL, only where no NULLs exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "InvoiceImportRuns" WHERE credential_id IS NULL) THEN
    RAISE NOTICE 'InvoiceImportRuns.credential_id has NULLs; left nullable';
  ELSE
    ALTER TABLE "InvoiceImportRuns" ALTER COLUMN credential_id SET NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM "InvoiceCredentials" WHERE verification_code_encrypted IS NULL) THEN
    RAISE NOTICE 'InvoiceCredentials.verification_code_encrypted has NULLs; left nullable';
  ELSE
    ALTER TABLE "InvoiceCredentials" ALTER COLUMN verification_code_encrypted SET NOT NULL;
  END IF;
END $$;

-- 6. migration bookkeeping
DELETE FROM drizzle.__drizzle_migrations
 WHERE hash = '46d8692288aac1e36e7ce4e3e14db9680320f2cc38858e9a3973a2a4ba59acd1' OR created_at = 1782700000000;
