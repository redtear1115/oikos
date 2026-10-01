-- 0072 — runtime DB role `futari_app` (#1467)
--
-- The app runtime used to connect as `postgres` (CREATEROLE, CREATEDB,
-- REPLICATION, owner of every table, reach into auth / cron / net / vault).
-- This creates a narrower role for the runtime: DML on public tables only.
-- Why BYPASSRLS, what it does and does not block, the operator steps that
-- turn it into a login role, and rollback: docs/superpowers/ops-runbook.md
-- §「Runtime DB role (futari_app)」.
--
-- The role is created NOLOGIN and without any credential. The credential is
-- set by the operator afterwards with psql's client-side SCRAM command (never
-- as SQL text: DDL statements are logged), then the operator enables login.
-- Nothing in this file may ever carry a credential — the repo is public and
-- tests/futari-app-role-guard.test.ts fails if one appears.
--
-- Idempotent: safe to re-run. A re-run never flips an operator-enabled
-- login back to NOLOGIN, and refuses to continue if a pre-existing
-- `futari_app` has broader attributes or role memberships than expected.

DO $$
DECLARE
  r pg_roles%ROWTYPE;
BEGIN
  SELECT * INTO r FROM pg_roles WHERE rolname = 'futari_app';
  IF NOT FOUND THEN
    CREATE ROLE futari_app WITH
      NOLOGIN NOSUPERUSER NOCREATEROLE NOCREATEDB NOREPLICATION BYPASSRLS NOINHERIT
      CONNECTION LIMIT -1;
  ELSIF r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication OR r.rolinherit OR NOT r.rolbypassrls THEN
    RAISE EXCEPTION 'futari_app exists with unexpected attributes (super=%, createrole=%, createdb=%, replication=%, inherit=%, bypassrls=%); fix it by hand before migrating',
      r.rolsuper, r.rolcreaterole, r.rolcreatedb, r.rolreplication, r.rolinherit, r.rolbypassrls;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_auth_members m WHERE m.member = (SELECT oid FROM pg_roles WHERE rolname = 'futari_app')) THEN
    RAISE EXCEPTION 'futari_app is a member of another role; it must not be — revoke the membership before migrating';
  END IF;
END
$$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO futari_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO futari_app;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO futari_app;
--> statement-breakpoint
-- Tables / sequences created later by `postgres` (every migration) are
-- covered automatically. Objects created by any other role are NOT: the
-- runbook's "after every migration" coverage query catches that.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO futari_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO futari_app;
--> statement-breakpoint
-- A role with no memberships gets exactly PUBLIC's privileges. PG 15+ no
-- longer gives PUBLIC CREATE on schema public, but an upgraded cluster can
-- still carry it; take it away only if it is there.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_namespace n, aclexplode(coalesce(n.nspacl, acldefault('n'::"char", n.nspowner))) a
    WHERE n.nspname = 'public' AND a.grantee = 0 AND a.privilege_type = 'CREATE'
  ) THEN
    REVOKE CREATE ON SCHEMA public FROM PUBLIC;
  END IF;
END
$$;
--> statement-breakpoint
-- Safety nets, not tuning: the longest statement recorded on dev (as
-- postgres, cron and migrations included) was under 10 s. A runaway or hijacked session is cut off instead of
-- holding locks.
ALTER ROLE futari_app SET statement_timeout = '30s';
--> statement-breakpoint
ALTER ROLE futari_app SET idle_in_transaction_session_timeout = '60s';
