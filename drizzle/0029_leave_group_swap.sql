-- v0.15.0 #79 — Leave group / swap roles foundations.
--
-- Adds three columns on OikosGroups to track a pending member_a / member_b
-- swap proposal (needed because member_a cannot leave directly under our
-- `member_a NOT NULL` constraint — they must swap first), plus an epoch
-- timestamp that downstream features (timeline filter, monthly stats slice)
-- can use to scope rows to the *current* relationship chapter without
-- backfilling historical data.
--
-- Also adds `revoked_at` on GroupInvites so leaveGroup can invalidate any
-- in-flight invite tokens atomically with the leave action.

-- ─── OikosGroups ─────────────────────────────────────────────────────────────
ALTER TABLE "OikosGroups"
  ADD COLUMN "pending_swap_proposed_by" uuid REFERENCES "Profiles"("id"),
  ADD COLUMN "pending_swap_expires_at" timestamptz,
  ADD COLUMN "current_epoch_started_at" timestamptz NOT NULL DEFAULT now();

ALTER TABLE "OikosGroups"
  ADD CONSTRAINT "oikos_groups_pending_swap_proposed_by_check"
  CHECK (
    pending_swap_proposed_by IS NULL
    OR pending_swap_proposed_by = member_a
    OR pending_swap_proposed_by = member_b
  );

-- A pending proposal always has both fields, or neither.
ALTER TABLE "OikosGroups"
  ADD CONSTRAINT "oikos_groups_pending_swap_consistency_check"
  CHECK (
    (pending_swap_proposed_by IS NULL AND pending_swap_expires_at IS NULL)
    OR (pending_swap_proposed_by IS NOT NULL AND pending_swap_expires_at IS NOT NULL)
  );

-- ─── GroupInvites ────────────────────────────────────────────────────────────
ALTER TABLE "GroupInvites"
  ADD COLUMN "revoked_at" timestamptz;
