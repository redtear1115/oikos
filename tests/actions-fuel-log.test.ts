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

import { createFuelLog, editFuelLog, softDeleteFuelLog } from '@/actions/fuelLog'
import { PAST_EPOCH_COOKIE } from '@/lib/db/queries/epoch'
import { assets } from '@/lib/db/schema'

/** How many of the reads in this action were Assets-ownership lookups. */
function assetLookupCount(): number {
  return mockBuilder.from.mock.calls.filter((call) => call[0] === assets).length
}

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

describe('createFuelLog', () => {
  it('atomically inserts FuelLog + CashTransaction with fuelLogId link, then recalcs', async () => {
    queueDbResult([GROUP])                                       // group lookup (.limit)
    queueDbResult([OPEN_EPOCH])                                  // current-epoch lookup
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

    expect(result).toEqual({ ok: true, data: { id: 'fuel-log-id' } })
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
    // validateFuelLogInput runs after getViewerWriteContext now — queue
    // group + epoch so the helper succeeds and validation is reached.
    queueDbResult([GROUP])
    queueDbResult([OPEN_EPOCH])
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
    queueDbResult([GROUP])         // viewer's group
    queueDbResult([OPEN_EPOCH])    // current-epoch lookup
    queueDbResult([])              // asset not found in this group → empty
    expect(await createFuelLog({
      assetId: 'foreign-asset',
      liters: 30,
      odometer: 1000,
      cost: 500,
      fuelType: '95',
      loggedAt: '2026-05-05',
      station: null,
      paidBy: 'user-a',
      splitType: 'all_mine',
    })).toEqual({ ok: false, code: 'linked_asset_not_in_group' })
  })

  it('auto-generates description "加油" when station is null', async () => {
    queueDbResult([GROUP])
    queueDbResult([OPEN_EPOCH])
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

  it('returns error code when payer is not in the group', async () => {
    queueDbResult([GROUP])
    queueDbResult([OPEN_EPOCH])
    queueDbResult([{ id: 'asset-1', deletedAt: null }])
    expect(await createFuelLog({
      assetId: 'asset-1', liters: 30, odometer: 1000, cost: 500,
      fuelType: '95', loggedAt: '2026-05-05', station: null,
      paidBy: 'user-stranger', splitType: 'all_mine',
    })).toEqual({ ok: false, code: 'payer_not_in_group' })
  })

  it('returns error code when asset is soft-deleted', async () => {
    queueDbResult([GROUP])
    queueDbResult([OPEN_EPOCH])
    queueDbResult([{ id: 'asset-1', deletedAt: new Date() }])
    expect(await createFuelLog({
      assetId: 'asset-1', liters: 30, odometer: 1000, cost: 500,
      fuelType: '95', loggedAt: '2026-05-05', station: null,
      paidBy: 'user-a', splitType: 'all_mine',
    })).toEqual({ ok: false, code: 'linked_asset_deleted' })
  })

  it('rejects when viewer is pinned to a past epoch', async () => {
    setCookie(PAST_EPOCH_COOKIE, 'epoch-old')
    queueDbResult([CLOSED_EPOCH])
    queueDbResult([GROUP])

    await expect(createFuelLog({
      assetId: 'asset-1',
      liters: 30,
      odometer: 1000,
      cost: 500,
      fuelType: '95',
      loggedAt: '2026-05-05',
      station: null,
      paidBy: 'user-a',
      splitType: 'all_mine',
    })).rejects.toThrow('過去章節不可編輯')
  })
})

describe('editFuelLog', () => {
  it('UPDATE FuelLog in place + soft-delete old txn + insert new txn (carry fuelLogId) + recalc', async () => {
    queueDbResult([GROUP])                                                          // group lookup
    queueDbResult([OPEN_EPOCH])                                                     // current-epoch lookup
    queueDbResult([{ id: 'fuel-log-id', assetId: 'asset-1', deletedAt: null }])     // fuel log lookup
    queueDbResult([{ id: 'asset-1' }])                                              // #1032 — EDITED row's asset ownership
    queueDbResult([{ id: 'asset-1', deletedAt: null }])                             // incoming asset ownership
    queueDbResult([{ id: 'old-txn-id' }])                                           // linked txn lookup
    // Inside the transaction:
    //   chapter lock (open GroupEpochs FOR SHARE) + members read under it
    //   tx.update(fuelLogs)... (with .returning — guarded)
    //   tx.update(cashTransactions)... (with .returning)
    //   tx.insert(cashTransactions)... (with .returning)
    //   tx.execute(sql`...`) for recalc
    queueDbResult([{ id: 'epoch-current' }])           // chapter lock
    queueDbResult([GROUP])                             // members read under the lock
    queueDbResult([{ id: 'fuel-log-id' }])             // UPDATE fuelLogs .returning
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

  it('returns error code when fuel log is already soft-deleted', async () => {
    queueDbResult([GROUP])                                                                    // group
    queueDbResult([OPEN_EPOCH])                                                               // current-epoch lookup
    queueDbResult([{ id: 'fuel-log-id', assetId: 'asset-1', deletedAt: new Date() }])         // fuel log soft-deleted

    expect(await editFuelLog({
      id: 'fuel-log-id',
      assetId: 'asset-1',
      liters: 40, odometer: 87000, cost: 1500,
      fuelType: '95', loggedAt: '2026-05-06', station: null,
      paidBy: 'user-a', splitType: 'all_mine',
    })).toEqual({ ok: false, code: 'fuel_log_deleted_or_missing' })
  })

  it('returns error code when fuel log is not found', async () => {
    queueDbResult([GROUP])
    queueDbResult([OPEN_EPOCH])
    queueDbResult([])  // no fuel log row

    expect(await editFuelLog({
      id: 'missing-id',
      assetId: 'asset-1',
      liters: 40, odometer: 87000, cost: 1500,
      fuelType: '95', loggedAt: '2026-05-06', station: null,
      paidBy: 'user-a', splitType: 'all_mine',
    })).toEqual({ ok: false, code: 'fuel_log_deleted_or_missing' })
  })

  it('returns error code when fuel log asset is not in viewer group', async () => {
    queueDbResult([GROUP])
    queueDbResult([OPEN_EPOCH])
    queueDbResult([{ id: 'fuel-log-id', assetId: 'foreign-asset', deletedAt: null }])
    queueDbResult([])  // asset lookup empty (asset not in this group)

    expect(await editFuelLog({
      id: 'fuel-log-id',
      assetId: 'foreign-asset',
      liters: 40, odometer: 87000, cost: 1500,
      fuelType: '95', loggedAt: '2026-05-06', station: null,
      paidBy: 'user-a', splitType: 'all_mine',
    })).toEqual({ ok: false, code: 'linked_asset_not_in_group' })
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

  it('returns error code when payer is not in the group', async () => {
    queueDbResult([GROUP])
    queueDbResult([OPEN_EPOCH])
    queueDbResult([{ id: 'fuel-log-id', assetId: 'asset-1', deletedAt: null }])
    queueDbResult([{ id: 'asset-1' }])                    // #1032 — edited row's asset
    queueDbResult([{ id: 'asset-1', deletedAt: null }])   // incoming asset

    expect(await editFuelLog({
      id: 'fuel-log-id',
      assetId: 'asset-1',
      liters: 40, odometer: 87000, cost: 1500,
      fuelType: '95', loggedAt: '2026-05-06', station: null,
      paidBy: 'user-stranger', splitType: 'all_mine',
    })).toEqual({ ok: false, code: 'payer_not_in_group' })
  })

  // ─── Regression for #1032 ───────────────────────────────────────────────
  // The pre-fix action looked the existing row up by id alone and then
  // ownership-checked the assetId the CALLER supplied — so a fuelLogId from
  // another group passed straight through, taking the victim's fuel log and
  // their linked CashTransaction with it. Both halves are pinned here: the
  // edited row's own asset must be resolved against the viewer's group (there
  // are now TWO Assets lookups, not one), and the gate must trip before any
  // write. The end-to-end proof against real Postgres lives in
  // `__tests__/actions/editFuelLog.crossGroup.test.ts`.

  it('resolves the EDITED row\'s asset against the viewer group, not just the incoming one (#1032)', async () => {
    queueDbResult([GROUP])
    queueDbResult([OPEN_EPOCH])
    queueDbResult([{ id: 'fuel-log-id', assetId: 'asset-1', deletedAt: null }])
    queueDbResult([{ id: 'asset-1' }])                    // edited row's asset — in group
    queueDbResult([{ id: 'asset-2', deletedAt: null }])   // incoming (reassigned) asset — in group
    queueDbResult([{ id: 'old-txn-id' }])                 // linked txn lookup
    queueDbResult([{ id: 'epoch-current' }])              // chapter lock
    queueDbResult([GROUP])                                // members read under the lock
    queueDbResult([{ id: 'fuel-log-id' }])                // UPDATE fuelLogs .returning
    queueDbResult([{ id: 'old-txn-id' }])                 // UPDATE old txn .returning
    queueDbResult([{ id: 'new-txn-id' }])                 // INSERT new txn .returning
    queueDbResult([])                                     // recalc
    queueDbResult([])                                     // recalc delta

    await editFuelLog({
      id: 'fuel-log-id',
      assetId: 'asset-2',
      liters: 40, odometer: 87000, cost: 1500,
      fuelType: '95', loggedAt: '2026-05-06', station: null,
      paidBy: 'user-a', splitType: 'all_mine',
    })

    // Two Assets reads: the row being edited, then the row it is moving to.
    // Pre-fix there was exactly one — the incoming asset — which is the bug.
    expect(assetLookupCount()).toBe(2)
  })

  it('rejects a fuelLogId whose asset is outside the viewer group, even when the incoming assetId is inside it (#1032)', async () => {
    queueDbResult([GROUP])
    queueDbResult([OPEN_EPOCH])
    // The victim's fuel log — the attacker holds its id from their duo days.
    queueDbResult([{ id: 'fuel-log-id', assetId: 'victim-asset', deletedAt: null }])
    // Ownership lookup on that asset comes back empty: it is not in the
    // attacker's group. The attacker's own 'asset-1' would have satisfied the
    // pre-fix check, so the throw must happen here, on the edited row.
    queueDbResult([])

    expect(await editFuelLog({
      id: 'fuel-log-id',
      assetId: 'asset-1',
      liters: 40, odometer: 87000, cost: 1500,
      fuelType: '95', loggedAt: '2026-05-06', station: null,
      paidBy: 'user-a', splitType: 'all_mine',
    })).toEqual({ ok: false, code: 'linked_asset_not_in_group' })

    // Nothing was written: no transaction, no soft-delete of the victim's txn.
    expect(mockDb.transaction).not.toHaveBeenCalled()
    expect(mockDb.update).not.toHaveBeenCalled()
    expect(mockDb.insert).not.toHaveBeenCalled()
    // The gate fired on the FIRST Assets read — the edited row's — before the
    // incoming assetId was ever looked at.
    expect(assetLookupCount()).toBe(1)
  })

  it('rejects when viewer is pinned to a past epoch', async () => {
    setCookie(PAST_EPOCH_COOKIE, 'epoch-old')
    queueDbResult([CLOSED_EPOCH])
    queueDbResult([GROUP])

    await expect(editFuelLog({
      id: 'fuel-log-id',
      assetId: 'asset-1',
      liters: 40, odometer: 87000, cost: 1500,
      fuelType: '95', loggedAt: '2026-05-06', station: null,
      paidBy: 'user-a', splitType: 'all_mine',
    })).rejects.toThrow('過去章節不可編輯')
  })
})

describe('softDeleteFuelLog', () => {
  it('soft-deletes both FuelLog and linked CashTransaction atomically + recalc', async () => {
    queueDbResult([GROUP])                                                          // group lookup
    queueDbResult([OPEN_EPOCH])                                                     // current-epoch lookup
    queueDbResult([{ id: 'fuel-log-id', assetId: 'asset-1', deletedAt: null }])     // fuel log lookup
    queueDbResult([{ id: 'asset-1', deletedAt: null }])                             // asset ownership
    // Inside the transaction:
    queueDbResult([{ id: 'epoch-current' }])           // chapter lock
    queueDbResult([GROUP])                             // members read under the lock
    queueDbResult([{ id: 'fuel-log-id' }])             // UPDATE fuelLogs .returning
    queueDbResult([{ id: 'old-txn-id' }])              // UPDATE cashTransactions .returning
    queueDbResult([])                                  // recalc UPDATE
    queueDbResult([])                                  // recalc UPDATE delta (extra safety)

    await softDeleteFuelLog('fuel-log-id')

    expect(mockDb.transaction).toHaveBeenCalledOnce()
    // update was called: once for fuelLogs, once for the linked cashTransactions row(s)
    expect(mockDb.update).toHaveBeenCalledTimes(2)
    // No inserts in a soft-delete
    expect(mockDb.insert).not.toHaveBeenCalled()

    // Both .set() calls must set deletedAt to a Date
    const setCalls = mockBuilder.set.mock.calls
    expect(setCalls.length).toBeGreaterThanOrEqual(2)
    const fuelLogSet = setCalls[0][0] as Record<string, unknown>
    const txnSet = setCalls[1][0] as Record<string, unknown>
    expect(fuelLogSet.deletedAt).toBeInstanceOf(Date)
    expect(txnSet.deletedAt).toBeInstanceOf(Date)
  })

  it('idempotent: soft-deleting an already-deleted fuel log returns error code', async () => {
    queueDbResult([GROUP])                                                                    // group
    queueDbResult([OPEN_EPOCH])                                                               // current-epoch lookup
    queueDbResult([{ id: 'fuel-log-id', assetId: 'asset-1', deletedAt: new Date() }])         // fuel log soft-deleted

    expect(await softDeleteFuelLog('fuel-log-id')).toEqual({ ok: false, code: 'fuel_log_deleted_or_missing' })
    // Should not enter the transaction at all
    expect(mockDb.transaction).not.toHaveBeenCalled()
  })

  it('returns error code when fuel log is not found', async () => {
    queueDbResult([GROUP])
    queueDbResult([OPEN_EPOCH])
    queueDbResult([])  // no fuel log row

    expect(await softDeleteFuelLog('missing-id')).toEqual({ ok: false, code: 'fuel_log_deleted_or_missing' })
    expect(mockDb.transaction).not.toHaveBeenCalled()
  })

  it('returns error code when fuel log asset is not in viewer group', async () => {
    queueDbResult([GROUP])
    queueDbResult([OPEN_EPOCH])
    queueDbResult([{ id: 'fuel-log-id', assetId: 'foreign-asset', deletedAt: null }])
    queueDbResult([])  // asset lookup empty (asset not in this group)

    expect(await softDeleteFuelLog('fuel-log-id')).toEqual({ ok: false, code: 'linked_asset_not_in_group' })
    expect(mockDb.transaction).not.toHaveBeenCalled()
  })

  it('throws unauthorized when no user', async () => {
    setMockUser(null)
    await expect(softDeleteFuelLog('fuel-log-id')).rejects.toThrow('Unauthorized')
  })

  it('rejects when viewer is pinned to a past epoch', async () => {
    setCookie(PAST_EPOCH_COOKIE, 'epoch-old')
    queueDbResult([CLOSED_EPOCH])
    queueDbResult([GROUP])

    await expect(softDeleteFuelLog('fuel-log-id')).rejects.toThrow('過去章節不可編輯')
  })
})

// #1290 — per-row edits and deletes are limited to the current chapter, under
// the chapter lock, and a fuel log's linked expense is only ever looked up and
// written within the viewer's group (DB-level coverage, including a car that
// changed groups: __tests__/actions/moneyRowChapterScope.test.ts).
describe('fuel log writes under the chapter lock (#1290)', () => {
  const input = {
    id: 'fuel-log-id', assetId: 'asset-1', liters: 40, odometer: 87000, cost: 1500,
    fuelType: '95', loggedAt: '2026-05-06', station: null, paidBy: 'user-b', splitType: 'all_mine' as const,
  }
  function queueEditPreamble() {
    queueDbResult([GROUP])
    queueDbResult([OPEN_EPOCH])
    queueDbResult([{ id: 'fuel-log-id', assetId: 'asset-1', deletedAt: null }])
    queueDbResult([{ id: 'asset-1' }])
    queueDbResult([{ id: 'asset-1', deletedAt: null }])
  }

  it('editFuelLog refuses with fuel_transaction_not_found when there is no linked expense in the viewer\'s group, and writes nothing', async () => {
    queueEditPreamble()
    queueDbResult([])  // linked expense lookup (viewer's group only) is empty

    expect(await editFuelLog(input)).toEqual({ ok: false, code: 'fuel_transaction_not_found' })
    expect(mockDb.update).not.toHaveBeenCalled()
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it('editFuelLog refuses with fuel_log_deleted_or_missing when its guarded FuelLogs update matches nothing, and inserts nothing', async () => {
    queueEditPreamble()
    queueDbResult([{ id: 'old-txn-id' }])
    queueDbResult([{ id: 'epoch-current' }])
    queueDbResult([GROUP])
    queueDbResult([])  // FuelLogs UPDATE .returning: not live, or not in the open chapter

    expect(await editFuelLog(input)).toEqual({ ok: false, code: 'fuel_log_deleted_or_missing' })
    expect(mockDb.update).toHaveBeenCalledOnce()
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it('editFuelLog fails closed without an open chapter', async () => {
    queueEditPreamble()
    queueDbResult([{ id: 'old-txn-id' }])
    queueDbResult([])  // no open chapter row

    expect(await editFuelLog(input)).toEqual({ ok: false, code: 'fuel_log_deleted_or_missing' })
    expect(mockBuilder.for).toHaveBeenCalledWith('share')
    expect(mockDb.update).not.toHaveBeenCalled()
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it('editFuelLog re-checks the payer against the members read under the lock', async () => {
    queueEditPreamble()
    queueDbResult([{ id: 'old-txn-id' }])
    queueDbResult([{ id: 'epoch-current' }])
    queueDbResult([{ memberA: 'user-a', memberB: null }])  // user-b is no longer a member

    expect(await editFuelLog(input)).toEqual({ ok: false, code: 'payer_not_in_group' })
    expect(mockDb.update).not.toHaveBeenCalled()
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it('softDeleteFuelLog fails closed without an open chapter', async () => {
    queueDbResult([GROUP])
    queueDbResult([OPEN_EPOCH])
    queueDbResult([{ id: 'fuel-log-id', assetId: 'asset-1', deletedAt: null }])
    queueDbResult([{ id: 'asset-1', deletedAt: null }])
    queueDbResult([])  // no open chapter row

    expect(await softDeleteFuelLog('fuel-log-id')).toEqual({ ok: false, code: 'fuel_log_deleted_or_missing' })
    expect(mockBuilder.for).toHaveBeenCalledWith('share')
    expect(mockDb.update).not.toHaveBeenCalled()
  })
})
