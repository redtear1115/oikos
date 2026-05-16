import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setMockUser } from './_mocks/supabase'
import { mockDb, queueDbResult, resetDbMocks } from './_mocks/db'

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

import { createSettlement, softDeleteSettlement, editSettlement } from '@/actions/settlement'
import { PAST_EPOCH_COOKIE } from '@/lib/db/queries/epoch'

const VIEWER = { id: 'user-a', email: 'a@example.com' }
const GROUP = { id: 'grp-1', memberA: 'user-a', memberB: 'user-b', name: '我們家' }
const OPEN_EPOCH = {
  id: 'epoch-current',
  groupId: 'grp-1',
  startedAt: '2026-01-01',
  endedAt: null,
  memberAId: 'user-a',
  memberBId: 'user-b',
}
const CLOSED_EPOCH = {
  id: 'epoch-old',
  groupId: 'grp-1',
  startedAt: '2025-01-01',
  endedAt: '2025-12-31',
  memberAId: 'user-a',
  memberBId: 'user-b',
}

beforeEach(() => {
  resetDbMocks()
  setMockUser(VIEWER)
  cookieStore.clear()
})

describe('createSettlement', () => {
  it('happy path', async () => {
    queueDbResult([GROUP])              // group lookup (.limit)
    queueDbResult([OPEN_EPOCH])         // current-epoch lookup
    queueDbResult([{ id: 'set-1' }])    // insert returning (.returning)
    // recalcGroupBalance tx.execute — gets [] from empty queue (default)

    const r = await createSettlement({
      amount: 50,
      payerId: 'user-a',
      settledAt: '2026-05-03',
    })
    expect(r).toEqual({ id: 'set-1' })
    expect(mockDb.transaction).toHaveBeenCalledOnce()
  })

  it('throws on invalid amount', async () => {
    // validateSettlementInput runs after getViewerWriteContext now — queue
    // group + epoch so the helper succeeds and validation is reached.
    queueDbResult([GROUP])
    queueDbResult([OPEN_EPOCH])
    await expect(createSettlement({
      amount: 0, payerId: 'user-a', settledAt: '2026-05-16',
    })).rejects.toThrow(/金額必須是正整數/)
  })

  it('throws if payer not in group', async () => {
    queueDbResult([GROUP])
    queueDbResult([OPEN_EPOCH])
    await expect(createSettlement({
      amount: 50, payerId: 'user-stranger', settledAt: '2026-05-16',
    })).rejects.toThrow('付款人不在家計簿內')
  })

  it('throws when group not found', async () => {
    queueDbResult([])  // empty group lookup → resolveViewerEpochContext returns null
    await expect(createSettlement({
      amount: 50, payerId: 'user-a', settledAt: '2026-05-16',
    })).rejects.toThrow('找不到家計簿')
  })

  it('throws unauthorized when no user', async () => {
    setMockUser(null)
    await expect(createSettlement({
      amount: 50, payerId: 'user-a', settledAt: '2026-05-16',
    })).rejects.toThrow('Unauthorized')
  })

  it('rejects when viewer is pinned to a past epoch', async () => {
    setCookie(PAST_EPOCH_COOKIE, 'epoch-old')
    queueDbResult([CLOSED_EPOCH])
    queueDbResult([GROUP])

    await expect(createSettlement({
      amount: 50,
      payerId: 'user-a',
      settledAt: '2026-05-03',
    })).rejects.toThrow('過去章節不可編輯')
  })
})

describe('softDeleteSettlement', () => {
  it('happy path', async () => {
    queueDbResult([GROUP])              // group lookup (.limit)
    queueDbResult([OPEN_EPOCH])         // current-epoch lookup
    queueDbResult([{ id: 'set-1' }])    // update returning (.returning)
    // recalcGroupBalance tx.execute — gets [] from empty queue (default)

    await softDeleteSettlement('set-1')
    expect(mockDb.transaction).toHaveBeenCalledOnce()
  })

  it('throws if not found', async () => {
    queueDbResult([GROUP])
    queueDbResult([OPEN_EPOCH])
    queueDbResult([])  // update returning empty → throws '找不到該筆紀錄'
    await expect(softDeleteSettlement('missing')).rejects.toThrow('找不到該筆紀錄')
  })

  it('throws unauthorized when no user', async () => {
    setMockUser(null)
    await expect(softDeleteSettlement('set-1')).rejects.toThrow('Unauthorized')
  })

  it('rejects when viewer is pinned to a past epoch', async () => {
    setCookie(PAST_EPOCH_COOKIE, 'epoch-old')
    queueDbResult([CLOSED_EPOCH])
    queueDbResult([GROUP])

    await expect(softDeleteSettlement('set-1')).rejects.toThrow('過去章節不可編輯')
  })
})

describe('editSettlement', () => {
  it('happy path: soft-deletes old + inserts new atomically', async () => {
    queueDbResult([GROUP])               // group lookup (.limit)
    queueDbResult([OPEN_EPOCH])          // current-epoch lookup
    queueDbResult([{ id: 'set-old' }])   // update returning — delete old (.returning)
    queueDbResult([{ id: 'set-new' }])   // insert returning (.returning)
    // recalcGroupBalance tx.execute — gets [] from empty queue (default)

    const r = await editSettlement({
      oldId: 'set-old',
      amount: 75,
      payerId: 'user-a',
      settledAt: '2026-05-03',
    })
    expect(r).toEqual({ id: 'set-new' })
    expect(mockDb.transaction).toHaveBeenCalledOnce()
  })

  it('throws if old row not found', async () => {
    queueDbResult([GROUP])
    queueDbResult([OPEN_EPOCH])
    queueDbResult([])  // update returning empty → throws '找不到該筆紀錄'
    await expect(editSettlement({
      oldId: 'set-missing', amount: 75, payerId: 'user-a', settledAt: '2026-05-16',
    })).rejects.toThrow('找不到該筆紀錄')
  })

  it('throws if payer not in group', async () => {
    queueDbResult([GROUP])
    queueDbResult([OPEN_EPOCH])
    await expect(editSettlement({
      oldId: 'set-1', amount: 75, payerId: 'user-stranger', settledAt: '2026-05-16',
    })).rejects.toThrow('付款人不在家計簿內')
  })

  it('throws unauthorized when no user', async () => {
    setMockUser(null)
    await expect(editSettlement({
      oldId: 'set-1', amount: 75, payerId: 'user-a', settledAt: '2026-05-16',
    })).rejects.toThrow('Unauthorized')
  })

  it('rejects when viewer is pinned to a past epoch', async () => {
    setCookie(PAST_EPOCH_COOKIE, 'epoch-old')
    queueDbResult([CLOSED_EPOCH])
    queueDbResult([GROUP])

    await expect(editSettlement({
      oldId: 'set-old',
      amount: 75,
      payerId: 'user-a',
      settledAt: '2026-05-03',
    })).rejects.toThrow('過去章節不可編輯')
  })
})
