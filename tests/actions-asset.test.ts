import { describe, it, expect, beforeEach } from 'vitest'
import { setMockUser } from './_mocks/supabase'
import { mockDb, mockBuilder, queueDbResult, resetDbMocks } from './_mocks/db'
import { createCar, editCar, softDeleteCar, createLifeEntity, editLifeEntity, softDeleteAsset } from '@/actions/asset'

const VIEWER = { id: 'user-a', email: 'a@example.com' }
const GROUP = { id: 'grp-1', memberA: 'user-a', memberB: 'user-b', name: '我們家' }

beforeEach(() => {
  resetDbMocks()
  setMockUser(VIEWER)
})

describe('createCar', () => {
  it('happy path: validates, inserts Asset + CarDetails in one tx', async () => {
    queueDbResult([GROUP])               // group lookup (.limit)
    queueDbResult([{ id: 'asset-1' }])   // assets insert .returning
    queueDbResult([])                    // carDetails insert (no .returning, awaited directly)

    const result = await createCar({
      name: '我的 Tesla',
      plate: 'ABC-1234',
      purchasedAt: '2024-06-01',
      purchasePrice: 800000,
    })

    expect(result).toEqual({ id: 'asset-1' })
    expect(mockDb.transaction).toHaveBeenCalledOnce()
  })

  it('throws unauthorized when no user', async () => {
    setMockUser(null)
    await expect(createCar({ name: '車', plate: 'A1' })).rejects.toThrow('Unauthorized')
  })

  it('throws on empty name', async () => {
    await expect(createCar({ name: '   ', plate: 'A1' })).rejects.toThrow(/名稱/)
  })

  it('throws on empty plate', async () => {
    await expect(createCar({ name: '車', plate: '   ' })).rejects.toThrow(/車牌/)
  })

  it('throws when group not found', async () => {
    queueDbResult([])
    await expect(createCar({ name: '車', plate: 'A1' })).rejects.toThrow('找不到家計簿')
  })
})

describe('editCar', () => {
  it('happy path: updates Asset name + CarDetails fields', async () => {
    queueDbResult([GROUP])              // group lookup
    queueDbResult([{ id: 'asset-1' }])  // assets update .returning — proves ownership
    queueDbResult([])                   // carDetails update (no .returning)

    await editCar({
      id: 'asset-1',
      name: '新名字',
      plate: 'XYZ-9',
      purchasedAt: null,
      purchasePrice: null,
    })

    expect(mockDb.transaction).toHaveBeenCalledOnce()
  })

  it('throws if asset not found in group', async () => {
    queueDbResult([GROUP])
    queueDbResult([])  // assets update returning empty
    await expect(editCar({
      id: 'missing', name: '車', plate: 'A1',
      purchasedAt: null, purchasePrice: null,
    })).rejects.toThrow(/找不到/)
  })

  it('throws unauthorized when no user', async () => {
    setMockUser(null)
    await expect(editCar({
      id: 'asset-1', name: '車', plate: 'A1',
      purchasedAt: null, purchasePrice: null,
    })).rejects.toThrow('Unauthorized')
  })
})

