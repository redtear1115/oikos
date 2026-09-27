// #1287 — the re-encrypt core, shared by the operator script
// (`scripts/reencrypt-pii.ts`) and any one-off runtime route that has to run
// the same algorithm inside a deployment holding the real key (see the
// "local prod key is the dev key" trap in docs/superpowers/ops-runbook.md).
//
// There is exactly one copy of the algorithm and of its SQL, here. #881 was a
// second copy of the cipher code that wrote values the app could not read; a
// second copy of the preflight/CAS loop would be the same mistake one level
// up. Callers own argument parsing, key installation and output; they never
// write SQL of their own.
//
// Constraints on this file (it is loaded by Node's native type stripping from
// the script, and by Next.js from app code):
//   - relative imports with the real `.ts` extension, no `@/` alias
//   - erasable TypeScript only (no enums, namespaces, parameter properties)
//
// Output rules: nothing here logs. Results are counts only — no primary keys,
// ciphertext, plaintext, AAD or key material ever leave this module.

import { ENCRYPTED_COLUMNS, aadFor, decrypt, encrypt, type EncryptedTable } from './crypto.ts'

// ── Targets ─────────────────────────────────────────────────────────────────

export const PROJECT_REFS = {
  prod: 'cxbnlahuhdvrbwcnzoqo',
  dev: 'ufhcprrauwsxdmscbkrf',
} as const
export type Target = keyof typeof PROJECT_REFS

/** Primary key column per table; must match the pk that the app passes to aadFor. */
const PK_COLUMN: Record<EncryptedTable, string> = {
  Assets: 'id',
  CarDetails: 'asset_id',
  HouseDetails: 'asset_id',
  ChildDetails: 'asset_id',
  InvoiceCredentials: 'id',
}

export interface ColumnTarget {
  table: EncryptedTable
  pk: string
  column: string
}

/** Derived from ENCRYPTED_COLUMNS so a newly encrypted column is covered automatically. */
export const COLUMN_TARGETS: readonly ColumnTarget[] = (
  Object.keys(ENCRYPTED_COLUMNS) as EncryptedTable[]
).flatMap((table) =>
  (ENCRYPTED_COLUMNS[table] as readonly string[]).map((column) => ({
    table,
    pk: PK_COLUMN[table],
    column,
  })),
)

// ── DB seam (mocked in tests) ───────────────────────────────────────────────

export interface Row {
  pk: string
  ct: string
}

export interface Db {
  /** Every non-null value of the column, soft-deleted rows included. */
  selectColumn(t: ColumnTarget): Promise<Row[]>
  /** `UPDATE … SET col = next WHERE pk = pk AND col = prev`; returns rows changed (0 or 1). */
  compareAndSwap(t: ColumnTarget, pk: string, prev: string, next: string): Promise<number>
}

// ── Guards ──────────────────────────────────────────────────────────────────

export class GuardError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GuardError'
  }
}

/**
 * The ref has to be *the* identifying part of the URL — the host of a direct
 * connection or the tenant suffix of a pooler username — and the other
 * environment's ref may not appear anywhere. Messages never echo the URL (it
 * carries the DB password).
 */
export function assertTargetMatchesUrl(target: Target, databaseUrl: string): void {
  let url: URL
  try {
    url = new URL(databaseUrl)
  } catch {
    throw new GuardError('Database URL is not a valid URL')
  }
  const ref = PROJECT_REFS[target]
  const otherRef = PROJECT_REFS[target === 'prod' ? 'dev' : 'prod']
  const host = url.hostname.toLowerCase()
  const user = decodeURIComponent(url.username).toLowerCase()
  const hostMatches = host === `db.${ref}.supabase.co`
  const userMatches = user.endsWith(`.${ref}`)
  if (databaseUrl.toLowerCase().includes(otherRef)) {
    throw new GuardError(`Database URL names the ${target === 'prod' ? 'dev' : 'prod'} project, not --target=${target}`)
  }
  if (!hostMatches && !userMatches) {
    throw new GuardError(`Database URL does not name the ${target} project in its host or username`)
  }
}

/** True when `ct` is already `v1:<writeKid>:…`. */
export function isCurrent(ct: string, writeKid: string): boolean {
  const parts = ct.split(':')
  return parts.length === 5 && parts[0] === 'v1' && parts[1] === writeKid
}

export function ctxFor(t: ColumnTarget, pk: string) {
  // ColumnTarget comes from ENCRYPTED_COLUMNS, so the pair is valid by construction.
  return aadFor(t.table, t.column as never, pk)
}

/**
 * Fail before connecting if the keyring is malformed or would not write
 * `v1:<writeKid>` (otherwise a bad keyring would only show up as every row
 * failing preflight). Encrypts an empty string under a throwaway context.
 */
