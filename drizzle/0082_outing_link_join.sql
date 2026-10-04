-- 0082: 出遊．朋友從分享連結加入 (#1558) — share-link and claim-token columns.
-- spec: docs/superpowers/specs/group-outing-design.md
--
-- Outings gets a share link; OutingParticipants gets a claim token. Neither
-- token is ever stored in plaintext:
--   * share_token_hash      sha256 hex of the share token, the lookup key for
--                           a visitor holding the link.
--   * share_token_encrypted lib/crypto v1 ciphertext of the same token, AAD
--                           `v1|Outings.share_token_encrypted|<outings.id>`,
--                           so members can re-display the link they already
--                           shared. Copied to another outing row it does not
--                           decrypt.
--   * share_token_rotated_at set when the link is created or reset.
--   * claim_token_hash      sha256 hex of the token in the claimant's cookie.
--   * claimed_at            when the slot was claimed. Account deletion
--                           (below) clears the claim token but keeps this
--                           non-NULL, so that slot is never claimable again.
-- All nullable, no backfill: links are created lazily on first "copy link".
--
-- Access is unchanged from 0066: RLS enabled with no policies and REVOKE from
-- anon/authenticated (plus column-level REVOKEs below for the #1471 guard).
-- futari_app reaches the new columns through its table-level grant (0072).
-- No new policies, no new grants.
--
-- Also: process_account_deletions (0074's definition, copied verbatim; no
-- later migration redefines it) clears claim_token_hash and pins claimed_at
-- where it unlinks the deleted user's participant rows. Without it the old
-- cookie keeps writing as the deleted person's slot, and a member's own slot
-- (bound, never claimed) turns claimable by anyone holding the share link.
-- Failure looks like: nothing errors; someone else is writing as
-- '已離開的夥伴'.
--
-- Rollback: scripts/rollback/0082_outing_link_join.down.sql
-- Idempotent: safe to re-apply.

ALTER TABLE "Outings" ADD COLUMN IF NOT EXISTS "share_token_hash" text;
--> statement-breakpoint
ALTER TABLE "Outings" ADD COLUMN IF NOT EXISTS "share_token_encrypted" text;
--> statement-breakpoint
ALTER TABLE "Outings" ADD COLUMN IF NOT EXISTS "share_token_rotated_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "OutingParticipants" ADD COLUMN IF NOT EXISTS "claim_token_hash" text;
--> statement-breakpoint
ALTER TABLE "OutingParticipants" ADD COLUMN IF NOT EXISTS "claimed_at" timestamp with time zone;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uq_outings_share_token_hash"
  ON "Outings"("share_token_hash") WHERE "share_token_hash" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_outing_participants_claim_token_hash"
  ON "OutingParticipants"("claim_token_hash") WHERE "claim_token_hash" IS NOT NULL;
--> statement-breakpoint

-- #1471 guard: every *_encrypted column carries its own column-level REVOKE.
-- 0066 already revoked the whole tables from these roles, so this changes
-- nothing on its own; it keeps the column covered if a later migration ever
-- grants table-level SELECT on Outings / OutingParticipants. The two hash
-- columns get the same treatment.
REVOKE ALL ("share_token_hash", "share_token_encrypted") ON TABLE "Outings" FROM anon, authenticated;
--> statement-breakpoint
REVOKE ALL ("claim_token_hash") ON TABLE "OutingParticipants" FROM anon, authenticated;
--> statement-breakpoint

-- ─── process_account_deletions ──────────────────────────────────────────────
-- 0074's function, unchanged except for the OutingParticipants unlink after
-- the group loop (#1558: claim_token_hash, claimed_at).
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
