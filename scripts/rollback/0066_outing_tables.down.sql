-- ROLLBACK for drizzle/0066_outing_tables.sql — DEV ONLY, NEVER RUN AUTOMATICALLY.
-- Not a drizzle migration: drizzle-kit only runs files listed in drizzle/meta/_journal.json.
--
-- What it does, in order:
--   1. Restores cleanup-soft-deleted to 0021's command (copied verbatim below).
--   2. Restores _delete_group_cascade and process_account_deletions to 0058's
--      definitions (copied verbatim below), with 0058's REVOKE/GRANT lines.
--   3. Drops the 5 outing tables and the outing_status enum. THIS DELETES ALL OUTING DATA.
--   4. Removes 0066's row from drizzle.__drizzle_migrations so `db:migrate` would re-apply it.
--
-- Step 2 must run before step 3's drops only in the sense that the new function
-- bodies reference the outing tables; plpgsql resolves tables at call time, so
-- the order below is safe either way.
-- Run inside one transaction:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f <this file>

-- 1. cron (0021)
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
$$);

-- 2. account-deletion functions (0058)
CREATE OR REPLACE FUNCTION public._delete_group_cascade(p_group uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  DELETE FROM "PendingExpenseOccurrences" WHERE group_id = p_group;
  DELETE FROM "PendingIncomeOccurrences"  WHERE group_id = p_group;
  DELETE FROM "TripExpenses" WHERE trip_id IN (SELECT id FROM "Trips" WHERE group_id = p_group);
  DELETE FROM "CashTransactions"   WHERE group_id = p_group;
  DELETE FROM "IncomeTransactions" WHERE group_id = p_group;
  DELETE FROM "FuelLogs" WHERE asset_id IN (SELECT id FROM "Assets" WHERE group_id = p_group);
  DELETE FROM "RecurringExpenseRules" WHERE group_id = p_group;
  DELETE FROM "RecurringIncomeRules"  WHERE group_id = p_group;
  DELETE FROM "InsuranceDetails" WHERE asset_id IN (SELECT id FROM "Assets" WHERE group_id = p_group);
  DELETE FROM "CarDetails"   WHERE asset_id IN (SELECT id FROM "Assets" WHERE group_id = p_group);
  DELETE FROM "HouseDetails" WHERE asset_id IN (SELECT id FROM "Assets" WHERE group_id = p_group);
  DELETE FROM "ChildDetails" WHERE asset_id IN (SELECT id FROM "Assets" WHERE group_id = p_group);
  DELETE FROM "PetDetails"   WHERE asset_id IN (SELECT id FROM "Assets" WHERE group_id = p_group);
  DELETE FROM "PlantDetails" WHERE asset_id IN (SELECT id FROM "Assets" WHERE group_id = p_group);
  DELETE FROM "Assets" WHERE group_id = p_group;
  DELETE FROM "Trips" WHERE group_id = p_group;
  DELETE FROM "PartnerQuizAnswers" WHERE session_id IN (SELECT id FROM "PartnerQuizSessions" WHERE group_id = p_group);
  DELETE FROM "PartnerQuizSessions" WHERE group_id = p_group;
  DELETE FROM "InvoiceImportRuns"      WHERE group_id = p_group;
  DELETE FROM "InvoiceImportSnapshots" WHERE group_id = p_group;
  DELETE FROM "InvoiceCredentials"     WHERE group_id = p_group;
  DELETE FROM "ImportBatches" WHERE group_id = p_group;
  DELETE FROM "MonthlyReviewMessages"  WHERE group_id = p_group;
  DELETE FROM "MonthlyReviewSnapshots" WHERE group_id = p_group;
  DELETE FROM "GroupInvites" WHERE group_id = p_group;
  DELETE FROM "Settlements"  WHERE group_id = p_group;
  DELETE FROM "GroupBalance" WHERE group_id = p_group;
  DELETE FROM "OikosGroups" WHERE id = p_group;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.process_account_deletions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_uid uuid;
  v_grp record;
  v_partner uuid;
  v_has_paired boolean;
  v_count integer := 0;
BEGIN
  FOR v_uid IN
    SELECT id FROM "Profiles"
    WHERE deletion_requested_at IS NOT NULL
      AND deletion_requested_at < now() - interval '14 days'
  LOOP
    BEGIN
      v_has_paired := false;

      FOR v_grp IN
        SELECT * FROM "OikosGroups" WHERE member_a = v_uid OR member_b = v_uid
      LOOP
        IF v_grp.member_b IS NULL AND v_grp.member_a = v_uid THEN
          PERFORM public._delete_group_cascade(v_grp.id);
        ELSE
          v_has_paired := true;
          v_partner := CASE WHEN v_grp.member_a = v_uid THEN v_grp.member_b ELSE v_grp.member_a END;

          IF v_grp.member_a = v_uid THEN
            UPDATE "OikosGroups"
            SET member_a = v_partner,
                member_b = NULL,
                default_split_ratio_a = CASE WHEN default_split_ratio_a IS NOT NULL
                                             THEN 100 - default_split_ratio_a ELSE NULL END,
                pending_swap_proposed_by = NULL,
                pending_swap_expires_at = NULL,
                current_epoch_started_at = now()
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
                current_epoch_started_at = now()
            WHERE id = v_grp.id;
          END IF;

          UPDATE "GroupEpochs" SET ended_at = now()
            WHERE group_id = v_grp.id AND ended_at IS NULL;
          INSERT INTO "GroupEpochs" (group_id, started_at, member_a_id, member_b_id)
            VALUES (v_grp.id, now(), v_partner, NULL);

          UPDATE "GroupInvites" SET revoked_at = now()
            WHERE group_id = v_grp.id AND accepted_at IS NULL AND revoked_at IS NULL;
          DELETE FROM "PushTokens" WHERE user_id = v_uid;

          UPDATE "GroupBalance" SET balance = 0, version = version + 1 WHERE group_id = v_grp.id;
        END IF;
      END LOOP;

      DELETE FROM auth.users WHERE id = v_uid;

      IF v_has_paired THEN
        UPDATE "Profiles" SET display_name = '已離開的夥伴', avatar_url = NULL
          WHERE id = v_uid;
      ELSE
        DELETE FROM "Profiles" WHERE id = v_uid;
      END IF;

      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'process_account_deletions: failed for %: %', v_uid, SQLERRM;
    END;
  END LOOP;

  RETURN v_count;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public._delete_group_cascade(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.process_account_deletions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_account_deletions() TO postgres, service_role;

-- 3. tables + enum
DROP TABLE IF EXISTS "OutingExpenseShares";
DROP TABLE IF EXISTS "OutingExpenses";
DROP TABLE IF EXISTS "OutingSettlements";
DROP TABLE IF EXISTS "OutingParticipants";
DROP TABLE IF EXISTS "Outings";
DROP TYPE IF EXISTS "outing_status";

-- 4. migration bookkeeping. Hash = sha256 of drizzle/0066_outing_tables.sql as committed;
--    if 0066 was edited after being applied, look the row up by created_at instead.
DELETE FROM drizzle.__drizzle_migrations
 WHERE hash = '335c9f0e2f30a04e56c9216a0004c4a129a75507b55451a5e99c4e22f1ce82d7' OR created_at = 1782400000000;
