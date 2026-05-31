-- Push device tokens for APNs (iOS) and FCM (Android future).
-- Upsert on (user_id, platform, token) — same device re-registers silently.

CREATE TABLE IF NOT EXISTS "PushTokens" (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES "Profiles"(id) ON DELETE CASCADE,
  group_id    uuid NOT NULL REFERENCES "OikosGroups"(id) ON DELETE CASCADE,
  platform    text NOT NULL CHECK (platform IN ('apns', 'fcm')),
  token       text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT NOW(),
  updated_at  timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT push_tokens_unique UNIQUE (user_id, platform, token)
);

CREATE INDEX IF NOT EXISTS "push_tokens_group_idx" ON "PushTokens" (group_id);
CREATE INDEX IF NOT EXISTS "push_tokens_user_idx"  ON "PushTokens" (user_id);

ALTER TABLE "PushTokens" ENABLE ROW LEVEL SECURITY;

-- Only the owning user can insert/update their own token
DROP POLICY IF EXISTS "push_tokens_owner_all" ON "PushTokens";
CREATE POLICY "push_tokens_owner_all" ON "PushTokens"
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Add to realtime publication for live updates across devices
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
      AND tablename = 'PushTokens'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE "PushTokens";
  END IF;
END $$;
