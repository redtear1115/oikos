-- 0086: former-member recurring rules (#1588 S3) — pause + clear on removal.
-- spec: docs/superpowers/specs/ (recurring rules); plan: #1588
--
-- Why: when a partner leaves (removePartner, account deletion) their recurring
-- rules stayed live. pg_cron kept generating a pending card per period for a
-- person who is no longer in the ledger; the cards can never be confirmed
-- (`recipient_not_in_group`, or a misleading "partner already handled it"),
-- and a later partner would inherit the ex's salary rule, amounts and source
-- text. Failure looks like: nothing errors; the card stack on /dashboard fills
-- with cards that never go away, labelled with whoever is in the ledger now.
--
-- What this migration does (all three steps use the same predicates):
--   1. process_account_deletions: CREATE OR REPLACE. The body is copied from
--      0083_outing_link_join.sql (the latest migration that defines it; 0084
--      and 0085 do not touch it) and only adds the pause / clear / reset steps
--      for the user's rules in the group they leave behind (solo groups are
--      cascaded and need none).
--   2. removePartner does the same in actions/membership.ts (not in this file).
--   3. Data repair (idempotent): for every live rule whose person (income
--      recipient_id / expense paid_by) is not member_a / member_b of the
--      rule's group: set paused_at = COALESCE(paused_at, now()); delete the
--      unprocessed pending cards (skipped_at IS NULL AND resolved_tx_id IS
--      NULL) of those rules, whatever their earlier paused state; reset
--      proposed_paid_by on unprocessed expense cards whose rule is paid by a
--      current member but whose snapshot is not.
--
-- THIS CHANGES PROD DATA. Deleted pending cards are not regenerated and a
-- paused rule stays paused until the user re-assigns it and resumes (resume
-- moves next_occurrence_at to the future). The repair is not reversed by the
-- rollback. Written transactions, skipped and resolved cards, and rules of
-- current members are untouched.
--
-- Run after 0084 and 0085 (journal order). Needs no new column / grant.
-- Rollback: scripts/rollback/0086_former_member_rules.down.sql (restores the
-- 0083 function body; the data repair stays).
-- Idempotent: safe to re-apply (a second run of the repair changes 0 rows).

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

-- ─── data repair ────────────────────────────────────────────────────────────
UPDATE "RecurringIncomeRules" r
SET paused_at = COALESCE(r.paused_at, now())
FROM "OikosGroups" g
WHERE g.id = r.group_id AND r.deleted_at IS NULL AND r.paused_at IS NULL
  AND r.recipient_id IS DISTINCT FROM g.member_a
  AND r.recipient_id IS DISTINCT FROM g.member_b;
--> statement-breakpoint
UPDATE "RecurringExpenseRules" r
SET paused_at = COALESCE(r.paused_at, now())
FROM "OikosGroups" g
WHERE g.id = r.group_id AND r.deleted_at IS NULL AND r.paused_at IS NULL
  AND r.paid_by IS DISTINCT FROM g.member_a
  AND r.paid_by IS DISTINCT FROM g.member_b;
--> statement-breakpoint
DELETE FROM "PendingIncomeOccurrences" p
USING "RecurringIncomeRules" r, "OikosGroups" g
WHERE r.id = p.rule_id AND g.id = r.group_id AND r.deleted_at IS NULL
  AND p.skipped_at IS NULL AND p.resolved_tx_id IS NULL
  AND r.recipient_id IS DISTINCT FROM g.member_a
  AND r.recipient_id IS DISTINCT FROM g.member_b;
--> statement-breakpoint
DELETE FROM "PendingExpenseOccurrences" p
USING "RecurringExpenseRules" r, "OikosGroups" g
WHERE r.id = p.rule_id AND g.id = r.group_id AND r.deleted_at IS NULL
  AND p.skipped_at IS NULL AND p.resolved_tx_id IS NULL
  AND r.paid_by IS DISTINCT FROM g.member_a
  AND r.paid_by IS DISTINCT FROM g.member_b;
--> statement-breakpoint
UPDATE "PendingExpenseOccurrences" p
SET proposed_paid_by = r.paid_by
FROM "RecurringExpenseRules" r, "OikosGroups" g
WHERE r.id = p.rule_id AND g.id = r.group_id
  AND p.skipped_at IS NULL AND p.resolved_tx_id IS NULL
  AND (r.paid_by = g.member_a OR r.paid_by = g.member_b)
  AND p.proposed_paid_by IS DISTINCT FROM g.member_a
  AND p.proposed_paid_by IS DISTINCT FROM g.member_b;
