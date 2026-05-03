-- Add Phase 1 transactional tables to the supabase_realtime publication so
-- that postgres_changes events for INSERT/UPDATE on these tables reach the
-- RealtimeProvider channel. On prod these were enabled via the Supabase
-- dashboard (Database → Replication) before this migration existed; the
-- IF-NOT-EXISTS guard makes this no-op there. On dev / new projects the
-- guard ensures the publication actually receives the table.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'CashTransactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE "CashTransactions";
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'Settlements'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE "Settlements";
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'GroupBalance'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE "GroupBalance";
  END IF;
END $$;
