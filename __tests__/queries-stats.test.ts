import { describe, it, expect, beforeEach } from 'vitest'
import { mockDb, queueDbResult, resetDbMocks } from '../tests/_mocks/db'
import {
  monthlyStatsByCategory,
  monthlyStatsByAsset,
  getGroupCreationMonthKey,
} from '@/lib/db/queries/transactions'
import { monthlyIncomeStatsByCategory } from '@/lib/db/queries/incomes'

beforeEach(() => resetDbMocks())

describe('monthlyStatsByCategory', () => {
  it('returns rows mapped from raw SQL output', async () => {
    queueDbResult([
      { category: 'dining', total: 4500, count: 12 },
      { category: 'transit', total: 2200, count: 6 },
    ])
    const rows = await monthlyStatsByCategory('grp-1', '2026-05')
    expect(rows).toEqual([
      { key: 'dining', total: 4500, count: 12 },
      { key: 'transit', total: 2200, count: 6 },
    ])
    expect(mockDb.execute).toHaveBeenCalledTimes(1)
  })

  it('returns an empty array when no rows match', async () => {
    queueDbResult([])
    const rows = await monthlyStatsByCategory('grp-1', '2026-05')
    expect(rows).toEqual([])
  })
})

describe('monthlyStatsByAsset', () => {
  it('preserves nulls for asset_id IS NULL group ("其他支出")', async () => {
    queueDbResult([
      { asset_id: 'a-1', asset_name: 'Tesla', total: 5000, count: 4 },
      { asset_id: null, asset_name: null, total: 1500, count: 8 },
    ])
    const rows = await monthlyStatsByAsset('grp-1', '2026-05')
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
    const rows = await monthlyStatsByAsset('grp-1', '2026-05')
    expect(rows[0].name).toBe('舊車（已刪）')
  })
})

describe('monthlyIncomeStatsByCategory', () => {
  it('returns rows mapped from raw SQL output (sorted desc by total)', async () => {
    queueDbResult([
      { category: 'salary', total: 75000, count: 1 },
      { category: 'sidehustle', total: 12000, count: 3 },
    ])
    const rows = await monthlyIncomeStatsByCategory('grp-1', '2026-05')
    expect(rows).toEqual([
      { key: 'salary', total: 75000, count: 1 },
      { key: 'sidehustle', total: 12000, count: 3 },
    ])
    expect(mockDb.execute).toHaveBeenCalledTimes(1)
  })

  it('returns an empty array when no rows match', async () => {
    queueDbResult([])
    const rows = await monthlyIncomeStatsByCategory('grp-1', '2026-05')
    expect(rows).toEqual([])
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
