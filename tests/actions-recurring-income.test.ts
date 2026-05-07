import { describe, it, expect, beforeEach } from 'vitest'
import { setMockUser } from './_mocks/supabase'
import { mockDb, mockBuilder, queueDbResult, resetDbMocks } from './_mocks/db'
import { createRule, updateRule, pauseRule, resumeRule, softDeleteRule, confirmPending, editAndConfirmPending } from '@/actions/recurringIncome'

const VIEWER = { id: 'user-a', email: 'a@example.com' }
const GROUP = { id: 'grp-1', memberA: 'user-a', memberB: 'user-b', name: '我們家' }

beforeEach(() => {
  resetDbMocks()
  setMockUser(VIEWER)
})

describe('createRule', () => {
  it('inserts rule with computed next_occurrence and returns id', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'rule-1' }])

    const out = await createRule({
      amount: 75000,
      category: 'salary',
      recipientId: 'user-a',
      intervalMonths: 1,
      dayOfMonth: 25,
      startsOn: '2026-05-07',  // today; first anchor → 2026-05-25
      endsOn: null,
      source: '公司 A 月薪',
      assetId: null,
    })

    expect(out).toEqual({ id: 'rule-1' })
    const values = mockBuilder.values.mock.calls[0][0] as Record<string, unknown>
    expect(values.groupId).toBe(GROUP.id)
    expect(values.amount).toBe(75000)
    expect(values.nextOccurrenceAt).toBe('2026-05-25')
  })

  it('rejects when recipient not in viewer group', async () => {
    queueDbResult([GROUP])
    await expect(createRule({
      amount: 1, category: 'other', recipientId: 'stranger',
      intervalMonths: 1, dayOfMonth: 1, startsOn: '2026-05-07', endsOn: null,
    })).rejects.toThrow(/家計簿/)
  })

  it('rejects when assetId not in group', async () => {
    queueDbResult([GROUP])
    queueDbResult([])  // assets lookup empty
    await expect(createRule({
      amount: 1, category: 'maturity', recipientId: 'user-a',
      intervalMonths: 12, dayOfMonth: 1, startsOn: '2026-05-07', endsOn: null,
      assetId: 'asset-x',
    })).rejects.toThrow(/關聯/)
  })
})

describe('updateRule', () => {
  it('updates fields and recomputes next_occurrence_at when schedule changes', async () => {
    queueDbResult([GROUP])
    queueDbResult([{
      id: 'rule-1', groupId: GROUP.id, startsOn: '2026-05-01',
      dayOfMonth: 25, intervalMonths: 1,
    }])
    queueDbResult([{ id: 'rule-1' }])

    await updateRule({
      id: 'rule-1',
      amount: 80000,
      category: 'salary',
      recipientId: 'user-a',
      intervalMonths: 1,
      dayOfMonth: 28,
      startsOn: '2026-05-01',
      endsOn: null,
      source: null,
      assetId: null,
    })

    const setCall = mockBuilder.set.mock.calls[0][0] as Record<string, unknown>
    expect(setCall.dayOfMonth).toBe(28)
    expect(setCall.amount).toBe(80000)
    expect(setCall.nextOccurrenceAt).toBeDefined()
  })

  it('throws when rule not in viewer group', async () => {
    queueDbResult([GROUP])
    queueDbResult([])
    await expect(updateRule({
      id: 'rule-x', amount: 1, category: 'other', recipientId: 'user-a',
      intervalMonths: 1, dayOfMonth: 1, startsOn: '2026-05-01', endsOn: null,
    })).rejects.toThrow(/找不到/)
  })
})

describe('pauseRule', () => {
  it('sets paused_at on rule in viewer group', async () => {
queueDbResult([GROUP])
    queueDbResult([{ id: 'rule-1' }])
    await pauseRule('rule-1')
    const setCall = mockBuilder.set.mock.calls[0][0] as Record<string, unknown>
    expect(setCall.pausedAt).toBeInstanceOf(Date)
  })
})

describe('resumeRule', () => {
  it('clears paused_at AND snaps next_occurrence to future when in past', async () => {
queueDbResult([GROUP])
    queueDbResult([{
      id: 'rule-1', groupId: GROUP.id,
      nextOccurrenceAt: '2026-02-25',
      intervalMonths: 1, dayOfMonth: 25,
    }])
    queueDbResult([{ id: 'rule-1' }])

    await resumeRule('rule-1')

    const setCall = mockBuilder.set.mock.calls[0][0] as Record<string, unknown>
    expect(setCall.pausedAt).toBeNull()
    expect(setCall.nextOccurrenceAt).toBe('2026-05-25')
  })

  it('keeps next_occurrence when already in future', async () => {
queueDbResult([GROUP])
    queueDbResult([{
      id: 'rule-1', groupId: GROUP.id,
      nextOccurrenceAt: '2026-06-25', intervalMonths: 1, dayOfMonth: 25,
    }])
    queueDbResult([{ id: 'rule-1' }])
    await resumeRule('rule-1')
    const setCall = mockBuilder.set.mock.calls[0][0] as Record<string, unknown>
    expect(setCall.nextOccurrenceAt).toBe('2026-06-25')
  })
})

describe('softDeleteRule', () => {
  it('soft-deletes rule and hard-deletes active pendings in one transaction', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'rule-1' }])  // tx update rule .returning
    queueDbResult([])                  // tx delete pendings

    await softDeleteRule('rule-1')

    expect(mockDb.transaction).toHaveBeenCalledOnce()
    expect(mockDb.update).toHaveBeenCalled()
    expect(mockDb.delete).toHaveBeenCalled()
  })

  it('throws when rule not in viewer group', async () => {
    queueDbResult([GROUP])
    queueDbResult([])
    await expect(softDeleteRule('rule-x')).rejects.toThrow(/找不到/)
  })
})

describe('confirmPending', () => {
  it('atomically inserts IncomeTx and updates pending.resolved_tx_id', async () => {
    queueDbResult([GROUP])
    queueDbResult([{
      id: 'pend-1', groupId: GROUP.id, ruleId: 'rule-1',
      proposedAmount: 75000, proposedDate: '2026-05-25',
      recipientId: 'user-a', category: 'salary',
      source: '公司 A 月薪', assetId: null,
    }])
    queueDbResult([{ id: 'tx-1' }])     // tx insert IncomeTx
    queueDbResult([{ id: 'pend-1' }])   // tx update pending

    const out = await confirmPending('pend-1')

    expect(out).toEqual({ txId: 'tx-1' })
    expect(mockDb.transaction).toHaveBeenCalledOnce()
  })

  it('throws when pending already resolved or skipped', async () => {
    queueDbResult([GROUP])
    queueDbResult([])
    await expect(confirmPending('pend-x')).rejects.toThrow(/已被處理|找不到/)
  })
})

describe('editAndConfirmPending', () => {
  it('inserts IncomeTx with edited fields and resolves pending', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'pend-1', groupId: GROUP.id }])
    queueDbResult([{ id: 'tx-2' }])
    queueDbResult([{ id: 'pend-1' }])

    const out = await editAndConfirmPending({
      pendingId: 'pend-1',
      amount: 80000,
      category: 'salary',
      recipientId: 'user-a',
      occurredAt: '2026-05-25',
      source: '加薪後 5 月',
      assetId: null,
    })

    expect(out).toEqual({ txId: 'tx-2' })
    const insertVals = mockBuilder.values.mock.calls[0][0] as Record<string, unknown>
    expect(insertVals.amount).toBe(80000)
    expect(insertVals.source).toBe('加薪後 5 月')
  })
})
