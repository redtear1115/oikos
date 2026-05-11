-- v0.15.0 #142 — Insurance 要保人 (policy holder) reference.
--
-- The policy holder is the person who BUYS the policy and pays premiums.
-- Distinct from the 被保人 (insured / `insured` text column), which can be
-- anyone (relatives outside the group), the 要保人 is always someone in the
-- group — so we bind it to Profiles via FK. This lets the policy "follow"
-- the holder when they leave the group (future leave-group flow can reassign
-- or detach the asset based on this column).
--
-- Nullable: existing rows backfill to NULL; the form defaults to the viewer
-- on next edit so users gradually fill it in. No retroactive guessing.

ALTER TABLE "InsuranceDetails"
  ADD COLUMN "policy_holder_user_id" uuid REFERENCES "Profiles"("id");
