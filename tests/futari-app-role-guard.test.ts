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
  ])('%s has no leak shape', (_name, text) => {
    const body = text()
    for (const [name, re] of LEAK_SHAPES) expect(body, name).not.toMatch(re)
  })

  it('the drop script takes back the default privileges before dropping the role', () => {
    const sql = code(dropScript)
    const revoke = sql.indexOf('REVOKE ALL ON TABLES FROM futari_app')
    const drop = sql.indexOf('DROP ROLE futari_app')
    expect(revoke).toBeGreaterThan(-1)
    expect(drop).toBeGreaterThan(revoke)
    expect(sql).not.toMatch(/DROP OWNED/i)
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
