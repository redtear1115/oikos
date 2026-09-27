/**
 * #1289 / #1453 — strip query parameters and row values out of a database
 * error before it leaves the database layer.
 *
 * ## Why
 *
 * Drizzle wraps every driver failure in a `DrizzleQueryError` whose message is
 * `Failed query: <sql>\nparams: <every bound value>`, and whose `.params` holds
 * the same values. The Postgres error it wraps (`.cause`) adds `detail`, which
 * for a unique violation reads `Key (group_id, user_id, barcode)=(…)` and for a
 * CHECK / NOT NULL violation reads `Failing row contains (…every column…)`,
 * and postgres.js hangs the bound values on it once more as hidden `query` /
 * `parameters` / `args` properties. Whatever re-throws that error — a server
 * action, a route handler, a server component — gets it logged by Next with
 * `console.error` (Vercel runtime logs) and captured by Sentry, so a ledger
 * description, an amount, an invoice barcode or a verification-code
 * ciphertext would land in both.
 *
 * Two callers:
 * - `lib/db/sanitizingQuery.ts` (#1453) runs it on every error a Drizzle query
 *   or transaction throws, before any application code sees it. This is the
 *   line that covers the Vercel log.
 * - `runAction` (`lib/action-errors.ts`, #1289) runs it again at the action
 *   boundary. Second line; idempotent.
 *
 * The SQL text stays: Drizzle binds values as `$1`, `$2`, … so the statement
 * itself carries none, and it is what makes the issue debuggable. The Postgres
 * message stays too, except a class 22 (data exception) message, which is
 * masked from its first quote on, and the quoted input of an "invalid input"
 * message wherever it appears.
 *
 * ## Contract
 *
 * - Pure, no imports (this module is reachable from client bundles through
 *   `lib/action-errors.ts`).
 * - Never throws. On an internal failure it returns a plain `Error` with a
 *   fixed message — carrying only the SQLSTATE and constraint name, which
 *   control flow reads — rather than the original.
 * - Returns the value to throw: the same object, cleaned in place, for a
 *   Drizzle error; a cleaned copy for a Postgres error or any other error
 *   postgres.js decorated with the query's parameters (they are defined
 *   non-configurable, so they cannot be removed in place). Anything else is
 *   returned untouched.
 *
 * ## What failure looks like
 *
 * Nothing errors. The values just appear in the Sentry issue title and in the
 * Vercel log line for the failed request.
 * `tests/db-error-sanitize.test.ts` and `tests/db-layer-sanitize.test.ts` are
 * the only things that turn red.
 */

/** Drizzle's message tail: `\nparams: ` up to the end. */
const PARAMS_TAIL_RE = /\nparams: [\s\S]*$/

/**
 * Postgres error fields that never carry row values. `hint` and `position`
 * (#1453) are kept because they are what makes a failed query debuggable;
 * Postgres fills them from the statement and the server, not from the row.
 */
const SAFE_PG_FIELDS = [
  'code',
  'severity',
  'severity_local',
  'schema_name',
  'table_name',
  'column_name',
  'constraint_name',
  'routine',
  'hint',
  'position',
] as const

/**
 * `detail` is dropped except for these SQLSTATEs (#1453): a deadlock
 * (40P01), a serialization failure (40001), a lock that could not be taken
 * (55P03) and a cancelled statement (57014) describe processes and locks,
 * not rows — and they are exactly the incidents that are unreadable without
 * the detail.
 */
const DETAIL_KEPT_CODES = new Set(['40P01', '40001', '55P03', '57014'])

/** Socket fields of a postgres.js connection error (`Errors.connection`). */
const CONNECTION_FIELDS = ['errno', 'address', 'port'] as const

const MASKED = '<masked>'

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
 * Any other error that postgres.js decorated with the failed query
 * (`src/connection.js` defines `query` / `parameters` / `args` on EVERY
 * error a query rejects with — connection errors included). Those
 * properties are non-configurable and non-enumerable: `JSON.stringify`
 * misses them, `util.inspect(err, { showHidden: true })` (and anything
 * that walks own property names) prints every bound value.
 */
function carriesDriverParameters(e: unknown): e is AnyError {
  return (
    e instanceof Error &&
    (Object.prototype.hasOwnProperty.call(e, 'parameters') ||
      Object.prototype.hasOwnProperty.call(e, 'args'))
  )
}

/** SQLSTATE class 22 — data exception: the message may quote the input. */
export function isDataExceptionCode(code: unknown): boolean {
  return typeof code === 'string' && /^22[0-9A-Z]{3}$/.test(code)
}

/**
 * Class 22 messages quote the offending value in many shapes — `invalid
 * input syntax for type uuid: "…"`, `value "…" is out of range for type
 * integer`, `malformed array literal: "…"`, `date/time field value out of
 * range: "…"`, `invalid value "…" for "…"`. Rather than enumerating them,
 * everything from the FIRST `"` to the end is masked (#1453, fail closed):
 * the value may itself contain quotes and newlines (#1439), so no closing
 * quote is ever searched for. A type or enum name quoted before the value
 * goes with it — that is the price of not guessing.
 */
export function maskFromFirstQuote(text: string): string {
  const q = text.indexOf('"')
  return q === -1 ? text : `${text.slice(0, q + 1)}${MASKED}"`
}

