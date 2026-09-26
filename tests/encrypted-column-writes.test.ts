/**
 * #1287 S1 (c) — static guard on every write to an encrypted column.
 *
 * Every `*Encrypted` value assigned in `actions/` must come from
 * `encrypt(` / `encryptForInsert(` with an inline `aadFor('<Table>',
 * '<column>', …)` naming the column the property actually maps to. That rules
 * out (1) copying ciphertext between rows — a v1 value bound to another row
 * would stop revealing, and a legacy one would silently "move" — and (2) a
 * write site binding the AAD of a different column.
 *
 * Failure looks like: nothing at runtime while S1 writes legacy; after S2,
 * reveals of newly written rows throw. This test fails first.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { ENCRYPTED_COLUMNS } from '@/lib/crypto'

const ROOT = join(__dirname, '..')

/** Drizzle property → `Table.column` it writes. */
const PROPERTY_COLUMN: Record<string, string> = {
  nameEncrypted: 'Assets.name_encrypted',
  plateEncrypted: 'CarDetails.plate_encrypted',
  addressEncrypted: 'HouseDetails.address_encrypted',
  idNumberEncrypted: 'ChildDetails.id_number_encrypted',
  insuranceIdEncrypted: 'ChildDetails.insurance_id_encrypted',
  verificationCodeEncrypted: 'InvoiceCredentials.verification_code_encrypted',
}

function sourceFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = join(dir, e.name)
    if (e.isDirectory()) return sourceFiles(rel)
    return /\.tsx?$/.test(e.name) ? [rel] : []
  })
}

interface Hit { file: string; line: number; prop: string; rhs: string; text: string }

function encryptedAssignments(): Hit[] {
  const hits: Hit[] = []
  for (const file of sourceFiles('actions')) {
    readFileSync(join(ROOT, file), 'utf8').split('\n').forEach((text, i) => {
      // Object keys (`plateEncrypted: …`) and member assignments
      // (`carUpdates.plateEncrypted = …`); a bare read like `row.plateEncrypted`
      // followed by a ternary `:` is not a key, so require key position.
      const m =
        text.match(/(?:^\s*|[{,]\s*)(\w+Encrypted)\??\s*:\s*(.*)$/) ??
        text.match(/\.(\w+Encrypted)\s*=(?!=)\s*(.*)$/)
      if (m) hits.push({ file, line: i + 1, prop: m[1], rhs: m[2].trim(), text })
    })
  }
  return hits
}

const isTypeAnnotation = (rhs: string) => /^string\b/.test(rhs)
// #1289 — retiring an invoice credential: `.set({ deletedAt: …,
// verificationCodeEncrypted: null })` on one line. A literal null carries no
// ciphertext and binds no AAD, so neither thing this guard protects is at
// stake; requiring `deletedAt` on the same line keeps it to the soft-delete
// shape the CHECK invoice_credentials_secret_iff_live (0069) expects.
// The retire must be the only `*Encrypted` on its line: the scan records one
// hit per line, so a second write sharing the line would otherwise ride on
// the exemption unchecked.
const isCredentialRetire = (h: Hit) =>
  h.prop === 'verificationCodeEncrypted' && /^null\s*}/.test(h.rhs) && /\bdeletedAt:/.test(h.text) &&
  (h.text.match(/\w+Encrypted\b/g) ?? []).length === 1
// Reads: `.select({ plateEncrypted: carDetails.plateEncrypted, … })`
const isSelectProjection = (h: Hit) => new RegExp(`^\\w+\\.${h.prop},?$`).test(h.rhs)

