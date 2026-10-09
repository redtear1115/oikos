-- 0091: an ended outing remembers the line it folded into the couple's ledger (#1635).
-- positioning: docs/superpowers/specs/group-outing-design.md (fold section)
--
-- Why: endOuting writes the member<->member suggested transfer into the main
-- ledger as a Settlement (#1634), but the ended outing kept listing that same
-- transfer as something still to pay. Failure looks like: nothing errors; an
-- ended outing shows "阿青 → 你 NT$2,750" and paying it pays the same money
-- twice. Deriving it later is unreliable (account deletion nulls
-- OutingParticipants.profile_id, a role swap flips orientation, and the epoch
-- close time and ended_at come from different clocks), so the end action
-- stores the folded line on the outing.
--
-- What this migration does (schema only, no backfill):
--   "Outings" gets fold_from_participant_id / fold_to_participant_id (plain
--   uuids) and fold_amount (outing minor units), all NULL, plus a CHECK that
--   they are all NULL or all set with fold_amount > 0 and from <> to. Older
--   folded outings keep NULL and behave as before.
--
-- NO foreign key on purpose: _delete_group_cascade (account deletion) and the
-- cleanup-soft-deleted cron both delete "OutingParticipants" in one statement
-- and "Outings" in the next, so an FK would fail the participant delete with
-- 23503 (account deletion never completes; the cron run deletes nothing), and
-- ON DELETE SET NULL would violate the CHECK. See the column comments.
--
-- Privileges: futari_app already holds table-level SELECT/INSERT/UPDATE/DELETE
-- on "Outings" (0072), which covers new columns. No grant change.

ALTER TABLE "Outings"
  ADD COLUMN IF NOT EXISTS fold_from_participant_id uuid,
  ADD COLUMN IF NOT EXISTS fold_to_participant_id uuid,
  ADD COLUMN IF NOT EXISTS fold_amount integer;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'outings_fold_record_check' AND conrelid = 'public."Outings"'::regclass
  ) THEN
    ALTER TABLE "Outings" ADD CONSTRAINT outings_fold_record_check CHECK (
      (fold_from_participant_id IS NULL AND fold_to_participant_id IS NULL AND fold_amount IS NULL)
      OR (fold_from_participant_id IS NOT NULL AND fold_to_participant_id IS NOT NULL
          AND fold_amount IS NOT NULL AND fold_amount > 0
          AND fold_from_participant_id <> fold_to_participant_id)
    );
  END IF;
END $$;
--> statement-breakpoint

COMMENT ON COLUMN "Outings".fold_from_participant_id IS
  'The debtor of the member<->member line endOuting folded into the ledger (#1635). Plain uuid, deliberately NO foreign key: _delete_group_cascade and the cleanup-soft-deleted cron delete OutingParticipants before Outings, so an FK would break both hard-delete paths.';
--> statement-breakpoint
COMMENT ON COLUMN "Outings".fold_to_participant_id IS
  'The creditor of the folded line (#1635). Plain uuid, deliberately NO foreign key (see fold_from_participant_id).';
--> statement-breakpoint
COMMENT ON COLUMN "Outings".fold_amount IS
  'The folded line in the outing''s minor units (#1635). All three fold_* columns are NULL or all set (outings_fold_record_check).';
