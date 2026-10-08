-- Count-only audit for drizzle/0090_ledger_autoname.sql (#1622). READ ONLY.
-- Prints three counts and never a name:
--   shaped     ledgers named '% 的家計簿' (any prefix)
--   matched    of those, how many 0090 would rename (its exact predicate).
--              Before 0090: if shaped > matched, STOP for owner review
--              (hand-typed names, or auto-names whose source name is lost).
--              After 0090 (and after a backup restore): must be 0.
--   superset   '% 的家計簿' ledgers with a deleted member (no auth.users row)
--              on any of their chapters. Cannot tell whether the prefix is
--              that person's name (destroyed by design). Baseline 0 on
--              2026-10-08; must never rise. Non-zero -> owner review.
-- Run: psql "$URL" -v ON_ERROR_STOP=1 -X -f scripts/ops/ledger-autoname-audit-0090.sql

BEGIN READ ONLY;

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
SELECT
  (SELECT count(*) FROM "OikosGroups" WHERE name LIKE '% 的家計簿') AS shaped,
  (SELECT count(*) FROM targets t JOIN "OikosGroups" g ON g.id = t.group_id
     WHERE g.name <> '家計簿') AS matched,
  (SELECT count(*) FROM "OikosGroups" g
     WHERE g.name LIKE '% 的家計簿' AND EXISTS (
       SELECT 1 FROM "GroupEpochs" e WHERE e.group_id = g.id AND (
         NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = e.member_a_id)
         OR (e.member_b_id IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = e.member_b_id))))) AS superset;

ROLLBACK;
