import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setMockUser } from './_mocks/supabase'
import { mockDb, mockBuilder, queueDbResult, resetDbMocks } from './_mocks/db'

// next/headers cookies() — controlled per test via setCookie below. Needed
// because resolveViewerEpochContext (called from getViewerWriteContext) reads
// PAST_EPOCH_COOKIE to decide whether the viewer is pinned to a past chapter.
const cookieStore = new Map<string, string>()
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: (key: string) => {
      const value = cookieStore.get(key)
      return value === undefined ? undefined : { value }
    },
    set: vi.fn(),
    delete: vi.fn(),
  })),
}))

function setCookie(key: string, value: string | null) {
  if (value === null) cookieStore.delete(key)
  else cookieStore.set(key, value)
}

import { createIncome, editIncome, softDeleteIncome } from '@/actions/income'
import { PAST_EPOCH_COOKIE } from '@/lib/db/queries/epoch'

const VIEWER = { id: 'user-a', email: 'a@example.com' }
const GROUP = { id: 'grp-1', memberA: 'user-a', memberB: 'user-b', name: '我們家' }
const OPEN_EPOCH = {
  id: 'epoch-current',
  groupId: 'grp-1',
  startedAt: new Date('2026-01-01T00:00:00Z'),
  endedAt: null,
  memberAId: 'user-a',
  memberBId: 'user-b',
}
const CLOSED_EPOCH = {
  id: 'epoch-old',
  groupId: 'grp-1',
  startedAt: new Date('2025-01-01T00:00:00Z'),
  endedAt: new Date('2025-12-31T23:59:59Z'),
  memberAId: 'user-a',
  memberBId: 'user-b',
}

beforeEach(() => {
  resetDbMocks()
  setMockUser(VIEWER)
  cookieStore.clear()
})

describe('createIncome', () => {
  it('inserts a row with validated fields and returns the new id', async () => {
    queueDbResult([GROUP])
    queueDbResult([OPEN_EPOCH])
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
    queueDbResult([OPEN_EPOCH])
    await expect(createIncome({
      amount: 1, category: 'other', recipientId: 'stranger',
      occurredAt: '2026-05-01',
    })).rejects.toThrow(/家計簿/)
  })

  it('rejects when assetId belongs to a different group', async () => {
    queueDbResult([GROUP])
    queueDbResult([OPEN_EPOCH])
    queueDbResult([])  // assets lookup returns empty

    await expect(createIncome({
      amount: 1, category: 'maturity', recipientId: 'user-a',
      occurredAt: '2026-05-01', assetId: 'asset-x',
    })).rejects.toThrow(/關聯/)
  })

  it('rejects when viewer is pinned to a past epoch', async () => {
    setCookie(PAST_EPOCH_COOKIE, 'epoch-old')
    queueDbResult([CLOSED_EPOCH])
    queueDbResult([GROUP])

    await expect(createIncome({
      amount: 30000,
      category: 'salary',
      recipientId: 'user-a',
      occurredAt: '2026-05-01',
    })).rejects.toThrow('過去章節不可編輯')
  })
})

describe('editIncome', () => {
  it('soft-deletes the old row + inserts a new one in a single transaction', async () => {
    queueDbResult([GROUP])
    queueDbResult([OPEN_EPOCH])
    queueDbResult([{ id: 'old-1' }])  // in-tx soft-delete .returning()
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

  it('throws when oldId not found or already deleted', async () => {
    queueDbResult([GROUP])
    queueDbResult([OPEN_EPOCH])
    queueDbResult([])  // soft-delete returning is empty (row gone or wrong group)
    await expect(editIncome({
      oldId: 'gone',
      amount: 1,
      category: 'salary',
      recipientId: 'user-a',
      occurredAt: '2026-05-01',
    })).rejects.toThrow(/找不到/)
  })

  it('rejects when viewer is pinned to a past epoch', async () => {
    setCookie(PAST_EPOCH_COOKIE, 'epoch-old')
    queueDbResult([CLOSED_EPOCH])
    queueDbResult([GROUP])

    await expect(editIncome({
      oldId: 'old-1',
      amount: 35000,
      category: 'salary',
      recipientId: 'user-a',
      occurredAt: '2026-05-01',
    })).rejects.toThrow('過去章節不可編輯')
  })
})

describe('softDeleteIncome', () => {
  it('sets deleted_at on the row', async () => {
    queueDbResult([GROUP])
    queueDbResult([OPEN_EPOCH])
    queueDbResult([{ id: 'inc-1' }])

    await softDeleteIncome('inc-1')

    expect(mockDb.update).toHaveBeenCalled()
    const setCall = mockBuilder.set.mock.calls[0][0] as Record<string, unknown>
    expect(setCall.deletedAt).toBeInstanceOf(Date)
  })

  it('rejects when viewer is pinned to a past epoch', async () => {
    setCookie(PAST_EPOCH_COOKIE, 'epoch-old')
    queueDbResult([CLOSED_EPOCH])
    queueDbResult([GROUP])

    await expect(softDeleteIncome('inc-1')).rejects.toThrow('過去章節不可編輯')
  })
})
