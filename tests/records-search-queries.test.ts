import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import './_mocks/supabase'
import { mockDb, mockBuilder, resetDbMocks } from './_mocks/db'

import {
  listFeedAllPaged,
  listFeedAllMonthSummaries,
  listTransactionsPaged,
  listTransactionsMonthSummaries,
  monthlyStatsByCategory,
  monthlyStatsByAsset,
  dailyTrendByMonth,
  type ResolvedTxnFilter,
} from '@/lib/db/queries/transactions'
import {
  listIncomesPaged,
  listIncomesMonthSummaries,
  monthlyIncomeStatsByCategory,
  type ResolvedIncomeFilter,
} from '@/lib/db/queries/incomes'
import type { EpochWindow } from '@/lib/db/queries/epoch'
import { toLikePattern } from '@/lib/filter'

const epoch: EpochWindow = {
  startedAt: new Date('2026-01-01T00:00:00Z'),
  endedAt: null,
  epochId: 'epoch-1',
  isPast: false,
}
const dialect = new PgDialect()

const SEARCH_TEXT = 'foo'
const PATTERN = toLikePattern(SEARCH_TEXT)

function txFilter(over: Partial<ResolvedTxnFilter> = {}): ResolvedTxnFilter {
  return {
    paidBy: null, splitTypes: [], burden: null, categories: [], incomeCategories: [],
    assetIds: [], amountMin: null, amountMax: null, status: null,
    excludeSettlements: false, cutAll: false, text: SEARCH_TEXT, ...over,
  }
}
function incFilter(over: Partial<ResolvedIncomeFilter> = {}): ResolvedIncomeFilter {
  return {
    recipientId: null, assetIds: [], incomeCategories: [], amountMin: null,
    amountMax: null, cutAll: false, text: SEARCH_TEXT, ...over,
  }
}

function rendered(chunk: SQL) {
  const q = dialect.sqlToQuery(chunk)
  return { sql: q.sql, params: q.params }
}
function executed(i = 0) {
  const calls = mockDb.execute.mock.calls as unknown as unknown[][]
  return rendered(calls[i]![0] as SQL)
}
function whereClause(i = 0) {
  const calls = mockBuilder.where!.mock.calls as unknown as unknown[][]
  return rendered(calls[i]![0] as SQL)
}
const ILIKE_ESC = /ILIKE \$\d+ ESCAPE '\\'/

