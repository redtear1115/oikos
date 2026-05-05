import { describe, it, expect, beforeEach } from 'vitest'
import { setMockUser } from './_mocks/supabase'
import { mockDb, mockBuilder, queueDbResult, resetDbMocks } from './_mocks/db'
import { createFuelLog, editFuelLog } from '@/actions/fuelLog'

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

describe('editFuelLog', () => {
  it('UPDATE FuelLog in place + soft-delete old txn + insert new txn (carry fuelLogId) + recalc', async () => {
    queueDbResult([GROUP])                                                          // group lookup
    queueDbResult([{ id: 'fuel-log-id', assetId: 'asset-1', deletedAt: null }])     // fuel log lookup
    queueDbResult([{ id: 'asset-1', deletedAt: null }])                             // asset ownership
    queueDbResult([{ id: 'old-txn-id' }])                                           // linked txn lookup
    // Inside the transaction:
    //   tx.update(fuelLogs)... (no .returning, await on chain) → consumes via .then
    //   tx.update(cashTransactions)... (with .returning)
    //   tx.insert(cashTransactions)... (with .returning)
    //   tx.execute(sql`...`) for recalc
    queueDbResult([])                                  // UPDATE fuelLogs (await on chain)
    queueDbResult([{ id: 'old-txn-id' }])              // UPDATE old txn .returning
    queueDbResult([{ id: 'new-txn-id' }])              // INSERT new txn .returning
    queueDbResult([])                                  // recalc UPDATE
    queueDbResult([])                                  // recalc UPDATE delta (extra safety)

    await editFuelLog({
      id: 'fuel-log-id',
      assetId: 'asset-1',
      liters: 40,
      odometer: 87000,
      cost: 1500,
      fuelType: '95',
      loggedAt: '2026-05-06',
      station: '中油 中和',
      paidBy: 'user-a',
      splitType: 'all_mine',
    })

    expect(mockDb.transaction).toHaveBeenCalledOnce()
    // update was called: once for fuelLogs (in-place), once for soft-deleting old txn
    expect(mockDb.update).toHaveBeenCalledTimes(2)
    // insert was called once for the new txn
    expect(mockDb.insert).toHaveBeenCalledTimes(1)

    // Inspect the .values() payload on the new txn — must carry the same fuelLogId.
    const valueCalls = mockBuilder.values.mock.calls
    expect(valueCalls).toHaveLength(1)
    const newTxnPayload = valueCalls[0][0] as Record<string, unknown>
    expect(newTxnPayload).toMatchObject({
      groupId: 'grp-1',
      assetId: 'asset-1',
      fuelLogId: 'fuel-log-id',  // FK carried over (Phase 1 editTransaction pattern)
      amount: 1500,
      paidBy: 'user-a',
      splitType: 'all_mine',
      category: 'transit',
      description: '加油 · 中油 中和',
    })

    // The first .set() call updates the FuelLog in place; the second sets deletedAt on the old txn.
    const setCalls = mockBuilder.set.mock.calls
    expect(setCalls.length).toBeGreaterThanOrEqual(2)
    const fuelLogSet = setCalls[0][0] as Record<string, unknown>
    expect(fuelLogSet).toMatchObject({
      fuelType: '95',
      odometer: 87000,
      station: '中油 中和',
    })
    const oldTxnSet = setCalls[1][0] as Record<string, unknown>
    expect(oldTxnSet.deletedAt).toBeInstanceOf(Date)
  })

  it('rejects edit when fuel log is already soft-deleted', async () => {
    queueDbResult([GROUP])                                                                    // group
    queueDbResult([{ id: 'fuel-log-id', assetId: 'asset-1', deletedAt: new Date() }])         // fuel log soft-deleted

    await expect(editFuelLog({
      id: 'fuel-log-id',
      assetId: 'asset-1',
      liters: 40, odometer: 87000, cost: 1500,
      fuelType: '95', loggedAt: '2026-05-06', station: null,
      paidBy: 'user-a', splitType: 'all_mine',
    })).rejects.toThrow(/已刪除|不存在/)
  })

  it('rejects edit when fuel log is not found', async () => {
    queueDbResult([GROUP])
    queueDbResult([])  // no fuel log row

    await expect(editFuelLog({
      id: 'missing-id',
      assetId: 'asset-1',
      liters: 40, odometer: 87000, cost: 1500,
      fuelType: '95', loggedAt: '2026-05-06', station: null,
      paidBy: 'user-a', splitType: 'all_mine',
    })).rejects.toThrow(/已刪除|不存在/)
  })

  it('rejects edit when fuel log asset is not in viewer group', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'fuel-log-id', assetId: 'foreign-asset', deletedAt: null }])
    queueDbResult([])  // asset lookup empty (asset not in this group)

    await expect(editFuelLog({
      id: 'fuel-log-id',
      assetId: 'foreign-asset',
      liters: 40, odometer: 87000, cost: 1500,
      fuelType: '95', loggedAt: '2026-05-06', station: null,
      paidBy: 'user-a', splitType: 'all_mine',
    })).rejects.toThrow(/不在家計簿內/)
  })

  it('throws unauthorized when no user', async () => {
    setMockUser(null)
    await expect(editFuelLog({
      id: 'fuel-log-id',
      assetId: 'asset-1',
      liters: 40, odometer: 87000, cost: 1500,
      fuelType: '95', loggedAt: '2026-05-06', station: null,
      paidBy: 'user-a', splitType: 'all_mine',
    })).rejects.toThrow('Unauthorized')
  })

  it('rejects when payer is not in the group', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'fuel-log-id', assetId: 'asset-1', deletedAt: null }])
    queueDbResult([{ id: 'asset-1', deletedAt: null }])

    await expect(editFuelLog({
      id: 'fuel-log-id',
      assetId: 'asset-1',
      liters: 40, odometer: 87000, cost: 1500,
      fuelType: '95', loggedAt: '2026-05-06', station: null,
      paidBy: 'user-stranger', splitType: 'all_mine',
    })).rejects.toThrow('付款人不在家計簿內')
  })
})