export function assertKeyringWritesCurrent(writeKid: string): void {
  const ctx = aadFor('Assets', 'name_encrypted', 'keyring-self-check')
  const probe = encrypt('', ctx)
  if (!isCurrent(probe, writeKid) || decrypt(probe, ctx) !== '') {
    throw new GuardError('Keyring does not write the v1 format under ENCRYPTION_WRITE_KID')
  }
}

// ── Core ────────────────────────────────────────────────────────────────────

export interface ColumnCounts {
  label: string
  total: number
  current: number
  toRewrite: number
  preflightFailed: number
  rewritten: number
  raced: number
  failed: number
}

export interface RunResult {
  mode: 'dry-run' | 'apply'
  aborted: 'preflight' | null
  columns: ColumnCounts[]
}

/**
 * Dry-run unless `apply`; preflight decrypts every row of every column before
 * the first write (one failure aborts with nothing written); each write is a
 * compare-and-swap on the old ciphertext. Runs against an already
 * target-guarded connection. Keys must already be installed in process.env;
 * `lib/crypto.ts` reads them there.
 */
export async function reencrypt(db: Db, opts: { apply: boolean; writeKid: string }): Promise<RunResult> {
  const columns: ColumnCounts[] = []
  const pending: { t: ColumnTarget; counts: ColumnCounts; rows: Row[] }[] = []

  // Preflight every row of every column before any write.
  for (const t of COLUMN_TARGETS) {
    const counts: ColumnCounts = {
      label: `${t.table}.${t.column}`,
      total: 0,
      current: 0,
      toRewrite: 0,
      preflightFailed: 0,
      rewritten: 0,
      raced: 0,
      failed: 0,
    }
    const rows = await db.selectColumn(t)
    const toRewrite: Row[] = []
    for (const row of rows) {
      counts.total++
      try {
        decrypt(row.ct, ctxFor(t, row.pk))
      } catch {
        // Wrong key, wrong AAD, tampering — and, since #1287 S3b, any leftover
        // legacy 3-part value, which lib/crypto.ts rejects as malformed.
        counts.preflightFailed++
        continue
      }
      if (isCurrent(row.ct, opts.writeKid)) counts.current++
      else {
        counts.toRewrite++
        toRewrite.push(row)
      }
    }
    columns.push(counts)
    pending.push({ t, counts, rows: toRewrite })
  }

  if (columns.some((c) => c.preflightFailed > 0)) {
    return { mode: opts.apply ? 'apply' : 'dry-run', aborted: 'preflight', columns }
  }
  // Dry-run writes nothing.
  if (!opts.apply) return { mode: 'dry-run', aborted: null, columns }

  // Compare-and-swap per row.
  for (const { t, counts, rows } of pending) {
    for (const row of rows) {
      try {
        const ctx = ctxFor(t, row.pk)
        const plaintext = decrypt(row.ct, ctx)
        const next = encrypt(plaintext, ctx)
        // Belt and braces: the new value must be current-format and round-trip
        // under the same AAD before it replaces anything.
        if (!isCurrent(next, opts.writeKid) || decrypt(next, ctx) !== plaintext) {
          counts.failed++
          continue
        }
        const changed = await db.compareAndSwap(t, row.pk, row.ct, next)
        if (changed === 1) counts.rewritten++
        else if (changed === 0) counts.raced++
        else counts.failed++
      } catch {
        counts.failed++
      }
    }
  }
  return { mode: 'apply', aborted: null, columns }
}

// ── postgres.js implementation ──────────────────────────────────────────────

export async function openDb(databaseUrl: string): Promise<{ db: Db; close: () => Promise<void> }> {
  const { default: postgres } = await import('postgres')
  const sql = postgres(databaseUrl, { max: 1, prepare: false, onnotice: () => {} })
  const db: Db = {
    async selectColumn(t) {
      const rows = await sql<{ pk: string; ct: string }[]>`
        SELECT ${sql(t.pk)}::text AS pk, ${sql(t.column)} AS ct
        FROM ${sql(t.table)}
        WHERE ${sql(t.column)} IS NOT NULL
      `
      return rows.map((r) => ({ pk: r.pk, ct: r.ct }))
    },
    async compareAndSwap(t, pk, prev, next) {
      const res = await sql`
        UPDATE ${sql(t.table)}
        SET ${sql(t.column)} = ${next}
        WHERE ${sql(t.pk)}::text = ${pk} AND ${sql(t.column)} = ${prev}
      `
      return res.count
    },
  }
  return { db, close: () => sql.end({ timeout: 5 }) }
}
