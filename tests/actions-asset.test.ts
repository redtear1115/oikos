import { describe, it, expect, beforeEach } from 'vitest'
import { setMockUser } from './_mocks/supabase'
import { mockDb, queueDbResult, resetDbMocks } from './_mocks/db'
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
