-- Remove the runtime DB role `futari_app` (#1467). Rollback / teardown.
--
-- PRECONDITION: nothing may still connect as futari_app. On dev that means
-- `.env.local` DATABASE_URL is back on the admin role; on prod, every Vercel
-- environment's DATABASE_URL is back on the old value AND redeployed.
--   Failure look if you skip this: the app starts failing every request with
--   "password authentication failed" / "role does not exist" the moment
--   step 1 commits — there is no gradual degradation.
--
-- Run as the admin role through the service method (ops-runbook §「Runtime DB
-- role (futari_app)」):
--   PGSERVICEFILE=… PGPASSFILE=… psql service=futari_<env>_admin -f scripts/ops/drop-futari-app-role.sql
--
-- Contains no credential and needs none. Each step is its own transaction so
-- that login is really off (committed) before sessions are terminated.

\set ON_ERROR_STOP on

-- 1. No new sessions.
ALTER ROLE futari_app NOLOGIN;

-- 2. End the ones still open (postgres is a member of pg_signal_backend on
--    Supabase; the pre-check prints it). Pooler connections included.
SELECT count(*) AS terminated
FROM pg_stat_activity
WHERE usename = 'futari_app' AND pg_terminate_backend(pid);

-- 3. Take back every grant the migration (0072) gave, then drop the role.
--    No DROP OWNED BY: futari_app must own nothing. If DROP ROLE fails with
--    "role cannot be dropped because some objects depend on it", something
--    was granted to or created by futari_app outside 0072 — stop and treat it
--    as an incident (ops-runbook, incident steps), do not force it.
BEGIN;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM futari_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM futari_app;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM futari_app;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM futari_app;
REVOKE ALL ON SCHEMA public FROM futari_app;
ALTER ROLE futari_app RESET ALL;
DROP ROLE futari_app;
COMMIT;

-- 4. Confirm: all three must be 0.
SELECT
  (SELECT count(*) FROM pg_roles WHERE rolname = 'futari_app') AS role_left,
  (SELECT count(*) FROM pg_default_acl da, aclexplode(da.defaclacl) a
    WHERE a.grantee NOT IN (SELECT oid FROM pg_roles) AND a.grantee <> 0) AS dangling_default_acl,
  (SELECT count(*) FROM pg_stat_activity WHERE usename = 'futari_app') AS sessions_left;

-- Recreating it later: re-run the body of drizzle/0072_futari_app_role.sql
-- (idempotent) as the admin role — `db:migrate` will not re-run a migration
-- it has already recorded — then redo the operator steps in the runbook.
