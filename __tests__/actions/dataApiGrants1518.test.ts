import { describe, it, expect, afterAll } from 'vitest'
import { loadEnvLocal } from '../outing/_setup'
import { privilegeLines, ALLOWLIST_AFTER_0080 } from './_dataApiAllowlist'

// ─── #1518 live Data API privileges ─────────────────────────────────────────
//
// Reads the catalog of the database DATABASE_URL points at (read-only
// session) and compares every privilege anon / authenticated hold in schema
// public — tables, columns, sequences, functions — to the exact allowlist 0080
// leaves (./_dataApiAllowlist.ts). A failure lists the extra or missing
// lines: an extra one is a table or function a signed-in browser can reach
// with its own session (usually a new table that kept Supabase's default
// anon / authenticated grants); a missing one is a grant Realtime needs.
//
// Excluded from CI with the rest of __tests__/actions/** (vitest.config.ci.ts).
// Fails on an environment that hasn't applied 0080 yet — that's the point.
// With a local DATABASE_URL it reads the stand-in; with .env.local, dev.
// ──────────────────────────────────────────────────────────────────────────────

loadEnvLocal()

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL not set; this test reads a database catalog. Ensure .env.local has it.')
const postgres = (await import('postgres')).default
const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {}, connection: { default_transaction_read_only: true } })
afterAll(async () => { await sql.end() })

describe('#1518 anon / authenticated privileges match the 0080 allowlist', () => {
  it('0080 is applied here', async () => {
    const [{ fn }] = await sql<{ fn: string | null }[]>`SELECT to_regprocedure('public.viewer_in_chapter(uuid, timestamptz)')::text AS fn`
    expect(fn).toBe('viewer_in_chapter(uuid,timestamp with time zone)')
  })

  it('every privilege is on the allowlist, and every allowlisted one is present', async () => {
    const lines = await privilegeLines(sql)
    expect({
      extra: lines.filter((l) => !ALLOWLIST_AFTER_0080.includes(l)),
      missing: ALLOWLIST_AFTER_0080.filter((l) => !lines.includes(l)),
    }).toEqual({ extra: [], missing: [] })
  })

  it('anon holds nothing on any public relation', async () => {
    const lines = await privilegeLines(sql)
    expect(lines.filter((l) => l.split('|')[1] === 'anon' && !l.endsWith('|EXECUTE'))).toEqual([])
  })
})
