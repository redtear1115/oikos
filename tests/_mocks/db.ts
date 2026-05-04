import { vi } from 'vitest'

/**
 * Returns a chainable query mock. Each call to a query builder method (.select, .from,
 * .where, etc.) returns `this`. The terminal methods (.limit, .returning, .execute) resolve
 * to whatever you queue via `queueResult`.
 */
function createQueryMock() {
  const queue: unknown[][] = []
  const builder: Record<string, unknown> = {}

  const chainable = ['select', 'from', 'where', 'set', 'values', 'orderBy', 'innerJoin', 'leftJoin']
  for (const m of chainable) {
    builder[m] = vi.fn(() => builder)
  }

  // Terminals — return resolved promises
  builder.limit = vi.fn(() => Promise.resolve(queue.shift() ?? []))
  builder.returning = vi.fn(() => Promise.resolve(queue.shift() ?? []))
  builder.execute = vi.fn(() => Promise.resolve(queue.shift() ?? []))
  // For inserts/updates that don't chain returning, the chain itself is the promise
  // (Drizzle returns a thenable). Provide .then so `await db.update(...).set(...).where(...)` works.
  builder.then = vi.fn((onFulfilled: (v: unknown) => unknown) => {
    return Promise.resolve(queue.shift() ?? []).then(onFulfilled)
  })

  return { builder, queue, queueResult: (value: unknown[]) => queue.push(value) }
}

const queryMock = createQueryMock()

export const mockDb = {
  select: vi.fn(() => queryMock.builder),
  insert: vi.fn(() => queryMock.builder),
  update: vi.fn(() => queryMock.builder),
  delete: vi.fn(() => queryMock.builder),
  // db.execute(sql`...`) — also consumes from the shared queue so raw-SQL queries
  // can be tested with the same queueDbResult helper as chainable queries.
  execute: vi.fn(() => Promise.resolve(queryMock.queue.shift() ?? [])),
  // transaction: just call the callback with `this` (so nested ops use the same builder)
  transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(mockDb)),
}

vi.mock('@/lib/db/client', () => ({ db: mockDb }))

/**
 * Queue a result to be returned by the next terminal (.limit / .returning / await).
 * Call once per expected DB read inside the action under test, in order.
 */
export function queueDbResult(rows: unknown[]) {
  queryMock.queueResult(rows)
}

/** Reset all mock state between tests. */
export function resetDbMocks() {
  Object.values(mockDb).forEach((fn) => {
    if (typeof fn === 'function' && 'mockReset' in fn) (fn as { mockReset: () => void }).mockReset()
  })
  // Re-initialize behaviors
  mockDb.select.mockImplementation(() => queryMock.builder)
  mockDb.insert.mockImplementation(() => queryMock.builder)
  mockDb.update.mockImplementation(() => queryMock.builder)
  mockDb.delete.mockImplementation(() => queryMock.builder)
  mockDb.execute.mockImplementation(() => Promise.resolve(queryMock.queue.shift() ?? []))
  mockDb.transaction.mockImplementation(async (fn) => fn(mockDb))
}
