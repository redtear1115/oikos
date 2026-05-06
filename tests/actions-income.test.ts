import { describe, it, expect, beforeEach } from 'vitest'
import { setMockUser } from './_mocks/supabase'
import { mockDb, mockBuilder, queueDbResult, resetDbMocks } from './_mocks/db'
import { createIncome, editIncome, softDeleteIncome } from '@/actions/income'

const VIEWER = { id: 'user-a', email: 'a@example.com' }
const GROUP = { id: 'grp-1', memberA: 'user-a', memberB: 'user-b', name: '我們家' }

beforeEach(() => {
  resetDbMocks()
  setMockUser(VIEWER)
})

describe('createIncome', () => {
  it('inserts a row with validated fields and returns the new id', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'inc-1' }])

    const out = await createIncome({
      amount: 30000,
      category: 'salary',
      recipientId: 'user-a',
      occurredAt: '2026-05-01',
      source: '五月薪水',
      assetId: null,
    })

    expect(out).toEqual({ id: 'inc-1' })
    expect(mockDb.insert).toHaveBeenCalled()
    const values = mockBuilder.values.mock.calls[0][0] as Record<string, unknown>
    expect(values.groupId).toBe(GROUP.id)
    expect(values.amount).toBe(30000)
    expect(values.category).toBe('salary')
    expect(values.recipientId).toBe('user-a')
  })

  it('rejects when recipientId is not in the viewer group', async () => {
    queueDbResult([GROUP])
    await expect(createIncome({
      amount: 1, category: 'other', recipientId: 'stranger',
      occurredAt: '2026-05-01',
    })).rejects.toThrow(/家計簿/)
  })

  it('rejects when assetId belongs to a different group', async () => {
    queueDbResult([GROUP])
    queueDbResult([])  // assets lookup returns empty

    await expect(createIncome({
      amount: 1, category: 'maturity', recipientId: 'user-a',
      occurredAt: '2026-05-01', assetId: 'asset-x',
    })).rejects.toThrow(/關聯/)
  })
})

describe('editIncome', () => {
  it('soft-deletes the old row + inserts a new one in a single transaction', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'old-1' }])  // old row lookup
    queueDbResult([])                  // soft-delete update (no return value needed)
    queueDbResult([{ id: 'new-1' }])  // new row insert

    await editIncome({
      oldId: 'old-1',
      amount: 35000,
      category: 'salary',
      recipientId: 'user-a',
      occurredAt: '2026-05-01',
    })

    expect(mockDb.transaction).toHaveBeenCalledOnce()
    expect(mockDb.update).toHaveBeenCalled()  // soft delete
    expect(mockDb.insert).toHaveBeenCalled()  // new row
  })
})

describe('softDeleteIncome', () => {
  it('sets deleted_at on the row', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'inc-1' }])

    await softDeleteIncome('inc-1')

    expect(mockDb.update).toHaveBeenCalled()
    const setCall = mockBuilder.set.mock.calls[0][0] as Record<string, unknown>
    expect(setCall.deletedAt).toBeInstanceOf(Date)
  })
})
