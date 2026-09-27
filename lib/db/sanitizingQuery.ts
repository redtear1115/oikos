/**
 * #1453 — every error a Drizzle query or transaction throws is cleaned by
 * {@link sanitizeDbError} before any application code sees it.
 *
 * ## Why here
 *
 * The bound values enter the error inside Drizzle: `PgPreparedQuery
 * .queryWithCache` catches the driver error and throws `new
 * DrizzleQueryError(sql, params, cause)`, whose message ends in `\nparams:
 * <every value>`. Every query goes through it — `db.select` / `insert` /
 * `update` / `delete`, `db.query.*`, `db.execute`, and all of those inside a
 * transaction. Cleaning there covers every caller at once: server actions,
 * route handlers, server components, cron routes — before Next prints the
 * error to the server log (Vercel runtime logs, which no Sentry hook sees)
 * and before Sentry's route / component wrappers capture it.
 *
 * Transactions need their own wrap. postgres.js keeps the RAW error of any
 * query that failed inside `begin()` / `savepoint()` and re-throws it when
 * the callback returns — so code that catches a (clean) Drizzle error inside
 * a transaction and carries on still gets the raw `PostgresError`, with its
 * hidden `parameters` / `args`, out of `db.transaction()` (or out of a nested
 * `tx.transaction()`, a savepoint). BEGIN / COMMIT failures (40001 on commit)
 * come out the same way.
 *
 * Wrapped (drizzle-orm 0.45, postgres-js driver):
 * - `queryWithCache` on `PgPreparedQuery.prototype` — reached as the parent of
 *   `PostgresJsPreparedQuery.prototype`, imported from
 *   `drizzle-orm/postgres-js`: the same module instance `lib/db/client.ts`
 *   builds `db` from, so an ESM / CJS double copy of drizzle cannot leave
 *   the live prototype unwrapped;
 * - `PostgresJsSession.prototype.transaction` (`db.transaction`);
 * - `PostgresJsTransaction.prototype.transaction` (`tx.transaction`).
 *
 * Each wrapper is an `async function` that `await`s the original, so both a
 * rejected promise and a synchronous throw are caught. The wrapped function
 * carries {@link DB_ERROR_SANITIZER_MARK} (`Symbol.for`, so a second copy of
 * this module sees it too); installing twice is a no-op.
 *
 * Drizzle's package is `sideEffects: false` and nothing imports this module
 * for its side effect: `lib/db/client.ts` calls {@link installDbErrorSanitizer}
 * explicitly before it builds `db`.
 *
 * ## What failure looks like
 *
 * - **A drizzle upgrade renames or moves one of the three methods** →
 *   `installDbErrorSanitizer` throws at startup (every page that touches the
 *   database fails) — deliberately loud. `tests/db-layer-sanitize.test.ts`
 *   fails in CI first.
 * - **A drizzle upgrade adds a query path that bypasses `queryWithCache`** →
 *   nothing errors. The values reappear as `params: …` lines in the Vercel log
 *   of a failing route handler or page. The same test drives every query
 *   shape through a fake driver and turns red.
 */
import {
  PostgresJsPreparedQuery,
  PostgresJsSession,
  PostgresJsTransaction,
} from 'drizzle-orm/postgres-js'
import { sanitizeDbError } from './sanitizeError'

/** Set on each wrapped function. */
export const DB_ERROR_SANITIZER_MARK = Symbol.for('oikos.db.errorSanitizer')

type Method = (this: unknown, ...args: unknown[]) => unknown

function wrapMethod(target: object, key: string, label: string): void {
  if (!Object.prototype.hasOwnProperty.call(target, key)) {
    throw new Error(`installDbErrorSanitizer: ${label}.${key} not found — drizzle-orm internals changed`)
  }
  const original = Reflect.get(target, key) as unknown
  if (typeof original !== 'function') {
    throw new Error(`installDbErrorSanitizer: ${label}.${key} is not a function — drizzle-orm internals changed`)
  }
  if ((original as unknown as Record<symbol, unknown>)[DB_ERROR_SANITIZER_MARK] === true) return
  const call = original as Method
  const wrapped = async function (this: unknown, ...args: unknown[]): Promise<unknown> {
    try {
      return await call.apply(this, args)
    } catch (e) {
      throw sanitizeDbError(e)
    }
  }
  Object.defineProperty(wrapped, DB_ERROR_SANITIZER_MARK, { value: true })
  Object.defineProperty(target, key, {
    value: wrapped,
    writable: true,
    configurable: true,
    enumerable: false,
  })
}

/** See the module comment. Idempotent; throws if drizzle's internals moved. */
export function installDbErrorSanitizer(): void {
  const preparedQuery = Object.getPrototypeOf(PostgresJsPreparedQuery.prototype) as object | null
  if (!preparedQuery) {
    throw new Error('installDbErrorSanitizer: PgPreparedQuery.prototype not found — drizzle-orm internals changed')
  }
  wrapMethod(preparedQuery, 'queryWithCache', 'PgPreparedQuery.prototype')
  wrapMethod(PostgresJsSession.prototype, 'transaction', 'PostgresJsSession.prototype')
  wrapMethod(PostgresJsTransaction.prototype, 'transaction', 'PostgresJsTransaction.prototype')
}
