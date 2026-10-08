-- 0088: a past chapter keeps the name each person had when it closed (#1604 part 2).
-- positioning: docs/superpowers/specs/after-leaving-design.md (「人：停在當時」)
-- plan: #1604 S4
--
-- Why: a closed chapter read its members' names live from Profiles. After a
-- leave, the stayer saw the ex under whatever name the ex used today (or the
-- ex saw the stayer's new name), so a chapter that is over kept changing.
-- Failure looks like: nothing errors; open 過去的時光, tap an old chapter, and
-- the other person carries a name they picked months after the chapter ended.
--
-- What this migration does:
--   1. GroupEpochs gets member_a_name / member_b_name (text, NULL). Derived
--      data: the display names frozen at close. NULL while a chapter is open
--      or a slot is empty. No grant: 0080 revoked every anon / authenticated
--      privilege on GroupEpochs, ADD COLUMN adds none, the table is not in
--      supabase_realtime, and no definer function returns its rows.
--   2. Trigger snapshot_epoch_member_names, BEFORE INSERT OR UPDATE OF
--      ended_at. Fills a NULL name slot from Profiles.display_name when a row
--      is inserted already closed, or when ended_at goes NULL -> not NULL. It
--      never overwrites a name, so a later rename, an update of another
--      column, or a second close leaves the snapshot alone. Covers every close
--      path (acceptInvite, leaveGroup, removePartner, process_account_deletions)
--      and any future one. SECURITY INVOKER: the writers are futari_app (SELECT
--      on Profiles, UPDATE on GroupEpochs per 0072) and postgres (cron).
--   3. process_account_deletions: CREATE OR REPLACE. The body is 0086's,
--      byte for byte, plus ONE block after the retry loop (next to the
--      OutingParticipants scrub, inside the per-user BEGIN ... EXCEPTION):
--      every name slot of the deleted user, in EVERY group (a group they left
--      long ago, a chapter their partner closed during the grace period), is
--      set to 「已離開的夥伴」. A failure rolls it back with the rest of that
--      user's deletion. Any later migration that redefines this function must
--      keep the block, and its own rollback must restore THIS body.
--   4. Backfill + repair (idempotent): (a) closed chapters with a NULL name get
--      the current Profiles.display_name; (b) a slot whose member has no
--      auth.users row (account deleted) becomes 「已離開的夥伴」 whatever it
--      holds. (b) also repairs a name captured by a deletion cron running
--      while this migration applied.
--
-- Backfill limit: chapters closed before this migration show the name as of
-- the day it was applied, not the name at their close (that was never stored).
--
-- ORDER (hard): run after 0087 (journal order), and on prod BEFORE the code
-- deploy that reads the new columns. lib/db/schema.ts now lists them, and
-- `db.select().from(groupEpochs)` names every column, including the current
-- chapter read on every dashboard request. Code first fails with "column does
-- not exist" and the whole dashboard breaks. Old code on the new schema is
-- fine: it ignores the columns and the trigger fills them.
-- Apply window: OUTSIDE 16:00-17:30 UTC (the deletion cron runs at 16:30 UTC,
-- 0059). Check cron.job_run_details shows no running process_account_deletions
-- first. Right after applying, and again after the next cron run, this must be 0:
--   SELECT count(*) FROM "GroupEpochs" e
--   WHERE (NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = e.member_a_id)
--          AND e.member_a_name IS NOT NULL AND e.member_a_name <> '已離開的夥伴')
--      OR (e.member_b_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = e.member_b_id)
--          AND e.member_b_name IS NOT NULL AND e.member_b_name <> '已離開的夥伴');
-- If it is not 0, re-run the repair (the two (b) statements at the end).
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE, DROP TRIGGER IF
-- EXISTS + CREATE, and a second run of the backfill changes 0 rows.
-- Rollback: scripts/rollback/0088_epoch_name_snapshot.down.sql (revert the
-- code FIRST, then run it). It drops the trigger, sets both columns to NULL so
-- no real name of a later-deleted user survives, and restores the 0086 body.
-- The columns stay.

ALTER TABLE "GroupEpochs" ADD COLUMN IF NOT EXISTS "member_a_name" text;
--> statement-breakpoint
ALTER TABLE "GroupEpochs" ADD COLUMN IF NOT EXISTS "member_b_name" text;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.snapshot_epoch_member_names()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NEW.ended_at IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    -- Only the close itself (NULL -> not NULL). A re-close keeps the snapshot.
    IF OLD.ended_at IS NOT NULL THEN
      RETURN NEW;
    END IF;
  END IF;
  -- Never overwrite: a slot that already holds a name keeps it.
  IF NEW.member_a_name IS NULL THEN
    SELECT p.display_name INTO NEW.member_a_name
      FROM "Profiles" p WHERE p.id = NEW.member_a_id;
  END IF;
  IF NEW.member_b_id IS NOT NULL AND NEW.member_b_name IS NULL THEN
    SELECT p.display_name INTO NEW.member_b_name
      FROM "Profiles" p WHERE p.id = NEW.member_b_id;
  END IF;
  RETURN NEW;
