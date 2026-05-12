import { describe, it, expect, beforeEach } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import './_mocks/supabase'
import { mockDb, queueDbResult, resetDbMocks } from './_mocks/db'

import {
  listTransactionsPaged,
  listFeedAllPaged,
  type ResolvedTxnFilter,
} from '@/lib/db/queries/transactions'
import type { EpochWindow } from '@/lib/db/queries/epoch'
import { ASSET_FILTER_NONE } from '@/lib/filter'

const defaultEpoch: EpochWindow = {
  startedAt: new Date('2026-01-01T00:00:00Z'),
  endedAt: null,
  epochId: 'epoch-1',
  isPast: false,
}

// The integration-level tests below exercise listTransactionsPaged /
// listFeedAllPaged with the mockDb in `_mocks/db`. We assert two things:
//
//   1) Row mapping: queued execute-results coerce correctly into FeedRows
//      (string timestamps → Date, status defaulting, etc.) — the contract
//      RecordsList and TransactionFeed both rely on.
//
//   2) SQL contents: the SQL chunk passed to db.execute carries the right
//      predicates — `WHERE deleted_at IS NULL`, the dateRange end-day-exclusive
//      bound, the IS NULL/OR/IN structure for the asset filter, etc. The mock
//      doesn't run SQL, so this is the only way to keep refactors from
//      silently breaking the predicate shape.

const dialect = new PgDialect()

/**
 * Fetch the SQL string + params for a specific db.execute() call. Drizzle
 * wraps the template into an SQL chunk; PgDialect serializes it to the same
 * `{sql, params}` shape that the postgres driver sees, so assertions match the
 * actual wire query.
 */
function executedSql(callIndex = 0): { sql: string; params: unknown[] } {
  const calls = mockDb.execute.mock.calls as unknown as unknown[][]
  const call = calls[callIndex]
  if (!call) throw new Error(`No db.execute call at index ${callIndex}`)
  const chunk = call[0] as SQL
  const q = dialect.sqlToQuery(chunk)
  return { sql: q.sql, params: q.params }
}

function baseFilter(overrides: Partial<ResolvedTxnFilter> = {}): ResolvedTxnFilter {
  return {
    paidBy: null,
    splitTypes: [],
    categories: [],
    incomeCategories: [],
    assetIds: [],
    amountMin: null,
    amountMax: null,
    status: null,
    excludeSettlements: false,
    cutAll: false,
    ...overrides,
  }
}

function sampleRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tx-1',
    amount: 100,
    split_type: 'half',
    split_ratio_a: null,
    description: '午餐',
    category: 'dining',
    paid_by: 'user-a',
    asset_id: null,
    fuel_log_id: null,
    notes: null,
    status: 'settled',
    transacted_at: '2026-05-01T00:00:00Z',
    created_at: '2026-05-01T00:30:00Z',
    kind: 'transaction' as const,
    ...overrides,
  }
}

beforeEach(() => {
  resetDbMocks()
})

