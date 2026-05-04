import { describe, it, expect, beforeEach } from 'vitest'
import { mockDb, queueDbResult, resetDbMocks } from '../tests/_mocks/db'
import {
  listAssetsForGroup,
  getAssetById,
  getAssetSummary,
  listTransactionsPagedForAsset,
} from '@/lib/db/queries/asset'

beforeEach(() => resetDbMocks())

describe('listAssetsForGroup', () => {
  it('returns rows with car details joined', async () => {
    queueDbResult([
      {
        id: 'asset-1',
        groupId: 'grp-1',
        type: 'car',
        name: '我的 Tesla',
        deletedAt: null,
        createdAt: new Date('2026-05-01'),
        plate: 'ABC-1234',
        purchasedAt: '2024-06-01',
        purchasePrice: 800000,
      },
    ])
    const rows = await listAssetsForGroup('grp-1')
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('我的 Tesla')
    expect(rows[0].plate).toBe('ABC-1234')
    expect(mockDb.select).toHaveBeenCalled()
  })
})

describe('getAssetById', () => {
  it('returns asset including soft-deleted (for zombie display)', async () => {
    queueDbResult([
      {
        id: 'asset-1',
        groupId: 'grp-1',
        type: 'car',
        name: '舊車',
        deletedAt: new Date('2026-04-01'),
        createdAt: new Date('2026-01-01'),
        plate: 'XYZ-9',
        purchasedAt: null,
        purchasePrice: null,
      },
    ])
    const row = await getAssetById('asset-1', 'grp-1')
    expect(row?.deletedAt).not.toBeNull()
  })

  it('returns null when not found', async () => {
    queueDbResult([])
    const row = await getAssetById('missing', 'grp-1')
    expect(row).toBeNull()
  })
})

describe('getAssetSummary', () => {
  it('returns monthAmount + totalAmount via raw SQL execute', async () => {
    queueDbResult([{ month_amount: 3500, total_amount: 42000 }])
    const s = await getAssetSummary('asset-1', 'grp-1')
    expect(s).toEqual({ monthAmount: 3500, totalAmount: 42000 })
  })

  it('coerces nulls to 0 (asset with no transactions)', async () => {
    queueDbResult([{ month_amount: null, total_amount: null }])
    const s = await getAssetSummary('asset-1', 'grp-1')
    expect(s).toEqual({ monthAmount: 0, totalAmount: 0 })
  })
})

describe('listTransactionsPagedForAsset', () => {
  it('returns FeedRow shape, normalises strings to Date', async () => {
    queueDbResult([
      {
        id: 'tx-1',
        amount: 1000,
        split_type: 'half',
        description: '加油',
        category: 'transit',
        paid_by: 'user-a',
        transacted_at: '2026-05-01T04:00:00Z',
        created_at: '2026-05-01T04:00:00Z',
        kind: 'transaction',
      },
    ])
    const rows = await listTransactionsPagedForAsset('asset-1', 'grp-1', null, 20)
    expect(rows).toHaveLength(1)
    expect(rows[0].kind).toBe('transaction')
    expect(rows[0].transactedAt).toBeInstanceOf(Date)
  })
})
