import { describe, it, expect } from 'vitest'
import { sql, type SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import {
  epochClause,
  dateRangeClause,
  dateColumnClause,
  assetIdsClause,
  eqValueClause,
  amountClause,
  statusClause,
  splitTypeClause,
  categoryInClause,
  cursorClause,
  andClause,
} from '@/lib/db/queries/_predicates'
import { ASSET_FILTER_NONE, type DateRange } from '@/lib/filter'
import type { EpochWindow } from '@/lib/db/queries/epoch'

const dialect = new PgDialect()

function ser(s: SQL | undefined): { sql: string; params: unknown[] } {
  if (s === undefined) return { sql: '', params: [] }
  const q = dialect.sqlToQuery(s)
  return { sql: q.sql, params: q.params }
}

function makeWindow(startedAt: string, endedAt: string | null): EpochWindow {
  return {
    epochId: 'ep-x',
    startedAt: new Date(startedAt),
    endedAt: endedAt ? new Date(endedAt) : null,
    isPast: endedAt !== null,
  }
}

describe('epochClause', () => {
  it('returns undefined when window is null or undefined', () => {
    expect(epochClause('created_at', null)).toBeUndefined()
    expect(epochClause('created_at', undefined)).toBeUndefined()
  })

  it('builds lower-bound-only clause for an open epoch (endedAt = null)', () => {
    const w = makeWindow('2026-05-01T00:00:00Z', null)
    const { sql: s, params } = ser(epochClause('created_at', w))
    expect(s).toMatch(/created_at\s*>=/)
    // No upper bound — no `<` comparison should appear.
    expect(s).not.toMatch(/created_at\s*</)
    expect(params).toEqual(['2026-05-01T00:00:00.000Z'])
  })

  it('builds [lower, upper) bounds for a closed epoch', () => {
    const w = makeWindow('2026-05-01T00:00:00Z', '2026-06-01T00:00:00Z')
    const { sql: s, params } = ser(epochClause('created_at', w))
    expect(s).toMatch(/created_at\s*>=/)
    expect(s).toMatch(/created_at\s*</)
    expect(params).toEqual([
      '2026-05-01T00:00:00.000Z',
      '2026-06-01T00:00:00.000Z',
    ])
  })

  it('supports table-aliased column refs (e.g. ct.created_at)', () => {
    const w = makeWindow('2026-05-01T00:00:00Z', null)
    const { sql: s } = ser(epochClause('ct.created_at', w))
    expect(s).toMatch(/ct\.created_at\s*>=/)
  })
})

describe('dateRangeClause (timestamptz column with Asia/Taipei conversion)', () => {
  it('returns undefined when neither monthKey nor dateRange is given', () => {
    expect(dateRangeClause('transacted_at', undefined, undefined)).toBeUndefined()
    expect(dateRangeClause('transacted_at', undefined, null)).toBeUndefined()
  })

  it('returns undefined for dateRange.kind = "all"', () => {
    expect(dateRangeClause('transacted_at', undefined, { kind: 'all' })).toBeUndefined()
  })

  it('builds Asia/Taipei tz-converted month bounds from a monthKey', () => {
    const { sql: s, params } = ser(dateRangeClause('transacted_at', '2026-05', undefined))
    expect(s).toMatch(/Asia\/Taipei/)
    expect(s).toMatch(/transacted_at/)
    // monthRangeIso returns naive timestamps for [start-of-month, start-of-next-month).
    expect(params).toEqual([
      '2026-05-01 00:00:00',
      '2026-06-01 00:00:00',
    ])
  })

  it('builds next-day-exclusive bounds for dateRange.kind = "range"', () => {
    const range: DateRange = { kind: 'range', start: '2026-05-01', end: '2026-05-03' }
    const { sql: s, params } = ser(dateRangeClause('transacted_at', undefined, range))
    expect(s).toMatch(/Asia\/Taipei/)
    // end '2026-05-03' inclusive → exclusive bound becomes '2026-05-04'.
    expect(params).toEqual(['2026-05-01', '2026-05-04'])
  })

  it('dateRange overrides monthKey when both are passed', () => {
    const range: DateRange = { kind: 'range', start: '2026-05-10', end: '2026-05-12' }
    const { params } = ser(dateRangeClause('transacted_at', '2026-01', range))
    expect(params).toEqual(['2026-05-10', '2026-05-13'])
  })

  it('handles a cross-month range (May 30 → June 2 inclusive)', () => {
    const range: DateRange = { kind: 'range', start: '2026-05-30', end: '2026-06-02' }
    const { params } = ser(dateRangeClause('transacted_at', undefined, range))
    expect(params).toEqual(['2026-05-30', '2026-06-03'])
  })

  it('dateRange.kind = "month" resolves through the monthKey path', () => {
    const range: DateRange = { kind: 'month', monthKey: '2026-07' }
    const { params } = ser(dateRangeClause('transacted_at', undefined, range))
    expect(params).toEqual([
      '2026-07-01 00:00:00',
      '2026-08-01 00:00:00',
    ])
  })
})

describe('dateColumnClause (date column, no tz conversion)', () => {
  it('builds [start, next-month) bounds from a monthKey without tz conversion', () => {
    const { sql: s, params } = ser(dateColumnClause('2026-05', undefined))
    expect(s).not.toMatch(/Asia\/Taipei/)
    expect(s).toMatch(/occurred_at\s*>=/)
    expect(s).toMatch(/occurred_at\s*</)
    expect(params).toEqual(['2026-05-01', '2026-06-01'])
  })

  it('handles cross-year monthKey (Dec → next Jan)', () => {
    const { params } = ser(dateColumnClause('2026-12', undefined))
    expect(params).toEqual(['2026-12-01', '2027-01-01'])
  })

  it('returns undefined for kind = "all"', () => {
    expect(dateColumnClause(undefined, { kind: 'all' })).toBeUndefined()
  })

  it('range mode: end inclusive becomes next-day exclusive', () => {
    const range: DateRange = { kind: 'range', start: '2026-05-01', end: '2026-05-03' }
    const { params } = ser(dateColumnClause(undefined, range))
    expect(params).toEqual(['2026-05-01', '2026-05-04'])
  })
})

describe('assetIdsClause', () => {
  it('returns undefined for an empty list (no filter)', () => {
    expect(assetIdsClause('asset_id', [])).toBeUndefined()
  })

  it('builds `IN (...)` for a uuid-only list, with no IS NULL branch', () => {
    const { sql: s, params } = ser(assetIdsClause('asset_id', ['aaa', 'bbb']))
    expect(s).toMatch(/asset_id\s+in\s*\(/i)
    expect(s).not.toMatch(/IS NULL/i)
    expect(params).toEqual(['aaa', 'bbb'])
  })

  it('builds `IS NULL` only when the list contains just the sentinel', () => {
    const { sql: s, params } = ser(assetIdsClause('asset_id', [ASSET_FILTER_NONE]))
    expect(s).toMatch(/asset_id\s+is\s+null/i)
    expect(s).not.toMatch(/\bin\s*\(/i)
    expect(params).toEqual([])
  })

  it('builds `IS NULL OR IN (...)` when sentinel + uuids are mixed', () => {
    const { sql: s, params } = ser(assetIdsClause('asset_id', [ASSET_FILTER_NONE, 'aaa', 'bbb']))
    expect(s).toMatch(/is\s+null\s+or/i)
    expect(s).toMatch(/in\s*\(/i)
    // The sentinel itself is not a parameter — only the uuids are bound.
    expect(params).toEqual(['aaa', 'bbb'])
  })

  it('supports table-aliased column refs', () => {
    const { sql: s } = ser(assetIdsClause('ct.asset_id', ['aaa']))
    expect(s).toMatch(/ct\.asset_id\s+in\s*\(/i)
  })
})

describe('eqValueClause', () => {
  it('returns undefined for falsy values (null / undefined / empty)', () => {
    expect(eqValueClause('paid_by', null)).toBeUndefined()
    expect(eqValueClause('paid_by', undefined)).toBeUndefined()
    expect(eqValueClause('paid_by', '')).toBeUndefined()
  })

  it('builds an equality predicate with the value as a parameter', () => {
    const { sql: s, params } = ser(eqValueClause('paid_by', 'user-a'))
    expect(s).toMatch(/paid_by\s*=/)
    expect(params).toEqual(['user-a'])
  })
})

describe('amountClause', () => {
  it('returns undefined when both bounds are null/undefined', () => {
    expect(amountClause(null, null)).toBeUndefined()
    expect(amountClause(undefined, undefined)).toBeUndefined()
  })

  it('emits `>=` when only the lower bound is set', () => {
    const { sql: s, params } = ser(amountClause(100, null))
    expect(s).toMatch(/amount\s*>=/)
    expect(s).not.toMatch(/<=|BETWEEN/i)
    expect(params).toEqual([100])
  })

  it('emits `<=` when only the upper bound is set', () => {
    const { sql: s, params } = ser(amountClause(null, 500))
    expect(s).toMatch(/amount\s*<=/)
    expect(params).toEqual([500])
  })

  it('emits `BETWEEN` when both bounds are set', () => {
    const { sql: s, params } = ser(amountClause(100, 500))
    expect(s).toMatch(/BETWEEN/i)
    expect(params).toEqual([100, 500])
  })

  it('supports a custom column ref', () => {
    const { sql: s } = ser(amountClause(100, null, 'ct.amount'))
    expect(s).toMatch(/ct\.amount\s*>=/)
  })
})

describe('statusClause', () => {
  it('returns undefined when status is null/undefined', () => {
    expect(statusClause(null)).toBeUndefined()
    expect(statusClause(undefined)).toBeUndefined()
  })

  it('builds an equality predicate with a record_status cast', () => {
    const { sql: s, params } = ser(statusClause('pending'))
    expect(s).toMatch(/status\s*=/)
    expect(s).toMatch(/record_status/)
    expect(params).toEqual(['pending'])
  })
})

describe('splitTypeClause', () => {
  it('returns undefined on an empty list', () => {
    expect(splitTypeClause([])).toBeUndefined()
  })

  it('builds `IN (...)` with split_type casts per value', () => {
    const { sql: s, params } = ser(splitTypeClause(['half', 'all_mine']))
    expect(s).toMatch(/split_type\s+in\s*\(/i)
    expect(s).toMatch(/split_type/i)
    expect(params).toEqual(['half', 'all_mine'])
  })
})

describe('categoryInClause', () => {
  it('returns undefined on an empty list', () => {
    expect(categoryInClause([])).toBeUndefined()
  })

  it('builds `IN (...)` for non-empty categories', () => {
    const { sql: s, params } = ser(categoryInClause(['dining', 'transit']))
    expect(s).toMatch(/category\s+in\s*\(/i)
    expect(params).toEqual(['dining', 'transit'])
  })

  it('supports a custom column ref (e.g. ct.category)', () => {
    const { sql: s } = ser(categoryInClause(['dining'], 'ct.category'))
    expect(s).toMatch(/ct\.category\s+in\s*\(/i)
  })
})

describe('cursorClause', () => {
  it('returns undefined when cursor is null (first page)', () => {
    expect(cursorClause('transacted_at', 'created_at', null)).toBeUndefined()
  })

  it('builds composite tuple comparison `(col_a, col_b) < (val_a, val_b)`', () => {
    const c = { transactedAt: '2026-05-03T00:00:00Z', createdAt: '2026-05-03T01:00:00Z' }
    const { sql: s, params } = ser(cursorClause('transacted_at', 'created_at', c))
    expect(s).toMatch(/\(transacted_at,\s*created_at\)\s*</)
    expect(params).toEqual([
      '2026-05-03T00:00:00Z',
      '2026-05-03T01:00:00Z',
    ])
  })

  it('supports aliased column refs (e.g. settled_at)', () => {
    const c = { transactedAt: '2026-05-03T00:00:00Z', createdAt: '2026-05-03T01:00:00Z' }
    const { sql: s } = ser(cursorClause('settled_at', 'created_at', c))
    expect(s).toMatch(/\(settled_at,\s*created_at\)\s*</)
  })
})

describe('andClause helper', () => {
  it('returns an empty SQL fragment when the inner clause is undefined', () => {
    const { sql: s, params } = ser(andClause(undefined))
    expect(s).toBe('')
    expect(params).toEqual([])
  })

  it('prefixes `AND` when the inner clause is defined', () => {
    const { sql: s } = ser(andClause(eqValueClause('paid_by', 'user-a')))
    expect(s).toMatch(/^AND\s/)
  })

  it('round-trips inside a raw SQL template', () => {
    const clause = epochClause('created_at', makeWindow('2026-05-01T00:00:00Z', null))
    const expr = sql`WHERE deleted_at IS NULL ${andClause(clause)}`
    const { sql: s, params } = ser(expr)
    expect(s).toMatch(/WHERE deleted_at IS NULL AND created_at\s*>=/)
    expect(params).toEqual(['2026-05-01T00:00:00.000Z'])
  })
})
