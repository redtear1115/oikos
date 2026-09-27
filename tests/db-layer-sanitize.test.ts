// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { inspect } from 'node:util'
import { randomUUID } from 'node:crypto'

/**
 * #1453 — every error thrown through `db` (`lib/db/client.ts`) is already
 * clean when application code catches it: no bound value and no row detail in
 * its message, stack, hidden properties or JSON form.
 *
 * Runs in CI: the real `db` (real drizzle, real schema, the real install call
 * in `lib/db/client.ts`) on top of a fake postgres.js client that fails every
 * query the way postgres.js does — a `PostgresError` with `detail`, and the
 * query's parameters defined on it as hidden, non-configurable `query` /
 * `parameters` / `args` (src/connection.js). The fake's `begin` / `savepoint`
 * keep the raw error of a failed query and re-throw it when the callback
 * returns, like postgres.js' `scope()` — the path that bypasses
 * `queryWithCache` when code catches inside a transaction and carries on.
 *
 * Failure looks like: the install call removed from `lib/db/client.ts`, or a
 * drizzle upgrade that moves `queryWithCache` / `transaction` — this file
 * turns red; in production the values would reappear as `params: …` lines in
 * the Vercel log of a failing route handler or page.
 */

// Built at runtime so a source line quoted into a stack frame cannot carry it.
const MARKER = ['ZX', '1453', 'MARK'].join('')
const CIPHER_MARKER = ['v1', 'k1', '1453aa', 'bb1453'].join(':')
const MARKERS = [MARKER, CIPHER_MARKER]

type Row = Record<string, unknown>
type Thenable = PromiseLike<unknown> & { values(): Thenable; catch(fn: (e: unknown) => unknown): Promise<unknown> }
interface FakeSql {
  options: { parsers: Row; serializers: Row }
  unsafe(query: string, params?: unknown[]): Thenable
  begin(fn: (sql: FakeSql) => unknown): Promise<unknown>
  savepoint(fn: (sql: FakeSql) => unknown): Promise<unknown>
}

const fake = vi.hoisted(() => ({
  /** Every query the fake saw, in order. */
  queries: [] as string[],
  /** Which queries fail. Default: all of them. */
  shouldFail: ((_query: string) => true) as (query: string) => boolean,
  client: null as unknown,
}))

vi.mock('postgres', async (importActual) => {
  const actual = await importActual<Record<string, unknown>>()
  const pg = actual.default as typeof import('postgres')
  const { PostgresError } = pg

  function rawError(query: string, params: unknown[]): Error {
    const e = new PostgresError({
      message: 'duplicate key value violates unique constraint "profiles_marker_uniq"',
      severity: 'ERROR',
      code: '23505',
      detail: `Key (display_name)=(${MARKER}) already exists.`,
      where: `unnamed portal parameter $1 = '${CIPHER_MARKER}'`,
      schema_name: 'public',
      table_name: 'Profiles',
      constraint_name: 'profiles_marker_uniq',
    } as never)
    // What postgres.js does to every error a query rejects with.
    Object.defineProperties(e, {
      query: { value: query, enumerable: false },
      parameters: { value: [...params, CIPHER_MARKER], enumerable: false },
      args: { value: [...params, CIPHER_MARKER], enumerable: false },
      types: { value: null, enumerable: false },
    })
    return e
  }

  function makeSql(onQueryError: (e: Error) => void): FakeSql {
    const sql: FakeSql = {
      options: { parsers: {}, serializers: {} },
      unsafe(query: string, params: unknown[] = []) {
        let run: Promise<unknown> | undefined
        const start = () => {
          if (!run) {
            fake.queries.push(query)
            if (fake.shouldFail(query)) {
              const e = rawError(query, params)
              onQueryError(e)
              run = Promise.reject(e)
            } else {
              run = Promise.resolve([])
            }
          }
          return run
        }
        const q: Thenable = {
          then: (onOk, onErr) => start().then(onOk, onErr),
          values: () => q,
          catch: (onErr) => start().catch(onErr),
        }
        return q
      },
      begin: (fn) => scope(fn),
      savepoint: (fn) => scope(fn),
    }
    return sql
  }

  /** postgres.js `scope()` (src/index.js), minus the wire. */
  async function scope(fn: (sql: FakeSql) => unknown): Promise<unknown> {
    let uncaught: Error | undefined
    const sql = makeSql((e) => { uncaught ??= e })
    try {
      const result = await fn(sql)
      if (uncaught) throw uncaught
      return result
    } catch (e) {
      throw (e instanceof PostgresError && (e as { code?: string }).code === '25P02' && uncaught) || e
    }
  }

  const factory = () => {
    const client = makeSql(() => {})
    fake.client = client
    return client
  }
  return { ...actual, default: Object.assign(factory, pg) }
})

