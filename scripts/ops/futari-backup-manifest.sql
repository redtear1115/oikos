-- #1549 — backup manifest: what a restore has to reproduce besides the dumps.
-- Read-only catalog queries plus counts; no row content except cron job
-- definitions. Sections start with a `## <name>` line; every other line is one
-- tab-separated record.
--
-- Run by scripts/ops/backup-prod.sh inside the backup's REPEATABLE READ
-- transaction (same snapshot as both pg_dumps), with its output streamed
-- straight into age — the manifest never exists unencrypted on disk. Run again
-- by scripts/ops/backup-restore-drill.sh against the restored local copy; the
-- drill compares the sections line by line, so a change to a query here
-- changes both sides at once.
--
-- The cron section carries each job's command (it contains the Edge Function
-- URL and the Vault secret NAME, never the secret). Only the encrypted manifest
-- may hold it; the drill prints job names only.

\pset tuples_only on
\pset format unaligned
\pset fieldsep '\t'
\pset footer off

\qecho '## meta'
SELECT 'server_version', current_setting('server_version');
SELECT 'taken_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');

\qecho '## row_counts'
\ir futari-backup-counts.sql

-- Encrypted columns: rows per key id (`v1:<kid>:…`). Shows which keys a backup
-- depends on (ops-runbook, rotation step 8). `other` = not the v1 format.
\qecho '## encrypted_kids'
SELECT format(
  $q$SELECT %L, CASE WHEN %I IS NULL THEN 'null' WHEN %I LIKE 'v1:%%' THEN split_part(%I, ':', 1) || ':' || split_part(%I, ':', 2) ELSE 'other' END AS kid, count(*) FROM %I.%I GROUP BY 2 ORDER BY 2$q$,
  c.relname || '.' || a.attname, a.attname, a.attname, a.attname, a.attname, n.nspname, c.relname)
FROM pg_attribute a
JOIN pg_class c ON c.oid = a.attrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  AND a.attnum > 0 AND NOT a.attisdropped AND a.attname LIKE '%\_encrypted'
ORDER BY c.relname, a.attname
\gexec

\qecho '## publication'
SELECT schemaname, tablename, coalesce(array_to_string(attnames, ','), ''), coalesce(rowfilter, '')
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY 1, 2;

-- name, schedule, active, username, database, command (base64, exact bytes).
\qecho '## cron'
SELECT jobname, schedule, active, username, database,
       replace(encode(convert_to(command, 'UTF8'), 'base64'), E'\n', '')
FROM cron.job
ORDER BY jobname;

\qecho '## extensions'
SELECT e.extname, e.extversion, n.nspname
FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
ORDER BY 1;

\qecho '## auth_triggers'
SELECT c.relname, t.tgname, pg_get_triggerdef(t.oid)
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'auth' AND NOT t.tgisinternal
ORDER BY 1, 2;

-- ACL items are sorted, so the same grants compare equal whatever order they
-- were applied in (a restore replays them in dump order).
\qecho '## relacl'
SELECT n.nspname, c.relname, c.relkind, coalesce((SELECT string_agg(x::text, ' ' ORDER BY x::text) FROM unnest(c.relacl) x), '')
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname IN ('public', 'drizzle') AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
ORDER BY 1, 2;

\qecho '## column_acl'
SELECT n.nspname, c.relname, a.attname, (SELECT string_agg(x::text, ' ' ORDER BY x::text) FROM unnest(a.attacl) x)
FROM pg_attribute a
JOIN pg_class c ON c.oid = a.attrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND a.attnum > 0 AND NOT a.attisdropped AND a.attacl IS NOT NULL
ORDER BY 1, 2, 3;

\qecho '## function_acl'
SELECT p.oid::regprocedure::text, coalesce((SELECT string_agg(x::text, ' ' ORDER BY x::text) FROM unnest(p.proacl) x), '')
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
ORDER BY 1;

\qecho '## default_acl'
SELECT pg_get_userbyid(d.defaclrole), coalesce(n.nspname, ''), d.defaclobjtype, (SELECT string_agg(x::text, ' ' ORDER BY x::text) FROM unnest(d.defaclacl) x)
FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
ORDER BY 1, 2, 3;
