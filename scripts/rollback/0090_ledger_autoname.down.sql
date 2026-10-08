-- ROLLBACK for drizzle/0090_ledger_autoname.sql — DOCUMENTED NO-OP.
-- Not a drizzle migration: drizzle-kit only runs files listed in drizzle/meta/_journal.json.
--
-- 0090 is data-only: it renamed ledgers named "<a person's name> 的家計簿" to
-- 「家計簿」. There is nothing to undo:
--   - The old names are PII (a person's display name) and are deliberately not
--     stored anywhere, so they cannot be restored. Renamed ledgers stay renamed;
--     an owner can rename theirs in 設定.
--   - No function, column, trigger, policy or grant was changed.
--
-- The STANDARD rollback for #1622 is reverting the code PR. Note that reverting
-- it makes leaveGroup name new solo ledgers after the leaver's display name
-- again (the bug), and 0090 would have to be re-run after the fix returns.
--
-- Optional: remove 0090's journal row so `db:migrate` re-applies it
-- (idempotent) when rolling forward. Not required: re-running the file by hand
-- has the same effect.
--   DELETE FROM drizzle.__drizzle_migrations WHERE created_at = 1784600000000;

SELECT 'no-op: 0090 renamed ledgers whose old names are PII and are not restored' AS rollback_0090;
