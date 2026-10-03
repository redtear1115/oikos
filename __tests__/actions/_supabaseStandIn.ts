// ─── A fresh Supabase stand-in database, migrated up to a chosen migration ──
//
// LOCAL THROWAWAY SERVER ONLY. `createStandInDb` creates a new database on the
// server `adminUrl` points at (it refuses anything that is not localhost),
// fills in the Supabase pieces the migrations and RLS policies call, then
// runs the repo's migrations through drizzle's own migrator in journal order,
// stopping after `through` (e.g. '0079'). `dropStandInDb` removes it.
//
// What is modelled, and why each piece matters (#1518):
//   - roles anon / authenticated / service_role, auth.users, auth.uid() that
//     reads `request.jwt.claims` the way Supabase's does, cron.schedule /
//     cron.unschedule, public.rls_auto_enable(), the supabase_realtime
//     publication — the objects migrations reference.
//   - Supabase's DEFAULT ACL: on Supabase every table, sequence and function
//     the `postgres` role creates in `public` is granted ALL to anon,
//     authenticated and service_role. A stand-in without it starts with no
//     grants at all, so a test of "authenticated cannot read X" passes for
//     the wrong reason — the grant was never there. Failure look of a
//     stand-in that skips this: every revoke test is green before the revoke
//     migration even runs (hence the positive controls in the tests).
//   - RLS ENABLED on every public table after the migrations. On Supabase
//     several tables got RLS from the bootstrap (db/rls/policies.sql), not
//     from a migration; the read-only check of 2026-10-03 found it on for
//     every public table in dev and prod.
//   - db/triggers/handle_new_user.sql, before the migrations (0018 alters it).
//
// Roles are cluster-wide and created only if missing; everything else lives
// in the new database.

import { randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync, symlinkSync, readdirSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'

const REPO = resolve(__dirname, '../..')

export const STANDIN_SQL = `
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb, created_at timestamptz DEFAULT now());
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $f$
  SELECT coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $f$;
CREATE SCHEMA cron;
CREATE TABLE cron.job (jobid bigserial PRIMARY KEY, jobname text UNIQUE, schedule text, command text);
CREATE FUNCTION cron.schedule(p_name text, p_schedule text, p_command text) RETURNS bigint LANGUAGE sql AS $f$
  INSERT INTO cron.job (jobname, schedule, command) VALUES (p_name, p_schedule, p_command)
  ON CONFLICT (jobname) DO UPDATE SET schedule = EXCLUDED.schedule, command = EXCLUDED.command RETURNING jobid $f$;
CREATE FUNCTION cron.unschedule(p_name text) RETURNS boolean LANGUAGE plpgsql AS $f$
BEGIN DELETE FROM cron.job WHERE jobname = p_name; IF NOT FOUND THEN RAISE EXCEPTION 'no job %', p_name; END IF; RETURN true; END $f$;
CREATE PUBLICATION supabase_realtime;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
CREATE FUNCTION public.rls_auto_enable() RETURNS void LANGUAGE sql AS $f$ SELECT $f$;
`

export function isLocalUrl(url: string): boolean {
  try {
    return ['localhost', '127.0.0.1', '::1'].includes(new URL(url).hostname)
  } catch {
    return false
  }
}

/** A drizzle migrations folder holding journal entries up to and including `through` ('0079'). */
function trimmedMigrationsFolder(through: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'oikos-standin-'))
  mkdirSync(join(dir, 'meta'))
  const journal = JSON.parse(readFileSync(join(REPO, 'drizzle/meta/_journal.json'), 'utf-8')) as {
    entries: { idx: number; tag: string }[]
  }
  const keep = journal.entries.filter((e) => e.tag.slice(0, 4) <= through)
  if (!keep.some((e) => e.tag.startsWith(through))) throw new Error(`no migration ${through} in the journal`)
  writeFileSync(join(dir, 'meta/_journal.json'), JSON.stringify({ ...journal, entries: keep }))
  const wanted = new Set(keep.map((e) => `${e.tag}.sql`))
  for (const f of readdirSync(join(REPO, 'drizzle'))) {
    if (wanted.has(f)) symlinkSync(join(REPO, 'drizzle', f), join(dir, f))
  }
  return dir
}

/** Run the repo's migrations (journal order) on `url`, up to and including `through`. */
export async function migrateThrough(url: string, through: string): Promise<void> {
  if (!isLocalUrl(url)) throw new Error('refusing to migrate a non-local database')
  const folder = trimmedMigrationsFolder(through)
  const client = postgres(url, { max: 1, onnotice: () => {} })
  try {
    await migrate(drizzle(client), { migrationsFolder: folder })
  } finally {
    await client.end()
    rmSync(folder, { recursive: true, force: true })
  }
}

/** Create a fresh stand-in database on the server of `adminUrl`, migrated through `through`. Returns its URL. */
export async function createStandInDb(adminUrl: string, through: string): Promise<string> {
  if (!isLocalUrl(adminUrl)) throw new Error('refusing to create a stand-in on a non-local server')
  const name = `standin_${randomUUID().replace(/-/g, '').slice(0, 12)}`
  const admin = postgres(adminUrl, { max: 1, onnotice: () => {} })
  try {
    await admin.unsafe(`CREATE DATABASE ${name}`)
  } finally {
    await admin.end()
  }
  const u = new URL(adminUrl)
  u.pathname = `/${name}`
  const url = u.toString()

  const db = postgres(url, { max: 1, onnotice: () => {} })
  try {
    await db.unsafe(STANDIN_SQL)
    // Bootstrap order on Supabase: the trigger function existed before the
    // migrations (0018 alters it).
    await db.unsafe(readFileSync(join(REPO, 'db/triggers/handle_new_user.sql'), 'utf-8'))
  } finally {
    await db.end()
  }
  await migrateThrough(url, through)
  const db2 = postgres(url, { max: 1, onnotice: () => {} })
  try {
    await db2.unsafe(`
      DO $$ DECLARE t text; BEGIN
        FOR t IN SELECT format('%I.%I', schemaname, tablename) FROM pg_tables WHERE schemaname = 'public' LOOP
          EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
        END LOOP;
      END $$`)
  } finally {
    await db2.end()
  }
  return url
}

export async function dropStandInDb(adminUrl: string, url: string): Promise<void> {
  const name = new URL(url).pathname.slice(1)
  if (!/^standin_[0-9a-f]{12}$/.test(name)) throw new Error(`not a stand-in database: ${name}`)
  const admin = postgres(adminUrl, { max: 1, onnotice: () => {} })
  try {
    await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`)
  } finally {
    await admin.end()
  }
}