function expectEpochAndDeleted(sqlText: string) {
  expect(sqlText).toMatch(/created_at"? >= /)
  expect(sqlText).toMatch(/deleted_at"? IS NULL/i)
}

beforeEach(() => {
  resetDbMocks()
  // The shared mock builder has no groupBy terminal (summaries end with it).
  ;(mockBuilder as Record<string, unknown>).groupBy = vi.fn(() => Promise.resolve([]))
})

describe('toLikePattern escaping', () => {
  it('escapes %, _ and backslash so they match literally', () => {
    expect(toLikePattern('50%_off\\')).toBe('%50\\%\\_off\\\\%')
  })
})

describe('text predicate in feed queries', () => {
  it('all feed: tx, income and settlement branches use bound ILIKE; epoch + deleted stay', async () => {
    await listFeedAllPaged({
      groupId: 'g1', cursor: null, limit: 20, filter: txFilter(),
      monthKey: '2026-05', epochWindow: epoch,
    })
    const { sql, params } = executed()
    expect(sql).toMatch(/description ILIKE \$\d+ ESCAPE '\\' OR notes ILIKE \$\d+ ESCAPE '\\'/)
    expect(sql).toMatch(/source ILIKE \$\d+ ESCAPE '\\'/)
    // Settlement: the raw note only, never the COALESCE display text.
    expect(sql).toMatch(/note ILIKE \$\d+ ESCAPE '\\'/)
    expect(sql).not.toMatch(/COALESCE\(note[^)]*\) ILIKE/i)
    expect(params.filter((p) => p === PATTERN).length).toBe(4)
    expect(sql).not.toContain(SEARCH_TEXT) // never interpolated
    expectEpochAndDeleted(sql)
  })

  it('all feed month summaries share the same predicate', async () => {
    await listFeedAllMonthSummaries({
      groupId: 'g1', filter: txFilter(), monthKey: '2026-05', epochWindow: epoch,
    })
    const { sql, params } = executed()
    expect(sql).toMatch(/description ILIKE/)
    expect(sql).toMatch(/source ILIKE/)
    expect(params).toContain(PATTERN)
    expectEpochAndDeleted(sql)
  })

  it('expense feed + summaries: description/notes and settlement note', async () => {
    await listTransactionsPaged({
      groupId: 'g1', cursor: null, limit: 20, filter: txFilter(), monthKey: '2026-05', epochWindow: epoch,
    })
    await listTransactionsMonthSummaries({
      groupId: 'g1', filter: txFilter(), monthKey: '2026-05', epochWindow: epoch,
    })
    for (const i of [0, 1]) {
      const { sql, params } = executed(i)
      expect(sql).toMatch(/description ILIKE \$\d+ ESCAPE '\\' OR notes ILIKE/)
      expect(sql).toMatch(/note ILIKE \$\d+ ESCAPE '\\'/)
      expect(params).toContain(PATTERN)
      expectEpochAndDeleted(sql)
    }
  })

  it('no text: no ILIKE anywhere', async () => {
    await listFeedAllPaged({
      groupId: 'g1', cursor: null, limit: 20, filter: txFilter({ text: undefined }),
      monthKey: '2026-05', epochWindow: epoch,
    })
    expect(executed().sql).not.toMatch(/ILIKE/)
  })

  it('income pager + summaries: source ILIKE with bound param, epoch + deleted_at stay', async () => {
    await listIncomesPaged('g1', null, 20, '2026-05', undefined, incFilter(), undefined, epoch)
    await listIncomesMonthSummaries('g1', '2026-05', undefined, incFilter(), undefined, epoch)
    for (const i of [0, 1]) {
      const { sql, params } = whereClause(i)
      expect(sql).toMatch(ILIKE_ESC)
      expect(sql).toContain('"source" ILIKE')
      expect(params).toContain(PATTERN)
      expectEpochAndDeleted(sql)
    }
  })
})

describe('text predicate in stats-card queries', () => {
  it('monthlyStatsByCategory', async () => {
    await monthlyStatsByCategory('g1', '2026-05', null, txFilter(), epoch)
    const { sql, params } = executed()
    expect(sql).toMatch(/description ILIKE \$\d+ ESCAPE '\\' OR notes ILIKE/)
    expect(params).toContain(PATTERN)
    expectEpochAndDeleted(sql)
  })

  it('monthlyStatsByAsset uses the ct alias', async () => {
    await monthlyStatsByAsset('g1', '2026-05', null, txFilter(), epoch, 'viewer')
    const { sql, params } = executed()
    expect(sql).toMatch(/ct\.description ILIKE \$\d+ ESCAPE '\\' OR ct\.notes ILIKE/)
    expect(params).toContain(PATTERN)
    expectEpochAndDeleted(sql)
  })

  it('dailyTrendByMonth: both the expense and the income half', async () => {
    await dailyTrendByMonth('g1', '2026-05', epoch, txFilter(), incFilter())
    expect(mockDb.execute).toHaveBeenCalledTimes(2)
    const a = executed(0)
    const b = executed(1)
    const expense = a.sql.includes('CashTransactions') ? a : b
    const income = a.sql.includes('IncomeTransactions') ? a : b
    expect(expense.sql).toMatch(/description ILIKE \$\d+ ESCAPE '\\' OR notes ILIKE/)
    expect(income.sql).toMatch(/source ILIKE \$\d+ ESCAPE '\\'/)
    for (const q of [expense, income]) {
      expect(q.params).toContain(PATTERN)
      expectEpochAndDeleted(q.sql)
    }
  })

  it('monthlyIncomeStatsByCategory', async () => {
    await monthlyIncomeStatsByCategory('g1', '2026-05', null, incFilter(), epoch)
    const { sql, params } = executed()
    expect(sql).toMatch(/source ILIKE \$\d+ ESCAPE '\\'/)
    expect(params).toContain(PATTERN)
    expectEpochAndDeleted(sql)
  })

  it('literal-escaped text is what gets bound', async () => {
    const text = '50%_off\\'
    await monthlyIncomeStatsByCategory('g1', '2026-05', null, incFilter({ text }), epoch)
    expect(executed().params).toContain('%50\\%\\_off\\\\%')
  })
})
