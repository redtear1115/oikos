-- 0069: invoice credential retention — the verification ciphertext lives only
-- as long as the credential is live (#1289, #1376) — plus one lock-order fix
-- in the account-deletion processor (#1427). v1.6.3.
--
-- Three parts, one migration:
--
-- A. Schema.
--    * InvoiceCredentials.verification_code_encrypted becomes nullable and a
--      CHECK ties it to liveness: live row ⇔ ciphertext present. Every
--      soft-delete path (delete, refresh, removePartner) now clears the column
--      in the same UPDATE; a path that forgets fails with 23514 instead of
--      silently keeping the secret.
--    * Backfill: soft-deleted rows lose their ciphertext before the CHECK is
--      added (0 rows on prod and dev when written; kept for correctness).
--    * InvoiceImportRuns.credential_id becomes nullable, FK ON DELETE SET NULL.
--      A run is the group's import audit trail and outlives the credential.
--      Before this, a credential with runs could not be hard-deleted: the
--      cleanup cron (0017 order) and _delete_group_cascade could both fail on
--      the FK, and process_account_deletions swallows the error per user, so
--      the account deletion retried every day, forever.
--
-- B. process_account_deletions (last defined in 0068, body copied verbatim)
--    * hard-deletes the deleting user's InvoiceCredentials in every group
--      before auth.users is deleted. Runs keep their row with credential_id
--      NULL.
--    * #1427: locks the group's Outings rows before the group row. The outing
--      actions lock Outings, then OikosGroups (actions/outing.ts); 0068 locked
--      OikosGroups, then _delete_group_cascade deleted the Outings — the
--      reverse order. A solo user writing to an outing at the moment the job
--      ran could deadlock with it (40P01): the job's WARNING, the deletion
--      postponed a day, or the user's outing write failing once.
--    _delete_group_cascade (0066) is not redefined: it already deletes Runs,
--    Snapshots, Credentials in that order, which stays FK-safe.
--
-- C. cleanup-soft-deleted re-scheduled from 0066's body verbatim, plus:
--      InvoiceCredentials  30 days after soft-delete
--      InvoiceImportRuns   1 year after started_at
--    Any re-schedule of this job must start from the highest-numbered
--    migration that schedules it. #1376 is what happens otherwise: 0021 copied
--    0012's body and silently dropped 0017's two invoice lines; nothing
--    errored, the rows were just never purged.
--    tests/cleanup-cron-lineage.test.ts turns red if a later re-schedule
--    drops a table an earlier one purged.
--
-- Residual risk, accepted: nulling or deleting a value does not remove it
-- from Supabase point-in-time recovery, backups or WAL. A deleted ciphertext
-- stays recoverable from those until they age out of their retention window.
-- App code cannot control that.
--
-- Failure looks like: nothing errors. A soft-deleted credential that still
-- carries ciphertext is impossible after this migration (the CHECK); a purge
-- that never runs shows up only as soft-deleted rows older than 30 days.
-- Rollback: scripts/rollback/0069_invoice_credential_retention.down.sql.
--
-- Idempotent: safe to re-apply.

-- ─── A. Schema ──────────────────────────────────────────────────────────────
ALTER TABLE "InvoiceCredentials" ALTER COLUMN verification_code_encrypted DROP NOT NULL;
--> statement-breakpoint

UPDATE "InvoiceCredentials"
SET verification_code_encrypted = NULL
WHERE deleted_at IS NOT NULL AND verification_code_encrypted IS NOT NULL;
--> statement-breakpoint

DO $$
BEGIN
  ALTER TABLE "InvoiceCredentials"
    ADD CONSTRAINT invoice_credentials_secret_iff_live
    CHECK ((deleted_at IS NULL) = (verification_code_encrypted IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

ALTER TABLE "InvoiceImportRuns" ALTER COLUMN credential_id DROP NOT NULL;
--> statement-breakpoint

-- Drop every FK on InvoiceImportRuns(credential_id), whatever its name
-- ("InvoiceImportRuns_credential_id_fkey" on dev and on a fresh migrate), then
-- add the one SET NULL constraint. A leftover NO ACTION FK under another name
-- would keep blocking the delete.
DO $$
DECLARE
  v_con text;
BEGIN
  FOR v_con IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.conrelid = '"InvoiceImportRuns"'::regclass
      AND c.contype = 'f'
      AND a.attname = 'credential_id'
  LOOP
    EXECUTE format('ALTER TABLE "InvoiceImportRuns" DROP CONSTRAINT %I', v_con);
  END LOOP;
END $$;
--> statement-breakpoint

ALTER TABLE "InvoiceImportRuns"
  ADD CONSTRAINT "InvoiceImportRuns_credential_id_fkey"
  FOREIGN KEY (credential_id) REFERENCES "InvoiceCredentials"(id) ON DELETE SET NULL;
--> statement-breakpoint

-- ─── B. process_account_deletions ───────────────────────────────────────────
-- 0068's function, unchanged except for two statements:
--   * the Outings lock at the top of the per-group loop (#1427). Taken for
--     every group, before the group row is read, because solo-vs-paired is
--     only known after that read; the paired branch doesn't need it but only
--     holds it until the job's transaction ends.
--   * the InvoiceCredentials delete next to the PushTokens delete. 0068 moved
--     the per-user cleanup out of the per-group loop, so this covers
--     credentials in every group the user was ever in, including one they
--     left earlier.
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
        -- #1427: Outings before OikosGroups, the order the outing actions use.
        -- The solo branch deletes these rows (_delete_group_cascade).
        PERFORM 1 FROM "Outings" WHERE group_id = v_gid ORDER BY id FOR UPDATE;

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
      -- Hard delete: the user is gone. Their runs stay (credential_id SET NULL).
      DELETE FROM "InvoiceCredentials" WHERE user_id = v_uid;
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
--> statement-breakpoint

REVOKE EXECUTE ON FUNCTION public.process_account_deletions() FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.process_account_deletions() TO postgres, service_role;
--> statement-breakpoint

-- ─── C. cleanup-soft-deleted ────────────────────────────────────────────────
-- 0066's command verbatim, plus the two invoice lines at the end. Runs have
-- no deleted_at: they age out by started_at. The credential purge needs no
-- NOT EXISTS guard: runs pointing at it get credential_id NULL.
DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-soft-deleted');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
--> statement-breakpoint

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
  DELETE FROM "InvoiceCredentials"        WHERE deleted_at < NOW() - INTERVAL '30 days';
  DELETE FROM "InvoiceImportRuns"         WHERE started_at < NOW() - INTERVAL '1 year';
$$);
