-- Remove the read-only backup role `futari_backup` (#1549). Rollback / teardown.
--
-- PRECONDITION: the nightly job is stopped first —
--   launchctl bootout gui/$(id -u)/<label>   (ops-runbook §「Prod backup (futari_backup)」, Rollback)
--   Failure look if you skip this: the next scheduled run fails to connect, the
--   Mac shows a FAILED notification and leaves the FAILED marker on the
--   Desktop; nothing else breaks (the app never uses this role).
--
-- Run as the admin role through the service method (ops-runbook §「Runtime DB
-- role (futari_app)」, 連線方式):
--   PGSERVICEFILE=… PGPASSFILE=… psql service=futari_<env>_admin -f scripts/ops/drop-futari-backup-role.sql
--
-- Contains no credential and needs none. Each step is its own transaction so
-- that login is really off (committed) before sessions are terminated.

\set ON_ERROR_STOP on

-- 1. No new sessions.
ALTER ROLE futari_backup NOLOGIN;

-- 2. End the ones still open (a run in progress: the snapshot holder and a
--    pg_dump). The pids are picked first (MATERIALIZED) and terminated in the
--    select list. Never put pg_terminate_backend in the WHERE clause:
--    pg_stat_activity is a view, and the planner pushes the call below the
--    user-name filter.
--      Failure look: every session postgres may signal dies — the app, the
--      pooler, PostgREST, this psql itself (FATAL: terminating connection due
--      to administrator command) — and step 3 never runs, so the role is
--      still there afterwards.
WITH targets AS MATERIALIZED (
  SELECT pid FROM pg_stat_activity
  WHERE usename = 'futari_backup' AND pid <> pg_backend_pid()
)
SELECT pid, pg_terminate_backend(pid) AS terminated FROM targets;

-- 3. Take back every grant the migrations (0081, 0082) gave — default privileges
--    first — then drop the role. No DROP OWNED BY: futari_backup must own
--    nothing. If DROP ROLE fails with "role cannot be dropped because some
--    objects depend on it", something was granted to or created by
--    futari_backup outside 0081 / 0082 — stop and treat it as an incident
--    (ops-runbook, incident steps), do not force it.
BEGIN;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM futari_backup;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM futari_backup;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM futari_backup;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM futari_backup;
REVOKE ALL ON SCHEMA public FROM futari_backup;
REVOKE ALL ON ALL TABLES IN SCHEMA drizzle FROM futari_backup;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA drizzle FROM futari_backup;
REVOKE ALL ON SCHEMA drizzle FROM futari_backup;
-- backup_auth (0082): only while the schema exists — it may already have
-- been dropped by scripts/rollback/0082_backup_auth_views.down.sql.
DO $$
BEGIN
  IF to_regnamespace('backup_auth') IS NOT NULL THEN
    REVOKE ALL ON TABLE backup_auth.users, backup_auth.identities FROM futari_backup;
    REVOKE ALL ON SCHEMA backup_auth FROM futari_backup;
  END IF;
END
$$;
-- 0081's auth grants: 0082 already revoked them (or they were refused on
-- Supabase); kept as harmless no-ops for a database where 0082 never ran.
REVOKE ALL ON TABLE auth.users, auth.identities FROM futari_backup;
REVOKE ALL ON SCHEMA auth FROM futari_backup;
REVOKE ALL ON TABLE cron.job FROM futari_backup;
REVOKE ALL ON SCHEMA cron FROM futari_backup;
ALTER ROLE futari_backup RESET ALL;
DROP ROLE futari_backup;
COMMIT;

-- 4. Confirm: all three must be 0.
SELECT
  (SELECT count(*) FROM pg_roles WHERE rolname = 'futari_backup') AS role_left,
  (SELECT count(*) FROM pg_default_acl da, aclexplode(da.defaclacl) a
    WHERE a.grantee NOT IN (SELECT oid FROM pg_roles) AND a.grantee <> 0) AS dangling_default_acl,
  (SELECT count(*) FROM pg_stat_activity WHERE usename = 'futari_backup') AS sessions_left;

-- Recreating it later: re-run the bodies of drizzle/0081_futari_backup_role.sql
-- and then drizzle/0082_backup_auth_views.sql (both idempotent) as the admin
-- role — `db:migrate` will not re-run a migration it has already recorded —
-- then redo the operator steps in the runbook.
