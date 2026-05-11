-- v0.15.0 #79 PR 3/4 — Epoch slicing.
--
-- A ledger can live through multiple relationships over time:
--   v1 a+b → b leaves → v2 a solo → a invites c → v3 a+c → ...
-- The brainstorm calls each segment an "epoch" or "chapter". Timeline /
-- monthly stats default to the current chapter; "過去的時光" lets users
-- pop back into a prior one.
--
-- `OikosGroups.current_epoch_started_at` (added in 0029) is enough to filter
-- "current vs past as one bucket" but doesn't let us enumerate prior epochs.
-- This table stores one row per chapter so the past-times list page can
-- render them with start/end + the partner of the time.
--
-- Backfill: every existing group gets one open row at its
-- current_epoch_started_at. Groups that already went through swap/leave
-- before this migration have no historical epoch metadata — those records
-- are lumped under the current epoch (acceptable: no users have used the
-- leave flow yet at the time of this migration).

CREATE TABLE "GroupEpochs" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "group_id"      uuid NOT NULL REFERENCES "OikosGroups"("id") ON DELETE CASCADE,
  "started_at"    timestamptz NOT NULL,
  "ended_at"      timestamptz,
  "member_a_id"   uuid NOT NULL REFERENCES "Profiles"("id"),
  "member_b_id"   uuid REFERENCES "Profiles"("id"),
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "group_epochs_chronology_check"
    CHECK ("ended_at" IS NULL OR "ended_at" > "started_at")
);

-- Reverse-chronological listing per group is the dominant access pattern
-- (past-times page + window lookups).
CREATE INDEX "group_epochs_by_group_started"
  ON "GroupEpochs" ("group_id", "started_at" DESC);

-- At most one open (ended_at IS NULL) row per group — the current chapter.
-- Past chapters always have an ended_at set when the next chapter opens.
CREATE UNIQUE INDEX "group_epochs_one_open_per_group"
  ON "GroupEpochs" ("group_id")
  WHERE "ended_at" IS NULL;

-- Backfill: insert a current open epoch row for every existing group, using
-- the group's existing `current_epoch_started_at` as the start.
INSERT INTO "GroupEpochs" ("group_id", "started_at", "member_a_id", "member_b_id")
SELECT "id", "current_epoch_started_at", "member_a", "member_b"
FROM "OikosGroups";

-- RLS — same shape as other group-scoped tables: members can read their own
-- group's epochs, writes are restricted to server-side service-role flow.
ALTER TABLE "GroupEpochs" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "group_epochs_select_members" ON "GroupEpochs" FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "OikosGroups" g
      WHERE g.id = "GroupEpochs"."group_id"
        AND (g.member_a = (select auth.uid()) OR g.member_b = (select auth.uid()))
    )
  );
