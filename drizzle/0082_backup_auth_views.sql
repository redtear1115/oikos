-- 0082 — backup_auth: read-only views over auth.users / auth.identities for
-- the backup role `futari_backup` (#1549).
--
-- Why: on Supabase the `auth` schema belongs to supabase_admin, and `postgres`
-- holds USAGE on it WITHOUT grant option. 0081's
-- `GRANT USAGE ON SCHEMA auth TO futari_backup` is therefore refused (WARNING
-- 01007, nothing granted; verified on dev 2026-10-05) and its table grants on
-- auth.users / auth.identities are unusable without schema USAGE. That is the
-- Supabase norm, not a migration bug. Never "fix" it with pg_read_all_data.
-- Instead `postgres` (which can read both tables) owns two views in its own
-- schema and grants SELECT on those views only. A plain view runs with its
-- owner's rights, so futari_backup reads the same rows without any privilege
-- on schema auth.
--
-- Why whole-row jsonb (`to_jsonb(u) AS r`): a view that names columns records
-- a per-column dependency in pg_depend, and Supabase Auth's own migrations
-- (DROP COLUMN, ALTER COLUMN TYPE) would then fail on it — sign-in breaking
-- after a Supabase Auth rollout. A whole-row reference depends on the table
-- only (pg_depend refobjsubid = 0): DROP / ALTER TYPE / RENAME / ADD of a
-- column all still work, and new or renamed columns show up in `r` by
-- themselves (probed on dev 2026-10-05 in a rolled-back transaction).
--
-- Why OFFSET 0: a single-table view without it is auto-updatable — DELETE
-- through it needs no column, so a role holding DELETE on the view could
-- delete auth rows with postgres's rights. OFFSET makes the view not
-- updatable at all (DELETE → 55000).
--
-- The views must stay owner-rights views (no security_invoker option).
--   Failure look if someone sets security_invoker=on (for instance to quiet a
--   Supabase advisor): nothing errors here; every nightly backup then fails at
--   the auth export stage with error kind `permission`, because the view now
--   checks futari_backup's own (absent) rights on auth.users.
--   Failure look on a database restored without this schema: the backup fails
--   at its privilege preflight with `relation "backup_auth.users" does not
--   exist`. The restored journal already lists 0082, so db:migrate skips it —
--   re-apply this file's body by hand (ops-runbook §「Prod backup
--   (futari_backup)」, 真正還原).
--
-- Exposure: anon / authenticated / service_role / PUBLIC get nothing on the
-- schema or the views (revoked below, asserted at the end). The schema is not
-- in the Data API's exposed schemas.
--
-- Journal `when` (1783850000000) sits between 0081 and later migrations on
-- purpose: drizzle applies an entry only if its `when` is newer than the last
-- applied one, so an entry older than what a database already has is skipped
-- silently (dev: applied by hand, see the runbook).
--
-- Idempotent: safe to re-run as postgres. Rollback:
-- scripts/rollback/0082_backup_auth_views.down.sql.

CREATE SCHEMA IF NOT EXISTS backup_auth AUTHORIZATION postgres;
--> statement-breakpoint
CREATE OR REPLACE VIEW backup_auth.users AS
  SELECT to_jsonb(u) AS r FROM auth.users u OFFSET 0;
--> statement-breakpoint
CREATE OR REPLACE VIEW backup_auth.identities AS
  SELECT to_jsonb(i) AS r FROM auth.identities i OFFSET 0;
--> statement-breakpoint
REVOKE ALL ON SCHEMA backup_auth FROM PUBLIC, anon, authenticated, service_role;
--> statement-breakpoint
REVOKE ALL ON TABLE backup_auth.users, backup_auth.identities FROM PUBLIC, anon, authenticated, service_role;
--> statement-breakpoint
GRANT USAGE ON SCHEMA backup_auth TO futari_backup;
--> statement-breakpoint
GRANT SELECT ON TABLE backup_auth.users, backup_auth.identities TO futari_backup;
--> statement-breakpoint
-- Clean up 0081's dead auth grants. Where 0081's grant was refused these are
-- no-ops (a WARNING at most); the backup reads backup_auth only.
REVOKE ALL ON TABLE auth.users, auth.identities FROM futari_backup;
--> statement-breakpoint
REVOKE ALL ON SCHEMA auth FROM futari_backup;
--> statement-breakpoint
-- Hard check of the result. Any extra grantee (a default privilege on some
-- environment, a hand-made grant), a different owner, a view option, or a
-- missing grant stops the migration here instead of leaving auth rows
-- readable by someone else. Compared as sets (aclexplode), so the owner's own
-- entry may differ between server versions (PG17 adds MAINTAIN).
DO $$
DECLARE
  extra text;
  v text;
  rl text;
BEGIN
  IF (SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname = 'backup_auth') IS DISTINCT FROM 'postgres' THEN
    RAISE EXCEPTION 'backup_auth is not owned by postgres';
  END IF;

  SELECT string_agg(e, ' ' ORDER BY e) INTO extra FROM (
    SELECT format('%s:%s:%s:%s', a.grantor::regrole,
                  CASE a.grantee WHEN 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END,
                  a.privilege_type, a.is_grantable::text) AS e
      FROM pg_namespace n, aclexplode(n.nspacl) a
     WHERE n.nspname = 'backup_auth' AND a.grantee <> n.nspowner
  ) s;
  IF extra IS DISTINCT FROM 'postgres:futari_backup:USAGE:false' THEN
    RAISE EXCEPTION 'backup_auth schema ACL is not exactly owner + futari_backup USAGE: %', coalesce(extra, '(none)');
  END IF;

  FOREACH v IN ARRAY ARRAY['users', 'identities'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'backup_auth' AND c.relname = v AND c.relkind = 'v'
         AND pg_get_userbyid(c.relowner) = 'postgres' AND c.reloptions IS NULL
    ) THEN
      RAISE EXCEPTION 'backup_auth.% is missing, not a view, not owned by postgres, or carries view options', v;
    END IF;

    SELECT string_agg(e, ' ' ORDER BY e) INTO extra FROM (
      SELECT format('%s:%s:%s:%s', a.grantor::regrole,
                    CASE a.grantee WHEN 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END,
                    a.privilege_type, a.is_grantable::text) AS e
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace, aclexplode(c.relacl) a
       WHERE n.nspname = 'backup_auth' AND c.relname = v AND a.grantee <> c.relowner
    ) s;
    IF extra IS DISTINCT FROM 'postgres:futari_backup:SELECT:false' THEN
      RAISE EXCEPTION 'backup_auth.% ACL is not exactly owner + futari_backup SELECT: %', v, coalesce(extra, '(none)');
    END IF;

    IF has_table_privilege('futari_backup', format('backup_auth.%I', v), 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
      RAISE EXCEPTION 'futari_backup holds a write privilege on backup_auth.%', v;
    END IF;

    FOREACH rl IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rl)
         AND (has_schema_privilege(rl, 'backup_auth', 'USAGE')
              OR has_table_privilege(rl, format('backup_auth.%I', v), 'SELECT')) THEN
        RAISE EXCEPTION '% can reach backup_auth.%', rl, v;
      END IF;
    END LOOP;
  END LOOP;
END
$$;
