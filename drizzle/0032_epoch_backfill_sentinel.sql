-- Corrective backfill for 0029_leave_group_swap + 0030_group_epochs.
--
-- 0029 added `OikosGroups.current_epoch_started_at NOT NULL DEFAULT now()`,
-- which silently stamped every existing group with the migration moment.
-- 0030 then propagated that stamp into `GroupEpochs.started_at` via:
--     INSERT INTO "GroupEpochs" ... SELECT current_epoch_started_at ...
-- As a result, all CashTransactions / Settlements / IncomeTransactions
-- created BEFORE the migration window were excluded by the new epoch-scoped
-- queries — the opposite of 0030's stated intent
-- (「lumped under the current epoch」).
--
-- Reset both fields to a sentinel pre-launch timestamp (2026-05-01 00:00
-- Asia/Taipei) for rows that look defaulted. The discriminator is
--   `current_epoch_started_at > created_at + 1 minute`
-- which is only true for rows the 0029 DEFAULT stamped after the fact:
-- new groups created post-migration set both fields at the same instant,
-- so the 1-minute tolerance distinguishes them from this batch without
-- needing a separate flag column.

UPDATE "OikosGroups"
SET current_epoch_started_at = TIMESTAMPTZ '2026-05-01 00:00:00+08'
WHERE current_epoch_started_at > created_at + INTERVAL '1 minute';

UPDATE "GroupEpochs" e
SET started_at = TIMESTAMPTZ '2026-05-01 00:00:00+08'
FROM "OikosGroups" g
WHERE e.group_id = g.id
  AND e.ended_at IS NULL
  AND e.started_at > g.created_at + INTERVAL '1 minute';
