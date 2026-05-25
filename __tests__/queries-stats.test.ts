import { describe, it, expect, beforeEach } from 'vitest'
import { mockDb, queueDbResult, resetDbMocks } from '../tests/_mocks/db'
import {
  monthlyStatsByCategory,
  monthlyStatsByAsset,
  getGroupCreationMonthKey,
  dailyTrendByMonth,
  type ResolvedTxnFilter,
} from '@/lib/db/queries/transactions'
import {
  monthlyIncomeStatsByCategory,
  listIncomeMonthSummary,
  type ResolvedIncomeFilter,
} from '@/lib/db/queries/incomes'

beforeEach(() => resetDbMocks())

// A filter exercising every expense dimension (payer / split / category / asset
// / amount / status) — used to assert the daily trend applies the full filter,
// not just one dimension.
const fullExpenseFilter: ResolvedTxnFilter = {
  paidBy: 'user-a',
  splitTypes: ['half'],
  burden: null,
  categories: ['dining'],
  incomeCategories: [],
  assetIds: ['asset-1'],
  amountMin: 100,
  amountMax: 9000,
  status: 'settled',
  excludeSettlements: true,
  cutAll: false,
}
// Income-only filter → cuts every expense row (cutsExpense).
const cutExpenseFilter: ResolvedTxnFilter = {
  paidBy: null, splitTypes: [], burden: null, categories: [],
  incomeCategories: ['salary'], assetIds: [], amountMin: null, amountMax: null,
  status: null, excludeSettlements: false, cutAll: true,
}
const fullIncomeFilter: ResolvedIncomeFilter = {
  recipientId: 'user-a', assetIds: ['asset-2'], incomeCategories: ['salary'],
  amountMin: 50, amountMax: 8000, cutAll: false,
}
// Expense-only filter → cuts every income row (cutsIncome).
const cutIncomeFilter: ResolvedIncomeFilter = {
  recipientId: null, assetIds: [], incomeCategories: [],
  amountMin: null, amountMax: null, cutAll: true,
}

describe('monthlyStatsByCategory', () => {
  const epochWindow = {
    startedAt: new Date('2026-01-01T00:00:00Z'),
    endedAt: null,
    epochId: 'epoch-1',
    isPast: false,
  }

  it('returns rows mapped from raw SQL output', async () => {
    queueDbResult([
      { category: 'dining', total: 4500, count: 12 },
      { category: 'transit', total: 2200, count: 6 },
    ])
    const rows = await monthlyStatsByCategory('grp-1', '2026-05', null, undefined, epochWindow)
    expect(rows).toEqual([
      { key: 'dining', total: 4500, count: 12 },
      { key: 'transit', total: 2200, count: 6 },
    ])
    expect(mockDb.execute).toHaveBeenCalledTimes(1)
  })

  it('returns an empty array when no rows match', async () => {
    queueDbResult([])
    const rows = await monthlyStatsByCategory('grp-1', '2026-05', null, undefined, epochWindow)
    expect(rows).toEqual([])
  })

  it('returns [] without querying when the filter cuts all expense (income-only filter)', async () => {
    // cutAll mirrors the income donut (incomes.ts) — an income-only filter leaves
    // no expense rows, so the 支出 donut must go empty instead of showing the month.
    const rows = await monthlyStatsByCategory('grp-1', '2026-05', null, cutExpenseFilter, epochWindow)
    expect(rows).toEqual([])
    expect(mockDb.execute).not.toHaveBeenCalled()
  })
})

describe('monthlyStatsByAsset', () => {
  const epochWindow = {
    startedAt: new Date('2026-01-01T00:00:00Z'),
    endedAt: null,
    epochId: 'epoch-1',
    isPast: false,
  }

  it('preserves nulls for asset_id IS NULL group ("其他支出")', async () => {
    queueDbResult([
      { asset_id: 'a-1', asset_name: 'Tesla', total: 5000, count: 4 },
      { asset_id: null, asset_name: null, total: 1500, count: 8 },
    ])
    const rows = await monthlyStatsByAsset('grp-1', '2026-05', null, undefined, epochWindow)
    expect(rows).toEqual([
      { key: 'a-1', name: 'Tesla', total: 5000, count: 4 },
      { key: null, name: null, total: 1500, count: 8 },
    ])
  })

  it('keeps the asset name even when soft-deleted (LEFT JOIN, no deletedAt filter)', async () => {
    // The query is responsible for not filtering deletedAt; this test asserts the
    // mapping passes through whatever the SQL returned without dropping the row.
    queueDbResult([
      { asset_id: 'a-zombie', asset_name: '舊車（已刪）', total: 800, count: 1 },
    ])
    const rows = await monthlyStatsByAsset('grp-1', '2026-05', null, undefined, epochWindow)
    expect(rows[0].name).toBe('舊車（已刪）')
  })

  it('returns [] without querying when the filter cuts all expense (income-only filter)', async () => {
    const rows = await monthlyStatsByAsset('grp-1', '2026-05', null, cutExpenseFilter, epochWindow)
    expect(rows).toEqual([])
    expect(mockDb.execute).not.toHaveBeenCalled()
  })
})

