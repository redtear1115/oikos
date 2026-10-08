// #1287 S3 — re-encrypt every field-level ciphertext into `v1:<WRITE_KID>` with AAD.
//
// What it does
// ------------
// For each encrypted column (lib/crypto.ts ENCRYPTED_COLUMNS — all seven,
// soft-deleted rows included, because a soft-deleted row can be restored and
// is still revealed from the same bytes), every value that is not already
// `v1:<ENCRYPTION_WRITE_KID>:…` is decrypted and re-encrypted under the write
// kid, bound to its own (table, column, primary key) through `aadFor`.
//
// It reads only what the app reads: v1 values. Since #1287 S3b the legacy
// 3-part format (`iv:tag:ct`, no AAD) is not accepted by `lib/crypto.ts`, so
// this script can no longer convert legacy rows either — it was run on dev and
// prod before S3b shipped, and both were at 0 legacy rows.
// What a leftover legacy row looks like now: preflight fails on that row
// (`preflight_failed=N`, exit 2) and NOTHING is written, on --apply too. It is
// not a wrong key and not corrupt data; the only repair is reverting S3b, then
// running this script, then re-shipping S3b.
//
// It imports `lib/crypto.ts` instead of re-implementing the format. #881 was
// exactly that mistake: a script with its own copy of the cipher code wrote
// values the app could not read. Here there is one implementation, so if the
// app can decrypt it, so can this script, and vice versa. The preflight /
// compare-and-swap loop and its SQL live in `lib/reencryptCore.ts` for the
// same reason: any runtime route that has to do this job (see the trap below)
// calls that one copy instead of carrying its own.
//
// TRAP — you probably do not have the prod key locally
// ----------------------------------------------------
// Every local / secrets-image env file labelled "prod" (`.env.production`,
// the image's `env/.env.production`, `reencrypt-prod.env`) holds the DEV
// `ENCRYPTION_KEY`, not prod's. The prod key exists only as a Vercel
// Sensitive variable (`vercel env pull` gives back `[SENSITIVE]`), so this
// script cannot re-encrypt prod as-is.
// What it looks like: `--target=prod` passes every guard (the DB URL in those
// files is the real prod one), then preflight fails on EVERY row — including
// the rows the app itself wrote — and nothing is written (2026-09-27 dry-run:
// preflight 22/22 failed). It is not corrupt data; it is the wrong key.
// What to do: run the shared core inside a Vercel *preview* deployment,
// which has the prod DB and the prod keyring — a one-off, token-guarded route
// on a throwaway branch that never merges (#882 did this for #881; #1287 for
// the k2 rotation). Procedure: docs/superpowers/ops-runbook.md.
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
//   ENCRYPTION_WRITE_KID               required (lib/crypto.ts refuses to
//                                      encrypt without one)
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
import { CryptoError } from '../lib/crypto.ts'
import {
  GuardError,
  assertKeyringWritesCurrent,
  assertTargetMatchesUrl,
  openDb,
  reencrypt,
  type ColumnCounts,
  type Db,
  type RunResult,
  type Target,
} from '../lib/reencryptCore.ts'

// The algorithm, its SQL and the target/keyring guards live in
// lib/reencryptCore.ts (one copy, shared with any runtime route). Re-exported
// so existing imports of this module keep working.
export {
  COLUMN_TARGETS,
  GuardError,
  PROJECT_REFS,
  assertKeyringWritesCurrent,
  assertTargetMatchesUrl,
  openDb,
  reencrypt,
} from '../lib/reencryptCore.ts'
export type { ColumnCounts, ColumnTarget, Db, Row, RunResult, Target } from '../lib/reencryptCore.ts'

// ── Argument / env handling ─────────────────────────────────────────────────

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

// ── Output ──────────────────────────────────────────────────────────────────

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
