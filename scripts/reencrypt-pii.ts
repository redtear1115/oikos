// #1287 S3 — re-encrypt every field-level ciphertext into `v1:<WRITE_KID>` with AAD.
//
// What it does
// ------------
// For each encrypted column (lib/crypto.ts ENCRYPTED_COLUMNS — all six,
// soft-deleted rows included, because a soft-deleted row can be restored and
// is still revealed from the same bytes), every value that is not already
// `v1:<ENCRYPTION_WRITE_KID>:…` is decrypted and re-encrypted under the write
// kid, bound to its own (table, column, primary key) through `aadFor`.
//
// It imports `lib/crypto.ts` instead of re-implementing the format. #881 was
// exactly that mistake: a script with its own copy of the cipher code wrote
// values the app could not read. Here there is one implementation, so if the
// app can decrypt it, so can this script, and vice versa.
//
// Guards (plan #1287 Part C, S3)
// ------------------------------
//   1. Dry-run by default. Nothing is written without `--apply`.
//   2. `--target=dev|prod` must match the Supabase project ref in the DB URL's
//      host (`db.<ref>.supabase.co`) or username (`postgres.<ref>`, pooler),
//      and the other environment's ref must not appear anywhere in the URL.
//   3. Preflight: every row of every column is decrypted before the first
//      write. One failure aborts the whole run with nothing written.
//   4. Each write is a compare-and-swap
//      (`UPDATE … SET col = new WHERE pk = $pk AND col = $old`). If 0 rows
//      change, the row moved under us (app edit, soft-delete/insert, hard
//      delete) and is counted as `raced`; the next run picks it up.
//   5. Output is counts only: no primary keys, no ciphertext, no plaintext,
//      no AAD, no key material, no connection string.
//
// Where the keys come from
// ------------------------
// Only from the env file named by `--env-file=<path>`, which should live on
// the mounted secrets disk image, not in the repo. The script refuses to run
// when any ENCRYPTION_* variable is already in its own environment (that is
// how keys end up in shell history — the #881 script took them inline), and
// refuses an env file that resolves inside the repo checkout (`.env.local`,
// or anything `vercel env pull` would drop there). Unmount the image after.
//
// The env file must contain:
//   ENCRYPTION_KEY / ENCRYPTION_KEYS   the keyring, same contract as the app
//   ENCRYPTION_WRITE_KID               required here (no legacy writes)
//   DATABASE_URL_DIRECT                preferred; or DATABASE_URL pointing at the
//                                      session pooler (the direct host may be
//                                      IPv6-only)
// Nothing is read from the ambient environment for these.
//
// Usage (operator step, user-approved; dev first, then prod):
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/reencrypt-pii.ts \
//     --target=dev --env-file=/Volumes/<secrets image>/<dev env file>          # dry-run
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/reencrypt-pii.ts \
//     --target=dev --env-file=/Volumes/<secrets image>/<dev env file> --apply  # write
//
// Exit codes: 0 ok · 1 usage/guard/unexpected error · 2 preflight failure
// (nothing written) · 3 apply finished with failed > 0 or raced > 0.
//
// Prerequisite: S2 is live in every environment that writes to the target DB,
// so the app itself no longer produces non-current ciphertext.
//
// Needs Node ≥ 22.18 (native TypeScript type stripping).

import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseEnv } from 'node:util'
import {
  CryptoError,
  ENCRYPTED_COLUMNS,
  aadFor,
  decrypt,
  encrypt,
  type EncryptedTable,
} from '../lib/crypto.ts'

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

// ── Argument / env handling ─────────────────────────────────────────────────

export class GuardError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GuardError'
  }
}

export interface Options {
  target: Target
  envFile: string
  apply: boolean
}

