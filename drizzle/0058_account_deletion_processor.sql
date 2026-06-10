-- 0058: backend account-deletion processor (run daily by pg_cron, see 0059).
-- Solo groups: full cascade delete. Paired groups: anonymize the leaver
-- (delete auth.users, keep a scrubbed Profiles tombstone) so the partner keeps
-- the shared ledger. Pure-DB + atomic per user; no Edge Function.

-- Helper: delete one group's entire subtree, FK-safe order (children -> parents).
-- Order derived from the live FK graph: pending occurrences -> transactions ->
-- fuel logs / asset details / rules -> assets -> trips -> remaining group
-- children -> the group row. CASCADE-backed children (CurrencyRates,
-- GroupEpochs, PushTokens, ImportErrors, Pending* via rules) drop with their
-- parents but are listed where deletion order still matters.
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
--> statement-breakpoint

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
--> statement-breakpoint

REVOKE EXECUTE ON FUNCTION public._delete_group_cascade(uuid) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.process_account_deletions() FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.process_account_deletions() TO postgres, service_role;