/**
 * 22P02-style messages quote the rejected input
 * (`invalid input syntax for type uuid: "…"`). The input is verbatim and may
 * contain newlines and quotes (#1439), so it is masked from the opening quote
 * to the END of the text — the closing quote is never searched for (a quote
 * found in the text may be one of the input's own). Applied to messages
 * without a class 22 code too, in case the shape arrives some other way.
 *
 * Failure looks like nothing: the part of the input after its first newline
 * or inner quote just sits in the re-thrown error's message.
 */
const INVALID_INPUT_HEAD_RE = /invalid input (?:syntax|value) for [^:\n]{0,256}: "/

function maskInvalidInput(text: string): string {
  const m = INVALID_INPUT_HEAD_RE.exec(text)
  return m ? `${text.slice(0, m.index + m[0].length)}${MASKED}"` : text
}

function maskPgMessage(message: string, code: unknown): string {
  return isDataExceptionCode(code) ? maskFromFirstQuote(message) : maskInvalidInput(message)
}

/**
 * The stack starts with `Name: message`. Swap `replacement` in for the
 * message there, so the mask ends where the message does and the frames
 * after it stay. When the message is not on the stack's first line, where
 * it ends is unknown — a bound value may contain `\n    at ` and look like
 * a frame (#1439) — so fail closed: the stack becomes the header alone.
 */
function swapStackMessage(stack: string, original: string, replacement: string, name: string): string {
  const at = original === '' ? -1 : stack.indexOf(original)
  if (at !== -1 && !stack.slice(0, at).includes('\n')) {
    return `${stack.slice(0, at)}${replacement}${stack.slice(at + original.length)}`
  }
  return `${name}: ${replacement}`
}

/**
 * A copy with the name, the masked message and the whitelisted fields — no
 * values, no hidden `query` / `parameters` / `args`.
 */
function cleanCopy(e: AnyError, extraFields: readonly string[], depth: number): Error {
  const message = typeof e.message === 'string' ? e.message : ''
  const out = new Error(maskPgMessage(message, e.code)) as AnyError
  out.name = typeof e.name === 'string' ? e.name : 'Error'
  for (const key of [...SAFE_PG_FIELDS, ...extraFields]) {
    const value = e[key]
    if (typeof value === 'string' || typeof value === 'number') out[key] = value
  }
  if (typeof e.detail === 'string' && typeof e.code === 'string' && DETAIL_KEPT_CODES.has(e.code)) {
    out.detail = e.detail
  }
  out.stack = typeof e.stack === 'string'
    ? swapStackMessage(e.stack, message, out.message, out.name)
    : `${out.name}: ${out.message}`
  if (e.cause !== undefined) out.cause = sanitizeInner(e.cause, depth + 1)
  return out
}

function cleanDrizzleError(e: AnyError, depth: number): void {
  const before = e.message
  const after = before.replace(PARAMS_TAIL_RE, '')
  if (typeof e.stack === 'string') e.stack = swapStackMessage(e.stack, before, after, e.name)
  if (after !== before) e.message = after
  Reflect.deleteProperty(e, 'params')
  if (e.cause !== undefined) e.cause = sanitizeInner(e.cause, depth + 1)
}

function sanitizeInner(e: unknown, depth: number): unknown {
  if (depth > 3) return e
  if (isDrizzleQueryError(e)) {
    cleanDrizzleError(e, depth)
    return e
  }
  if (isPostgresError(e)) return cleanCopy(e, [], depth)
  if (carriesDriverParameters(e)) return cleanCopy(e, CONNECTION_FIELDS, depth)
  // Some other error wrapping a driver error (e.g. an app error thrown with
  // `{ cause }`): clean the chain below it.
  if (e instanceof Error && e.cause !== undefined) {
    const cause = sanitizeInner(e.cause, depth + 1)
    if (cause !== e.cause) Reflect.set(e, 'cause', cause)
  }
  return e
}

/** Read `key` without letting a throwing getter escape. */
function safeRead(source: unknown, key: string): unknown {
  try {
    return typeof source === 'object' && source !== null ? (source as AnyError)[key] : undefined
  } catch {
    return undefined
  }
}

/**
 * The fixed-message fallback still carries the SQLSTATE and the constraint
 * of the first error in the chain that has one: control flow reads them
 * (`actions/invite.ts` `pgErrorCode`, `actions/invoice.ts`
 * `isBarcodeUniqueViolation`), and losing them would turn an expected
 * failure into an unexpected one.
 */
function fallbackError(e: unknown): Error {
  const out = new Error('Database error (details removed)') as AnyError
  let cur: unknown = e
  for (let depth = 0; cur && depth < 4; depth++) {
    const code = safeRead(cur, 'code')
    if (typeof code === 'string') {
      out.code = code
      const constraint = safeRead(cur, 'constraint_name')
      if (typeof constraint === 'string') out.constraint_name = constraint
      break
    }
    cur = safeRead(cur, 'cause')
  }
  return out
}

/** See the module comment. Returns the value the caller should throw. */
export function sanitizeDbError(e: unknown): unknown {
  try {
    return sanitizeInner(e, 0)
  } catch {
    try {
      return fallbackError(e)
    } catch {
      return new Error('Database error (details removed)')
    }
  }
}
