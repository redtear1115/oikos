-- 0066: 出遊 (Group Outing) — multi-party expense-splitting sub-ledger (#943, v1.6.0).
-- spec: docs/superpowers/specs/group-outing-design.md
--
-- Five tables isolated from the two-person core. Participants decouple from
-- Profiles (profile_id nullable: friends are names in v1.6.0; members are
-- linked server-side). No share_token / claim_token columns: anonymous join is
-- v1.7.0 and adds them then.
--
-- Access: RLS enabled with NO policies, plus REVOKE from anon/authenticated,
-- so the client can never read or write these tables directly. All access is
-- through Server Actions on the service role. Not added to supabase_realtime.
--
-- Also in this migration, because the new tables would otherwise break them:
--   * _delete_group_cascade / process_account_deletions (0058) learn about
--     the outing tables. Without this, deleting an account whose group has
--     an outing fails on the Outings → GroupEpochs FK and the user is never
--     deleted (process_account_deletions swallows the error per user).
--   * cleanup-soft-deleted (0021) purges soft-deleted outing rows after 1 year.
--
-- Idempotent: safe to re-apply.

DO $$
BEGIN
  CREATE TYPE "outing_status" AS ENUM ('active', 'settling', 'ended', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "Outings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "group_id" uuid NOT NULL REFERENCES "OikosGroups"("id"),
  "epoch_id" uuid NOT NULL REFERENCES "GroupEpochs"("id"),
  "created_by" uuid NOT NULL REFERENCES "Profiles"("id"),
  "name" text NOT NULL CHECK (char_length(btrim("name")) BETWEEN 1 AND 100),
  "currency" "currency_code" NOT NULL,
  "status" "outing_status" DEFAULT 'active' NOT NULL,
  "start_date" date,
  "folded_at" timestamp with time zone,
  "ended_at" timestamp with time zone,
  "deleted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "OutingParticipants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "outing_id" uuid NOT NULL REFERENCES "Outings"("id"),
  "display_name" text NOT NULL CHECK (char_length(btrim("display_name")) BETWEEN 1 AND 40),
  "profile_id" uuid REFERENCES "Profiles"("id"),
  "deactivated_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "OutingExpenses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "outing_id" uuid NOT NULL REFERENCES "Outings"("id"),
  "paid_by_participant_id" uuid NOT NULL REFERENCES "OutingParticipants"("id"),
  "amount" integer NOT NULL CHECK ("amount" > 0),
  "description" text CHECK ("description" IS NULL OR char_length("description") <= 100),
  "category" text CHECK ("category" IS NULL OR char_length("category") <= 32),
  "entered_by_participant_id" uuid REFERENCES "OutingParticipants"("id"),
  "transacted_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "OutingExpenseShares" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "expense_id" uuid NOT NULL REFERENCES "OutingExpenses"("id"),
  "participant_id" uuid NOT NULL REFERENCES "OutingParticipants"("id"),
  "share_amount" integer NOT NULL CHECK ("share_amount" >= 0)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "OutingSettlements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "outing_id" uuid NOT NULL REFERENCES "Outings"("id"),
  "from_participant_id" uuid NOT NULL REFERENCES "OutingParticipants"("id"),
  "to_participant_id" uuid NOT NULL REFERENCES "OutingParticipants"("id"),
  "amount" integer NOT NULL CHECK ("amount" > 0),
  "deleted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CHECK ("from_participant_id" <> "to_participant_id")
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_outings_group" ON "Outings"("group_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_outing_participants_outing" ON "OutingParticipants"("outing_id");
--> statement-breakpoint
-- One participant row per Futari member per outing. Foldback resolves the two
-- member participants by profile_id, so a second row for the same profile
-- would make that lookup ambiguous.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_outing_participants_profile"
  ON "OutingParticipants"("outing_id", "profile_id") WHERE "profile_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_outing_expenses_outing" ON "OutingExpenses"("outing_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_outing_expense_shares_expense_participant"
  ON "OutingExpenseShares"("expense_id", "participant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_outing_settlements_outing" ON "OutingSettlements"("outing_id");
--> statement-breakpoint

ALTER TABLE "Outings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "OutingParticipants" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "OutingExpenses" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "OutingExpenseShares" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "OutingSettlements" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "Outings", "OutingParticipants", "OutingExpenses", "OutingExpenseShares", "OutingSettlements"
  FROM anon, authenticated;
--> statement-breakpoint

-- 0058's helper plus the outing subtree, deleted before Trips / the group row.
-- Outings.epoch_id → GroupEpochs has no ON DELETE, and GroupEpochs drop with
-- OikosGroups, so outings must be gone before the group row. Order inside the
-- subtree is FK-safe: shares → expenses → settlements → participants → outings.
CREATE OR REPLACE FUNCTION public._delete_group_cascade(p_group uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  DELETE FROM "PendingExpenseOccurrences" WHERE group_id = p_group;
  DELETE FROM "PendingIncomeOccurrences"  WHERE group_id = p_group;
  DELETE FROM "TripExpenses" WHERE trip_id IN (SELECT id FROM "Trips" WHERE group_id = p_group);
  DELETE FROM "CashTransactions"   WHERE group_id = p_group;
  DELETE FROM "IncomeTransactions" WHERE group_id = p_group;
  DELETE FROM "FuelLogs" WHERE asset_id IN (SELECT id FROM "Assets" WHERE group_id = p_group);
  DELETE FROM "RecurringExpenseRules" WHERE group_id = p_group;
  DELETE FROM "RecurringIncomeRules"  WHERE group_id = p_group;
  DELETE FROM "InsuranceDetails" WHERE asset_id IN (SELECT id FROM "Assets" WHERE group_id = p_group);
  DELETE FROM "CarDetails"   WHERE asset_id IN (SELECT id FROM "Assets" WHERE group_id = p_group);
  DELETE FROM "HouseDetails" WHERE asset_id IN (SELECT id FROM "Assets" WHERE group_id = p_group);
  DELETE FROM "ChildDetails" WHERE asset_id IN (SELECT id FROM "Assets" WHERE group_id = p_group);
  DELETE FROM "PetDetails"   WHERE asset_id IN (SELECT id FROM "Assets" WHERE group_id = p_group);
  DELETE FROM "PlantDetails" WHERE asset_id IN (SELECT id FROM "Assets" WHERE group_id = p_group);
  DELETE FROM "Assets" WHERE group_id = p_group;
  DELETE FROM "Trips" WHERE group_id = p_group;
  DELETE FROM "OutingExpenseShares" WHERE expense_id IN (
    SELECT e.id FROM "OutingExpenses" e JOIN "Outings" o ON o.id = e.outing_id WHERE o.group_id = p_group);
  DELETE FROM "OutingExpenses"     WHERE outing_id IN (SELECT id FROM "Outings" WHERE group_id = p_group);
  DELETE FROM "OutingSettlements"  WHERE outing_id IN (SELECT id FROM "Outings" WHERE group_id = p_group);
  DELETE FROM "OutingParticipants" WHERE outing_id IN (SELECT id FROM "Outings" WHERE group_id = p_group);
  DELETE FROM "Outings" WHERE group_id = p_group;
  DELETE FROM "PartnerQuizAnswers" WHERE session_id IN (SELECT id FROM "PartnerQuizSessions" WHERE group_id = p_group);
  DELETE FROM "PartnerQuizSessions" WHERE group_id = p_group;
  DELETE FROM "InvoiceImportRuns"      WHERE group_id = p_group;
  DELETE FROM "InvoiceImportSnapshots" WHERE group_id = p_group;
  DELETE FROM "InvoiceCredentials"     WHERE group_id = p_group;
  DELETE FROM "ImportBatches" WHERE group_id = p_group;
  DELETE FROM "MonthlyReviewMessages"  WHERE group_id = p_group;
  DELETE FROM "MonthlyReviewSnapshots" WHERE group_id = p_group;
  DELETE FROM "GroupInvites" WHERE group_id = p_group;
  DELETE FROM "Settlements"  WHERE group_id = p_group;
  DELETE FROM "GroupBalance" WHERE group_id = p_group;
  DELETE FROM "OikosGroups" WHERE id = p_group;
END;
$fn$;
--> statement-breakpoint

-- 0058's processor, unchanged except for one statement in the paired branch:
-- the leaver's member participant in this group's outings is unlinked and
-- renamed the same way their Profiles row is scrubbed below, so the partner
-- keeps the outing history without the leaver's name.
CREATE OR REPLACE FUNCTION public.process_account_deletions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_uid uuid;
  v_grp record;
  v_partner uuid;
  v_has_paired boolean;
  v_count integer := 0;
BEGIN
  FOR v_uid IN
    SELECT id FROM "Profiles"
    WHERE deletion_requested_at IS NOT NULL
      AND deletion_requested_at < now() - interval '14 days'
  LOOP
    BEGIN
      v_has_paired := false;

      FOR v_grp IN
        SELECT * FROM "OikosGroups" WHERE member_a = v_uid OR member_b = v_uid
      LOOP
        IF v_grp.member_b IS NULL AND v_grp.member_a = v_uid THEN
          PERFORM public._delete_group_cascade(v_grp.id);
        ELSE
          v_has_paired := true;
          v_partner := CASE WHEN v_grp.member_a = v_uid THEN v_grp.member_b ELSE v_grp.member_a END;

          IF v_grp.member_a = v_uid THEN
            UPDATE "OikosGroups"
            SET member_a = v_partner,
                member_b = NULL,
                default_split_ratio_a = CASE WHEN default_split_ratio_a IS NOT NULL
                                             THEN 100 - default_split_ratio_a ELSE NULL END,
                pending_swap_proposed_by = NULL,
                pending_swap_expires_at = NULL,
                current_epoch_started_at = now()
            WHERE id = v_grp.id;

            UPDATE "CashTransactions"      SET split_ratio_a = 100 - split_ratio_a
              WHERE group_id = v_grp.id AND split_ratio_a IS NOT NULL;
            UPDATE "RecurringExpenseRules" SET split_ratio_a = 100 - split_ratio_a
              WHERE group_id = v_grp.id AND split_ratio_a IS NOT NULL;
            UPDATE "PendingExpenseOccurrences" SET proposed_split_ratio_a = 100 - proposed_split_ratio_a
              WHERE group_id = v_grp.id AND proposed_split_ratio_a IS NOT NULL;
          ELSE
            UPDATE "OikosGroups"
            SET member_b = NULL,
                pending_swap_proposed_by = NULL,
                pending_swap_expires_at = NULL,
                current_epoch_started_at = now()
            WHERE id = v_grp.id;
          END IF;

          UPDATE "GroupEpochs" SET ended_at = now()
            WHERE group_id = v_grp.id AND ended_at IS NULL;
          INSERT INTO "GroupEpochs" (group_id, started_at, member_a_id, member_b_id)
            VALUES (v_grp.id, now(), v_partner, NULL);

          UPDATE "GroupInvites" SET revoked_at = now()
            WHERE group_id = v_grp.id AND accepted_at IS NULL AND revoked_at IS NULL;
          DELETE FROM "PushTokens" WHERE user_id = v_uid;

          UPDATE "OutingParticipants" SET profile_id = NULL, display_name = '已離開的夥伴'
            WHERE profile_id = v_uid
              AND outing_id IN (SELECT id FROM "Outings" WHERE group_id = v_grp.id);

          UPDATE "GroupBalance" SET balance = 0, version = version + 1 WHERE group_id = v_grp.id;
        END IF;
      END LOOP;

      DELETE FROM auth.users WHERE id = v_uid;

      IF v_has_paired THEN
        UPDATE "Profiles" SET display_name = '已離開的夥伴', avatar_url = NULL
          WHERE id = v_uid;
      ELSE
        DELETE FROM "Profiles" WHERE id = v_uid;
      END IF;

      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'process_account_deletions: failed for %: %', v_uid, SQLERRM;
    END;
  END LOOP;

  RETURN v_count;
END;
$fn$;
--> statement-breakpoint

REVOKE EXECUTE ON FUNCTION public._delete_group_cascade(uuid) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.process_account_deletions() FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.process_account_deletions() TO postgres, service_role;
--> statement-breakpoint

-- cleanup-soft-deleted: 0021's command verbatim (the live job, checked on dev
-- 2026-09-21), plus the outing tables. A soft-deleted outing takes its whole
-- subtree with it; soft-deleted expenses / settlements inside a live outing
-- go on their own. Shares have no deleted_at: they go with their expense.
DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-soft-deleted');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
--> statement-breakpoint

SELECT cron.schedule('cleanup-soft-deleted', '0 3 * * 0', $$
  DELETE FROM "CashTransactions"          WHERE deleted_at < NOW() - INTERVAL '1 year';
  DELETE FROM "Settlements"               WHERE deleted_at < NOW() - INTERVAL '1 year';
  DELETE FROM "FuelLogs"                  WHERE deleted_at < NOW() - INTERVAL '1 year';
  DELETE FROM "IncomeTransactions"        WHERE deleted_at < NOW() - INTERVAL '1 year';
  DELETE FROM "RecurringIncomeRules"      WHERE deleted_at < NOW() - INTERVAL '1 year';
  DELETE FROM "PendingIncomeOccurrences"  WHERE skipped_at < NOW() - INTERVAL '90 days';
  DELETE FROM "RecurringExpenseRules"     WHERE deleted_at < NOW() - INTERVAL '1 year';
  DELETE FROM "PendingExpenseOccurrences" WHERE skipped_at < NOW() - INTERVAL '90 days';
  DELETE FROM "OutingExpenseShares" WHERE expense_id IN (
    SELECT e.id FROM "OutingExpenses" e JOIN "Outings" o ON o.id = e.outing_id
    WHERE e.deleted_at < NOW() - INTERVAL '1 year' OR o.deleted_at < NOW() - INTERVAL '1 year');
  DELETE FROM "OutingExpenses" WHERE deleted_at < NOW() - INTERVAL '1 year'
    OR outing_id IN (SELECT id FROM "Outings" WHERE deleted_at < NOW() - INTERVAL '1 year');
  DELETE FROM "OutingSettlements" WHERE deleted_at < NOW() - INTERVAL '1 year'
    OR outing_id IN (SELECT id FROM "Outings" WHERE deleted_at < NOW() - INTERVAL '1 year');
  DELETE FROM "OutingParticipants"
    WHERE outing_id IN (SELECT id FROM "Outings" WHERE deleted_at < NOW() - INTERVAL '1 year');
  DELETE FROM "Outings"                   WHERE deleted_at < NOW() - INTERVAL '1 year';
$$);
