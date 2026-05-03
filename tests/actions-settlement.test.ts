import { describe, it, expect, beforeEach } from 'vitest'
import { setMockUser } from './_mocks/supabase'
import { mockDb, queueDbResult, resetDbMocks } from './_mocks/db'
import { createSettlement, softDeleteSettlement, editSettlement } from '@/actions/settlement'

const VIEWER = { id: 'user-a', email: 'a@example.com' }
const GROUP = { id: 'grp-1', memberA: 'user-a', memberB: 'user-b', name: '我們家' }

beforeEach(() => {
  resetDbMocks()
  setMockUser(VIEWER)
})

describe('createSettlement', () => {
  it('happy path', async () => {
    queueDbResult([GROUP])              // group lookup (.limit)
    queueDbResult([{ id: 'set-1' }])    // insert returning (.returning)
    // recalcGroupBalance tx.execute — gets [] from empty queue (default)

    const r = await createSettlement({
      amount: 50,
      payerId: 'user-a',
      settledAt: new Date('2026-05-03'),
    })
    expect(r).toEqual({ id: 'set-1' })
    expect(mockDb.transaction).toHaveBeenCalledOnce()
  })

  it('throws on invalid amount', async () => {
    // validateSettlementInput runs before group lookup — no queue needed
    await expect(createSettlement({
      amount: 0, payerId: 'user-a', settledAt: new Date(),
    })).rejects.toThrow(/金額必須是正整數/)
  })

  it('throws if payer not in group', async () => {
    queueDbResult([GROUP])
    await expect(createSettlement({
      amount: 50, payerId: 'user-stranger', settledAt: new Date(),
    })).rejects.toThrow('付款人不在家計簿內')
  })

  it('throws when group not found', async () => {
    queueDbResult([])  // empty group lookup
    await expect(createSettlement({
      amount: 50, payerId: 'user-a', settledAt: new Date(),
    })).rejects.toThrow('找不到家計簿')
  })

  it('throws unauthorized when no user', async () => {
    setMockUser(null)
    await expect(createSettlement({
      amount: 50, payerId: 'user-a', settledAt: new Date(),
    })).rejects.toThrow('Unauthorized')
  })
})

describe('softDeleteSettlement', () => {
  it('happy path', async () => {
    queueDbResult([GROUP])              // group lookup (.limit)
    queueDbResult([{ id: 'set-1' }])    // update returning (.returning)
    // recalcGroupBalance tx.execute — gets [] from empty queue (default)

    await softDeleteSettlement('set-1')
    expect(mockDb.transaction).toHaveBeenCalledOnce()
  })

  it('throws if not found', async () => {
    queueDbResult([GROUP])
    queueDbResult([])  // update returning empty → throws '找不到該筆紀錄'
    await expect(softDeleteSettlement('missing')).rejects.toThrow('找不到該筆紀錄')
  })

  it('throws unauthorized when no user', async () => {
    setMockUser(null)
    await expect(softDeleteSettlement('set-1')).rejects.toThrow('Unauthorized')
  })
})

describe('editSettlement', () => {
  it('happy path: soft-deletes old + inserts new atomically', async () => {
    queueDbResult([GROUP])               // group lookup (.limit)
    queueDbResult([{ id: 'set-old' }])   // update returning — delete old (.returning)
    queueDbResult([{ id: 'set-new' }])   // insert returning (.returning)
    // recalcGroupBalance tx.execute — gets [] from empty queue (default)

    const r = await editSettlement({
      oldId: 'set-old',
      amount: 75,
      payerId: 'user-a',
      settledAt: new Date('2026-05-03'),
    })
    expect(r).toEqual({ id: 'set-new' })
    expect(mockDb.transaction).toHaveBeenCalledOnce()
  })

  it('throws if old row not found', async () => {
    queueDbResult([GROUP])
    queueDbResult([])  // update returning empty → throws '找不到該筆紀錄'
    await expect(editSettlement({
      oldId: 'set-missing', amount: 75, payerId: 'user-a', settledAt: new Date(),
    })).rejects.toThrow('找不到該筆紀錄')
  })

  it('throws if payer not in group', async () => {
    queueDbResult([GROUP])
    await expect(editSettlement({
      oldId: 'set-1', amount: 75, payerId: 'user-stranger', settledAt: new Date(),
    })).rejects.toThrow('付款人不在家計簿內')
  })

  it('throws unauthorized when no user', async () => {
    setMockUser(null)
    await expect(editSettlement({
      oldId: 'set-1', amount: 75, payerId: 'user-a', settledAt: new Date(),
    })).rejects.toThrow('Unauthorized')
  })
})
