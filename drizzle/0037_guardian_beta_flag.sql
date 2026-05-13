-- v0.16.0 #220 — Guardian (守護) beta flag.
--
-- Guardian was carved out of 愛物 as its own module — eventually a paid
-- feature. Until payments ship, visibility is gated by a per-group beta flag
-- that members can self-enable from Settings.
--
-- The gate runs through `canAccessGuardian(group)` in lib/guardian.ts, so the
-- future "hasSubscription || isBetaEnabled" cut-over is a one-file change.
-- Existing insurance data is untouched when the flag is off: rows stay in DB
-- and re-appear as soon as the flag flips back on.

ALTER TABLE "OikosGroups"
  ADD COLUMN "guardian_beta_enabled" boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN "OikosGroups"."guardian_beta_enabled" IS
  'Per-group beta opt-in for the Guardian (守護) module. Future paid-tier gate replaces this. See lib/guardian.ts#canAccessGuardian.';
