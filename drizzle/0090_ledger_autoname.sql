-- 0090: no ledger name is derived from a person's name (#1622).
-- positioning: docs/superpowers/specs/account-deletion-design.md (display
-- names are removed), after-leaving-design.md (a deleted account shows
-- 「已離開的夥伴」). plan: #1622 S6 (design C).
--
-- Why: leaveGroup named the leaver's new solo ledger "<display name> 的家計簿".
-- OikosGroups.name is never rewritten by process_account_deletions, and the
-- ledger can later be shared with a new partner, so a person's real name
-- outlived their account deletion and was shown to whoever shared the ledger.
-- The code fix (same PR) names a new solo ledger with the neutral, localized
-- copy key postLeave.newLedgerName; this migration renames the legacy ones.
-- Failure looks like: nothing errors; open 設定 as the owner (or the next
-- partner) of a ledger created by a leave and its name still carries a real
-- name, also after that person deleted their account.
--
-- What this migration does (DATA ONLY: no function, column, trigger, policy or
-- grant changes; process_account_deletions is untouched):
--   Renames to '家計簿' every OikosGroups row whose name equals
--   X || ' 的家計簿', where X is a name the database still holds for a person
--   ON THIS LEDGER (a person on any of its GroupEpochs rows, or its current
--   member_a / member_b):
--     - that person's live Profiles.display_name, or
--     - a 0088 chapter-snapshot name of that person (GroupEpochs.member_a_name
--       where member_a_id is the person, member_b_name where member_b_id is),
--       from ANY chapter in ANY group. By person, because a leaver's new ledger
--       has only an open chapter (snapshots are taken on close), so the name
--       used for the auto-name is frozen on the OLD ledger's closing chapter.
--   Never cross-person: a name of someone who was never on this ledger does
--   not match. The placeholder 「已離開的夥伴」 and empty names are skipped.
--   '家計簿' is the zh-TW value of postLeave.newLedgerName
--   (tests/ledger-autoname.test.ts asserts the two are identical).
--   Ledgers named by hand in any other shape (「我們的家計簿」) are untouched.
--   Nothing is selected out: no name is ever printed.
--
-- ORDER: after 0089 (journal order). On prod, deploy the CODE FIRST, then
-- apply 0090: old code running after 0090 can still mint a new
-- "X 的家計簿" on a leave. Applied the other way round it is still safe, but
-- must be re-run after the deploy. No apply-window constraint (no function is
-- touched); avoiding 16:00-17:30 UTC is harmless.
--
-- Idempotent: the second run matches nothing ('家計簿' is not of the shape
-- X || ' 的家計簿' for a non-empty X) and changes 0 rows.
--
-- Invariant, run right after applying; must be 0 (the predicate below as a
-- count, i.e. replace the UPDATE with SELECT count(*) FROM targets):
--   exact for every name the database still holds for a person on that
--   ledger's chapters (live display names + any 0088 snapshot of that person
--   in any group). It CANNOT see names that were never stored: a rename before
--   0088 existed, or a rename while the person had no closed chapter, nor a
--   deleted person's name (destroyed by design). For those, the `superset`
--   count (ledgers named '% 的家計簿' with a deleted member on their chapters)
--   goes to owner review. All three counts, never a name:
--     psql -f scripts/ops/ledger-autoname-audit-0090.sql   (matched = invariant)
--
-- Backups: encrypted daily backups keep the old names until retention ends
-- (#1549). A restore must re-apply this migration (ops-runbook restore list).
-- Rollback: scripts/rollback/0090_ledger_autoname.down.sql is a documented
-- no-op; the old names are PII and are not stored anywhere to restore from.

WITH persons AS (
  SELECT e.group_id, e.member_a_id AS person_id FROM "GroupEpochs" e
  UNION
  SELECT e.group_id, e.member_b_id FROM "GroupEpochs" e WHERE e.member_b_id IS NOT NULL
  UNION
  SELECT g.id, g.member_a FROM "OikosGroups" g
  UNION
  SELECT g.id, g.member_b FROM "OikosGroups" g WHERE g.member_b IS NOT NULL
),
person_names AS (
  SELECT p.id AS person_id, p.display_name AS name FROM "Profiles" p
  UNION
  SELECT e.member_a_id, e.member_a_name FROM "GroupEpochs" e
  WHERE e.member_a_name IS NOT NULL
  UNION
  SELECT e.member_b_id, e.member_b_name FROM "GroupEpochs" e
  WHERE e.member_b_id IS NOT NULL AND e.member_b_name IS NOT NULL
),
targets AS (
  SELECT DISTINCT pr.group_id
  FROM persons pr
  JOIN person_names n ON n.person_id = pr.person_id
  JOIN "OikosGroups" g ON g.id = pr.group_id
  WHERE n.name IS NOT NULL
    AND btrim(n.name) <> ''
    AND n.name <> '已離開的夥伴'
    AND g.name = n.name || ' 的家計簿'
)
UPDATE "OikosGroups" g
SET name = '家計簿'
FROM targets t
WHERE g.id = t.group_id
  AND g.name <> '家計簿';
