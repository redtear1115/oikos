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

-- Sign-in identities through the backup_auth views (0082): futari_backup has
-- no privilege on schema auth. Labels stay `auth.*` so the sanity check, the
-- count baseline and the drill compare keep working unchanged. Failure look on
-- a database without backup_auth (a restore that skipped re-applying 0082):
-- `relation "backup_auth.users" does not exist` — the backup stops at its
-- privilege preflight, before any part is written.
SELECT 'auth.users', count(*) FROM backup_auth.users;
SELECT 'auth.identities', count(*) FROM backup_auth.identities;