describe('monthlyIncomeStatsByCategory', () => {
  const epochWindow = {
    startedAt: new Date('2026-01-01T00:00:00Z'),
    endedAt: null,
    epochId: 'epoch-1',
    isPast: false,
  }

  it('returns rows mapped from raw SQL output (sorted desc by total)', async () => {
    queueDbResult([
      { category: 'salary', total: 75000, count: 1 },
      { category: 'sidehustle', total: 12000, count: 3 },
    ])
    const rows = await monthlyIncomeStatsByCategory('grp-1', '2026-05', null, undefined, epochWindow)
    expect(rows).toEqual([
      { key: 'salary', total: 75000, count: 1 },
      { key: 'sidehustle', total: 12000, count: 3 },
    ])
    expect(mockDb.execute).toHaveBeenCalledTimes(1)
  })

  it('returns an empty array when no rows match', async () => {
    queueDbResult([])
    const rows = await monthlyIncomeStatsByCategory('grp-1', '2026-05', null, undefined, epochWindow)
    expect(rows).toEqual([])
  })
})

describe('listIncomeMonthSummary', () => {
  // Bug A regression test: this function used to ignore epoch window entirely,
  // making the dashboard hero card「本月進帳」cross-bleed across epochs.
  // Lock in that the SQL now scopes by created_at against the epoch boundary.
  const closedEpoch = {
    startedAt: new Date('2025-01-01T00:00:00Z'),
    endedAt: new Date('2025-12-31T23:59:59Z'),
    epochId: 'epoch-old',
    isPast: true,
  }
  const openEpoch = {
    startedAt: new Date('2026-01-01T00:00:00Z'),
    endedAt: null,
    epochId: 'epoch-current',
    isPast: false,
  }

  it('parses total + count from raw SQL row', async () => {
    queueDbResult([{ total: '12500', count: '3' }])
    const result = await listIncomeMonthSummary('grp-1', '2026-05', openEpoch)
    expect(result).toEqual({ total: 12500, count: 3 })
    expect(mockDb.execute).toHaveBeenCalledTimes(1)
  })

  it('returns zeros when group has no income in the month', async () => {
    queueDbResult([{ total: '0', count: '0' }])
    const result = await listIncomeMonthSummary('grp-1', '2026-05', openEpoch)
    expect(result).toEqual({ total: 0, count: 0 })
  })

  it('SQL includes both startedAt lower bound AND endedAt upper bound for closed past epoch', async () => {
    queueDbResult([{ total: '0', count: '0' }])
    await listIncomeMonthSummary('grp-1', '2026-05', closedEpoch)
    const sqlArg = (mockDb.execute as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0]
    const sqlString = JSON.stringify(sqlArg)
    // Lower bound (epoch start) — required, always present
    expect(sqlString).toContain('created_at >= ')
    // Upper bound (epoch end) — must appear for closed epoch
    expect(sqlString).toContain('created_at < ')
  })

  it('SQL omits upper bound when current (open) epoch — endedAt is null', async () => {
    queueDbResult([{ total: '0', count: '0' }])
    await listIncomeMonthSummary('grp-1', '2026-05', openEpoch)
    const sqlArg = (mockDb.execute as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0]
    const sqlString = JSON.stringify(sqlArg)
    expect(sqlString).toContain('created_at >= ')
    expect(sqlString).not.toContain('created_at < ')
  })
})

