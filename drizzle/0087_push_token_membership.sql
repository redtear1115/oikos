-- 0087: a push token can only be bound to a ledger its owner is in (#1605).
-- plan: #1605 S2.2 (finding F8); positioning: docs/superpowers/specs/after-leaving-design.md
--
-- Why: 0054's policy `push_tokens_owner_all` checked only `user_id =
-- auth.uid()`. Any signed-in user could upsert a PushTokens row (or re-point
-- their existing row) onto ANY `group_id` they knew — and a group id is not a
-- secret to an ex-partner (it ships in every dashboard RSC payload). Their
-- device would then be sent that ledger's "pending card due" push. Failure
-- looks like: nothing errors; a person outside the ledger gets 「有待確認的定期
-- 收支」 every morning the ledger has a due card.
--
-- What this migration does:
--   1. REPLACES (DROP + CREATE, same name) push_tokens_owner_all. USING is
--      unchanged (`user_id = auth.uid()`: read / update / delete only your own
--      rows). WITH CHECK additionally requires auth.uid() to be the token
--      group's current member_a or member_b. Both the INSERT and the ON
--      CONFLICT DO UPDATE path of the client's upsert (lib/pushNotifications.ts)
--      check the new row, so re-pointing an existing row to a non-member group
--      is refused too (42501, returned to supabase-js as `{ error }`; the
--      registration listener ignores it). The sub-select reads only
--      OikosGroups (id, member_a, member_b), which `authenticated` already
--      holds (0080) and which groups_member_select already lets a member see.
--      NO new GRANT and no new function: the 0080 allowlist
--      (`PushTokens|authenticated|T:SELECT,INSERT,UPDATE`) is unchanged.
--   2. Deletes, once, the tokens whose owner is not a member of their group
--      (left, removed, or joined elsewhere before #1605 moved tokens in the
--      actions). Prod had 0 such rows on 2026-10-08; re-run the read-only count
--      just before applying. A deleted token registers again the next time its
--      app opens the dashboard (PushTokenRegistrar, against the active ledger).
--
-- Not here: the send-time filter (supabase/functions/send-recurring-push,
-- memberTokens.ts) is the authoritative check and does not depend on this
-- file; the Edge Function redeploy and this migration can go in either order.
--
-- Run after 0086 (journal order). Needs no new column / grant.
-- Idempotent: DROP POLICY IF EXISTS + CREATE; a second run of the DELETE
-- removes 0 rows.
-- Rollback: scripts/rollback/0087_push_token_membership.down.sql (restores the
-- 0054 policy; the deleted rows are not restored — they re-register).

DROP POLICY IF EXISTS "push_tokens_owner_all" ON "PushTokens";
--> statement-breakpoint
CREATE POLICY "push_tokens_owner_all" ON "PushTokens"
  USING (user_id = (select auth.uid()))
  WITH CHECK (
    user_id = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM "OikosGroups" g
      WHERE g.id = "PushTokens".group_id
        AND (g.member_a = (select auth.uid()) OR g.member_b = (select auth.uid()))
    )
  );
--> statement-breakpoint

-- ─── data repair ────────────────────────────────────────────────────────────
DELETE FROM "PushTokens" t
WHERE NOT EXISTS (
  SELECT 1 FROM "OikosGroups" g
  WHERE g.id = t.group_id
    AND (g.member_a = t.user_id OR g.member_b = t.user_id)
);
