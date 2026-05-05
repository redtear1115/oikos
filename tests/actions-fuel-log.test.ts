import { describe, it, expect, beforeEach } from 'vitest'
import { setMockUser } from './_mocks/supabase'
import { mockDb, mockBuilder, queueDbResult, resetDbMocks } from './_mocks/db'
import { createFuelLog } from '@/actions/fuelLog'

const VIEWER = { id: 'user-a', email: 'a@example.com' }
const GROUP = { id: 'grp-1', memberA: 'user-a', memberB: 'user-b', name: '我們家' }

beforeEach(() => {
  resetDbMocks()
  setMockUser(VIEWER)
})

describe('createFuelLog', () => {
  it('atomically inserts FuelLog + CashTransaction with fuelLogId link, then recalcs', async () => {
    queueDbResult([GROUP])                                       // group lookup (.limit)
    queueDbResult([{ id: 'asset-1', deletedAt: null }])          // asset ownership lookup (.limit)
    queueDbResult([{ id: 'fuel-log-id' }])                       // FuelLog insert .returning
    queueDbResult([{ id: 'txn-id' }])                            // CashTransaction insert .returning
    // recalcGroupBalance tx.execute — pulls [] from empty queue (default)

    const result = await createFuelLog({
      assetId: 'asset-1',
      liters: 36.2,
      odometer: 86420,
      cost: 1340,
      fuelType: '95',
      loggedAt: '2026-05-05',
      station: '中油 永和',
      paidBy: 'user-a',
      splitType: 'all_mine',
    })

    expect(result).toEqual({ id: 'fuel-log-id' })
    expect(mockDb.transaction).toHaveBeenCalledOnce()
    // Two inserts inside the transaction: FuelLog + CashTransaction
    expect(mockDb.insert).toHaveBeenCalledTimes(2)

    // .values() is invoked once per insert — first FuelLog payload, then CashTransaction payload.
    const valueCalls = mockBuilder.values.mock.calls
    expect(valueCalls).toHaveLength(2)
    const fuelLogPayload = valueCalls[0][0] as Record<string, unknown>
    expect(fuelLogPayload).toMatchObject({
      assetId: 'asset-1',
      fuelType: '95',
      odometer: 86420,
      station: '中油 永和',
    })

    const txnPayload = valueCalls[1][0] as Record<string, unknown>
    expect(txnPayload).toMatchObject({
      groupId: 'grp-1',
      assetId: 'asset-1',
      fuelLogId: 'fuel-log-id',
      amount: 1340,
      paidBy: 'user-a',
      splitType: 'all_mine',
      category: 'transit',
      description: '加油 · 中油 永和',
    })
  })

  it('rejects fuelType=electric (EV1)', async () => {
    // validateFuelLogInput throws before any DB call — no queueing needed.
    await expect(createFuelLog({
      assetId: 'asset-1',
      liters: 30,
      odometer: 1000,
      cost: 500,
      fuelType: 'electric',
      loggedAt: '2026-05-05',
      station: null,
      paidBy: 'user-a',
      splitType: 'all_mine',
    })).rejects.toThrow(/電車/)
  })

  it('rejects when asset belongs to a different group', async () => {
    queueDbResult([GROUP])  // viewer's group
    queueDbResult([])       // asset not found in this group → empty
    await expect(createFuelLog({
      assetId: 'foreign-asset',
      liters: 30,
      odometer: 1000,
      cost: 500,
      fuelType: '95',
      loggedAt: '2026-05-05',
      station: null,
      paidBy: 'user-a',
      splitType: 'all_mine',
    })).rejects.toThrow(/不在家計簿內/)
  })

  it('auto-generates description "加油" when station is null', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'asset-1', deletedAt: null }])
    queueDbResult([{ id: 'fuel-log-id' }])
    queueDbResult([{ id: 'txn-id' }])

    await createFuelLog({
      assetId: 'asset-1',
      liters: 30,
      odometer: 1000,
      cost: 500,
      fuelType: '95',
      loggedAt: '2026-05-05',
      station: null,
      paidBy: 'user-a',
      splitType: 'all_mine',
    })

    const valueCalls = mockBuilder.values.mock.calls
    const txnPayload = valueCalls[1][0] as Record<string, unknown>
    expect(txnPayload.description).toBe('加油')
  })

  it('throws unauthorized when no user', async () => {
    setMockUser(null)
    await expect(createFuelLog({
      assetId: 'asset-1', liters: 30, odometer: 1000, cost: 500,
      fuelType: '95', loggedAt: '2026-05-05', station: null,
      paidBy: 'user-a', splitType: 'all_mine',
    })).rejects.toThrow('Unauthorized')
  })

  it('throws when payer is not in the group', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'asset-1', deletedAt: null }])
    await expect(createFuelLog({
      assetId: 'asset-1', liters: 30, odometer: 1000, cost: 500,
      fuelType: '95', loggedAt: '2026-05-05', station: null,
      paidBy: 'user-stranger', splitType: 'all_mine',
    })).rejects.toThrow('付款人不在家計簿內')
  })

  it('throws when asset is soft-deleted', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'asset-1', deletedAt: new Date() }])
    await expect(createFuelLog({
      assetId: 'asset-1', liters: 30, odometer: 1000, cost: 500,
      fuelType: '95', loggedAt: '2026-05-05', station: null,
      paidBy: 'user-a', splitType: 'all_mine',
    })).rejects.toThrow(/已刪除/)
  })
})
