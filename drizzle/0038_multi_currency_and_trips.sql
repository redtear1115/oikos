-- v0.17.0 #68 #42 — Multi-currency support + trip sub-ledger.
--
-- Multi-currency (#68):
--   - OikosGroups.base_currency: per-group base. Default 'twd'. Lock rule
--     ('no records in current epoch') is enforced in actions/currency.ts,
--     not at the DB layer.
--   - CurrencyRates: per-group psychological rates. PK (group_id, from, to).
--   - CashTransactions / IncomeTransactions: add original_currency,
--     original_amount, rate_snapshot. NULL = native base-currency write.
--     amount column still stores BASE currency integer (USD as cents).
--
-- Trip sub-ledger (#42):
--   - Trips table: tag-style sub-ledger. trip_id on CashTransactions only.
--   - epoch_id is FK to GroupEpochs, enforcing single-epoch containment
--     structurally. Write-side guard in actions/trip.ts rejects start_date
--     before currentEpochStartedAt.
--   - actions/membership.ts rejects leaveGroup when active trip exists.
--
-- See docs/superpowers/specs/multi-currency-trip-design.md.

-- ─── Enums ─────────────────────────────────────────────────────────────────

CREATE TYPE "currency_code" AS ENUM ('twd', 'cny', 'usd', 'jpy');
CREATE TYPE "trip_status" AS ENUM ('active', 'ended', 'archived');

-- ─── OikosGroups: base_currency ────────────────────────────────────────────

ALTER TABLE "OikosGroups"
  ADD COLUMN "base_currency" "currency_code" NOT NULL DEFAULT 'twd';

COMMENT ON COLUMN "OikosGroups"."base_currency" IS
  'Group-level base currency. Locked once any record exists in the current epoch. See lib/currency.ts + actions/currency.ts.';

-- ─── CurrencyRates ─────────────────────────────────────────────────────────

CREATE TABLE "CurrencyRates" (
  "group_id" uuid NOT NULL REFERENCES "OikosGroups"("id") ON DELETE CASCADE,
  "from_currency" "currency_code" NOT NULL,
  "to_currency" "currency_code" NOT NULL,
  "rate" numeric(10,3) NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("group_id", "from_currency", "to_currency"),
  CHECK ("from_currency" <> "to_currency"),
  CHECK ("rate" > 0)
);

COMMENT ON TABLE "CurrencyRates" IS
  'Per-group psychological exchange rates (TWD/CNY/USD/JPY 4x4 matrix). Rate semantics: 1 display unit of from = rate display units of to.';

-- ─── Trips (must precede CashTransactions ALTER for FK) ────────────────────

CREATE TABLE "Trips" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "group_id" uuid NOT NULL REFERENCES "OikosGroups"("id"),
  "epoch_id" uuid NOT NULL REFERENCES "GroupEpochs"("id"),
  "name" text NOT NULL,
  "start_date" date NOT NULL,
  "end_date" date,
  "default_currency" "currency_code",
  "budget_amount" integer,
  "budget_currency" "currency_code",
  "cover_photo_url" text,
  "status" "trip_status" NOT NULL DEFAULT 'active',
  "ended_at" timestamptz,
  "deleted_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date IS NULL OR end_date >= start_date),
  CHECK ((status = 'ended') = (ended_at IS NOT NULL))
);

COMMENT ON TABLE "Trips" IS
  '#42 旅行子帳本. Tag-style: CashTransactions.trip_id references this. Strictly contained in a single epoch (epoch_id FK + start_date guard).';

CREATE INDEX "Trips_group_active_idx" ON "Trips" ("group_id", "status")
  WHERE deleted_at IS NULL;

-- ─── CashTransactions: multi-currency + trip ───────────────────────────────

ALTER TABLE "CashTransactions"
  ADD COLUMN "original_currency" "currency_code",
  ADD COLUMN "original_amount" integer,
  ADD COLUMN "rate_snapshot" numeric(10,3),
  ADD COLUMN "trip_id" uuid REFERENCES "Trips"("id");

ALTER TABLE "CashTransactions"
  ADD CONSTRAINT "CashTransactions_original_currency_tuple"
  CHECK (
    (original_currency IS NULL AND original_amount IS NULL AND rate_snapshot IS NULL)
    OR
    (original_currency IS NOT NULL AND original_amount IS NOT NULL AND rate_snapshot IS NOT NULL)
  );

COMMENT ON COLUMN "CashTransactions"."original_currency" IS
  'Original currency entered by user. NULL = native base-currency write. See spec section 1.3.';
COMMENT ON COLUMN "CashTransactions"."rate_snapshot" IS
  'Exchange rate locked at write time (snapshot semantics). Past records unaffected by later rate changes.';

CREATE INDEX "CashTransactions_trip_idx" ON "CashTransactions" ("trip_id")
  WHERE trip_id IS NOT NULL;

-- ─── IncomeTransactions: schema-only (UI defers) ───────────────────────────

ALTER TABLE "IncomeTransactions"
  ADD COLUMN "original_currency" "currency_code",
  ADD COLUMN "original_amount" integer,
  ADD COLUMN "rate_snapshot" numeric(10,3);

ALTER TABLE "IncomeTransactions"
  ADD CONSTRAINT "IncomeTransactions_original_currency_tuple"
  CHECK (
    (original_currency IS NULL AND original_amount IS NULL AND rate_snapshot IS NULL)
    OR
    (original_currency IS NOT NULL AND original_amount IS NOT NULL AND rate_snapshot IS NOT NULL)
  );
