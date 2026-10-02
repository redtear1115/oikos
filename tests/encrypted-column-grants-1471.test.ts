import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * #1471 — `*_encrypted` ciphertext must not be selectable by Supabase's
 * client roles (anon / authenticated). Those roles are what the Data API
 * (PostgREST) and Realtime postgres_changes run as; whatever they may SELECT
 * reaches the browser.
 *
 * Static half (runs in CI): every `*_encrypted` column declared in
 * lib/db/schema.ts must be covered by a migration's column-level
 * `REVOKE ALL ("<col>") ON TABLE "<table>" FROM anon, authenticated`, and the
 * Assets column grants to authenticated must cover every non-encrypted Assets
 * column (Realtime silently omits columns the subscriber can't SELECT — a new
 * column without a grant never errors, it just never arrives).
 *
 * Live half: __tests__/actions/encryptedColumnGrants1471.test.ts checks the
 * dev database's actual privileges.
 */

const ROOT = join(__dirname, '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const code = (sql: string) => sql.replace(/--[^\n]*/g, '')

const TAG = '0075_encrypted_columns_grants'
const migration = code(read(`drizzle/${TAG}.sql`))
const allMigrations = readdirSync(join(ROOT, 'drizzle'))
  .filter((f) => /^\d{4}_.*\.sql$/.test(f))
  .map((f) => code(read(`drizzle/${f}`)))
  .join('\n')

/** { table → column names } from lib/db/schema.ts, by walking pgTable blocks. */
function schemaColumns(): Map<string, string[]> {
  const out = new Map<string, string[]>()
  let table: string | null = null
  for (const line of read('lib/db/schema.ts').split('\n')) {
    const t = line.match(/pgTable\(\s*'(\w+)'/)
    if (t) { table = t[1]; out.set(table, []); continue }
    if (/^\}\s*(,|\))/.test(line)) { table = null; continue }
    const c = table && line.match(/^\s+\w+:\s*\w+\(\s*'(\w+)'/)
    if (c) out.get(table!)!.push(c[1])
  }
  return out
}

const cols = (list: string) => list.split(',').map((s) => s.trim().replace(/^"|"$/g, ''))
const unquote = (s: string) => s.replace(/"/g, '')

describe('#1471 encrypted columns are not granted to anon / authenticated', () => {
  const schema = schemaColumns()
  const encrypted = [...schema].flatMap(([t, cs]) => cs.filter((c) => c.endsWith('_encrypted')).map((c) => [t, c] as const))

  it('finds the encrypted columns in schema.ts (parser sanity)', () => {
    expect(encrypted).toEqual(expect.arrayContaining([
      ['Assets', 'name_encrypted'],
      ['CarDetails', 'plate_encrypted'],
      ['ChildDetails', 'id_number_encrypted'],
      ['ChildDetails', 'insurance_id_encrypted'],
      ['HouseDetails', 'address_encrypted'],
      ['InvoiceCredentials', 'verification_code_encrypted'],
    ]))
    expect(schema.get('Assets')).toEqual(expect.arrayContaining(['id', 'group_id', 'frozen_at']))
  })

  it('every *_encrypted column has a column-level REVOKE from anon and authenticated', () => {
    const revoked = new Set<string>()
    for (const m of allMigrations.matchAll(/REVOKE\s+ALL\s*\(([^)]*)\)\s*ON\s+TABLE\s+("?\w+"?)\s+FROM\s+anon\s*,\s*authenticated\b/gi)) {
      for (const c of cols(m[1])) revoked.add(`${unquote(m[2])}.${c}`)
    }
    const missing = encrypted.map(([t, c]) => `${t}.${c}`).filter((k) => !revoked.has(k))
    expect(missing, 'add a migration: REVOKE ALL ("<col>") ON TABLE "<table>" FROM anon, authenticated (#1471)').toEqual([])
  })

  it('no migration grants an *_encrypted column, and 0075 grants nothing to anon', () => {
    for (const m of allMigrations.matchAll(/GRANT\s+[^;]*?\(([^)]*)\)\s*ON\s+TABLE\s+"?\w+"?\s+TO\s+[^;]*;/gi)) {
      expect(cols(m[1]).filter((c) => c.endsWith('_encrypted')), m[0]).toEqual([])
    }
    expect(migration).not.toMatch(/\bGRANT\b[^;]*\bTO\s+anon\b/i)
    expect(migration).not.toMatch(/\bGRANT\s+ALL\b/i)
  })

  it('authenticated can SELECT every non-encrypted Assets column (Realtime drops ungranted ones silently)', () => {
    const granted = new Set<string>()
    for (const m of allMigrations.matchAll(/GRANT\s+SELECT\s*\(([^)]*)\)\s*ON\s+TABLE\s+"Assets"\s+TO\s+authenticated\b/gi)) {
      for (const c of cols(m[1])) granted.add(c)
    }
    const needed = schema.get('Assets')!.filter((c) => !c.endsWith('_encrypted'))
    expect(needed.filter((c) => !granted.has(c)),
      'new Assets column: add GRANT SELECT ("<col>") ON TABLE "Assets" TO authenticated in its migration').toEqual([])
  })

  it('does not rely on a publication column list (wal2json ignores it; the column grant is the control)', () => {
    expect(migration).not.toMatch(/ALTER\s+PUBLICATION/i)
  })

  it('is in the journal, after every earlier entry', () => {
    const { entries } = JSON.parse(read('drizzle/meta/_journal.json')) as { entries: { tag: string; when: number }[] }
    const i = entries.findIndex((e) => e.tag === TAG)
    expect(i, 'journal entry missing — db:migrate would silently skip the file (#874)').toBeGreaterThan(-1)
    for (const e of entries.slice(0, i)) expect(entries[i].when).toBeGreaterThan(e.when)
  })
})