const { db } = await import('@/lib/db/client')
const { profiles } = await import('@/lib/db/schema')
const { eq, sql, DrizzleQueryError } = await import('drizzle-orm')
const { PostgresJsPreparedQuery, PostgresJsSession, PostgresJsTransaction } = await import('drizzle-orm/postgres-js')
const { DB_ERROR_SANITIZER_MARK } = await import('@/lib/db/sanitizingQuery')

/** Every place a value could hide, as text. */
function surfaces(e: unknown): string {
  const parts: string[] = [inspect(e, { showHidden: true, depth: 8 })]
  try {
    parts.push(JSON.stringify(e) ?? '')
  } catch {
    parts.push('<unserializable>')
  }
  let cur: unknown = e
  for (let depth = 0; cur && depth < 5; depth++) {
    const err = cur as Error & Row
    parts.push(String(err.message), String(err.stack))
    for (const key of Object.getOwnPropertyNames(err)) {
      try {
        parts.push(`${key}=${inspect(err[key], { showHidden: true, depth: 4 })}`)
      } catch {
        parts.push(`${key}=<unreadable>`)
      }
    }
    cur = err.cause
  }
  return parts.join('\n')
}

function leaks(e: unknown): string[] {
  const text = surfaces(e)
  return MARKERS.filter((m) => text.includes(m))
}

async function rejection(p: PromiseLike<unknown>): Promise<Error & Row> {
  return Promise.resolve(p).then(
    () => { throw new Error('expected a rejection') },
    (e: unknown) => e as Error & Row,
  )
}

/** The SQLSTATE, wherever the chain carries it (what actions read). */
function codeOf(e: unknown): unknown {
  let cur: unknown = e
  for (let depth = 0; cur && depth < 4; depth++) {
    const code = (cur as Row).code
    if (typeof code === 'string') return code
    cur = (cur as Row).cause
  }
  return undefined
}

function insertRow() {
  return db.insert(profiles).values({ id: randomUUID(), displayName: MARKER })
}

beforeEach(() => {
  fake.queries.length = 0
  fake.shouldFail = () => true
})

describe('the wrap is installed on drizzle\'s live prototypes', () => {
  it.each([
    ['PgPreparedQuery.prototype.queryWithCache', () => Object.getPrototypeOf(PostgresJsPreparedQuery.prototype).queryWithCache],
    ['PostgresJsSession.prototype.transaction', () => PostgresJsSession.prototype.transaction],
    ['PostgresJsTransaction.prototype.transaction', () => PostgresJsTransaction.prototype.transaction],
  ])('%s carries the marker', (_name, get) => {
    const fn = get() as unknown as Record<symbol, unknown>
    expect(typeof fn).toBe('function')
    expect(fn[DB_ERROR_SANITIZER_MARK]).toBe(true)
    expect(DB_ERROR_SANITIZER_MARK).toBe(Symbol.for('oikos.db.errorSanitizer'))
  })
})

describe('the fake driver really produces the raw errors (control)', () => {
  it('a failed query rejects with the values in detail and the hidden parameters', async () => {
    const client = fake.client as FakeSql
    const e = await rejection(client.unsafe('select $1', [MARKER]))
    expect(e.code).toBe('23505')
    expect(leaks(e)).toEqual(MARKERS)
  })

  it('begin() re-throws the raw error of a query caught inside it', async () => {
    const client = fake.client as FakeSql
    const e = await rejection(client.begin(async (tx) => {
      await tx.unsafe('insert $1', [MARKER]).then(() => {}, () => {})
      return 'ok'
    }))
    expect(e.code).toBe('23505')
    expect(leaks(e)).toEqual(MARKERS)
  })
})

