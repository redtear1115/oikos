import { describe, it, expect, afterAll } from 'vitest'
import { loadEnvLocal } from '../outing/_setup'

// ─── #1471 live privileges on the dev database ──────────────────────────────
//
// Supabase's Data API and Realtime run as anon / authenticated, and hand the
// browser every column those roles may SELECT. This reads the real catalog:
// any public `*_encrypted` column — including one added after 0075, on a
// table that got Supabase's default anon/authenticated grants — must not be
// selectable (or writable) by either role. A failure here means ciphertext is
// one `GET /rest/v1/<table>?select=<col>` away from a browser again.
//
// Read-only catalog queries; runs on the runtime connection (DATABASE_URL).
// Excluded from CI with the rest of __tests__/actions/** (vitest.config.ci.ts).
// Fails on an environment that hasn't applied 0075 yet — that's the point.
// ──────────────────────────────────────────────────────────────────────────────

loadEnvLocal()

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL not set; this test reads the dev database catalog. Ensure .env.local has it.')
const postgres = (await import('postgres')).default
const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} })
afterAll(async () => { await sql.end() })

describe('#1471 encrypted-column privileges on dev', () => {
  it('no anon / authenticated privilege on any *_encrypted column', async () => {
    const rows = await sql<{ col: string; role: string; priv: string }[]>`
      select format('%I.%I', c.table_name, c.column_name) col, r.role, p.priv
      from information_schema.columns c
      cross join (values ('anon'), ('authenticated')) r(role)
      cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('REFERENCES')) p(priv)
      where c.table_schema = 'public' and c.column_name like '%\\_encrypted'
        and has_column_privilege(r.role, format('public.%I', c.table_name), c.column_name, p.priv)`
    expect(rows).toEqual([])
    const [{ n }] = await sql<{ n: number }[]>`
      select count(*)::int n from information_schema.columns
      where table_schema = 'public' and column_name like '%\\_encrypted'`
    expect(n, 'no *_encrypted columns found — wrong database?').toBeGreaterThanOrEqual(6)
  })

  it('authenticated keeps what Realtime and the FuelLogs / *Details RLS policies need on Assets', async () => {
    const rows = await sql<{ col: string; ok: boolean }[]>`
      select col, has_column_privilege('authenticated', 'public."Assets"', col, 'SELECT') ok
      from unnest(array['id', 'group_id', 'type', 'name', 'created_at', 'deleted_at']) col`
    expect(rows.filter((r) => !r.ok).map((r) => r.col)).toEqual([])
  })

  it('anon has no privilege on the asset / detail / invoice-credential tables', async () => {
    const rows = await sql<{ t: string }[]>`
      select t from unnest(array['Assets', 'CarDetails', 'ChildDetails', 'HouseDetails', 'InsuranceDetails', 'PetDetails', 'InvoiceCredentials']) t
      where has_any_column_privilege('anon', format('public.%I', t), 'SELECT, INSERT, UPDATE, REFERENCES')
         or has_table_privilege('anon', format('public.%I', t), 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')`
    expect(rows).toEqual([])
  })

  it('the runtime role (futari_app) still reads and writes the encrypted columns server-side', async () => {
    const [{ sel, dml }] = await sql<{ sel: boolean; dml: boolean }[]>`
      select has_column_privilege('futari_app', 'public."Assets"', 'name_encrypted', 'SELECT') sel,
             has_table_privilege('futari_app', 'public."ChildDetails"', 'SELECT, INSERT, UPDATE, DELETE') dml`
    expect({ sel, dml }).toEqual({ sel: true, dml: true })
  })
})
