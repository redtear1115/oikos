import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  chmodSync,
  copyFileSync,
  existsSync,
  readdirSync,
  rmSync,
  statSync,
  readFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * #1549 — the read-only backup role `futari_backup` and the nightly backup.
 *
 * The repo is public, and none of these mistakes errors when it happens:
 *   - a credential, a connection URL or a project host in a committed file
 *     sits in git history from then on;
 *   - a broader grant (another schema, pg_read_all_data, a function) turns a
 *     backup credential into a way into vault / storage / everything;
 *   - `set -x` in a script that holds the password prints it to the log;
 *   - a drill that reads a service-role key or schedules cron jobs on a
 *     restored copy starts calling production Edge Functions;
 *   - a --dry-run that touches a tool contacts production while "only
 *     planning".
 * So the checks below are on the files, scoped to the files #1549 added.
 */

const ROOT = join(__dirname, '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

const MIGRATION_TAG = '0081_futari_backup_role'
const migration = read(`drizzle/${MIGRATION_TAG}.sql`)
// 0081's `GRANT USAGE ON SCHEMA auth` is refused on Supabase (postgres has no
// grant option there), so auth rows are read through postgres-owned views.
const VIEWS_TAG = '0082_backup_auth_views'
const VIEWS_WHEN = 1783850000000
const viewsMigration = read(`drizzle/${VIEWS_TAG}.sql`)
const dropScript = read('scripts/ops/drop-futari-backup-role.sql')
const counts = read('scripts/ops/futari-backup-counts.sql')
const backup = read('scripts/ops/backup-prod.sh')
const drill = read('scripts/ops/backup-restore-drill.sh')
const install = read('scripts/ops/install-backup.sh')
const wrapper = read('scripts/ops/futari-backup-run.sh')
const plist = read('scripts/ops/launchd/futari-backup.plist.template')

const SHELL_SCRIPTS = [
  'scripts/ops/backup-prod.sh',
  'scripts/ops/backup-restore-drill.sh',
  'scripts/ops/install-backup.sh',
  'scripts/ops/futari-backup-run.sh',
] as const
const NEW_FILES = [
  `drizzle/${MIGRATION_TAG}.sql`,
  `drizzle/${VIEWS_TAG}.sql`,
  `scripts/rollback/${VIEWS_TAG}.down.sql`,
  'scripts/ops/drop-futari-backup-role.sql',
  'scripts/ops/futari-backup-counts.sql',
  'scripts/ops/futari-backup-manifest.sql',
  'scripts/ops/launchd/futari-backup.plist.template',
  ...SHELL_SCRIPTS,
] as const

const RUNBOOK_HEADING = '## Prod backup (futari_backup)'
function runbookSection(): string {
  const doc = read('docs/superpowers/ops-runbook.md')
  const start = doc.indexOf(`\n${RUNBOOK_HEADING}\n`)
  if (start === -1) return ''
  const next = doc.indexOf('\n## ', start + RUNBOOK_HEADING.length + 1)
  return doc.slice(start, next === -1 ? undefined : next)
}

/** SQL with `--` comments removed, so a comment can't satisfy or trip a check. */
const sqlCode = (sql: string) => sql.replace(/--[^\n]*/g, '')
/** Shell with whole-line `#` comments removed (the shebang included). */
const shCode = (sh: string) =>
  sh
    .split('\n')
    .filter((l) => !/^\s*#/.test(l))
    .join('\n')

// Shapes a credential or a location leaks through. Kept as patterns (not
// literal strings in the checked files) so the checks themselves can be
// written down.
const LEAK_SHAPES: [string, RegExp][] = [
  ['libpq password env var', /PGPASSWORD/],
  ["a PASSWORD '...' literal", /PASSWORD\s+'/i],
  ['a postgres connection URL', /postgres(ql)?:\/\//i],
  ['a Supabase host', /supabase\.(co|com)\b/i],
  ['a pooler host', /pooler\./i],
  ['a 20-letter project ref', /\b[a-z]{20}\b/],
  ['an age secret key', /AGE-SECRET-KEY-1[0-9A-Z]{20,}/],
  ['a pinned age recipient', /\bage1[02-9ac-hj-np-z]{58}\b/],
]

describe('0081 futari_backup migration (#1549)', () => {
  it('is in the journal, after every earlier entry', () => {
    const { entries } = JSON.parse(read('drizzle/meta/_journal.json')) as {
      entries: { tag: string; when: number }[]
    }
    const i = entries.findIndex((e) => e.tag === MIGRATION_TAG)
    expect(i, 'journal entry missing — db:migrate would silently skip the file (#874)').toBeGreaterThan(-1)
    for (const e of entries.slice(0, i)) expect(entries[i].when).toBeGreaterThan(e.when)
  })

  it('contains no credential at all — not even the word, comments included', () => {
    expect(migration).not.toMatch(/PASSWORD/i)
  })

  it('creates the role NOLOGIN with the narrow attribute set and a 2-connection limit, and never enables login', () => {
    const sql = sqlCode(migration)
    const create = sql.match(/CREATE ROLE futari_backup\b[^;]*;/)
    expect(create, 'CREATE ROLE futari_backup … ; not found').not.toBeNull()
    for (const attr of ['NOLOGIN', 'NOSUPERUSER', 'NOCREATEROLE', 'NOCREATEDB', 'NOREPLICATION', 'NOINHERIT', 'BYPASSRLS']) {
      expect(create![0]).toMatch(new RegExp(`\\b${attr}\\b`))
    }
    expect(create![0]).toMatch(/CONNECTION LIMIT 2\b/)
    expect(sql).not.toMatch(/(?<!NO)LOGIN\b/)
    expect(sql).toMatch(/ALTER ROLE futari_backup SET default_transaction_read_only = on;/)
    // The snapshot holder idles inside its transaction while the dumps run.
    expect(sql).not.toMatch(/idle_in_transaction_session_timeout|statement_timeout/)
  })

  // Every grant: SELECT or USAGE only, to futari_backup only, on the allowed
  // schemas only; in auth only users / identities, in cron only job.
  it('grants nothing but SELECT / USAGE on public, drizzle, auth.users/identities and cron.job', () => {
    const sql = sqlCode(migration).replace(/DO \$\$[\s\S]*?\$\$;/g, '')
    const grants = sql
      .split(';')
      .map((s) => s.replace(/\s+/g, ' ').trim())
      .filter((s) => /\bGRANT\b/i.test(s))
    expect(grants.length).toBeGreaterThanOrEqual(10)
    for (const g of grants) {
      const m = g.match(/\bGRANT (.+?) ON (.+?) TO (\w+)$/i)
      expect(m, `unrecognised grant: ${g}`).not.toBeNull()
      const [, privs, target, grantee] = m!
      expect(grantee).toBe('futari_backup')
      for (const p of privs.split(',').map((x) => x.trim())) expect(['SELECT', 'USAGE']).toContain(p)
      const schema = target.match(/\b(?:SCHEMA|IN SCHEMA)\s+(\w+)/i)?.[1]
      const tables = target.match(/^TABLE (.+)$/i)?.[1]
      if (/^(TABLES|SEQUENCES)$/i.test(target)) {
        expect(g).toMatch(/^ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT ON (TABLES|SEQUENCES) TO futari_backup$/)
      } else if (schema) {
        expect(['public', 'drizzle', 'auth', 'cron']).toContain(schema)
        if (/ALL (TABLES|SEQUENCES) IN SCHEMA/i.test(target)) expect(['public', 'drizzle']).toContain(schema)
      } else {
        expect(tables, `grant target neither schema nor table: ${g}`).toBeTruthy()
        for (const t of tables!.split(',').map((x) => x.trim())) {
          expect(['auth.users', 'auth.identities', 'cron.job']).toContain(t)
        }
      }
    }
    expect(sql).not.toMatch(/\bGRANT\s+ALL\b/i)
    expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE|EXECUTE|REFERENCES|TRIGGER)\b/i)
    expect(sql).not.toMatch(/pg_read_all_data|pg_write_all_data|pg_monitor|pg_signal_backend/i)
    expect(sql).not.toMatch(/\bON\s+(ALL\s+)?(FUNCTIONS?|ROUTINES?|PROCEDURES?)\b/i)
    // No role membership in either direction.
    expect(sql).not.toMatch(/\bGRANT\s+futari_backup\b|\bGRANT\s+\w+\s+TO\s+futari_backup\s*;/i)
  })

  it('grants the default privileges for tables and sequences postgres creates later', () => {
    const sql = sqlCode(migration)
    expect(sql).toMatch(/ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public\s+GRANT SELECT ON TABLES TO futari_backup/)
    expect(sql).toMatch(/ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public\s+GRANT SELECT ON SEQUENCES TO futari_backup/)
    expect(sql).toMatch(/GRANT SELECT ON TABLE auth\.users, auth\.identities TO futari_backup/)
    expect(sql).toMatch(/GRANT SELECT ON TABLE cron\.job TO futari_backup/)
  })
})

/** Statements outside DO blocks, comments removed, whitespace collapsed. */
const statements = (sql: string) =>
  sqlCode(sql)
    .replace(/DO \$\$[\s\S]*?\$\$;/g, '')
    .split(';')
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

describe('0082 backup_auth views (#1549)', () => {
  it('is in the journal after 0081, with the `when` that keeps it before later migrations', () => {
    const { entries } = JSON.parse(read('drizzle/meta/_journal.json')) as {
      entries: { idx: number; tag: string; when: number; breakpoints: boolean }[]
    }
    const i = entries.findIndex((e) => e.tag === VIEWS_TAG)
    expect(i, 'journal entry missing — db:migrate would silently skip the file (#874)').toBeGreaterThan(-1)
    expect(entries[i]).toMatchObject({ idx: 82, when: VIEWS_WHEN, breakpoints: true })
    for (const e of entries.slice(0, i)) expect(entries[i].when).toBeGreaterThan(e.when)
  })

  it('contains no credential at all — not even the word, comments included', () => {
    expect(viewsMigration).not.toMatch(/PASSWORD/i)
  })

  // Two whole-row jsonb views: no per-column dependency (Supabase Auth's own
  // DROP / ALTER COLUMN keeps working), not auto-updatable (OFFSET 0), and
  // owner-rights (no view options).
  it('builds exactly two whole-row jsonb views over auth.users / auth.identities, each with OFFSET 0', () => {
    const stmts = statements(viewsMigration)
    expect(stmts).toContain('CREATE SCHEMA IF NOT EXISTS backup_auth AUTHORIZATION postgres')
    const views = stmts.filter((s) => /\bVIEW\b/i.test(s))
    expect(views).toEqual([
      'CREATE OR REPLACE VIEW backup_auth.users AS SELECT to_jsonb(u) AS r FROM auth.users u OFFSET 0',
      'CREATE OR REPLACE VIEW backup_auth.identities AS SELECT to_jsonb(i) AS r FROM auth.identities i OFFSET 0',
    ])
  })

  it('has no function, no SECURITY DEFINER, no security_invoker, no WITH CHECK, no view options', () => {
    const code = sqlCode(viewsMigration)
    expect(code).not.toMatch(/SECURITY\s+DEFINER/i)
    expect(code).not.toMatch(/\bFUNCTION\b|\bPROCEDURE\b|\bROUTINE\b/i)
    expect(code).not.toMatch(/security_invoker/i)
    expect(code).not.toMatch(/WITH\s+(LOCAL\s+|CASCADED\s+)?CHECK/i)
    expect(code).not.toMatch(/\bVIEW\s+[\w.]+\s+WITH\s*\(/i)
    expect(code).not.toMatch(/pg_read_all_data|pg_write_all_data|ALTER DEFAULT PRIVILEGES|\bGRANT\s+ALL\b/i)
    expect(code).not.toMatch(/\bCREATE\s+ROLE\b|\bALTER\s+ROLE\b/i)
  })

  it('grants exactly USAGE on backup_auth and SELECT on its two views, to futari_backup only', () => {
    const grants = statements(viewsMigration).filter((s) => /\bGRANT\b/i.test(s) && !/^REVOKE\b/i.test(s))
    expect(grants).toEqual([
      'GRANT USAGE ON SCHEMA backup_auth TO futari_backup',
      'GRANT SELECT ON TABLE backup_auth.users, backup_auth.identities TO futari_backup',
    ])
    const outsideDo = statements(viewsMigration).join(';\n')
    expect(outsideDo).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE|EXECUTE|REFERENCES|TRIGGER)\b/i)
  })

  it('revokes everything from PUBLIC, anon, authenticated, service_role and drops 0081\'s auth grants', () => {
    const stmts = statements(viewsMigration)
    expect(stmts).toContain('REVOKE ALL ON SCHEMA backup_auth FROM PUBLIC, anon, authenticated, service_role')
    expect(stmts).toContain(
      'REVOKE ALL ON TABLE backup_auth.users, backup_auth.identities FROM PUBLIC, anon, authenticated, service_role',
    )
    expect(stmts).toContain('REVOKE ALL ON TABLE auth.users, auth.identities FROM futari_backup')
    expect(stmts).toContain('REVOKE ALL ON SCHEMA auth FROM futari_backup')
    // The revokes run before the grants (a later REVOKE FROM PUBLIC never
    // touches futari_backup, but keep the order obvious).
    expect(stmts.findIndex((s) => s.startsWith('REVOKE ALL ON SCHEMA backup_auth'))).toBeLessThan(
      stmts.findIndex((s) => s.startsWith('GRANT USAGE ON SCHEMA backup_auth')),
    )
  })

  it('ends with a DO block that asserts the exact ACLs, owner and options, and RAISEs otherwise', () => {
    const code = sqlCode(viewsMigration)
    const blocks = code.match(/DO \$\$[\s\S]*?\$\$;/g) ?? []
    expect(blocks).toHaveLength(1)
    const check = blocks[0] ?? ''
    expect(code.trimEnd().endsWith(check)).toBe(true)
    expect(check).toContain("'postgres:futari_backup:USAGE:false'")
    expect(check).toContain("'postgres:futari_backup:SELECT:false'")
    // format('%s', bool) renders 'f', not 'false': without the ::text cast the
    // assertion RAISEs on every environment (caught applying to dev 2026-10-05).
    expect(check.match(/a\.is_grantable::text/g) ?? []).toHaveLength(2)
    expect(check).toMatch(/aclexplode\(n\.nspacl\)/)
    expect(check).toMatch(/aclexplode\(c\.relacl\)/)
    expect(check).toMatch(/c\.reloptions IS NULL/)
    expect(check).toMatch(/c\.relkind = 'v'/)
    expect(check).toMatch(/IS DISTINCT FROM 'postgres'/)
    expect((check.match(/RAISE EXCEPTION/g) ?? []).length).toBeGreaterThanOrEqual(5)
  })

  it('counts read the views, with the auth.* labels the sanity check and the drill compare expect', () => {
    const code = sqlCode(counts)
    expect(code).toMatch(/SELECT 'auth\.users', count\(\*\) FROM backup_auth\.users;/)
    expect(code).toMatch(/SELECT 'auth\.identities', count\(\*\) FROM backup_auth\.identities;/)
    expect(code).not.toMatch(/FROM auth\./)
  })

  it('rollback drops the schema and nothing else', () => {
    const stmts = statements(read(`scripts/rollback/${VIEWS_TAG}.down.sql`))
    expect(stmts).toEqual([
      'DROP SCHEMA IF EXISTS backup_auth CASCADE',
      `DELETE FROM drizzle.__drizzle_migrations WHERE created_at = ${VIEWS_WHEN}`,
    ])
  })
})

describe('drop script (#1549)', () => {
  const sql = sqlCode(dropScript)
  it('turns login off, terminates sessions, revokes default privileges and every grant, then drops — in that order', () => {
    const order = [
      'ALTER ROLE futari_backup NOLOGIN',
      'pg_terminate_backend',
      'REVOKE ALL ON TABLES FROM futari_backup',
      'REVOKE ALL ON SEQUENCES FROM futari_backup',
      'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM futari_backup',
      'REVOKE ALL ON ALL TABLES IN SCHEMA drizzle FROM futari_backup',
      'REVOKE ALL ON TABLE backup_auth.users, backup_auth.identities FROM futari_backup',
      'REVOKE ALL ON SCHEMA backup_auth FROM futari_backup',
      'REVOKE ALL ON TABLE auth.users, auth.identities FROM futari_backup',
      'REVOKE ALL ON TABLE cron.job FROM futari_backup',
      'REVOKE ALL ON SCHEMA cron FROM futari_backup',
      'DROP ROLE futari_backup',
    ]
    let at = -1
    for (const step of order) {
      const i = sql.indexOf(step, at + 1)
      expect(i, `${step} missing or out of order`).toBeGreaterThan(at)
      at = i
    }
    for (const schema of ['public', 'drizzle', 'auth', 'cron']) {
      expect(sql).toContain(`REVOKE ALL ON SCHEMA ${schema} FROM futari_backup`)
    }
    expect(sql).not.toMatch(/DROP OWNED/i)
  })

  // pg_stat_activity is a view: pg_terminate_backend(...) in its WHERE clause
  // gets pushed below the user-name filter and terminates every session the
  // caller may signal, including its own. Only the select-list form is safe.
  it.each([
    ['ops-runbook §Prod backup', runbookSection],
    ['scripts/ops/drop-futari-backup-role.sql', () => sql],
  ])('%s never calls pg_terminate_backend from a WHERE clause', (_name, text) => {
    const body = text()
    expect(body).toMatch(/pg_terminate_backend/)
    expect(body).not.toMatch(/\b(WHERE|AND|OR)\s+(NOT\s+)?\(?\s*pg_terminate_backend/i)
  })
})

describe('no leak shape in any file #1549 added, nor in its runbook section', () => {
  it('the runbook section exists and says what failure looks like', () => {
    const s = runbookSection()
    expect(s.length).toBeGreaterThan(2000)
    expect(s).toContain('擋得住／擋不住')
    expect((s.match(/失效的樣子|漏掉：/g) ?? []).length).toBeGreaterThanOrEqual(8)
  })

  it.each([...NEW_FILES.map((rel) => [rel, () => read(rel)] as [string, () => string]), ['ops-runbook §Prod backup', runbookSection] as [string, () => string]])(
    '%s',
    (_name, text) => {
      const body = text()
      for (const [name, re] of LEAK_SHAPES) expect(body, name).not.toMatch(re)
    },
  )

  it('the scripts and the plist template carry no URL at all', () => {
    for (const rel of [...SHELL_SCRIPTS, 'scripts/ops/launchd/futari-backup.plist.template']) {
      expect(read(rel), rel).not.toMatch(/:\/\//)
    }
  })

  it('the Keychain item is always created with -w last, so the password is prompted for', () => {
    const uses = [...runbookSection().matchAll(/add-generic-password[^`\n]*/g)].map((m) => m[0].trim())
    expect(uses.length).toBeGreaterThan(0)
    for (const u of uses) expect(u, u).toMatch(/ -w$/)
  })
})

describe('shell scripts (#1549)', () => {
  it.each(SHELL_SCRIPTS)('%s: strict mode, private umask, never traces', (rel) => {
    const body = shCode(read(rel))
    expect(body).toMatch(/^set -euo pipefail$/m)
    expect(body).toMatch(/^umask 077$/m)
    expect(body).not.toMatch(/\bset\s+-[a-wyz]*x|set\s+-o\s+xtrace|\bbash\s+-x\b|BASH_XTRACEFD/)
  })

  it('backup: the age recipient is a placeholder pinned at install, never read from config', () => {
    expect(backup.match(/__FUTARI_BACKUP_AGE_RECIPIENT__/g)).toHaveLength(1)
    expect(backup).toMatch(/^readonly AGE_RECIPIENT='__FUTARI_BACKUP_AGE_RECIPIENT__'$/m)
    expect(shCode(backup)).not.toMatch(/CFG_AGE_RECIPIENT/)
    expect(install).toMatch(/sed "s\/\$\{PLACEHOLDER\}\/\$\{RECIPIENT\}\/"/)
  })

  it('backup: one exported snapshot shared by the public dump and both auth exports, each streamed into age with every pipe stage checked', () => {
    const code = shCode(backup)
    expect(code).toMatch(/BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY/)
    expect(code).toMatch(/pg_export_snapshot\(\)/)
    expect(code).toMatch(/--snapshot="\$SNAPSHOT"/)
    expect(code.match(/\| "\$AGE" -r "\$AGE_RECIPIENT" -o "\$\{STAGING\}\/bundle\/\$\{name\}\.partial"/g)).toHaveLength(2)
    expect(code).toMatch(/PIPESTATUS/)
    expect(code).toMatch(/--schema=public --schema=drizzle/)
    // pg_dump never writes to a file: its only output is the pipe into age.
    expect(code).not.toMatch(/PG_DUMP[^\n]*(-f|--file)\b/)
  })

  // Auth rows come from the backup_auth views (0082) as data only, under the
  // holder's snapshot, in a second session — never from schema auth itself,
  // never as a pg_dump archive.
  it('backup: auth parts are COPY of the backup_auth views in a session that imports the snapshot, UTF8 pinned', () => {
    const code = shCode(backup)
    expect(code).not.toMatch(/--table=auth\./)
    expect(code).not.toMatch(/\bauth\.dump\.age\b/)
    expect(code).not.toMatch(/FROM auth\./)
    const order = [
      '"SET client_encoding = \'UTF8\';"',
      '"BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;"',
      '"SET TRANSACTION SNAPSHOT \'${SNAPSHOT}\';"',
      '"COPY (SELECT r FROM backup_auth.${view}) TO STDOUT;"',
      '"COMMIT;"',
    ]
    let at = -1
    for (const step of order) {
      const i = code.indexOf(step, at + 1)
      expect(i, `${step} missing or out of order`).toBeGreaterThan(at)
      at = i
    }
    expect(code).toMatch(/^copy_part auth-users\.copy\.age users "\$MIN_BYTES_AUTH"$/m)
    expect(code).toMatch(/^copy_part auth-identities\.copy\.age identities "\$MIN_BYTES_AUTH"$/m)
    // Sequential, after the public dump: holder + one exporter = 2 connections.
    expect(code.indexOf('dump_part public.dump.age')).toBeLessThan(code.indexOf('copy_part auth-users.copy.age'))
    expect(code).not.toMatch(/copy_part[^\n]*&\s*$/m)
    expect(code).toMatch(/send "\\\\qecho 'bundle_format\\\\t2'"/)
  })

  it('backup: refuses to run if the role can write to backup_auth, before any part is written', () => {
    const code = shCode(backup)
    const chk = code.indexOf(
      "has_table_privilege(current_user, 'backup_auth.users', 'INSERT,UPDATE,DELETE,TRUNCATE') OR has_table_privilege(current_user, 'backup_auth.identities', 'INSERT,UPDATE,DELETE,TRUNCATE') OR has_schema_privilege(current_user, 'backup_auth', 'CREATE')",
    )
    expect(chk).toBeGreaterThan(-1)
    expect(code).toMatch(/if \[ "\$WRITE_CHK" != 'f' \]; then/)
    expect(chk).toBeLessThan(code.indexOf("send \"\\\\i '${COUNTS_SQL}'\""))
    expect(chk).toBeLessThan(code.indexOf('dump_part public.dump.age'))
  })

  it('backup: the upload check expects exactly the four bundle_format 2 files', () => {
    const code = shCode(backup)
    expect(code).toMatch(/grep -c \.\)" = '4' \] \|\| die "remote bundle does not hold exactly 4 files"/)
    expect(code).toMatch(/^for part in public\.dump\.age auth-users\.copy\.age auth-identities\.copy\.age manifest\.txt\.age; do$/m)
  })

  // The password's only exit is the 600 pgpass file in the staging dir:
  // stdout / stderr end up in the log or a transcript, argv and env in `ps`.
  it('backup: the Keychain secret only ever goes into the staging pgpass file', () => {
    const code = shCode(backup)
    expect(code).toMatch(/security find-generic-password -s "\$CFG_KEYCHAIN_SERVICE" -a "\$CFG_KEYCHAIN_ACCOUNT" -w/)
    const uses = code.split('\n').filter((l) => /\$\{?PW\b|"\$PW"/.test(l))
    for (const l of uses) {
      const ok =
        /^\s*\[ -n "\$PW" \]/.test(l) ||
        /^\s*printf '%s:%s:%s:%s:%s\\n' .*"\$\(esc "\$PW"\)" > "\$\{STAGING\}\/pgpass"$/.test(l)
      expect(ok, `unexpected use of the secret: ${l.trim()}`).toBe(true)
    }
    expect(code).toMatch(/^PW=''$/m)
    expect(code).toMatch(/^unset PW$/m)
    expect(code).toMatch(/export PGPASSFILE="\$\{STAGING\}\/pgpass"/)
  })

  it('backup: retention numbers match the privacy policy (30 kept, min 7, nothing younger than 30 days)', () => {
    expect(backup).toMatch(/^readonly KEEP_NEWEST=30$/m)
    expect(backup).toMatch(/^readonly KEEP_MIN=7$/m)
    expect(backup).toMatch(/^readonly KEEP_DAYS=30$/m)
  })

  it('drill: local target only, no service-role key, no Vault, schedules nothing', () => {
    const code = shCode(drill)
    expect(code).toMatch(/^export PGHOST='127\.0\.0\.1'$/m)
    expect(code.match(/PGHOST=/g)).toHaveLength(1)
    expect(code).not.toMatch(/service_role|SERVICE_ROLE|supabase\s+status|\.env\b|vault\.|cron\.schedule|cron\.alter_job/i)
    expect(code).toMatch(/SELECT count\(\*\) FROM cron\.job WHERE active/)
  })

  it('drill: restores in the runbook order', () => {
    const code = shCode(drill)
    const order = [
      'CREATE ROLE %I WITH NOLOGIN NOSUPERUSER NOCREATEROLE NOCREATEDB NOREPLICATION NOINHERIT BYPASSRLS',
      'REVOKE ALL ON TABLES FROM anon, authenticated',
      '--section=pre-data',
      '-f "$BACKUP_AUTH_SQL"',
      '--section=data',
      'CREATE SCHEMA ${STAGE_SCHEMA}',
      'restore_auth users',
      'restore_auth identities',
      'DROP SCHEMA ${STAGE_SCHEMA} CASCADE',
      '--section=post-data',
      '"$TRIGGER_SQL"',
      'ALTER PUBLICATION supabase_realtime ADD TABLE',
      'cron.job WHERE active',
    ]
    let at = -1
    for (const step of order) {
      const i = code.indexOf(step, at + 1)
      expect(i, `${step} missing or out of order`).toBeGreaterThan(at)
      at = i
    }
  })

  it('drill: re-applies the repo\'s 0082 and accepts bundle_format 2 only, with all four parts present', () => {
    const code = shCode(drill)
    expect(code).toMatch(/^BACKUP_AUTH_SQL="\$\{REPO\}\/drizzle\/0082_backup_auth_views\.sql"$/m)
    expect(code).toMatch(/^for part in public\.dump\.age auth-users\.copy\.age auth-identities\.copy\.age manifest\.txt\.age; do$/m)
    expect(code).toMatch(/\[ "\$BUNDLE_FORMAT" = '2' \] \|\| fail/)
    // Checked before anything is restored.
    expect(code.indexOf('"$BUNDLE_FORMAT" = \'2\'')).toBeLessThan(code.indexOf('restore_pass pre-data'))
    expect(code).not.toMatch(/auth\.dump\.age/)
  })

  // Regression for a crafted part (a line like `\! touch /tmp/x`): decrypted
  // auth data reaches psql only as \copy's data — psql takes its commands from
  // -c and exits after the copy, never reading the part as a script.
  it('drill: decrypted auth parts are only ever fed to `psql -c "\\copy … FROM STDIN"`, never run as a script', () => {
    const code = shCode(drill).replace(/\s*\\\n\s*/g, ' ')
    const authFeeds = code.split('\n').filter((l) => /\bdecrypt "[^\n]*copy\.age/.test(l))
    expect(authFeeds).toHaveLength(1)
    const feed = authFeeds[0]
    expect(feed).toMatch(
      /decrypt "\$\{BUNDLE\}\/auth-\$\{t\}\.copy\.age" 2>>"\$ERR" \| "\$PSQL" -X -w -q -v ON_ERROR_STOP=1 -c "SET client_encoding = 'UTF8'" -c "\\\\copy \$\{STAGE_SCHEMA\}\.\$\{t\} \(r\) FROM STDIN" >\/dev\/null 2>>"\$ERR"$/,
    )
    // Every psql that reads a pipe from decrypt has -c and no -f.
    for (const l of code.split('\n').filter((x) => /\bdecrypt ".*\|\s*"\$PSQL"/.test(x))) {
      expect(l, l).toMatch(/"\$PSQL"[^|]* -c /)
      expect(l, l).not.toMatch(/"\$PSQL"[^|]* (-f|--file)\b/)
    }
    // The INSERT takes validated, %I-quoted, non-generated column names only.
    expect(code).toMatch(/a\.attgenerated = ''/)
    expect(code).toMatch(/c !~ '\^\[a-z_\]\[a-z0-9_\]\*\\\$'/)
    expect(code).toMatch(/jsonb_populate_record\(NULL::auth\.%I, s\.r\)/)
    expect(code).toMatch(/format\('%I', c\)/)
    expect(code).toMatch(/\[\[ "\$t" =~ \^\(users\|identities\)\$ \]\]/)
  })

  it('wrapper: checks the installed SHA-256 sums before running anything', () => {
    const code = shCode(wrapper)
    const check = code.indexOf('shasum -a 256 --status -c SHA256SUMS')
    expect(check).toBeGreaterThan(-1)
    expect(code.indexOf('backup-prod.sh')).toBeGreaterThan(check)
  })

  it('installer never loads the LaunchAgent itself', () => {
    expect(shCode(install)).not.toMatch(/^\s*launchctl\b/m)
  })

  it('installer: every check (recipient, placeholders, plutil, sums) runs before anything is swapped in', () => {
    const code = shCode(install)
    const swap = code.indexOf('mv "$NEW_DEST" "$DEST"')
    expect(swap).toBeGreaterThan(-1)
    for (const check of [
      'recipient line not found after substitution',
      "grep -q '__[A-Z_]*__' \"${PLIST}.new\"",
      '/usr/bin/plutil -lint "${PLIST}.new"',
      'shasum -a 256 --status -c SHA256SUMS',
    ]) {
      const i = code.indexOf(check)
      expect(i, `${check} missing`).toBeGreaterThan(-1)
      expect(i, `${check} runs after the swap`).toBeLessThan(swap)
    }
    // Nothing writes into the live install dir before the swap.
    expect(code.slice(0, swap)).not.toMatch(/> "\$\{DEST\}\/|"\$DEST\/"|chmod [0-7]+ "\$\{DEST\}/)
  })

  it('plist template: placeholders only, daily 03:30, private umask', () => {
    expect(plist).not.toMatch(/\/Users\/|\/home\//)
    // Exactly the two tokens the installer fills — any other `__X__` (even in
    // a comment) makes the installer refuse the rendered plist.
    expect([...new Set(plist.match(/__[A-Z_]*__/g))].sort()).toEqual(['__LAUNCHD_LOG__', '__RUN_SCRIPT__'])
    expect(plist).toMatch(/<key>Hour<\/key>\s*<integer>3<\/integer>\s*<key>Minute<\/key>\s*<integer>30<\/integer>/)
    expect(plist).toMatch(/<key>Umask<\/key>\s*<integer>63<\/integer>/)
  })
})

// The dry run must contact nothing. Run it for real against a throwaway HOME
// whose config points every tool at a trap that records being called.
// The installer is macOS-only (plutil, launchd, BSD userland); CI runs on
// Linux, so this runs on the owner's Mac and in local verification only.
describe.skipIf(process.platform !== 'darwin')('install-backup.sh really installs (#1549)', () => {
  const OPS_FILES = [
    'install-backup.sh',
    'backup-prod.sh',
    'futari-backup-run.sh',
    'futari-backup-counts.sql',
    'futari-backup-manifest.sql',
    'launchd/futari-backup.plist.template',
  ]
  // Built at runtime so this file holds no recipient-shaped string.
  const RECIPIENT = ['age1', 'q'.repeat(58)].join('')

  function setup() {
    const tmp = mkdtempSync(join(tmpdir(), 'futari-backup-install-'))
    const repo = join(tmp, 'repo')
    const home = join(tmp, 'home')
    const bin = join(tmp, 'bin')
    mkdirSync(join(repo, 'scripts/ops/launchd'), { recursive: true })
    mkdirSync(home)
    mkdirSync(bin)
    for (const f of OPS_FILES) copyFileSync(join(ROOT, 'scripts/ops', f), join(repo, 'scripts/ops', f))
    const called = join(tmp, 'CALLED')
    // A real `launchctl` must never run; record it if the installer tries.
    writeFileSync(join(bin, 'launchctl'), `#!/bin/sh\necho "launchctl $*" >> "${called}"\nexit 0\n`)
    chmodSync(join(bin, 'launchctl'), 0o755)
    const env = { HOME: home, PATH: `${bin}:/usr/bin:/bin:/usr/sbin:/sbin`, NODE_ENV: 'test' as const }
    const git = (...args: string[]) =>
      execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@invalid', '-c', 'commit.gpgsign=false', ...args], {
        cwd: repo,
        env,
        stdio: 'pipe',
      })
    git('init', '-q')
    git('add', '.')
    git('commit', '-q', '-m', 'x')
    const run = () =>
      execFileSync('bash', [join(repo, 'scripts/ops/install-backup.sh'), '--allow-untagged', '--recipient', RECIPIENT], {
        encoding: 'utf8',
        env,
        stdio: 'pipe',
      })
    const dest = join(home, '.local/libexec/futari-backup')
    const plistPath = join(home, 'Library/LaunchAgents/local.futari.backup.plist')
    return { tmp, repo, dest, plistPath, called, git, run }
  }

  it('exits 0 with a lint-clean plist, a pinned copy and SHA256SUMS that verify; never calls launchctl', () => {
    const t = setup()
    try {
      const out = t.run()
      expect(out).toMatch(/installed from untagged/)
      const rendered = readFileSync(t.plistPath, 'utf8')
      expect(rendered).not.toMatch(/__[A-Z_]*__/)
      expect(rendered).toContain(`${t.dest}/futari-backup-run.sh`)
      execFileSync('/usr/bin/plutil', ['-lint', t.plistPath], { stdio: 'pipe' })
      execFileSync('/usr/bin/shasum', ['-a', '256', '--status', '-c', 'SHA256SUMS'], { cwd: t.dest, stdio: 'pipe' })
      expect(readFileSync(join(t.dest, 'backup-prod.sh'), 'utf8')).toContain(`readonly AGE_RECIPIENT='${RECIPIENT}'`)
      expect(statSync(t.dest).mode & 0o777).toBe(0o700)
      expect(statSync(join(t.dest, 'backup-prod.sh')).mode & 0o777).toBe(0o500)
      expect(statSync(join(t.dest, 'SHA256SUMS')).mode & 0o777).toBe(0o400)
      expect(readdirSync(join(t.dest, '..')).filter((n) => /\.(new|old)\./.test(n))).toEqual([])
      expect(existsSync(t.called), 'launchctl was called').toBe(false)
    } finally {
      rmSync(t.tmp, { recursive: true, force: true })
    }
  })

  it('a failed check leaves the previous install untouched (no partial install)', () => {
    const t = setup()
    try {
      t.run()
      const sumsBefore = readFileSync(join(t.dest, 'SHA256SUMS'), 'utf8')
      const plistBefore = readFileSync(t.plistPath, 'utf8')
      // A reviewed change that breaks the template: an unknown placeholder,
      // plus a change to a script so a partial install would be visible.
      const tpl = join(t.repo, 'scripts/ops/launchd/futari-backup.plist.template')
      writeFileSync(tpl, readFileSync(tpl, 'utf8').replace('<plist version="1.0">', '<plist version="1.0"><!-- __BROKEN__ -->'))
      const sql = join(t.repo, 'scripts/ops/futari-backup-counts.sql')
      writeFileSync(sql, readFileSync(sql, 'utf8') + '\n-- changed\n')
      t.git('commit', '-q', '-am', 'y')
      expect(() => t.run()).toThrow(/plist placeholders left/)
      expect(readFileSync(join(t.dest, 'SHA256SUMS'), 'utf8')).toBe(sumsBefore)
      expect(readFileSync(t.plistPath, 'utf8')).toBe(plistBefore)
      execFileSync('/usr/bin/shasum', ['-a', '256', '--status', '-c', 'SHA256SUMS'], { cwd: t.dest, stdio: 'pipe' })
      expect(readdirSync(join(t.dest, '..')).filter((n) => /\.(new|old)\./.test(n))).toEqual([])
      expect(existsSync(`${t.plistPath}.new`)).toBe(false)
    } finally {
      rmSync(t.tmp, { recursive: true, force: true })
    }
  })
})

describe('backup-prod.sh --dry-run connects to nothing (#1549)', () => {
  it('exits 0, prints the plan, runs no tool and writes nothing', () => {
    const home = mkdtempSync(join(tmpdir(), 'futari-backup-dry-'))
    try {
      const bin = join(home, 'bin')
      const conf = join(home, '.config', 'futari-backup')
      mkdirSync(bin, { recursive: true })
      mkdirSync(conf, { recursive: true })
      const called = join(home, 'CALLED')
      for (const tool of ['psql', 'pg_dump', 'age', 'rclone']) {
        const p = join(bin, tool)
        writeFileSync(p, `#!/bin/sh\necho "${tool} $*" >> "${called}"\n`)
        chmodSync(p, 0o755)
      }
      writeFileSync(join(conf, 'config'), `PG_BIN_DIR=${bin}\nAGE_BIN=${bin}/age\nRCLONE_BIN=${bin}/rclone\nRCLONE_DEST=${home}/remote\n`)
      writeFileSync(join(conf, 'pg_service.conf'), '[futari_prod_backup]\nhost=db.invalid\nport=5432\ndbname=postgres\nuser=x\nsslmode=verify-full\n')
      chmodSync(conf, 0o700)
      chmodSync(join(conf, 'config'), 0o600)
      chmodSync(join(conf, 'pg_service.conf'), 0o600)
      const before = readdirSync(home).sort()

      const out = execFileSync('bash', [join(ROOT, 'scripts/ops/backup-prod.sh'), '--dry-run'], {
        encoding: 'utf8',
        env: { HOME: home, PATH: '/usr/bin:/bin:/usr/sbin:/sbin', NODE_ENV: 'test' },
      })
      expect(out).toMatch(/dry run \(nothing contacted/)
      expect(out).toMatch(/A real run would:/)
      // The repo copy has no pinned recipient, so a real run would refuse.
      expect(out).toMatch(/age recipient not pinned/)
      expect(existsSync(called), 'a tool was executed during --dry-run').toBe(false)
      expect(readdirSync(home).sort()).toEqual(before)
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })
})

describe('leak-shape patterns catch what they are meant to', () => {
  // Built at runtime so this file itself stays free of the shapes.
  const samples = [
    ['PG', 'PASSWORD=x psql'].join(''),
    ['ALTER ROLE futari_backup ', 'PASSWORD', " 'x'"].join(''),
    ['postgres', 'ql://futari_backup:x@h:5432/postgres'].join(''),
    ['aws-0-x.', 'pooler.', 'supabase.com'].join(''),
    ['https://', 'abcdefghijklmnopqrst', '.supabase.co'].join(''),
    ['AGE-SECRET-KEY-1', 'Q'.repeat(58)].join(''),
    ['age1', 'q'.repeat(58)].join(''),
  ]
  it.each(samples)('flags %#', (sample) => {
    expect(LEAK_SHAPES.some(([, re]) => re.test(sample))).toBe(true)
  })
  it('does not flag the operator commands', () => {
    for (const ok of [
      '\\password futari_backup',
      'security add-generic-password -s futari-backup -a futari_backup -U -w',
      'psql service=futari_prod_backup',
      "readonly AGE_RECIPIENT='__FUTARI_BACKUP_AGE_RECIPIENT__'",
    ]) {
      expect(LEAK_SHAPES.some(([, re]) => re.test(ok))).toBe(false)
    }
  })
})