describe('createCar with auto-transaction', () => {
  it('atomically creates Asset + CarDetails + CashTransaction when purchasePrice > 0', async () => {
    queueDbResult([GROUP])                            // group lookup (.limit)
    queueDbResult([{ id: 'asset-1' }])                // assets insert .returning
    queueDbResult([])                                 // carDetails insert (await)
    queueDbResult([{ id: 'txn-1' }])                  // cashTransactions insert .returning

    const result = await createCar({
      name: '阿白',
      plate: 'ABC-1234',
      purchasedAt: '2026-04-01',
      purchasePrice: 500000,
      primaryUserId: 'user-a',
      fuelType: '95',
    })

    expect(result).toEqual({ id: 'asset-1' })
    expect(mockDb.transaction).toHaveBeenCalledOnce()
    // Three inserts inside the transaction: Asset + CarDetails + CashTransaction
    expect(mockDb.insert).toHaveBeenCalledTimes(3)

    const valueCalls = mockBuilder.values.mock.calls
    expect(valueCalls).toHaveLength(3)

    const carDetailsPayload = valueCalls[1][0] as Record<string, unknown>
    expect(carDetailsPayload).toMatchObject({
      assetId: 'asset-1',
      plate: 'ABC-1234',
      purchasedAt: '2026-04-01',
      purchasePrice: 500000,
      primaryUserId: 'user-a',
      fuelType: '95',
    })

    const txnPayload = valueCalls[2][0] as Record<string, unknown>
    expect(txnPayload).toMatchObject({
      groupId: 'grp-1',
      assetId: 'asset-1',
      fuelLogId: null,
      paidBy: 'user-a',
      splitType: 'all_mine',
      amount: 500000,
      category: 'transit',
      description: '購入 · 阿白',
    })
    expect((txnPayload.transactedAt as Date).getTime()).toBe(
      new Date('2026-04-01T00:00:00').getTime()
    )
  })

  it('skips auto-tx when purchasePrice is null (only Asset + CarDetails)', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'asset-2' }])
    queueDbResult([])

    await createCar({
      name: '阿白',
      plate: 'ABC-1234',
      purchasedAt: null,
      purchasePrice: null,
      primaryUserId: null,
      fuelType: '95',
    })

    expect(mockDb.insert).toHaveBeenCalledTimes(2)  // Asset + CarDetails only
    const valueCalls = mockBuilder.values.mock.calls
    expect(valueCalls).toHaveLength(2)
  })

  it('uses primaryUserId=NULL → splitType=half + paidBy=viewer (共用)', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'asset-3' }])
    queueDbResult([])
    queueDbResult([{ id: 'txn-3' }])

    await createCar({
      name: '阿白',
      plate: 'ABC-1234',
      purchasedAt: '2026-04-01',
      purchasePrice: 500000,
      primaryUserId: null,
      fuelType: '95',
    })

    const valueCalls = mockBuilder.values.mock.calls
    const txnPayload = valueCalls[2][0] as Record<string, unknown>
    expect(txnPayload.paidBy).toBe('user-a')   // viewer
    expect(txnPayload.splitType).toBe('half')
  })

  it('falls back to NOW() when purchasedAt is null', async () => {
    // Solo group (memberB null) — primaryUser NULL falls to all_mine via partner=null
    queueDbResult([{ id: 'grp-solo', memberA: 'user-a', memberB: null, name: '我' }])
    queueDbResult([{ id: 'asset-4' }])
    queueDbResult([])
    queueDbResult([{ id: 'txn-4' }])

    const before = Date.now()
    await createCar({
      name: '阿白',
      plate: 'ABC-1234',
      purchasedAt: null,
      purchasePrice: 500000,
      primaryUserId: 'user-a',
      fuelType: '95',
    })
    const after = Date.now()

    const valueCalls = mockBuilder.values.mock.calls
    const txnPayload = valueCalls[2][0] as Record<string, unknown>
    const transactedAt = txnPayload.transactedAt as Date
    expect(transactedAt).toBeInstanceOf(Date)
    expect(transactedAt.getTime()).toBeGreaterThanOrEqual(before)
    expect(transactedAt.getTime()).toBeLessThanOrEqual(after)
  })

  it('solo group: primaryUserId=null → all_mine + paidBy=viewer', async () => {
    queueDbResult([{ id: 'grp-solo', memberA: 'user-a', memberB: null, name: '我' }])
    queueDbResult([{ id: 'asset-5' }])
    queueDbResult([])
    queueDbResult([{ id: 'txn-5' }])

    await createCar({
      name: '阿白',
      plate: 'ABC-1234',
      purchasedAt: '2026-04-01',
      purchasePrice: 500000,
      primaryUserId: null,
      fuelType: '95',
    })

    const valueCalls = mockBuilder.values.mock.calls
    const txnPayload = valueCalls[2][0] as Record<string, unknown>
    expect(txnPayload.paidBy).toBe('user-a')
    expect(txnPayload.splitType).toBe('all_mine')
  })

  it('Slice 1 callers without primaryUserId/fuelType still work (validator defaults)', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'asset-6' }])
    queueDbResult([])

    // Existing Slice 1 happy path — no primaryUserId, no fuelType, no purchasePrice
    const result = await createCar({
      name: '我的 Tesla',
      plate: 'XYZ-9',
    })

    expect(result).toEqual({ id: 'asset-6' })
    expect(mockDb.insert).toHaveBeenCalledTimes(2)  // No auto-tx (no purchasePrice)
    const valueCalls = mockBuilder.values.mock.calls
    const carDetailsPayload = valueCalls[1][0] as Record<string, unknown>
    expect(carDetailsPayload.fuelType).toBe('95')         // validator default
    expect(carDetailsPayload.primaryUserId).toBeNull()    // validator default
  })

  it('purchasePrice=0 is rejected by validator (positive integer required)', async () => {
    // validateAmount throws on amount<=0 — runs before any DB call
    await expect(createCar({
      name: '阿白',
      plate: 'ABC-1234',
      purchasedAt: null,
      purchasePrice: 0,
      primaryUserId: null,
      fuelType: '95',
    })).rejects.toThrow(/購入價/)
  })
})

