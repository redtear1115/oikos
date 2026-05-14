-- v0.17.2 #42 — Isolated trip ledger.
--
-- Architecture decision (see docs/superpowers/specs/multi-currency-trip-design.md):
--   - TripExpenses is a separate table from CashTransactions. Trip UI reads
--     from here; main ledger (/records, stats, balance) reads CashTransactions
--     and does NOT see these rows. Natural isolation by table boundary.
--   - On trip end (Phase 4 of v0.17.2), a summary CashTransaction will be
--     written to fold the trip back into the main ledger. CashTransactions.trip_id
--     stays — that's the column those summary records will use to link back.
--   - Trips.rate_snapshot jsonb: copied from CurrencyRates at trip creation,
--     keys are `${from}_${to}` uppercase (e.g. "USD_TWD"). Locks FX for the
--     trip so later group-level rate edits don't drift trip displays.
--
-- split_ratio semantics on TripExpenses: payer's share % (0–100). Distinct
-- from CashTransactions.split_ratio_a, which is always member A's share %.

-- ─── Trips: rate_snapshot ──────────────────────────────────────────────────

ALTER TABLE "Trips"
  ADD COLUMN "rate_snapshot" jsonb;

COMMENT ON COLUMN "Trips"."rate_snapshot" IS
  'FX rate snapshot at trip creation. Keys: `${from}_${to}` uppercase, e.g. "USD_TWD". Values: numeric. Locks rates for the trip; later CurrencyRates edits don''t mutate trip displays.';

-- ─── TripExpenses ──────────────────────────────────────────────────────────

CREATE TABLE "TripExpenses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "trip_id" uuid NOT NULL REFERENCES "Trips"("id"),
  "paid_by" uuid NOT NULL REFERENCES "Profiles"("id"),
  "amount" integer NOT NULL,
  "original_currency" "currency_code",
  "original_amount" integer,
  "category" text NOT NULL,
  "split_type" "split_type" NOT NULL,
  "split_ratio" integer,
  "description" text,
  "transacted_at" timestamptz NOT NULL DEFAULT now(),
  "deleted_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "TripExpenses_original_currency_tuple"
    CHECK (
      (original_currency IS NULL AND original_amount IS NULL)
      OR
      (original_currency IS NOT NULL AND original_amount IS NOT NULL)
    ),
  CONSTRAINT "TripExpenses_split_ratio_range"
    CHECK (split_ratio IS NULL OR (split_ratio BETWEEN 0 AND 100)),
  CONSTRAINT "TripExpenses_weighted_requires_ratio"
    CHECK (
      (split_type = 'weighted' AND split_ratio IS NOT NULL)
      OR
      (split_type <> 'weighted' AND split_ratio IS NULL)
    )
);

COMMENT ON TABLE "TripExpenses" IS
  '#42 旅行子帳本明細. Isolated from CashTransactions: main ledger queries do not see these rows. Folded back via summary CashTransaction on trip end (Phase 4).';

COMMENT ON COLUMN "TripExpenses"."split_ratio" IS
  'Payer''s share % (0–100). Distinct from CashTransactions.split_ratio_a (always member A''s share). NOT NULL when split_type = weighted.';

CREATE INDEX "TripExpenses_trip_idx" ON "TripExpenses" ("trip_id")
  WHERE deleted_at IS NULL;
CREATE INDEX "TripExpenses_paid_by_idx" ON "TripExpenses" ("paid_by")
  WHERE deleted_at IS NULL;
CREATE INDEX "TripExpenses_deleted_at_idx" ON "TripExpenses" ("deleted_at")
  WHERE deleted_at IS NOT NULL;
