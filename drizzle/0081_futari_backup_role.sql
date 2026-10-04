-- 0081 — read-only backup role `futari_backup` (#1549)
--
-- Prod is on the Supabase Free plan: no automatic backups, no PITR. The nightly
-- backup (scripts/ops/backup-prod.sh, run from the owner's Mac) connects as this
-- role, not as `postgres`. What it can and cannot reach, the operator steps
-- that turn it into a login role, the restore order and rollback:
-- docs/superpowers/ops-runbook.md §「Prod backup (futari_backup)」.
--
-- The role is created NOLOGIN and without any credential. The operator sets
-- the credential afterwards with psql's client-side SCRAM command (never as
-- SQL text: DDL statements are logged), stores it in the macOS Keychain, then
-- enables login. Nothing in this file may ever carry a
-- credential — the repo is public and tests/futari-backup-role-guard.test.ts
-- fails if one appears.
--
-- Why BYPASSRLS: pg_dump turns row security off and refuses to dump a table
-- whose policies would filter rows for it. Without BYPASSRLS the dump fails
-- on the first RLS table. Never work around that with pg_dump's
-- --enable-row-security: the session has no JWT claims, every policy sees
-- auth.uid() = NULL, and the "backup" succeeds with 0 rows in every table.
-- The same applies to cron.job, which pg_cron protects with an RLS policy on
-- `username = current_user`: without BYPASSRLS the manifest would list 0 jobs.
--
-- Grants: SELECT only — public and drizzle (all tables + sequences, plus
-- tables / sequences `postgres` creates later), auth.users and auth.identities
-- only, and cron.job only (for the manifest). Sessions default to read-only
-- transactions. At most 2 connections: the snapshot holder plus one pg_dump
-- (the backup runs its two pg_dumps one after the other; `pg_dump -j` would
-- need more and fails on the limit — that is intended).
--
-- No statement / idle-in-transaction timeouts on purpose: the snapshot holder
-- sits idle inside its transaction for as long as the dumps run.
--   Failure look if someone adds idle_in_transaction_session_timeout here: the
--   holder is killed mid-run, the second pg_dump fails with "invalid snapshot
--   identifier", and the run fails every night once the data outgrows the
--   timeout.
--
-- Idempotent: safe to re-run. A re-run never flips an operator-enabled login
-- back to NOLOGIN, and refuses to continue if a pre-existing `futari_backup`
-- has broader attributes or role memberships than expected.

DO $$
DECLARE
  r pg_roles%ROWTYPE;
BEGIN
  SELECT * INTO r FROM pg_roles WHERE rolname = 'futari_backup';
  IF NOT FOUND THEN
    CREATE ROLE futari_backup WITH
      NOLOGIN NOSUPERUSER NOCREATEROLE NOCREATEDB NOREPLICATION NOINHERIT BYPASSRLS
      CONNECTION LIMIT 2;
  ELSIF r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication OR r.rolinherit OR NOT r.rolbypassrls THEN
    RAISE EXCEPTION 'futari_backup exists with unexpected attributes (super=%, createrole=%, createdb=%, replication=%, inherit=%, bypassrls=%); fix it by hand before migrating',
      r.rolsuper, r.rolcreaterole, r.rolcreatedb, r.rolreplication, r.rolinherit, r.rolbypassrls;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_auth_members m WHERE m.member = (SELECT oid FROM pg_roles WHERE rolname = 'futari_backup')) THEN
    RAISE EXCEPTION 'futari_backup is a member of another role; it must not be — revoke the membership before migrating';
  END IF;
END
$$;
--> statement-breakpoint
ALTER ROLE futari_backup CONNECTION LIMIT 2;
--> statement-breakpoint
ALTER ROLE futari_backup SET default_transaction_read_only = on;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO futari_backup;
--> statement-breakpoint
GRANT SELECT ON ALL TABLES IN SCHEMA public TO futari_backup;
--> statement-breakpoint
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO futari_backup;
--> statement-breakpoint
-- Tables / sequences created later by `postgres` (every migration) are
-- covered automatically. Objects created by any other role are NOT — the
-- runbook's coverage query catches that; the symptom otherwise is the next
-- nightly run failing with "permission denied for table …".
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT ON TABLES TO futari_backup;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT ON SEQUENCES TO futari_backup;
--> statement-breakpoint
-- The migration journal (drizzle.__drizzle_migrations). Without it a restored
-- database would re-run every migration on the next `db:migrate`.
GRANT USAGE ON SCHEMA drizzle TO futari_backup;
--> statement-breakpoint
GRANT SELECT ON ALL TABLES IN SCHEMA drizzle TO futari_backup;
--> statement-breakpoint
GRANT SELECT ON ALL SEQUENCES IN SCHEMA drizzle TO futari_backup;
--> statement-breakpoint
-- Sign-in identities: every Profiles row references auth.users. Only these two
-- tables — sessions, refresh tokens, MFA and audit tables are not backed up.
-- If this grant is refused on an environment: STOP (plan #1549). Never fall
-- back to pg_read_all_data.
GRANT USAGE ON SCHEMA auth TO futari_backup;
--> statement-breakpoint
GRANT SELECT ON TABLE auth.users, auth.identities TO futari_backup;
--> statement-breakpoint
-- pg_cron jobs, read into the encrypted manifest so a real restore can
-- recreate them. cron.job only (not job_run_details).
GRANT USAGE ON SCHEMA cron TO futari_backup;
--> statement-breakpoint
GRANT SELECT ON TABLE cron.job TO futari_backup;
