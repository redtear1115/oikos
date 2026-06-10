-- 0057: account deletion request marker.
-- NULL = no pending deletion; set = scheduled for deletion since this instant.
-- Processed by process_account_deletions() (0058) after a 14-day grace window.
ALTER TABLE "Profiles" ADD COLUMN "deletion_requested_at" timestamp with time zone;