END;
$fn$;
--> statement-breakpoint

REVOKE EXECUTE ON FUNCTION public.snapshot_epoch_member_names() FROM PUBLIC, anon, authenticated;
--> statement-breakpoint

DROP TRIGGER IF EXISTS "GroupEpochs_snapshot_member_names" ON "GroupEpochs";
--> statement-breakpoint
CREATE TRIGGER "GroupEpochs_snapshot_member_names"
  BEFORE INSERT OR UPDATE OF ended_at ON "GroupEpochs"
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_epoch_member_names();
--> statement-breakpoint

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

              -- #1588: the leaving user's recurring rules stop here, the same
              -- steps as removePartner (actions/membership.ts) and the data
              -- repair below. Pause by person (COALESCE keeps an earlier
              -- paused_at); delete the unprocessed cards of those rules
              -- whatever their earlier paused state (skipped / resolved cards
              -- and written transactions stay); reset stale payer snapshots
              -- on the partner's rules to the rule's payer.
              UPDATE "RecurringIncomeRules"
                SET paused_at = COALESCE(paused_at, v_boundary)
                WHERE group_id = v_grp.id AND recipient_id = v_uid AND deleted_at IS NULL;
              UPDATE "RecurringExpenseRules"
                SET paused_at = COALESCE(paused_at, v_boundary)
                WHERE group_id = v_grp.id AND paid_by = v_uid AND deleted_at IS NULL;
              DELETE FROM "PendingIncomeOccurrences"
                WHERE group_id = v_grp.id AND skipped_at IS NULL AND resolved_tx_id IS NULL
                  AND rule_id IN (
                    SELECT id FROM "RecurringIncomeRules"
                    WHERE group_id = v_grp.id AND recipient_id = v_uid AND deleted_at IS NULL);
              DELETE FROM "PendingExpenseOccurrences"
                WHERE group_id = v_grp.id AND skipped_at IS NULL AND resolved_tx_id IS NULL
                  AND rule_id IN (
                    SELECT id FROM "RecurringExpenseRules"
                    WHERE group_id = v_grp.id AND paid_by = v_uid AND deleted_at IS NULL);
              UPDATE "PendingExpenseOccurrences" p
                SET proposed_paid_by = r.paid_by
                FROM "RecurringExpenseRules" r
                WHERE r.id = p.rule_id AND p.group_id = v_grp.id
                  AND p.skipped_at IS NULL AND p.resolved_tx_id IS NULL
                  AND p.proposed_paid_by = v_uid AND r.paid_by = v_partner;

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
      -- #1604: the user's name, frozen on every chapter they were in
      -- (0088), becomes 「已離開的夥伴」 in every group: their current one, one
      -- they left long ago, and a chapter their partner closed during the
      -- grace period. After the retry loop, so a rolled-back attempt cannot
      -- undo it; inside this user's block, so a failure undoes it with the rest.
      UPDATE "GroupEpochs" SET member_a_name = '已離開的夥伴' WHERE member_a_id = v_uid;
      UPDATE "GroupEpochs" SET member_b_name = '已離開的夥伴' WHERE member_b_id = v_uid;

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

-- ─── backfill + repair (idempotent) ─────────────────────────────────────────
-- (a) closed chapters with no snapshot yet: today's name (the backfill limit).
UPDATE "GroupEpochs" e
SET member_a_name = p.display_name
FROM "Profiles" p
WHERE p.id = e.member_a_id AND e.ended_at IS NOT NULL AND e.member_a_name IS NULL;
--> statement-breakpoint
UPDATE "GroupEpochs" e
SET member_b_name = p.display_name
FROM "Profiles" p
WHERE p.id = e.member_b_id AND e.ended_at IS NOT NULL AND e.member_b_name IS NULL;
--> statement-breakpoint
-- (b) a member whose account is gone (no auth.users row): the placeholder,
-- whatever the slot holds. Also the repair for the apply-vs-cron race.
UPDATE "GroupEpochs" e
SET member_a_name = '已離開的夥伴'
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = e.member_a_id)
  AND e.member_a_name IS DISTINCT FROM '已離開的夥伴';
--> statement-breakpoint
UPDATE "GroupEpochs" e
SET member_b_name = '已離開的夥伴'
WHERE e.member_b_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = e.member_b_id)
  AND e.member_b_name IS DISTINCT FROM '已離開的夥伴';
