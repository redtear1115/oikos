-- v0.17.4 follow-up — Force `Trips.rate_snapshot.default` to equal the group's
-- `base_currency` for every existing trip.
--
-- Rationale: the trip-level default-currency picker is being removed (#410
-- follow-up). All trip expenses now denominate against the group's main-ledger
-- base currency. Removing the picker would silently re-interpret historical
-- TripExpenses whose `original_currency IS NULL` (= "use the trip's OLD
-- default") as "use the new default = base_currency", shifting their displayed
-- original currency.
--
-- Strategy per trip whose snapshot.default != base_currency:
--   1. Backfill TripExpenses.original_currency on NULL rows to the OLD default
--      so the historical "this row was in X" reading is preserved.
--   2. Ensure the snapshot's entries include base_currency with rate = 1
--      (insert if missing).
--   3. Set snapshot.default = upper(base_currency).
--   4. Mirror Trips.default_currency = upper(base_currency).
--
-- Trips whose snapshot already has default = base_currency are left alone.

DO $$
DECLARE
  r RECORD;
  old_def text;
  base text;
  snap jsonb;
  entries jsonb;
  has_base boolean;
BEGIN
  FOR r IN
    SELECT t.id,
           t.rate_snapshot,
           t.default_currency,
           upper(g.base_currency::text) AS base
    FROM "Trips" t
    JOIN "OikosGroups" g ON g.id = t.group_id
    WHERE t.deleted_at IS NULL
  LOOP
    snap := COALESCE(r.rate_snapshot, '{}'::jsonb);

    -- Skip legacy / malformed snapshots (handled by lib/trip-currency.parse on read).
    CONTINUE WHEN NOT (snap ? 'default' AND snap ? 'entries');

    old_def := upper(snap ->> 'default');
    base := r.base;
    CONTINUE WHEN old_def = base;

    entries := snap -> 'entries';
    has_base := EXISTS (
      SELECT 1
      FROM jsonb_array_elements(entries) AS e
      WHERE upper(e ->> 'code') = base
    );

    -- 1. Backfill NULL original_currency on this trip's expenses.
    UPDATE "TripExpenses"
      SET original_currency = old_def
      WHERE trip_id = r.id
        AND original_currency IS NULL
        AND deleted_at IS NULL;

    -- 2. Ensure base_currency entry exists in the snapshot (rate = 1).
    IF NOT has_base THEN
      entries := entries || jsonb_build_array(jsonb_build_object(
        'code', base,
        'label', NULL,
        'rate', 1
      ));
    END IF;

    -- 3 + 4. Swap default to base and mirror the column.
    UPDATE "Trips"
      SET rate_snapshot = jsonb_build_object('default', base, 'entries', entries),
          default_currency = base
      WHERE id = r.id;
  END LOOP;
END $$;

COMMENT ON COLUMN "Trips"."default_currency" IS
  'Trip default currency code. Since #410 follow-up: always equals the group''s base_currency (mirrors rate_snapshot.default). Kept as a column for query convenience.';