export function parseArgs(argv: readonly string[]): Options {
  let target: string | undefined
  let envFile: string | undefined
  let apply = false
  for (const arg of argv) {
    if (arg === '--apply') apply = true
    else if (arg.startsWith('--target=')) target = arg.slice('--target='.length)
    else if (arg.startsWith('--env-file=')) envFile = arg.slice('--env-file='.length)
    else throw new GuardError('Unknown argument (expected --target=dev|prod --env-file=<path> [--apply])')
  }
  if (target !== 'dev' && target !== 'prod') throw new GuardError('--target=dev|prod is required')
  if (!envFile) throw new GuardError('--env-file=<path> is required')
  return { target, envFile, apply }
}

const KEY_VARS = ['ENCRYPTION_KEY', 'ENCRYPTION_KEYS', 'ENCRYPTION_WRITE_KID'] as const

/** Keys must not arrive through the process environment (shell history, inline vars). */
export function assertNoAmbientKeys(env: Record<string, string | undefined>): void {
  for (const name of Object.keys(env)) {
    if (name.startsWith('ENCRYPTION_') && env[name] !== undefined && env[name] !== '') {
      throw new GuardError(`${name} is set in the environment; keys must come only from --env-file`)
    }
  }
}

function isInside(child: string, parent: string): boolean {
  const rel = relative(parent, child)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

/**
 * The checkout roots this script belongs to: its own worktree and, when that
 * is a linked worktree, the main checkout its `.git` file points at.
 */
export function repoRoots(scriptDir: string): string[] {
  const root = resolve(scriptDir, '..')
  const roots = [root]
  const dotGit = resolve(root, '.git')
  try {
    if (statSync(dotGit).isFile()) {
      const m = /^gitdir:\s*(.+)$/m.exec(readFileSync(dotGit, 'utf8'))
      const idx = m ? m[1].trim().lastIndexOf('/.git/worktrees/') : -1
      if (m && idx !== -1) roots.push(m[1].trim().slice(0, idx))
    }
  } catch {
    // no .git (e.g. an exported copy): the script dir's parent is the only root
  }
  return roots.flatMap((r) => {
    try {
      return [r, realpathSync(r)]
    } catch {
      return [r]
    }
  })
}

export function assertEnvFileOutsideRepo(envFile: string, roots: readonly string[]): void {
  const abs = resolve(envFile)
  const candidates = [abs]
  try {
    candidates.push(realpathSync(abs))
  } catch {
    // missing file is reported by the caller
  }
  for (const c of candidates) {
    if (roots.some((r) => isInside(c, r))) {
      throw new GuardError('--env-file must live outside the repository (use the mounted secrets image)')
    }
  }
}

export interface LoadedEnv {
  databaseUrl: string
  writeKid: string
  /** Only the keyring variables, for installing into process.env. */
  keyVars: Partial<Record<(typeof KEY_VARS)[number], string>>
}

export function parseEnvFile(contents: string): LoadedEnv {
  const parsed = parseEnv(contents) as Record<string, string | undefined>
  const keyVars: LoadedEnv['keyVars'] = {}
  for (const name of KEY_VARS) {
    const v = parsed[name]
    if (v !== undefined && v !== '') keyVars[name] = v
  }
  const writeKid = keyVars.ENCRYPTION_WRITE_KID
  if (!writeKid) throw new GuardError('ENCRYPTION_WRITE_KID must be set in the env file')
  const databaseUrl = parsed.DATABASE_URL_DIRECT || parsed.DATABASE_URL
  if (!databaseUrl) throw new GuardError('DATABASE_URL_DIRECT (or DATABASE_URL) must be set in the env file')
  return { databaseUrl, writeKid, keyVars }
}

/**
 * Guard 2. The ref has to be *the* identifying part of the URL — the host of
 * a direct connection or the tenant suffix of a pooler username — and the
 * other environment's ref may not appear anywhere.
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

function isCurrent(ct: string, writeKid: string): boolean {
  const parts = ct.split(':')
  return parts.length === 5 && parts[0] === 'v1' && parts[1] === writeKid
}

function ctxFor(t: ColumnTarget, pk: string) {
  // ColumnTarget comes from ENCRYPTED_COLUMNS, so the pair is valid by construction.
  return aadFor(t.table, t.column as never, pk)
}

/**
 * Runs guards 1, 3, 4 against an already-guarded (2) connection. Keys must
 * already be installed in process.env; `lib/crypto.ts` reads them there.
 */
export async function reencrypt(db: Db, opts: { apply: boolean; writeKid: string }): Promise<RunResult> {
  const columns: ColumnCounts[] = []
  const pending: { t: ColumnTarget; counts: ColumnCounts; rows: Row[] }[] = []

  // Guard 3 — preflight every row of every column before any write.
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
  // Guard 1 — dry-run writes nothing.
  if (!opts.apply) return { mode: 'dry-run', aborted: null, columns }

  // Guard 4 — compare-and-swap per row.
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

export function formatResult(target: Target, r: RunResult): string {
  const lines = [`target=${target} mode=${r.mode}`]
  for (const c of r.columns) {
    lines.push(
      `  ${c.label}: total=${c.total} current=${c.current} to_rewrite=${c.toRewrite}` +
        ` preflight_failed=${c.preflightFailed}` +
        (r.mode === 'apply' && !r.aborted ? ` rewritten=${c.rewritten} raced=${c.raced} failed=${c.failed}` : ''),
    )
  }
  const sum = (k: keyof ColumnCounts) => r.columns.reduce((n, c) => n + (c[k] as number), 0)
  if (r.aborted === 'preflight') {
    lines.push(`ABORTED: preflight_failed=${sum('preflightFailed')}; nothing was written`)
  } else if (r.mode === 'dry-run') {
    lines.push(`dry run: to_rewrite=${sum('toRewrite')}; nothing was written (pass --apply to write)`)
  } else {
    lines.push(`done: rewritten=${sum('rewritten')} raced=${sum('raced')} failed=${sum('failed')}`)
    if (sum('raced') > 0) lines.push('raced rows changed during the run; run again to pick them up')
  }
  return lines.join('\n')
}

export function exitCodeFor(r: RunResult): number {
  if (r.aborted) return 2
  if (r.mode === 'apply' && r.columns.some((c) => c.failed > 0 || c.raced > 0)) return 3
  return 0
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

// ── postgres.js implementation ──────────────────────────────────────────────

async function openDb(databaseUrl: string): Promise<{ db: Db; close: () => Promise<void> }> {
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

// ── CLI ─────────────────────────────────────────────────────────────────────

/** Error text safe to print: guard/crypto messages are written to be; anything else is reduced to its type. */
function safeMessage(err: unknown): string {
  if (err instanceof GuardError || err instanceof CryptoError) return err.message
  const code = (err as { code?: unknown })?.code
  const name = err instanceof Error ? err.name : 'Error'
  return typeof code === 'string' ? `${name} (${code})` : name
}

export async function main(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  scriptDir: string,
  connect: (databaseUrl: string) => Promise<{ db: Db; close: () => Promise<void> }> = openDb,
): Promise<number> {
  const opts = parseArgs(argv)
  assertNoAmbientKeys(env)
  assertEnvFileOutsideRepo(opts.envFile, repoRoots(scriptDir))
  if (!existsSync(opts.envFile)) throw new GuardError('--env-file does not exist')
  const loaded = parseEnvFile(readFileSync(opts.envFile, 'utf8'))
  assertTargetMatchesUrl(opts.target, loaded.databaseUrl)

  for (const name of KEY_VARS) {
    const v = loaded.keyVars[name]
    if (v === undefined) delete env[name]
    else env[name] = v
  }
  assertKeyringWritesCurrent(loaded.writeKid)

  const { db, close } = await connect(loaded.databaseUrl)
  try {
    const result = await reencrypt(db, { apply: opts.apply, writeKid: loaded.writeKid })
    console.log(formatResult(opts.target, result))
    return exitCodeFor(result)
  } finally {
    await close()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const scriptDir = dirname(fileURLToPath(import.meta.url))
  main(process.argv.slice(2), process.env, scriptDir).then(
    (code) => {
      process.exitCode = code
    },
    (err: unknown) => {
      console.error(`reencrypt-pii: ${safeMessage(err)}`)
      process.exitCode = 1
    },
  )
}
