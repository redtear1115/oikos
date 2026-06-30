-- #946 — Backfill missing open epoch rows.
--
-- Invariant: every group has exactly one open epoch (ended_at IS NULL),
-- enforced by the partial unique index from 0030. The 0030 backfill
-- established this for all groups existing at the time, but createGroup
-- never opened the initial row for groups created afterwards. Solo groups
-- (member_b IS NULL) created via onboarding therefore had zero epoch rows,
-- and /trips + trip creation threw '找不到當前章節' (500).
--
-- The forward fix (createGroup now opens the row) only covers new groups;
-- this repairs the groups already created without one. Mirrors the 0030
-- backfill: started_at = current_epoch_started_at, member_b_id carried as-is
-- (null for solo). Idempotent — only inserts where no open epoch exists, so
-- it can never violate the unique index nor disturb groups already correct.
INSERT INTO "GroupEpochs" ("group_id", "started_at", "member_a_id", "member_b_id")
SELECT g."id", g."current_epoch_started_at", g."member_a", g."member_b"
FROM "OikosGroups" g
WHERE NOT EXISTS (
  SELECT 1 FROM "GroupEpochs" e
  WHERE e."group_id" = g."id" AND e."ended_at" IS NULL
);