describe('dailyTrendByMonth', () => {
  const epochWindow = {
    startedAt: new Date('2026-01-01T00:00:00Z'),
    endedAt: null,
    epochId: 'epoch-1',
    isPast: false,
  }

  it('merges expense + income by day and zero-fills the full month', async () => {
    // First execute() = expense rows; second = income rows (Promise.all order).
    queueDbResult([
      { day: 1, total: 300 },
      { day: 15, total: 1200 },
    ])
    queueDbResult([
      { day: 15, total: 5000 },
      { day: 31, total: 800 },
    ])
    const rows = await dailyTrendByMonth('grp-1', '2026-05', epochWindow)

    // May has 31 days — every day present, ascending.
    expect(rows).toHaveLength(31)
    expect(rows.map((r) => r.day)).toEqual(Array.from({ length: 31 }, (_, i) => i + 1))
    expect(rows[0]).toEqual({ day: 1, totalExpense: 300, totalIncome: 0 })
    expect(rows[13]).toEqual({ day: 14, totalExpense: 0, totalIncome: 0 })
    expect(rows[14]).toEqual({ day: 15, totalExpense: 1200, totalIncome: 5000 })
    expect(rows[30]).toEqual({ day: 31, totalExpense: 0, totalIncome: 800 })
    expect(mockDb.execute).toHaveBeenCalledTimes(2)
  })

  it('returns all-zero rows with the correct length for a 28-day month', async () => {
    queueDbResult([])
    queueDbResult([])
    const rows = await dailyTrendByMonth('grp-1', '2026-02', epochWindow)
    expect(rows).toHaveLength(28)
    expect(rows.every((r) => r.totalExpense === 0 && r.totalIncome === 0)).toBe(true)
  })

  it('scopes expense by transacted_at (Taipei) and income by occurred_at, both epoch-bound', async () => {
    queueDbResult([])
    queueDbResult([])
    await dailyTrendByMonth('grp-1', '2026-05', epochWindow)
    const calls = (mockDb.execute as unknown as { mock: { calls: unknown[][] } }).mock.calls
    const expenseSql = JSON.stringify(calls[0][0])
    const incomeSql = JSON.stringify(calls[1][0])
    // Expense reads CashTransactions with a Taipei-local day, epoch-scoped on created_at.
    expect(expenseSql).toContain('CashTransactions')
    expect(expenseSql).toContain('Asia/Taipei')
    expect(expenseSql).toContain('created_at')
    // Income reads IncomeTransactions by its date column occurred_at, epoch-scoped too.
    expect(incomeSql).toContain('IncomeTransactions')
    expect(incomeSql).toContain('occurred_at')
    expect(incomeSql).toContain('created_at')
  })

  it('applies the FULL structured filter to both branches (not just the payer)', async () => {
    queueDbResult([])
    queueDbResult([])
    await dailyTrendByMonth('grp-1', '2026-05', epochWindow, fullExpenseFilter, fullIncomeFilter)
    const calls = (mockDb.execute as unknown as { mock: { calls: unknown[][] } }).mock.calls
    const expenseSql = JSON.stringify(calls[0][0])
    const incomeSql = JSON.stringify(calls[1][0])
    // Expense honours every dimension the donut does: payer / split / category /
    // asset / status (amount is in the SELECT regardless, so it's not asserted).
    expect(expenseSql).toContain('paid_by')
    expect(expenseSql).toContain('split_type')
    expect(expenseSql).toContain('category')
    expect(expenseSql).toContain('asset_id')
    expect(expenseSql).toContain('status')
    // Income honours recipient / income category / asset.
    expect(incomeSql).toContain('recipient_id')
    expect(incomeSql).toContain('category')
    expect(incomeSql).toContain('asset_id')
  })

  it('empties the expense branch WITHOUT querying when filter.cutAll (income-only filter)', async () => {
    // Only the income query should hit the DB; expense is skipped (→ all zeros).
    queueDbResult([{ day: 10, total: 5000 }])
    const rows = await dailyTrendByMonth('grp-1', '2026-05', epochWindow, cutExpenseFilter, fullIncomeFilter)
    expect(mockDb.execute).toHaveBeenCalledTimes(1)
    expect(rows.every((r) => r.totalExpense === 0)).toBe(true)
    expect(rows.find((r) => r.day === 10)?.totalIncome).toBe(5000)
  })

  it('empties the income branch WITHOUT querying when incomeFilter.cutAll (expense-only filter)', async () => {
    queueDbResult([{ day: 3, total: 1200 }])
    const rows = await dailyTrendByMonth('grp-1', '2026-05', epochWindow, fullExpenseFilter, cutIncomeFilter)
    expect(mockDb.execute).toHaveBeenCalledTimes(1)
    expect(rows.every((r) => r.totalIncome === 0)).toBe(true)
    expect(rows.find((r) => r.day === 3)?.totalExpense).toBe(1200)
  })
})

describe('getGroupCreationMonthKey', () => {
  it('returns the YYYY-MM string from the row', async () => {
    queueDbResult([{ month: '2024-09' }])
    const key = await getGroupCreationMonthKey('grp-1')
    expect(key).toBe('2024-09')
  })

  it('returns null when no row found', async () => {
    queueDbResult([])
    const key = await getGroupCreationMonthKey('grp-missing')
    expect(key).toBeNull()
  })
})
