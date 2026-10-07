-- ROLLBACK for drizzle/0086_former_member_rules.sql — MANUAL ONLY, NEVER RUN AUTOMATICALLY.
-- Not a drizzle migration: drizzle-kit only runs files listed in drizzle/meta/_journal.json.
--
-- What it does: restore process_account_deletions to the
-- 0083 body (no pause / clear / reset of the leaving user's recurring rules).
--
-- NOT reversed: the 0086 data repair and anything removePartner already did.
-- Paused rules stay paused (resume them in the app after re-assigning),
-- deleted pending cards are not regenerated, reset payers stay reset.
-- Revert the code (actions/membership.ts, resumeRule guard) separately.

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
  v_gids uuid[];
  v_attempts integer;
BEGIN
  FOR v_uid IN
    SELECT id FROM "Profiles"
    WHERE deletion_requested_at IS NOT NULL
      AND deletion_requested_at < now() - interval '14 days'
  LOOP
    BEGIN
      -- #1433: the scan below is not locked. A group the user joined or
      -- created after it (leaveGroup's new solo ledger, a partner's ledger
      -- through acceptInvite) was never visited. Once this attempt holds its
      -- locks, re-read; if such a group exists, roll the attempt back (which
      -- releases its locks) and start over from a fresh scan, so every attempt
      -- still locks in 0069's order: ascending id, Outings before OikosGroups.
      v_attempts := 0;
      LOOP
        BEGIN
          v_gids := ARRAY(
            SELECT id FROM "OikosGroups" WHERE member_a = v_uid OR member_b = v_uid ORDER BY id
          );
          FOREACH v_gid IN ARRAY v_gids
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

          -- #1449: the user's own row, last (groups -> chapters -> Profiles,
          -- lockForEpochClose's order). An acceptInvite / createGroup holding
          -- it commits before the re-read below, which then sees the ledger it
          -- added; one that comes later waits until this transaction commits
          -- and finds the account gone (profile_is_live, app side).
          PERFORM 1 FROM "Profiles" WHERE id = v_uid FOR UPDATE;

          -- The groups locked above cannot gain the user while this holds
          -- their locks; a group outside them can only have committed since
          -- the scan.
          EXIT WHEN NOT EXISTS (
            SELECT 1 FROM "OikosGroups"
            WHERE (member_a = v_uid OR member_b = v_uid) AND id <> ALL (v_gids)
          );
          v_attempts := v_attempts + 1;
          IF v_attempts >= 3 THEN
            RAISE EXCEPTION 'groups kept changing during % attempts', v_attempts;
          END IF;
          RAISE EXCEPTION USING ERRCODE = 'OK433';
        EXCEPTION WHEN SQLSTATE 'OK433' THEN
          NULL;
        END;
      END LOOP;

      DELETE FROM "PushTokens" WHERE user_id = v_uid;
      -- Hard delete: the user is gone. Their runs stay (credential_id SET NULL).
      DELETE FROM "InvoiceCredentials" WHERE user_id = v_uid;
      -- #1558: clear claim_token_hash so the slot's old cookie stops working,
      -- and keep claimed_at non-NULL so the slot is never claimable again. A
      -- slot bound without a claim (a Futari member's own row) has no
      -- claimed_at; without the COALESCE it would come out of this UPDATE
      -- looking unclaimed (profile_id, claim_token_hash and claimed_at all
      -- NULL), and anyone holding the share link could take it over.
      UPDATE "OutingParticipants"
        SET profile_id = NULL, display_name = '已離開的夥伴',
            claim_token_hash = NULL, claimed_at = COALESCE(claimed_at, now())
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
