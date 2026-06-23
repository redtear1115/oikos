-- 0060: Group Outing (出遊) — multi-party expense-splitting sub-ledger.
-- 5 tables isolated from the two-person core. Participants decouple from
-- Profiles (profile_id nullable). RLS enabled with NO policies → client
-- direct access denied; all writes go through Server Actions (later phases).
-- spec: docs/superpowers/specs/2026-06-23-group-outing-design.md
CREATE TYPE "outing_status" AS ENUM ('active', 'settling', 'ended', 'archived');

CREATE TABLE "Outings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "group_id" uuid NOT NULL REFERENCES "OikosGroups"("id"),
  "epoch_id" uuid NOT NULL REFERENCES "GroupEpochs"("id"),
  "created_by" uuid NOT NULL REFERENCES "Profiles"("id"),
  "name" text NOT NULL,
  "currency" "currency_code" NOT NULL,
  "share_token" text NOT NULL UNIQUE,
  "status" "outing_status" DEFAULT 'active' NOT NULL,
  "start_date" date,
  "folded_at" timestamp with time zone,
  "ended_at" timestamp with time zone,
  "deleted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "OutingParticipants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "outing_id" uuid NOT NULL REFERENCES "Outings"("id"),
  "display_name" text NOT NULL,
  "profile_id" uuid REFERENCES "Profiles"("id"),
  "claim_token" text NOT NULL UNIQUE,
  "claimed_at" timestamp with time zone,
  "deactivated_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "OutingExpenses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "outing_id" uuid NOT NULL REFERENCES "Outings"("id"),
  "paid_by_participant_id" uuid NOT NULL REFERENCES "OutingParticipants"("id"),
  "amount" integer NOT NULL,
  "description" text,
  "category" text,
  "entered_by_participant_id" uuid REFERENCES "OutingParticipants"("id"),
  "transacted_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "OutingExpenseShares" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "expense_id" uuid NOT NULL REFERENCES "OutingExpenses"("id"),
  "participant_id" uuid NOT NULL REFERENCES "OutingParticipants"("id"),
  "share_amount" integer NOT NULL
);

CREATE TABLE "OutingSettlements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "outing_id" uuid NOT NULL REFERENCES "Outings"("id"),
  "from_participant_id" uuid NOT NULL REFERENCES "OutingParticipants"("id"),
  "to_participant_id" uuid NOT NULL REFERENCES "OutingParticipants"("id"),
  "amount" integer NOT NULL,
  "deleted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX "idx_outings_group" ON "Outings"("group_id");
CREATE INDEX "idx_outing_participants_outing" ON "OutingParticipants"("outing_id");
CREATE INDEX "idx_outing_expenses_outing" ON "OutingExpenses"("outing_id");
CREATE INDEX "idx_outing_expense_shares_expense" ON "OutingExpenseShares"("expense_id");
CREATE INDEX "idx_outing_settlements_outing" ON "OutingSettlements"("outing_id");

-- RLS: enable with no policies → deny all client (anon + authenticated) direct
-- access. Server Actions use the service role which bypasses RLS.
ALTER TABLE "Outings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OutingParticipants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OutingExpenses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OutingExpenseShares" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OutingSettlements" ENABLE ROW LEVEL SECURITY;