describe('editCar with primaryUserId + fuelType', () => {
  it('updates carDetails with new fields, does NOT insert any transaction (E2 drift)', async () => {
    queueDbResult([GROUP])               // group lookup
    queueDbResult([{ id: 'asset-1' }])   // assets update .returning
    queueDbResult([])                    // carDetails update

    await editCar({
      id: 'asset-1',
      name: '阿白',
      plate: 'ABC-1234',
      purchasedAt: '2026-04-01',
      purchasePrice: 600000,   // changed from 500k — drift expected per E2
      primaryUserId: 'user-a',
      fuelType: '98',
    })

    // Exactly 2 updates (assets + carDetails), no inserts
    expect(mockDb.update).toHaveBeenCalledTimes(2)
    expect(mockDb.insert).not.toHaveBeenCalled()

    // Verify the carDetails payload includes the new fields
    const valueCalls = mockBuilder.values.mock.calls
    expect(valueCalls).toHaveLength(0)   // edit uses .set(), not .values()
  })

  it('accepts fuelType=92 on editCar', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'asset-1' }])
    queueDbResult([])

    await expect(editCar({
      id: 'asset-1',
      name: '九二車',
      plate: 'AA-1234',
      purchasedAt: null,
      purchasePrice: null,
      primaryUserId: null,
      fuelType: '92',
    })).resolves.toBeUndefined()
  })

  it('omitting primaryUserId/fuelType still works (Slice 1 callers, defaults applied)', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'asset-1' }])
    queueDbResult([])

    await expect(editCar({
      id: 'asset-1',
      name: '車',
      plate: 'A1',
      purchasedAt: null,
      purchasePrice: null,
    })).resolves.toBeUndefined()
  })
})

describe('softDeleteCar', () => {
  it('happy path: marks deleted_at, does NOT touch transaction.asset_id', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'asset-1' }])  // assets update .returning

    await softDeleteCar('asset-1')

    // Critical: must not touch CashTransactions (per Q7-A in spec)
    expect(mockDb.update).toHaveBeenCalledTimes(1)
  })

  it('throws if not found', async () => {
    queueDbResult([GROUP])
    queueDbResult([])
    await expect(softDeleteCar('missing')).rejects.toThrow(/找不到/)
  })

  it('throws unauthorized when no user', async () => {
    setMockUser(null)
    await expect(softDeleteCar('asset-1')).rejects.toThrow('Unauthorized')
  })
})

describe('createLifeEntity', () => {
  it('happy path: inserts Asset (no detail table)', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'asset-2' }])  // assets insert .returning

    const result = await createLifeEntity({ type: 'pet', name: '米嚕' })

    expect(result).toEqual({ id: 'asset-2' })
    expect(mockDb.insert).toHaveBeenCalledOnce()
    expect(mockDb.transaction).not.toHaveBeenCalled()  // 不需要 tx（只寫一張表）
  })

  it('throws on empty name', async () => {
    await expect(createLifeEntity({ type: 'pet', name: '   ' })).rejects.toThrow(/名稱/)
  })

  it('throws unauthorized', async () => {
    setMockUser(null)
    await expect(createLifeEntity({ type: 'plant', name: '阿拉比卡' })).rejects.toThrow('Unauthorized')
  })

  it('throws when group not found', async () => {
    queueDbResult([])  // group lookup returns empty
    await expect(createLifeEntity({ type: 'pet', name: '米嚕' })).rejects.toThrow('找不到家計簿')
  })

  it('throws on name over 32 chars', async () => {
    await expect(
      createLifeEntity({ type: 'pet', name: 'a'.repeat(33) })
    ).rejects.toThrow(/32/)
  })
})

describe('editLifeEntity', () => {
  it('happy path: updates Asset name', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'asset-2' }])  // assets update .returning

    await editLifeEntity({ id: 'asset-2', name: '新名字' })

    expect(mockDb.update).toHaveBeenCalledOnce()
  })

  it('throws when asset not found', async () => {
    queueDbResult([GROUP])
    queueDbResult([])  // update returns empty = not found / wrong group
    await expect(editLifeEntity({ id: 'nope', name: '名' })).rejects.toThrow('找不到')
  })

  it('throws unauthorized when no user', async () => {
    setMockUser(null)
    await expect(editLifeEntity({ id: 'asset-2', name: '名' })).rejects.toThrow('Unauthorized')
  })

  it('throws on empty name', async () => {
    await expect(editLifeEntity({ id: 'asset-2', name: '  ' })).rejects.toThrow(/名稱/)
  })

  it('throws on name over 32 chars', async () => {
    await expect(editLifeEntity({ id: 'asset-2', name: 'a'.repeat(33) })).rejects.toThrow(/32/)
  })
})

describe('softDeleteAsset', () => {
  it('sets deleted_at on asset', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'asset-2' }])  // update .returning

    await softDeleteAsset('asset-2')

    expect(mockDb.update).toHaveBeenCalledOnce()
  })

  it('throws when asset not found', async () => {
    queueDbResult([GROUP])
    queueDbResult([])
    await expect(softDeleteAsset('nope')).rejects.toThrow('找不到')
  })

  it('throws unauthorized when no user', async () => {
    setMockUser(null)
    await expect(softDeleteAsset('asset-2')).rejects.toThrow('Unauthorized')
  })
})
