-- ROLLBACK for drizzle/0087_push_token_membership.sql — MANUAL ONLY, NEVER RUN AUTOMATICALLY.
-- Not a drizzle migration: drizzle-kit only runs files listed in drizzle/meta/_journal.json.
--
-- What it does: restores 0054's push_tokens_owner_all (owner check only, no
-- membership check in WITH CHECK). After this, a signed-in user can again
-- bind a token to any group id they know (#1605 F8 reopens).
--
-- NOT reversed: the 0087 data repair. Tokens it deleted (owner not a member of
-- the token's group) are not restored; each device registers again the next
-- time its app opens the dashboard.
-- The send-time member filter in supabase/functions/send-recurring-push is
-- independent; roll it back by redeploying the previous function version.

DROP POLICY IF EXISTS "push_tokens_owner_all" ON "PushTokens";
CREATE POLICY "push_tokens_owner_all" ON "PushTokens"
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
