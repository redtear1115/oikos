-- 0068: account-deletion processor — tombstone whenever the profile can't be
-- deleted, and read the epoch boundary after the locks (#1377, v1.6.2).
--
-- Redefines process_account_deletions (last defined in 0066). Three changes:
--
-- 1. Tombstone fallback. 0058 chose delete-vs-scrub from "is the user in a
--    paired group right now". A user who left a pair earlier sits in a solo
--    group, so the processor tried to DELETE their Profiles row — which the
--    old group's ledger still references (GroupEpochs.member_*_id, paid_by,
--    Outings.created_by, …, all NO ACTION). The FK error rolled back the
--    user's whole block: auth.users kept the row, the request stayed pending,
--    and the job logged a WARNING for them every day, forever.
--    Now the profile delete runs in its own block; on foreign_key_violation
--    the row becomes the same scrubbed tombstone the paired branch leaves.
--
-- 2. deletion_requested_at is cleared on the tombstone. The scrubbed row of a
--    paired leaver kept it, so the next day's run picked the row again, found
--    no group, failed the same FK delete and logged the same WARNING. Cleared
--    = processed; the account is gone (auth.users deleted), nobody can sign in
--    as it to see the pending-deletion banner. The backfill below clears it on
--    rows already processed before this migration.
--
-- 3. Epoch boundary. The paired branch used now() — the job's start time —
--    for ended_at / started_at / current_epoch_started_at, after possibly
--    waiting on the group row. It now locks the group row, re-reads it, locks
--    the open epoch, and only then reads clock_timestamp(), so the boundary is
--    never earlier than a write that committed while the job waited. Lock
--    order OikosGroups → GroupEpochs (FOR NO KEY UPDATE), the same order the
--    membership actions use.
--
-- Also moved out of the per-group branch: PushTokens delete and the
-- OutingParticipants unlink now cover every group the user ever joined, not
-- only the one they were still paired in — a leaver's name in an earlier
-- group's ended outing is scrubbed the same way.
--
-- Failure looks like: nothing errors. Symptom of the old bug on prod is a
-- Profiles row with deletion_requested_at older than 14 days whose auth.users
-- row still exists, plus a daily 'process_account_deletions: failed for …'
-- WARNING in the Postgres log.
-- Rollback: scripts/rollback/0068_account_deletion_tombstone.down.sql.

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
--> statement-breakpoint

REVOKE EXECUTE ON FUNCTION public.process_account_deletions() FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.process_account_deletions() TO postgres, service_role;
--> statement-breakpoint

-- Backfill: tombstones processed before this migration still carry
-- deletion_requested_at. Processed = the auth.users row is gone (the per-user
-- block is atomic, so a failed run never deletes it).
UPDATE "Profiles" p
SET deletion_requested_at = NULL
WHERE p.deletion_requested_at IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id);
