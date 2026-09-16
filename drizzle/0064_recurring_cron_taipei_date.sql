-- #1262 — 定期收支的卡片永遠晚一個台北日。
--
-- Both generators run at '0 16 * * *'. pg_cron on prod reads that in GMT
-- (`cron.timezone = GMT`), so the job fires at 16:00 UTC = 00:00 Asia/Taipei
-- of the NEXT day. The job body then asked `CURRENT_DATE`, which in a UTC
-- session at 16:00 UTC is still the PREVIOUS day. So the card for period D was
-- inserted at Taipei D+1 00:00 and the couple saw it a day late, every time.
--
-- Measured on prod (cxbnlahuhdvrbwcnzoqo, 2026-09-16), read-only:
--     session TimeZone = UTC
--     cron.timezone    = GMT
--     lag_days (Taipei date of insert − period_start) = {"1": 21}
-- 21 of the last 21 pendings, no exceptions. Not a sampling artefact.
--
-- Fix: both jobs read the date in Taipei wall-clock, the same spelling 0026 /
-- 0061 already use for the monthly-review cron:
--     (NOW() AT TIME ZONE 'Asia/Taipei')::date
-- At the 16:00 UTC firing instant that evaluates to D+1 — the Taipei day that
-- has just begun — so a rule due on Taipei day P now produces its card at
-- 00:00 of day P instead of 00:00 of day P+1.
--
-- The schedule strings are deliberately NOT touched ('0 16 * * *' stays).
-- 00:00 Taipei is already the intended firing time; only the in-body date
-- basis was wrong. Moving the schedule too would make the next prod run
-- impossible to attribute to one change.
--
-- Both `CURRENT_DATE` sites inside each job must move together. The INSERT
-- picks the period and the UPDATE advances next_occurrence_at past it; if
-- their predicates disagree, one of two silent failures follows — the UPDATE
-- firing without the INSERT skips a period outright, and the INSERT firing
-- without the UPDATE re-attempts the same period every night (swallowed by
-- ON CONFLICT, so the card just never moves on).
--
-- Switch-over night (the first run after this migration is applied, on Taipei
-- day X+1 00:00):
--   * Everything with period ≤ X−1 was already consumed by the previous run
--     (old basis at that run = X−1).
--   * This run's basis is X+1, so periods X and X+1 both satisfy the
--     predicate. Period X would have been generated tonight anyway (late, as
--     always); period X+1 is pulled forward one day — to its correct day.
--   * No rule can emit two periods in one run: the body advances
--     next_occurrence_at exactly once per execution, so a rule whose period is
--     X advances to X + interval and is done for the night. A rule can still
--     only catch up one period per day, which is the pre-existing behaviour.
--   * Nothing is skipped: the basis moves forward, never back, and the
--     predicate is `<=`.
--   So the visible effect for a user is: a rule due on the switch-over day
--   gets its card at the start of that day rather than the start of the next.
--   Some couples will see one extra card on that single night (the tail of the
--   old cadence plus the head of the new one) — those are two different rules'
--   cards, both due, neither duplicated.
--
-- The push notification (supabase/functions/send-recurring-push, fired at
-- '10 16 * * *' = Taipei 00:10) computed its `today` with
-- `new Date().toISOString().slice(0, 10)` — also UTC, also a day behind. It is
-- changed in the same PR. Shipping only this migration would replace the
-- one-day-late card with a card that appears on time and is announced the
-- following night.
--
-- cron.schedule() with an existing jobname replaces the command in place, so
-- no unschedule step is needed.

-- ─── generate-pending-income ──────────────────────────────────────────────
-- Body is 0016's, with both CURRENT_DATE occurrences moved to Taipei.
SELECT cron.schedule('generate-pending-income', '0 16 * * *', $$
  INSERT INTO "PendingIncomeOccurrences"
    (group_id, rule_id, period_start, proposed_amount, proposed_date)
  SELECT r.group_id, r.id, r.next_occurrence_at, r.amount, r.next_occurrence_at
  FROM "RecurringIncomeRules" r
  WHERE r.deleted_at IS NULL
    AND r.paused_at IS NULL
    AND r.next_occurrence_at <= (NOW() AT TIME ZONE 'Asia/Taipei')::date
    AND (r.ends_on IS NULL OR r.next_occurrence_at <= r.ends_on)
  ON CONFLICT (rule_id, period_start) DO NOTHING;

  UPDATE "RecurringIncomeRules"
  SET next_occurrence_at = compute_next_occurrence(next_occurrence_at, interval_months, day_of_month)
  WHERE deleted_at IS NULL
    AND paused_at IS NULL
    AND next_occurrence_at <= (NOW() AT TIME ZONE 'Asia/Taipei')::date
    AND (ends_on IS NULL OR next_occurrence_at <= ends_on);
$$);

-- ─── generate-pending-expense ─────────────────────────────────────────────
-- Body is 0063's (NOT 0021's — 0063 is the version actually live, and it is
-- the one that carries proposed_split_ratio_a from #1243; re-scheduling from
-- 0021 would drop that column again and silently reintroduce the bug), with
-- both CURRENT_DATE occurrences moved to Taipei. The asset auto-pause
-- statement is unchanged; it has no date predicate.
SELECT cron.schedule('generate-pending-expense', '0 16 * * *', $$
  INSERT INTO "PendingExpenseOccurrences"
    (group_id, rule_id, period_start, proposed_amount, proposed_date,
     proposed_description, proposed_paid_by, proposed_split_type,
     proposed_split_ratio_a)
  SELECT r.group_id, r.id, r.next_occurrence_at, r.amount, r.next_occurrence_at,
         r.description, r.paid_by, r.split_type, r.split_ratio_a
  FROM "RecurringExpenseRules" r
  LEFT JOIN "Assets" a ON a.id = r.asset_id
  WHERE r.deleted_at IS NULL
    AND r.paused_at IS NULL
    AND r.next_occurrence_at <= (NOW() AT TIME ZONE 'Asia/Taipei')::date
    AND (r.ends_on IS NULL OR r.next_occurrence_at <= r.ends_on)
    AND (r.asset_id IS NULL OR a.deleted_at IS NULL)
  ON CONFLICT (rule_id, period_start) DO NOTHING;

  UPDATE "RecurringExpenseRules"
  SET next_occurrence_at = compute_next_occurrence(next_occurrence_at, interval_months, day_of_month)
  WHERE deleted_at IS NULL
    AND paused_at IS NULL
    AND next_occurrence_at <= (NOW() AT TIME ZONE 'Asia/Taipei')::date
    AND (ends_on IS NULL OR next_occurrence_at <= ends_on);

  -- Asset soft-deleted → auto-pause the rule. User can edit the rule (clear or
  -- re-link asset) and resume from the settings page; we keep asset_id as an
  -- audit trail rather than nulling it out.
  UPDATE "RecurringExpenseRules" r
  SET paused_at = NOW()
  FROM "Assets" a
  WHERE r.asset_id = a.id
    AND r.deleted_at IS NULL
    AND r.paused_at IS NULL
    AND a.deleted_at IS NOT NULL;
$$);
