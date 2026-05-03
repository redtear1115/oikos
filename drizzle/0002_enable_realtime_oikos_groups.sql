DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'OikosGroups'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE "OikosGroups";
  END IF;
END $$;
