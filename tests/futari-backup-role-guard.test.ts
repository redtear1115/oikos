import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, existsSync, readdirSync, rmSync } from 'node:fs'
import { readFileSync } from 'node:fs'
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
const dropScript = read('scripts/ops/drop-futari-backup-role.sql')
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

  it('backup: one exported snapshot shared by both dumps, each streamed into age with every pipe stage checked', () => {
    const code = shCode(backup)
    expect(code).toMatch(/BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY/)
    expect(code).toMatch(/pg_export_snapshot\(\)/)
    expect(code).toMatch(/--snapshot="\$SNAPSHOT"/)
    expect(code).toMatch(/\| "\$AGE" -r "\$AGE_RECIPIENT" -o "\$\{STAGING\}\/bundle\/\$\{name\}\.partial"/)
    expect(code).toMatch(/PIPESTATUS/)
    expect(code).toMatch(/--schema=public --schema=drizzle/)
    expect(code).toMatch(/--data-only --table=auth\.users --table=auth\.identities/)
    // pg_dump never writes to a file: its only output is the pipe into age.
    expect(code).not.toMatch(/PG_DUMP[^\n]*(-f|--file)\b/)
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
      '--section=data',
      'auth.dump.age" --data-only',
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

  it('wrapper: checks the installed SHA-256 sums before running anything', () => {
    const code = shCode(wrapper)
    const check = code.indexOf('shasum -a 256 --status -c SHA256SUMS')
    expect(check).toBeGreaterThan(-1)
    expect(code.indexOf('backup-prod.sh')).toBeGreaterThan(check)
  })

  it('installer never loads the LaunchAgent itself', () => {
    expect(shCode(install)).not.toMatch(/^\s*launchctl\b/m)
  })

  it('plist template: placeholders only, daily 03:30, private umask', () => {
    expect(plist).not.toMatch(/\/Users\/|\/home\//)
    expect(plist).toContain('__RUN_SCRIPT__')
    expect(plist).toMatch(/<key>Hour<\/key>\s*<integer>3<\/integer>\s*<key>Minute<\/key>\s*<integer>30<\/integer>/)
    expect(plist).toMatch(/<key>Umask<\/key>\s*<integer>63<\/integer>/)
  })
})

// The dry run must contact nothing. Run it for real against a throwaway HOME
// whose config points every tool at a trap that records being called.
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
