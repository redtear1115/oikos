-- #1549 — per-table row counts: one line per table, `schema.table<TAB>count`.
-- Read-only. Used by scripts/ops/backup-prod.sh (inside the backup snapshot,
-- for the sanity check and the manifest) and by scripts/ops/backup-restore-drill.sh
-- (against the restored local copy). Same text both sides, so the lines compare
-- one to one.
--
-- Counts only — never row content. The output may be written to the local
-- counts state file (mode 600).

\pset tuples_only on
\pset format unaligned
\pset fieldsep '\t'
\pset footer off

SELECT format('SELECT %L, count(*) FROM %I.%I', n.nspname || '.' || c.relname, n.nspname, c.relname)
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname IN ('public', 'drizzle') AND c.relkind IN ('r', 'p')
ORDER BY n.nspname, c.relname
\gexec

SELECT 'auth.users', count(*) FROM auth.users;
SELECT 'auth.identities', count(*) FROM auth.identities;
