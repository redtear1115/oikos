-- ROLLBACK for drizzle/0068_account_deletion_tombstone.sql — DEV ONLY, NEVER RUN AUTOMATICALLY.
-- Not a drizzle migration: drizzle-kit only runs files listed in drizzle/meta/_journal.json.
--
-- What it does:
--   1. Restores process_account_deletions to 0066's definition (copied verbatim
--      below), with its REVOKE/GRANT lines.
--   2. Removes 0068's row from drizzle.__drizzle_migrations so `db:migrate` would re-apply it.
--
-- Not reversed: 0068's backfill (deletion_requested_at cleared on already-
-- processed tombstones). The old value only made the job re-pick a row whose
-- account was already gone; restoring it would bring back the daily WARNING.
-- Run inside one transaction:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f <this file>

-- 1. process_account_deletions (0066)
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

          UPDATE "OutingParticipants" SET profile_id = NULL, display_name = '已離開的夥伴'
            WHERE profile_id = v_uid
              AND outing_id IN (SELECT id FROM "Outings" WHERE group_id = v_grp.id);

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

REVOKE EXECUTE ON FUNCTION public.process_account_deletions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_account_deletions() TO postgres, service_role;

-- 2. migration bookkeeping
DELETE FROM drizzle.__drizzle_migrations
 WHERE hash = '6046bf288a1cb4dd80ce2851e388dcc5ca7468a3636f197d91eb58d83fb40190' OR created_at = 1782600000000;
