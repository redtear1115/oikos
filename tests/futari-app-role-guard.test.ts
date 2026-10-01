import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * #1467 — the runtime DB role `futari_app`.
 *
 * The repo is public. The role's credential is set by the operator with
 * psql's client-side `\password`, never as SQL text and never in a file
 * that ships. None of these mistakes errors when it happens — the migration
 * still runs, the role still logs in — the credential just sits in git
 * history (or, for SQL text, in the database's DDL log) from then on.
 *
 * So: the migration may not carry a credential or enable login, and the
 * runbook section + ops script that tell people how to handle it may not
 * contain the shapes a credential leaks through.
 */

const ROOT = join(__dirname, '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

const MIGRATION_TAG = '0072_futari_app_role'
const migration = read(`drizzle/${MIGRATION_TAG}.sql`)
const dropScript = read('scripts/ops/drop-futari-app-role.sql')
const OPS_SCRIPTS = ['scripts/ops/futari-app-pgpass.py', 'scripts/ops/futari-app-db-url.py'] as const

// Names the ops scripts give to values holding a credential (or a line/URL
// that embeds one).
const SECRET_IDENT = /(?<![\w.])(pw|app_pw|url|direct|current|line|raw|parts)(?!\w)/

/** Argument text of every print / sys.exit / sys.std*.write call, with string
 *  literal text dropped but f-string `{…}` expressions kept — so a message
 *  that merely contains the word "line" doesn't count, `{pw}` and `pw` do. */
function outputCalls(py: string): string[] {
  const out: string[] = []
  for (const m of py.matchAll(/(?:\bprint|sys\.exit|sys\.std(?:out|err)\.write)\(([^\n]*)/g)) {
    const kept = m[1].replace(/([rbfRBF]*)(['"])((?:\\.|(?!\2).)*)\2/g, (_s, prefix: string, _q, body: string) =>
      /f/i.test(prefix) ? ' ' + [...body.matchAll(/\{([^{}]*)\}/g)].map((b) => b[1]).join(' ') + ' ' : ' ')
    out.push(kept)
  }
  return out
}

const RUNBOOK_HEADING = '## Runtime DB role (futari_app)'
function runbookSection(): string {
  const doc = read('docs/superpowers/ops-runbook.md')
  const start = doc.indexOf(`\n${RUNBOOK_HEADING}\n`)
  if (start === -1) return ''
  const next = doc.indexOf('\n## ', start + RUNBOOK_HEADING.length + 1)
  return doc.slice(start, next === -1 ? undefined : next)
}

/** SQL with `--` comments removed, so a comment can't satisfy or trip a check. */
const code = (sql: string) => sql.replace(/--[^\n]*/g, '')

// Shapes a credential leaks through. Kept as patterns (not literal strings in
// the checked files) so the checks themselves can be written down.
const LEAK_SHAPES: [string, RegExp][] = [
  ['libpq password env var', /PGPASSWORD/],
  ["a PASSWORD '...' literal", /PASSWORD\s+'/i],
  ['a psql connection URL with credentials', /psql\s+["']?postgres(ql)?:\/\/[^\s"']*:[^\s"']*@/i],
]

describe('0072 futari_app migration (#1467)', () => {
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

  it('creates the role NOLOGIN with the narrow attribute set, and never enables login', () => {
    const sql = code(migration)
    const create = sql.match(/CREATE ROLE futari_app\b[^;]*;/)
    expect(create, 'CREATE ROLE futari_app … ; not found').not.toBeNull()
    for (const attr of ['NOLOGIN', 'NOSUPERUSER', 'NOCREATEROLE', 'NOCREATEDB', 'NOREPLICATION', 'BYPASSRLS', 'NOINHERIT']) {
      expect(create![0]).toMatch(new RegExp(`\\b${attr}\\b`))
    }
    // LOGIN is the operator's step, after the credential is set.
    expect(sql).not.toMatch(/(?<!NO)LOGIN\b/)
    // Nothing broader than public DML + sequence usage.
    expect(sql).not.toMatch(/\bGRANT\s+ALL\b/i)
    expect(sql).not.toMatch(/\bTRUNCATE\b/i)
    expect(sql).not.toMatch(/\bGRANT\s+futari_app\b|\bGRANT\s+\w+\s+TO\s+futari_app\s*;/i)
    expect(sql).not.toMatch(/\bON\s+SCHEMA\s+(?!public\b)\w+/i)
    expect(sql).not.toMatch(/\bIN\s+SCHEMA\s+(?!public\b)\w+/i)
    expect(sql).not.toMatch(/\bGRANT\s+EXECUTE\b/i)
    expect(sql).not.toMatch(/\bON\s+(ALL\s+)?(FUNCTIONS?|ROUTINES?|PROCEDURES?)\b/i)
  })

  it('covers tables and sequences created later by postgres', () => {
    const sql = code(migration)
    expect(sql).toMatch(/ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public\s+GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO futari_app/)
    expect(sql).toMatch(/ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public\s+GRANT USAGE, SELECT ON SEQUENCES TO futari_app/)
  })

  it('has no leak shape', () => {
    for (const [name, re] of LEAK_SHAPES) expect(migration, name).not.toMatch(re)
  })
})

describe('futari_app runbook section + ops script (#1467)', () => {
  it('the runbook section exists', () => {
    expect(runbookSection().length).toBeGreaterThan(500)
  })

  it.each([
    ['ops-runbook §Runtime DB role', runbookSection],
    ['scripts/ops/drop-futari-app-role.sql', () => dropScript],
    ...OPS_SCRIPTS.map((rel) => [rel, () => read(rel)] as [string, () => string]),
  ])('%s has no leak shape', (_name, text) => {
    const body = text()
    for (const [name, re] of LEAK_SHAPES) expect(body, name).not.toMatch(re)
  })

  // The scripts hold the password in a variable; the only safe exits are a
  // mode-600 file, .env.local, or pbcopy's stdin. stdout/stderr end up in the
  // terminal scrollback and, when an agent is driving, in its transcript;
  // argv and env are visible in `ps`.
  it.each(OPS_SCRIPTS)('%s never prints, argv-passes or env-passes a secret', (rel) => {
    const py = read(rel)
    for (const call of outputCalls(py)) {
      expect(call, `secret reaches output: ${call}`).not.toMatch(SECRET_IDENT)
    }
    for (const argv of py.matchAll(/subprocess\.\w+\(\s*(\[[^\]]*\])/g)) {
      expect(argv[1], 'secret in subprocess argv').not.toMatch(SECRET_IDENT)
    }
    expect(py).not.toMatch(/os\.system|os\.putenv|environ\s*(\[[^\]]*\]\s*=(?!=)|\.update|\.setdefault)|(?<![\w.])env\s*=(?!=)/)
    expect(py).not.toMatch(/sys\.argv/)
  })

  it('the drop script takes back the default privileges before dropping the role', () => {
    const sql = code(dropScript)
    const revoke = sql.indexOf('REVOKE ALL ON TABLES FROM futari_app')
    const drop = sql.indexOf('DROP ROLE futari_app')
    expect(revoke).toBeGreaterThan(-1)
    expect(drop).toBeGreaterThan(revoke)
    expect(sql).not.toMatch(/DROP OWNED/i)
  })

  // pg_stat_activity is a view: a pg_terminate_backend(...) in its WHERE clause
  // gets pushed below the user-name filter and terminates every session the
  // caller may signal, including its own. Only the select-list form is safe.
  it.each([
    ['ops-runbook §Runtime DB role', runbookSection],
    ['scripts/ops/drop-futari-app-role.sql', () => code(dropScript)],
  ])('%s never calls pg_terminate_backend from a WHERE clause', (_name, text) => {
    const body = text()
    expect(body).toMatch(/pg_terminate_backend/)
    expect(body).not.toMatch(/\b(WHERE|AND|OR)\s+(NOT\s+)?\(?\s*pg_terminate_backend/i)
  })
})

describe('leak-shape patterns catch what they are meant to', () => {
  // Built at runtime so this file itself stays free of the shapes.
  const env = ['PG', 'PASSWORD=x psql'].join('')
  const literal = ['ALTER ROLE futari_app ', 'PASSWORD', " 'x'"].join('')
  const url = ['psql "postgres', '://futari_app:secret@host:6543/postgres"'].join('')
  it.each([env, literal, url])('flags %#', (sample) => {
    expect(LEAK_SHAPES.some(([, re]) => re.test(sample))).toBe(true)
  })
  it('does not flag the operator command or a service connection', () => {
    for (const ok of ['\\password futari_app', 'psql service=futari_dev_app -c "select 1"', 'PGPASSFILE=x psql service=y']) {
      expect(LEAK_SHAPES.some(([, re]) => re.test(ok))).toBe(false)
    }
  })
})