describe('errors thrown through db are clean at the source', () => {
  const cases: Array<[string, () => PromiseLike<unknown>]> = [
    ['insert', () => insertRow()],
    ['select', () => db.select().from(profiles).where(eq(profiles.displayName, MARKER))],
    ['db.query.*', () => db.query.profiles.findFirst({ where: eq(profiles.displayName, MARKER) })],
    ['db.execute', () => db.execute(sql`select ${MARKER}`)],
    ['update', () => db.update(profiles).set({ displayName: MARKER }).where(eq(profiles.id, randomUUID()))],
    ['delete', () => db.delete(profiles).where(eq(profiles.displayName, MARKER))],
  ]

  it.each(cases)('%s', async (_name, run) => {
    const e = await rejection(run())
    expect(e).toBeInstanceOf(DrizzleQueryError)
    expect(e.message.startsWith('Failed query: ')).toBe(true)
    expect(e.message).not.toContain('params:')
    expect('params' in e).toBe(false)
    expect((e.cause as Row).detail).toBeUndefined()
    // Control flow still reads these.
    expect(codeOf(e)).toBe('23505')
    expect((e.cause as Row).constraint_name).toBe('profiles_marker_uniq')
    expect(leaks(e)).toEqual([])
    expect(fake.queries).toHaveLength(1)
  })

  it('db.transaction: a query error propagating out', async () => {
    const e = await rejection(db.transaction(async (tx) => {
      await tx.insert(profiles).values({ id: randomUUID(), displayName: MARKER })
    }))
    expect(codeOf(e)).toBe('23505')
    expect(leaks(e)).toEqual([])
  })

  it('db.transaction: caught inside, callback returns normally — begin() re-throws the raw error', async () => {
    let inside: unknown
    const e = await rejection(db.transaction(async (tx) => {
      try {
        await tx.insert(profiles).values({ id: randomUUID(), displayName: MARKER })
      } catch (err) {
        inside = err
      }
      return 'carried on'
    }))
    expect(leaks(inside)).toEqual([])
    expect(codeOf(e)).toBe('23505')
    expect(leaks(e)).toEqual([])
  })

  it('nested savepoint: a query error propagating out of both', async () => {
    const e = await rejection(db.transaction(async (tx) => {
      await tx.transaction(async (tx2) => {
        await tx2.insert(profiles).values({ id: randomUUID(), displayName: MARKER })
      })
    }))
    expect(codeOf(e)).toBe('23505')
    expect(leaks(e)).toEqual([])
  })

  it('nested savepoint: caught inside it — savepoint() re-throws the raw error into the outer transaction', async () => {
    let fromSavepoint: unknown
    const result = await db.transaction(async (tx) => {
      try {
        await tx.transaction(async (tx2) => {
          try {
            await tx2.insert(profiles).values({ id: randomUUID(), displayName: MARKER })
          } catch {
            // carry on
          }
          return 'inner done'
        })
      } catch (err) {
        fromSavepoint = err
      }
      return 'outer done'
    })
    expect(result).toBe('outer done')
    expect(fromSavepoint).toBeInstanceOf(Error)
    expect(codeOf(fromSavepoint)).toBe('23505')
    expect(leaks(fromSavepoint)).toEqual([])
  })

  it('non-database errors thrown inside a transaction pass through untouched', async () => {
    fake.shouldFail = () => false
    const mine = new Error('balance_not_zero')
    await expect(db.transaction(async () => { throw mine })).rejects.toBe(mine)
  })
})

// Last on purpose: it calls the install itself, which would mask a missing
// install call in lib/db/client.ts for every test after it.
describe('idempotency', () => {
  it('installing again is a no-op', async () => {
    const { installDbErrorSanitizer } = await import('@/lib/db/sanitizingQuery')
    const before = Object.getPrototypeOf(PostgresJsPreparedQuery.prototype).queryWithCache
    expect((before as Record<symbol, unknown>)[DB_ERROR_SANITIZER_MARK]).toBe(true)
    installDbErrorSanitizer()
    expect(Object.getPrototypeOf(PostgresJsPreparedQuery.prototype).queryWithCache).toBe(before)
  })
})