describe('encrypted-column writes in actions/', () => {
  const hits = encryptedAssignments()
  const retires = hits.filter(isCredentialRetire)
  const writes = hits.filter((h) => !isTypeAnnotation(h.rhs) && !isSelectProjection(h) && !isCredentialRetire(h))

  it('the retire exemption does not cover a second encrypted write on the same line', () => {
    const line = '      .set({ deletedAt: now, verificationCodeEncrypted: null }); const zz = { verificationCodeEncrypted: row.verificationCodeEncrypted }'
    const hit: Hit = { file: 'x.ts', line: 1, prop: 'verificationCodeEncrypted', rhs: 'null }); const zz = { verificationCodeEncrypted: row.verificationCodeEncrypted }', text: line }
    expect(isCredentialRetire(hit)).toBe(false)
    const alone = '      .set({ deletedAt: now, verificationCodeEncrypted: null })'
    expect(isCredentialRetire({ ...hit, rhs: 'null })', text: alone })).toBe(true)
  })

  it('finds the invoice credential retire sites (delete, refresh, removePartner)', () => {
    expect(retires.map((h) => h.file).sort())
      .toEqual([join('actions', 'invoice.ts'), join('actions', 'invoice.ts'), join('actions', 'membership.ts')])
  })

  it('finds the known write sites (guard against the scan silently matching nothing)', () => {
    // car ×2, child create ×3, editChild ×3 + upsert insert ×2, house ×2, invoice ×2
    expect(writes.length).toBeGreaterThanOrEqual(14)
    expect(new Set(writes.map((w) => w.prop))).toEqual(new Set(Object.keys(PROPERTY_COLUMN)))
  })

  it('every write comes from encrypt()/encryptForInsert() with the matching aadFor column', () => {
    const bad: string[] = []
    for (const w of writes) {
      const where = `${w.file}:${w.line} ${w.prop}`
      const expected = PROPERTY_COLUMN[w.prop]
      if (!expected) { bad.push(`${where}: unknown encrypted property`); continue }
      if (!/\b(?:encrypt|encryptForInsert)\(/.test(w.rhs)) { bad.push(`${where}: not from encrypt()`); continue }
      const aad = w.rhs.match(/aadFor\('(\w+)',\s*'(\w+)',/)
      if (!aad) { bad.push(`${where}: no inline aadFor(...)`); continue }
      if (`${aad[1]}.${aad[2]}` !== expected) bad.push(`${where}: binds ${aad[1]}.${aad[2]}, expected ${expected}`)
      // Allowed shapes only: `encrypt…(…)` or `x === null ? null : encrypt(…)`
      if (!/^(?:encrypt|encryptForInsert)\(|^[\w.]+ === null \? null : encrypt\(/.test(w.rhs)) {
        bad.push(`${where}: unexpected expression shape`)
      }
    }
    expect(bad).toEqual([])
  })

  it('PROPERTY_COLUMN covers exactly lib/crypto ENCRYPTED_COLUMNS', () => {
    const registered = Object.entries(ENCRYPTED_COLUMNS).flatMap(([t, cols]) => cols.map((c) => `${t}.${c}`))
    expect(Object.values(PROPERTY_COLUMN).sort()).toEqual(registered.sort())
  })

  it('every *_encrypted column in the schema is registered in ENCRYPTED_COLUMNS', () => {
    const schema = readFileSync(join(ROOT, 'lib/db/schema.ts'), 'utf8')
    const found: string[] = []
    let table: string | null = null
    for (const line of schema.split('\n')) {
      const t = line.match(/pgTable\('(\w+)'/)
      if (t) table = t[1]
      const c = line.match(/text\('(\w+_encrypted)'\)/)
      if (c && table) found.push(`${table}.${c[1]}`)
    }
    const registered = Object.entries(ENCRYPTED_COLUMNS).flatMap(([t, cols]) => cols.map((c) => `${t}.${c}`))
    expect(found.sort()).toEqual(registered.sort())
  })

  it('only actions/asset.ts and actions/invoice.ts import lib/crypto (outside tests)', () => {
    const importers = ['actions', 'app', 'lib', 'components']
      .flatMap((d) => sourceFiles(d))
      .filter((f) => f !== join('lib', 'crypto.ts'))
      .filter((f) => /from '@\/lib\/crypto'|from '\.\.?\/.*crypto'/.test(readFileSync(join(ROOT, f), 'utf8')))
    expect(importers.sort()).toEqual([join('actions', 'asset.ts'), join('actions', 'invoice.ts')])
  })
})
