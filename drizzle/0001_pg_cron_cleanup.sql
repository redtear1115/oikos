-- Schedule weekly cleanup of soft-deleted rows older than 1 year.
-- Runs every Sunday at 03:00 UTC.
--
-- Note: this requires the pg_cron extension. Supabase has it enabled by default
-- on Pro tier. If cron.schedule fails with "permission denied" or "extension not
-- found", enable pg_cron via the Supabase dashboard (Database → Extensions).

-- Idempotent: drop any existing schedule with the same name first.
DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-soft-deleted');
EXCEPTION WHEN OTHERS THEN
  -- Job didn't exist; ignore.
  NULL;
END $$;

SELECT cron.schedule('cleanup-soft-deleted', '0 3 * * 0', $$
  DELETE FROM "CashTransactions" WHERE deleted_at < NOW() - INTERVAL '1 year';
  DELETE FROM "Settlements" WHERE deleted_at < NOW() - INTERVAL '1 year';
$$);
