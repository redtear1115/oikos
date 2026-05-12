import { describe, it, expect, beforeEach } from 'vitest'
import { mockDb, queueDbResult, resetDbMocks } from '../tests/_mocks/db'
import {
  monthlyStatsByCategory,
  monthlyStatsByAsset,
  getGroupCreationMonthKey,
} from '@/lib/db/queries/transactions'
import { monthlyIncomeStatsByCategory, listIncomeMonthSummary } from '@/lib/db/queries/incomes'

beforeEach(() => resetDbMocks())

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
