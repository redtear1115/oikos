import { describe, it, expect, beforeEach } from 'vitest'
import { setMockUser } from './_mocks/supabase'
import { mockDb, queueDbResult, resetDbMocks } from './_mocks/db'
import { createTransaction, editTransaction, softDeleteTransaction } from '@/actions/transaction'

const VIEWER = { id: 'user-a', email: 'a@example.com' }
const GROUP = { id: 'grp-1', memberA: 'user-a', memberB: 'user-b', name: '我們家' }

beforeEach(() => {
  resetDbMocks()
  setMockUser(VIEWER)
})

describe('createTransaction', () => {
  it('happy path: validates, inserts, recalcs', async () => {
    queueDbResult([GROUP])              // group lookup (.limit)
    queueDbResult([{ id: 'tx-1' }])     // insert returning (.returning)
    // recalcGroupBalance uses tx.execute — shifts [] from empty queue (default)

    const result = await createTransaction({
      amount: 100,
      description: '午餐',
      category: 'food',
      splitType: 'half',
      payerId: 'user-a',
      transactedAt: new Date('2026-05-03'),
    })

    expect(result).toEqual({ id: 'tx-1' })
    expect(mockDb.transaction).toHaveBeenCalledOnce()
  })

  it('throws unauthorized when no user', async () => {
    setMockUser(null)
    await expect(createTransaction({
      amount: 100, description: 'x', category: 'food',
      splitType: 'half', payerId: 'user-a', transactedAt: new Date(),
    })).rejects.toThrow('Unauthorized')
  })

  it('throws on invalid amount', async () => {
    // validateTransactionInput runs before group lookup — no queue needed
    await expect(createTransaction({
      amount: 0, description: 'x', category: 'food',
      splitType: 'half', payerId: 'user-a', transactedAt: new Date(),
    })).rejects.toThrow(/金額必須是正整數/)
  })

  it('throws when group not found', async () => {
    queueDbResult([])  // empty group lookup → throws '找不到家計簿'
    await expect(createTransaction({
      amount: 100, description: 'x', category: 'food',
      splitType: 'half', payerId: 'user-a', transactedAt: new Date(),
    })).rejects.toThrow('找不到家計簿')
  })

  it('throws when payer not in group', async () => {
    queueDbResult([GROUP])
    await expect(createTransaction({
      amount: 100, description: 'x', category: 'food',
      splitType: 'half', payerId: 'user-stranger', transactedAt: new Date(),
    })).rejects.toThrow('付款人不在家計簿內')
  })
})

describe('editTransaction', () => {
  it('happy path: soft-deletes old + inserts new in one transaction', async () => {
    queueDbResult([GROUP])                    // group lookup (.limit)
    queueDbResult([{ assetId: null }])        // oldRow lookup (.limit)
    // no asset re-check (assetId is null)
    queueDbResult([{ id: 'tx-old' }])         // soft-delete UPDATE .returning (race-guard)
    queueDbResult([{ id: 'tx-new' }])         // insert returning (.returning)
    // recalcGroupBalance tx.execute — gets [] from empty queue (default)

    const result = await editTransaction({
      oldId: 'tx-old',
      amount: 200,
      description: 'updated',
      category: 'food',
      splitType: 'half',
      payerId: 'user-a',
      transactedAt: new Date('2026-05-03'),
    })

    expect(result).toEqual({ id: 'tx-new' })
    expect(mockDb.transaction).toHaveBeenCalledOnce()
  })

  it('throws if old row not found', async () => {
    queueDbResult([GROUP])
    queueDbResult([])  // oldRow lookup empty → throws '找不到該筆紀錄'
    await expect(editTransaction({
      oldId: 'tx-missing', amount: 200, description: 'x',
      category: 'food', splitType: 'half', payerId: 'user-a',
      transactedAt: new Date(),
    })).rejects.toThrow('找不到該筆紀錄')
  })

  it('throws unauthorized when no user', async () => {
    setMockUser(null)
    await expect(editTransaction({
      oldId: 'tx-1', amount: 100, description: 'x',
      category: 'food', splitType: 'half', payerId: 'user-a',
      transactedAt: new Date(),
    })).rejects.toThrow('Unauthorized')
  })
})

