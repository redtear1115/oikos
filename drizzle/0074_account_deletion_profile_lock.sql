-- 0074: account deletion takes the user's Profiles row before its re-read,
-- and the app can ask whether a profile still belongs to a live account
-- (#1449).
--
-- process_account_deletions (last defined in 0071, body copied verbatim)
-- re-reads the user's groups after locking them (#1433), but nothing stopped
-- a group from gaining the user AFTER that re-read. Two actions give a user
-- with no ledger a new one without touching any group the job locks:
-- acceptInvite (seats them as member_b of the inviter's ledger) and
-- createGroup (a new solo ledger). Both take the user's Profiles row FOR NO
-- KEY UPDATE first (#1432). Committing after the re-read, including while the
-- job's DELETE "Profiles" waits on that row, left the deleted user's profile
-- as a tombstone ('已離開的夥伴') seated in the partner's ledger, or as the
-- only member of an orphan solo ledger.
--
-- The fix, in two parts:
--
-- 1. Inside each attempt, after the per-group loop and before the re-read,
--    the job takes the user's Profiles row FOR UPDATE. Lock order stays
--    groups -> chapter rows -> Profiles, the order lockForEpochClose uses, so
--    no new cycle. An accept / createGroup holding the row makes the job
--    wait; once it commits, the re-read sees the new ledger and the attempt
--    rolls back to its savepoint (releasing this lock with the others) and
--    starts over.
--
-- 2. Job first: the action waits on the row and gets it once the job commits.
--    A hard-deleted profile is simply gone. But a user with history (a
--    removed partner still named in past chapters / expenses) is kept as a
--    tombstone, and the tombstone clears deletion_requested_at, so the action
--    would find an ordinary-looking row. profile_is_live() answers from
--    auth.users, which the job deletes in the same transaction: a durable
--    signal. The runtime role (futari_app, created by 0072) cannot read
--    schema auth, hence SECURITY DEFINER with an empty search_path,
--    executable by futari_app only (the job and migrations run as postgres).
--    The app calls it in its own statement AFTER the lock: inside the locking
--    statement it would read auth.users through that statement's snapshot,
--    taken before the wait, and still answer true.
--
-- Failure looks like (before this migration): nothing errors, no WARNING; the
-- job returns its normal count. The deleted user's profile is a tombstone that
-- is still member_b of the partner's OikosGroups row (with an open duo
-- GroupEpochs row naming it), or member_a of a solo OikosGroups row whose open
-- chapter no one can ever open again.
--
-- Rollback: scripts/rollback/0074_account_deletion_profile_lock.down.sql
-- (restores 0071's function, drops profile_is_live). Roll the app code back
-- FIRST: lib/db/queries/epoch.ts calls profile_is_live, and every createGroup
-- and acceptInvite fails while the function is missing. For the same reason
-- this migration must be applied before that code is deployed.
--
-- Idempotent: safe to re-apply.

-- ─── process_account_deletions ──────────────────────────────────────────────
-- 0071's function, unchanged except for the Profiles lock (the block marked
-- #1449) between the per-group loop and the re-read.
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

-- ─── profile_is_live ────────────────────────────────────────────────────────
-- True while the profile's account exists; false once process_account_deletions
-- has run for it, whether it deleted the Profiles row or kept a tombstone.
-- Called by lib/db/queries/epoch.ts (lockProfileRow) right after it locks the
-- row. Reveals only whether an auth account exists for a given id.
CREATE OR REPLACE FUNCTION public.profile_is_live(p_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT EXISTS (SELECT 1 FROM auth.users WHERE id = p_id)
$fn$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.profile_is_live(uuid) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.profile_is_live(uuid) TO futari_app;
