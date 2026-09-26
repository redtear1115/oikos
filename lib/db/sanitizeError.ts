/**
 * #1289 — strip query parameters and row values out of a database error before
 * it leaves a server action.
 *
 * ## Why
 *
 * Drizzle wraps every driver failure in a `DrizzleQueryError` whose message is
 * `Failed query: <sql>\nparams: <every bound value>`, and whose `.params` holds
 * the same values. The Postgres error it wraps (`.cause`) adds `detail`, which
 * for a unique violation reads `Key (group_id, user_id, barcode)=(…)` and for a
 * CHECK / NOT NULL violation reads `Failing row contains (…every column…)`.
 * A server action that fails unexpectedly re-throws that error; Next logs it
 * with `console.error` (Vercel runtime logs) and Sentry captures it — so a
 * ledger description, an amount, an invoice barcode or a verification-code
 * ciphertext would land in both. Cleaning it here, before the re-throw, also
 * covers the Vercel log line, which no Sentry hook ever sees.
 *
 * The SQL text stays: Drizzle binds values as `$1`, `$2`, … so the statement
 * itself carries none, and it is what makes the issue debuggable. The Postgres
 * message stays too, except the quoted input of an "invalid input syntax"
 * error (22P02), which is masked.
 *
 * ## Contract
 *
 * - Pure, no imports (this module is reachable from client bundles through
 *   `lib/action-errors.ts`).
 * - Never throws. On an internal failure it returns a plain `Error` with a
 *   fixed message rather than the original.
 * - Returns the value to throw: the same object, cleaned in place, for a
 *   Drizzle error; a cleaned copy for a bare Postgres error (postgres.js
 *   defines `parameters` / `args` on it as non-configurable, so they cannot be
 *   removed in place). Anything else is returned untouched.
 *
 * ## What failure looks like
 *
 * Nothing errors. The values just appear in the Sentry issue title and in the
 * Vercel log line for the failed request.
 * `tests/db-error-sanitize.test.ts` is the only thing that turns red.
 */

/** Drizzle's message tail: `\nparams: ` up to the end. */
const PARAMS_TAIL_RE = /\nparams: [\s\S]*$/
/** The same tail inside a stack string, up to the first stack frame. */
const STACK_PARAMS_RE = /\nparams: [\s\S]*?(?=\n\s+at |$)/

/** Postgres error fields that never carry row values. */
const SAFE_PG_FIELDS = [
  'code',
  'severity',
  'severity_local',
  'schema_name',
  'table_name',
  'column_name',
  'constraint_name',
  'routine',
] as const

type AnyError = Error & Record<string, unknown>

function isDrizzleQueryError(e: unknown): e is AnyError {
  return (
    e instanceof Error &&
    typeof e.message === 'string' &&
    e.message.startsWith('Failed query: ') &&
    ('params' in e || 'query' in e)
  )
}

/** postgres.js `PostgresError`, or anything shaped like it. */
function isPostgresError(e: unknown): e is AnyError {
  return (
    e instanceof Error &&
    typeof (e as AnyError).code === 'string' &&
    typeof (e as AnyError).severity === 'string'
  )
}

/**
 * 22P02-style messages quote the rejected input
 * (`invalid input syntax for type uuid: "…"`); the quoted part is masked.
 */
const INVALID_INPUT_RE = /(invalid input (?:syntax|value) for [^:"\n]*: )"[^"\n]*"/g

function maskInvalidInput(text: string): string {
  return text.replace(INVALID_INPUT_RE, '$1"<masked>"')
}

/** A copy that keeps the SQLSTATE, the names and the message — no values. */
function clonePostgresError(e: AnyError): Error {
  const out = new Error(maskInvalidInput(e.message)) as AnyError
  out.name = e.name
  for (const key of SAFE_PG_FIELDS) {
    const value = e[key]
    if (typeof value === 'string') out[key] = value
  }
  if (typeof e.stack === 'string') out.stack = maskInvalidInput(e.stack)
  return out
}

function cleanDrizzleError(e: AnyError, depth: number): void {
  const before = e.message
  const after = before.replace(PARAMS_TAIL_RE, '')
  if (after !== before) {
    e.message = after
    if (typeof e.stack === 'string') {
      e.stack = e.stack.replace(before, after).replace(STACK_PARAMS_RE, '')
    }
  }
  Reflect.deleteProperty(e, 'params')
  if (e.cause !== undefined) e.cause = sanitizeInner(e.cause, depth + 1)
}

function sanitizeInner(e: unknown, depth: number): unknown {
  if (depth > 3) return e
  if (isDrizzleQueryError(e)) {
    cleanDrizzleError(e, depth)
    return e
  }
  if (isPostgresError(e)) return clonePostgresError(e)
  // Some other error wrapping a driver error (e.g. an app error thrown with
  // `{ cause }`): clean the chain below it.
  if (e instanceof Error && e.cause !== undefined) {
    const cause = sanitizeInner(e.cause, depth + 1)
    if (cause !== e.cause) Reflect.set(e, 'cause', cause)
  }
  return e
}

/** See the module comment. Returns the value the caller should throw. */
export function sanitizeDbError(e: unknown): unknown {
  try {
    return sanitizeInner(e, 0)
  } catch {
    return new Error('Database error (details removed)')
  }
}