describe('createTransaction with assetId', () => {
  it('happy path: validates asset belongs to group + not deleted', async () => {
    queueDbResult([GROUP])                           // group lookup
    queueDbResult([{ id: 'asset-1', deletedAt: null }])  // asset check .limit
    queueDbResult([{ id: 'tx-1' }])                  // insert .returning
    // recalc empty queue

    const result = await createTransaction({
      amount: 100, description: '加油', category: 'transit',
      splitType: 'half', payerId: 'user-a',
      transactedAt: new Date('2026-05-03'),
      assetId: 'asset-1',
    })
    expect(result).toEqual({ id: 'tx-1' })
  })

  it('rejects assetId not in group', async () => {
    queueDbResult([GROUP])
    queueDbResult([])  // asset lookup empty
    await expect(createTransaction({
      amount: 100, description: 'x', category: 'food',
      splitType: 'half', payerId: 'user-a', transactedAt: new Date(),
      assetId: 'foreign-asset',
    })).rejects.toThrow(/不在家計簿內/)
  })

  it('rejects assetId pointing at soft-deleted asset', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'asset-zombie', deletedAt: new Date() }])
    await expect(createTransaction({
      amount: 100, description: 'x', category: 'food',
      splitType: 'half', payerId: 'user-a', transactedAt: new Date(),
      assetId: 'asset-zombie',
    })).rejects.toThrow(/已刪除/)
  })
})

describe('editTransaction with assetId', () => {
  it('allows keeping old assetId even if asset is now deleted (zombie keep)', async () => {
    queueDbResult([GROUP])                              // group lookup
    queueDbResult([{ assetId: 'asset-zombie' }])        // oldRow .limit — asset matches
    // No asset re-check because assetId === oldRow.assetId
    queueDbResult([{ id: 'tx-old' }])                   // soft-delete UPDATE .returning (race-guard)
    queueDbResult([{ id: 'tx-new' }])                   // insert .returning
    // recalc execute pulls from empty queue (default [])

    const result = await editTransaction({
      oldId: 'tx-old', amount: 200, description: 'x',
      category: 'food', splitType: 'half', payerId: 'user-a',
      transactedAt: new Date(),
      assetId: 'asset-zombie',  // same as before — exempt from not-deleted check
    })
    expect(result).toEqual({ id: 'tx-new' })
  })

  it('blocks newly assigning to a deleted asset', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ assetId: null }])                          // oldRow had no asset
    queueDbResult([{ id: 'asset-zombie', deletedAt: new Date() }])  // new asset is deleted
    await expect(editTransaction({
      oldId: 'tx-old', amount: 200, description: 'x',
      category: 'food', splitType: 'half', payerId: 'user-a',
      transactedAt: new Date(),
      assetId: 'asset-zombie',
    })).rejects.toThrow(/已刪除/)
  })
})

describe('softDeleteTransaction', () => {
  it('happy path: marks deleted_at, recalcs', async () => {
    queueDbResult([GROUP])              // group lookup (.limit)
    queueDbResult([{ id: 'tx-1' }])     // update returning (.returning)
    // recalcGroupBalance tx.execute — gets [] from empty queue (default)

    await softDeleteTransaction('tx-1')
    expect(mockDb.transaction).toHaveBeenCalledOnce()
  })

  it('throws if not found', async () => {
    queueDbResult([GROUP])
    queueDbResult([])  // update returning empty → throws '找不到該筆紀錄'
    await expect(softDeleteTransaction('tx-missing')).rejects.toThrow('找不到該筆紀錄')
  })

  it('throws unauthorized when no user', async () => {
    setMockUser(null)
    await expect(softDeleteTransaction('tx-1')).rejects.toThrow('Unauthorized')
  })
})
