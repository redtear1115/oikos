import { describe, it, expect, beforeEach } from 'vitest'
import { setMockUser } from './_mocks/supabase'
import { mockDb, queueDbResult, resetDbMocks } from './_mocks/db'
import { createCar, editCar, softDeleteCar } from '@/actions/asset'

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
