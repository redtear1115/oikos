-- v0.17.4 #410 — Trip-scoped self-serve currencies.
--
-- Trip currencies become free-text (per-trip choice). Multi-currency picking,
-- rate setting, and the default currency move from the (deprecated) group-wide
-- CurrencyRates table into Trips.rate_snapshot jsonb, with a richer shape:
--
--   { "default": "TWD",
--     "entries": [
--       { "code": "TWD", "label": null, "rate": 1 },
--       { "code": "JPY", "label": null, "rate": 0.22 },
--       { "code": "VND", "label": "越南盾", "rate": 0.0013 }
--     ] }
--
-- Reads accept both legacy `${FROM}_${TO}` and new shape; writes are new shape
-- only. This migration converts existing legacy rows in-place.
--
-- Main ledger (CashTransactions / IncomeTransactions / Settlements / OikosGroups
-- .base_currency) stays on the `currency_code` enum (4 controlled values) —
-- only trip-scoped columns widen to text.

-- ─── Drop enum on trip-scoped currency columns ─────────────────────────────

ALTER TABLE "Trips"
  ALTER COLUMN "default_currency" TYPE text USING "default_currency"::text,
  ALTER COLUMN "budget_currency" TYPE text USING "budget_currency"::text;

ALTER TABLE "TripExpenses"
  ALTER COLUMN "original_currency" TYPE text USING "original_currency"::text;

-- Length sanity (free-text but keep within reason).
ALTER TABLE "Trips"
  ADD CONSTRAINT "Trips_default_currency_len"
    CHECK ("default_currency" IS NULL OR length("default_currency") BETWEEN 1 AND 16),
  ADD CONSTRAINT "Trips_budget_currency_len"
    CHECK ("budget_currency" IS NULL OR length("budget_currency") BETWEEN 1 AND 16);

ALTER TABLE "TripExpenses"
  ADD CONSTRAINT "TripExpenses_original_currency_len"
    CHECK ("original_currency" IS NULL OR length("original_currency") BETWEEN 1 AND 16);

-- Normalise to uppercase — new shape stores uppercase codes in rate_snapshot,
-- columns should agree.
UPDATE "Trips"
  SET "default_currency" = upper("default_currency")
  WHERE "default_currency" IS NOT NULL;
UPDATE "Trips"
  SET "budget_currency" = upper("budget_currency")
  WHERE "budget_currency" IS NOT NULL;
UPDATE "TripExpenses"
  SET "original_currency" = upper("original_currency")
  WHERE "original_currency" IS NOT NULL;

-- ─── Reshape Trips.rate_snapshot from legacy to new shape ──────────────────
--
-- Legacy: { "TWD_USD": 0.032, "USD_TWD": 31.5, "TWD_JPY": 5.000, ... }
--   Each pair is `${FROM}_${TO}` (uppercase) → numeric rate.
--
-- New:    { default: "TWD", entries: [ { code, label, rate }, ... ] }
--   `rate` semantics: 1 unit of `code` = `rate` units of `default`.
--   `default` itself is included with rate = 1.
--
-- Strategy: per row, pick `default = upper(default_currency || base_currency || 'TWD')`,
-- then for each legacy key of form `${FROM}_${default}`, emit an entry with
-- rate = legacy value. Skip the inverse direction (we have both directions in
-- legacy so the direct one always exists when a pair was set).

DO $$
DECLARE
  r RECORD;
  def_code text;
  legacy jsonb;
  entries jsonb;
  seen text[];
  k text;
  pair text[];
  from_code text;
  to_code text;
  rate_val numeric;
BEGIN
  FOR r IN
    SELECT t.id, t.rate_snapshot, t.default_currency, g.base_currency::text AS base_currency
    FROM "Trips" t
    JOIN "OikosGroups" g ON g.id = t.group_id
  LOOP
    def_code := upper(COALESCE(r.default_currency, r.base_currency, 'TWD'));
    legacy := COALESCE(r.rate_snapshot, '{}'::jsonb);

    -- Already-migrated rows have {default, entries} shape; skip them.
    IF legacy ? 'default' AND legacy ? 'entries' THEN
      CONTINUE;
    END IF;

    entries := jsonb_build_array(jsonb_build_object(
      'code', def_code,
      'label', NULL,
      'rate', 1
    ));
    seen := ARRAY[def_code];

    FOR k IN SELECT * FROM jsonb_object_keys(legacy)
    LOOP
      pair := string_to_array(k, '_');
      CONTINUE WHEN array_length(pair, 1) <> 2;

      from_code := upper(pair[1]);
      to_code := upper(pair[2]);
      rate_val := (legacy ->> k)::numeric;

      IF to_code = def_code AND from_code <> def_code AND NOT (from_code = ANY(seen)) AND rate_val > 0 THEN
        entries := entries || jsonb_build_array(jsonb_build_object(
          'code', from_code,
          'label', NULL,
          'rate', rate_val
        ));
        seen := array_append(seen, from_code);
      END IF;
    END LOOP;

    UPDATE "Trips"
      SET rate_snapshot = jsonb_build_object('default', def_code, 'entries', entries)
      WHERE id = r.id;
  END LOOP;
END $$;

COMMENT ON COLUMN "Trips"."rate_snapshot" IS
  'FX snapshot at trip creation. New shape: {default: string, entries: [{code, label, rate}]}. Rate semantics: 1 unit of code = rate units of default. See lib/trip-currency.ts.';

COMMENT ON COLUMN "Trips"."default_currency" IS
  'Trip default currency code (free-text since #410). Authoritative default lives in rate_snapshot.default; this column mirrors it for query convenience.';

COMMENT ON COLUMN "TripExpenses"."original_currency" IS
  'Original currency code (free-text since #410). Must match an entry.code in the parent Trips.rate_snapshot.';

-- CurrencyRates table is marked deprecated in lib/db/schema.ts; left in place
-- for now (no drop). Future cleanup pass will remove it.