describe('listTransactionsPaged', () => {
  it('drill.kind = "income" short-circuits to [] without touching the DB', async () => {
    const rows = await listTransactionsPaged({
      groupId: 'grp-1',
      cursor: null,
      drill: { kind: 'income', categoryId: 'salary' },
      epochWindow: defaultEpoch,
    })
    expect(rows).toEqual([])
    expect(mockDb.execute).not.toHaveBeenCalled()
  })

  it('filter.cutAll short-circuits to [] without touching the DB (income-only filter)', async () => {
    const rows = await listTransactionsPaged({
      groupId: 'grp-1',
      cursor: null,
      filter: baseFilter({ cutAll: true, incomeCategories: ['salary'] }),
      epochWindow: defaultEpoch,
    })
    expect(rows).toEqual([])
    expect(mockDb.execute).not.toHaveBeenCalled()
  })

  it('first page (cursor=null): WHERE excludes soft-deleted rows; coerces string timestamps to Date', async () => {
    queueDbResult([sampleRow()])
    const rows = await listTransactionsPaged({ groupId: 'grp-1', cursor: null, limit: 20, epochWindow: defaultEpoch })

    expect(rows).toHaveLength(1)
    expect(rows[0].transactedAt).toBeInstanceOf(Date)
    expect(rows[0].createdAt).toBeInstanceOf(Date)
    expect(rows[0].status).toBe('settled')

    const { sql } = executedSql()
    expect(sql).toMatch(/deleted_at IS NULL/)
    // No cursor on the first page — neither tuple comparison should appear.
    expect(sql).not.toMatch(/\(transacted_at, created_at\) </)
  })

  it('subsequent page (cursor set): SQL carries the tuple comparison + cursor params', async () => {
    queueDbResult([])
    await listTransactionsPaged({
      groupId: 'grp-1',
      cursor: { transactedAt: '2026-05-01T00:00:00Z', createdAt: '2026-05-01T00:30:00Z' },
      limit: 20,
      epochWindow: defaultEpoch,
    })
    const { sql, params } = executedSql()
    expect(sql).toMatch(/\(transacted_at, created_at\) </)
    expect(params).toContain('2026-05-01T00:00:00Z')
    expect(params).toContain('2026-05-01T00:30:00Z')
  })

  it('empty page (last page): returns [] without throwing', async () => {
    queueDbResult([])
    const rows = await listTransactionsPaged({
      groupId: 'grp-1',
      cursor: { transactedAt: '2026-04-01T00:00:00Z', createdAt: '2026-04-01T00:00:00Z' },
      epochWindow: defaultEpoch,
    })
    expect(rows).toEqual([])
  })

  it('dateRange with an inclusive end date becomes a next-day-exclusive bound in SQL', async () => {
    queueDbResult([])
    await listTransactionsPaged({
      groupId: 'grp-1',
      cursor: null,
      dateRange: { kind: 'range', start: '2026-05-01', end: '2026-05-03' },
      epochWindow: defaultEpoch,
    })
    const { sql, params } = executedSql()
    expect(sql).toMatch(/Asia\/Taipei/)
    // The serialized params should include the inclusive start AND the
    // computed next-day exclusive upper bound for `transacted_at`.
    expect(params).toContain('2026-05-01')
    expect(params).toContain('2026-05-04')
  })

  it('dateRange across a month boundary still resolves the next-day-exclusive bound correctly', async () => {
    queueDbResult([])
    await listTransactionsPaged({
      groupId: 'grp-1',
      cursor: null,
      dateRange: { kind: 'range', start: '2026-05-30', end: '2026-06-02' },
      epochWindow: defaultEpoch,
    })
    const { params } = executedSql()
    expect(params).toContain('2026-05-30')
    expect(params).toContain('2026-06-03')
  })

  it('asset filter with sentinel + uuids emits the `IS NULL OR IN (...)` predicate', async () => {
    queueDbResult([])
    await listTransactionsPaged({
      groupId: 'grp-1',
      cursor: null,
      filter: baseFilter({ assetIds: [ASSET_FILTER_NONE, 'aaaa', 'bbbb'] }),
      epochWindow: defaultEpoch,
    })
    const { sql } = executedSql()
    // The composite predicate is what users get when they chip-select「車 + 未歸屬」.
    expect(sql).toMatch(/asset_id IS NULL OR asset_id IN/i)
  })

  it('asset filter with sentinel-only emits just `IS NULL` (no IN list)', async () => {
    queueDbResult([])
    await listTransactionsPaged({
      groupId: 'grp-1',
      cursor: null,
      filter: baseFilter({ assetIds: [ASSET_FILTER_NONE] }),
      epochWindow: defaultEpoch,
    })
    const { sql } = executedSql()
    expect(sql).toMatch(/asset_id IS NULL/i)
    expect(sql).not.toMatch(/asset_id IN \(/i)
  })

  it('asset filter with uuids-only emits `IN (...)` and no IS NULL branch', async () => {
    queueDbResult([])
    await listTransactionsPaged({
      groupId: 'grp-1',
      cursor: null,
      filter: baseFilter({ assetIds: ['aaaa'] }),
      epochWindow: defaultEpoch,
    })
    const { sql } = executedSql()
    expect(sql).toMatch(/asset_id IN \(/i)
    expect(sql).not.toMatch(/asset_id IS NULL OR/i)
  })

  it('drill on category narrows the SQL to that category', async () => {
    queueDbResult([])
    await listTransactionsPaged({
      groupId: 'grp-1',
      cursor: null,
      drill: { kind: 'category', categoryId: 'dining' },
      epochWindow: defaultEpoch,
    })
    const { sql, params } = executedSql()
    expect(sql).toMatch(/category =/i)
    expect(params).toContain('dining')
  })

  it('drill on asset with null assetId narrows to `asset_id IS NULL`', async () => {
    queueDbResult([])
    await listTransactionsPaged({
      groupId: 'grp-1',
      cursor: null,
      drill: { kind: 'asset', assetId: null },
      epochWindow: defaultEpoch,
    })
    const { sql } = executedSql()
    expect(sql).toMatch(/asset_id IS NULL/i)
  })
})

describe('listFeedAllPaged', () => {
  it('returns rows for the union feed (transaction + settlement + income) with string timestamp coercion', async () => {
    queueDbResult([
      { ...sampleRow(), sort_at: '2026-05-02T00:00:00Z', sort_created: '2026-05-02T00:00:00Z' },
      {
        id: 'inc-1',
        amount: 1000,
        split_type: null,
        split_ratio_a: null,
        description: '薪水',
        category: 'salary',
        paid_by: 'user-a',
        asset_id: null,
        fuel_log_id: null,
        notes: null,
        status: 'settled',
        sort_at: '2026-05-01T00:00:00Z',
        sort_created: '2026-05-01T00:00:00Z',
        kind: 'income' as const,
      },
    ])
    const rows = await listFeedAllPaged({ groupId: 'grp-1', cursor: null, limit: 20, epochWindow: defaultEpoch })
    expect(rows).toHaveLength(2)
    expect(rows[0].kind).toBe('transaction')
    expect(rows[1].kind).toBe('income')
    // Sort-shape rows still produce Date instances downstream.
    expect(rows[0].transactedAt).toBeInstanceOf(Date)
    expect(rows[1].transactedAt).toBeInstanceOf(Date)
  })

  it('cross-kind cut: income-only filter (cutAll) drops the cash-tx branch', async () => {
    queueDbResult([])
    await listFeedAllPaged({
      groupId: 'grp-1',
      cursor: null,
      filter: baseFilter({ incomeCategories: ['salary'], cutAll: true }),
      epochWindow: defaultEpoch,
    })
    const { sql } = executedSql()
    // The CashTransactions branch is short-circuited with `AND FALSE` so it
    // contributes nothing to the UNION.
    expect(sql).toContain('FROM "CashTransactions"')
    expect(sql).toMatch(/AND FALSE/)
  })

  it('cross-kind cut: expense-only category drops the income branch', async () => {
    queueDbResult([])
    await listFeedAllPaged({
      groupId: 'grp-1',
      cursor: null,
      filter: baseFilter({ categories: ['dining'] }),
      epochWindow: defaultEpoch,
    })
    const { sql } = executedSql()
    expect(sql).toContain('FROM "IncomeTransactions"')
    expect(sql).toMatch(/AND FALSE/)
  })

  it('cursor advances against the `sort_at` / `sort_created` aliases', async () => {
    queueDbResult([])
    await listFeedAllPaged({
      groupId: 'grp-1',
      cursor: { transactedAt: '2026-05-01T00:00:00Z', createdAt: '2026-05-01T00:30:00Z' },
      epochWindow: defaultEpoch,
    })
    const { sql, params } = executedSql()
    expect(sql).toMatch(/\(sort_at, sort_created\) </)
    expect(params).toContain('2026-05-01T00:00:00Z')
    expect(params).toContain('2026-05-01T00:30:00Z')
  })

  it('SQL preserves the ORDER BY sort_at DESC, sort_created DESC ordering', async () => {
    queueDbResult([])
    await listFeedAllPaged({ groupId: 'grp-1', cursor: null, epochWindow: defaultEpoch })
    const { sql } = executedSql()
    expect(sql).toMatch(/ORDER BY sort_at DESC, sort_created DESC/)
  })

  it('excludeSettlements=true drops the Settlements branch entirely from the union', async () => {
    queueDbResult([])
    await listFeedAllPaged({
      groupId: 'grp-1',
      cursor: null,
      filter: baseFilter({ excludeSettlements: true, splitTypes: ['half'] }),
      epochWindow: defaultEpoch,
    })
    const { sql } = executedSql()
    expect(sql).not.toContain('FROM "Settlements"')
  })
})
