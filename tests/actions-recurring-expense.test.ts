import { describe, it, expect, beforeEach } from 'vitest'
import { setMockUser } from './_mocks/supabase'
import { mockDb, mockBuilder, queueDbResult, resetDbMocks } from './_mocks/db'
import {
  createRule,
  updateRule,
  pauseRule,
  resumeRule,
  softDeleteRule,
  confirmPending,
  editAndConfirmPending,
  skipPending,
} from '@/actions/recurringExpense'

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
      amount: 25000,
      category: 'housing',
      paidBy: 'user-a',
      splitType: 'half',
      description: '房租',
      intervalMonths: 1,
      dayOfMonth: 1,
      startsOn: '2026-05-07',  // first anchor → 2026-06-01 (May 1 already passed)
      endsOn: null,
      assetId: null,
    })

    expect(out).toEqual({ ok: true, data: { id: 'rule-1' } })
    const values = mockBuilder.values.mock.calls[0][0] as Record<string, unknown>
    expect(values.groupId).toBe(GROUP.id)
    expect(values.amount).toBe(25000)
    expect(values.paidBy).toBe('user-a')
    expect(values.splitType).toBe('half')
    expect(values.description).toBe('房租')
    expect(values.nextOccurrenceAt).toBe('2026-06-01')
  })

  it('rejects when paidBy not in viewer group', async () => {
    queueDbResult([GROUP])
    expect(await createRule({
      amount: 1000, category: 'other', paidBy: 'stranger', splitType: 'half',
      description: 'x', intervalMonths: 1, dayOfMonth: 1,
      startsOn: '2026-05-07', endsOn: null,
    })).toEqual({ ok: false, code: 'payer_not_in_group' })
  })

  it('rejects when settle category provided', async () => {
    // Validator runs before group lookup — no queue needed
    await expect(createRule({
      amount: 1000, category: 'settle', paidBy: 'user-a', splitType: 'half',
      description: 'x', intervalMonths: 1, dayOfMonth: 1,
      startsOn: '2026-05-07', endsOn: null,
    })).rejects.toThrow(/不可使用此分類/)
  })

  it('rejects when assetId not in group', async () => {
    queueDbResult([GROUP])
    queueDbResult([])  // assets lookup empty
    await expect(createRule({
      amount: 1000, category: 'housing', paidBy: 'user-a', splitType: 'half',
      description: 'x', intervalMonths: 1, dayOfMonth: 1,
      startsOn: '2026-05-07', endsOn: null,
      assetId: 'asset-x',
    })).rejects.toThrow(/關聯/)
  })
})

describe('updateRule', () => {
  it('updates fields and recomputes next_occurrence_at when schedule changes', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'rule-1', groupId: GROUP.id }])
    queueDbResult([{ id: 'rule-1' }])

    expect(await updateRule({
      id: 'rule-1',
      amount: 28000,
      category: 'housing',
      paidBy: 'user-b',
      splitType: 'half',
      description: '房租',
      intervalMonths: 1,
      dayOfMonth: 5,
      startsOn: '2026-05-01',
      endsOn: null,
      assetId: null,
    })).toEqual({ ok: true, data: { id: 'rule-1' } })

    const setCall = mockBuilder.set.mock.calls[0][0] as Record<string, unknown>
    expect(setCall.dayOfMonth).toBe(5)
    expect(setCall.amount).toBe(28000)
    expect(setCall.paidBy).toBe('user-b')
    expect(setCall.nextOccurrenceAt).toBeDefined()
  })

  it('returns error code when rule not in viewer group', async () => {
    queueDbResult([GROUP])
    queueDbResult([])
    expect(await updateRule({
      id: 'rule-x', amount: 1000, category: 'housing',
      paidBy: 'user-a', splitType: 'half', description: 'x',
      intervalMonths: 1, dayOfMonth: 1,
      startsOn: '2026-05-01', endsOn: null,
    })).toEqual({ ok: false, code: 'recurring_rule_not_found' })
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
      nextOccurrenceAt: '2026-02-01',
      intervalMonths: 1, dayOfMonth: 1,
    }])
    queueDbResult([{ id: 'rule-1' }])

    await resumeRule('rule-1')

    const setCall = mockBuilder.set.mock.calls[0][0] as Record<string, unknown>
    expect(setCall.pausedAt).toBeNull()
    // nextOccurrenceAt should be snapped to a future date past today (2026-05-09)
    const next = setCall.nextOccurrenceAt as string
    expect(next > '2026-05-09').toBe(true)
  })

  it('keeps next_occurrence when already in future', async () => {
    // computed relative to now — a hardcoded date silently expires
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() + 13)
    const futureFirst = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
    queueDbResult([GROUP])
    queueDbResult([{
      id: 'rule-1', groupId: GROUP.id,
      nextOccurrenceAt: futureFirst, intervalMonths: 1, dayOfMonth: 1,
    }])
    queueDbResult([{ id: 'rule-1' }])
    await resumeRule('rule-1')
    const setCall = mockBuilder.set.mock.calls[0][0] as Record<string, unknown>
    expect(setCall.nextOccurrenceAt).toBe(futureFirst)
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

  it('returns error code when rule not in viewer group', async () => {
    queueDbResult([GROUP])
    queueDbResult([])
    expect(await softDeleteRule('rule-x')).toEqual({ ok: false, code: 'recurring_rule_not_found' })
  })
})

describe('confirmPending', () => {
  it('atomically inserts CashTx, resolves pending, and recalcs balance', async () => {
    queueDbResult([GROUP])
    queueDbResult([{
      id: 'pend-1', groupId: GROUP.id,
      proposedAmount: 25000, proposedDate: '2026-06-01',
      proposedDescription: '房租', proposedPaidBy: 'user-a',
      proposedSplitType: 'half',
      category: 'housing', assetId: null,
    }])
    queueDbResult([{ id: 'tx-1' }])     // tx insert CashTx
    queueDbResult([{ id: 'pend-1' }])   // tx update pending

    const out = await confirmPending('pend-1')

    expect(out).toEqual({ ok: true, data: { txId: 'tx-1' } })
    expect(mockDb.transaction).toHaveBeenCalledOnce()

    // Insert payload mirrors snapshot
    const insertVals = mockBuilder.values.mock.calls[0][0] as Record<string, unknown>
    expect(insertVals.amount).toBe(25000)
    expect(insertVals.paidBy).toBe('user-a')
    expect(insertVals.splitType).toBe('half')
    expect(insertVals.description).toBe('房租')
    expect(insertVals.category).toBe('housing')

    // Balance recalc fires inside the same transaction (single execute call from
    // recalcGroupBalance's UPDATE GroupBalance ... raw SQL).
    expect(mockDb.execute).toHaveBeenCalledTimes(1)
  })

  it('returns error code when pending already resolved or skipped', async () => {
    queueDbResult([GROUP])
    queueDbResult([])
    expect(await confirmPending('pend-x')).toEqual({ ok: false, code: 'pending_expense_not_found' })
  })

  it('returns race error code when proposedPaidBy left the group', async () => {
    queueDbResult([GROUP])
    queueDbResult([{
      id: 'pend-1', groupId: GROUP.id,
      proposedAmount: 25000, proposedDate: '2026-06-01',
      proposedDescription: '房租', proposedPaidBy: 'user-ghost',
      proposedSplitType: 'half',
      category: 'housing', assetId: null,
    }])

    expect(await confirmPending('pend-1')).toEqual({ ok: false, code: 'pending_expense_partner_handled' })
    // No insert / update should have run when race-guard fired
    expect(mockDb.transaction).not.toHaveBeenCalled()
  })
})

describe('editAndConfirmPending', () => {
  it('inserts CashTx with overridden fields, resolves pending, recalcs balance', async () => {
    queueDbResult([GROUP])
    queueDbResult([{
      id: 'pend-1', groupId: GROUP.id,
      proposedAmount: 25000, proposedDate: '2026-06-01',
      proposedDescription: '房租', proposedPaidBy: 'user-a',
      proposedSplitType: 'half',
      ruleCategory: 'housing', ruleAssetId: null,
    }])
    queueDbResult([{ id: 'tx-2' }])     // tx insert CashTx
    queueDbResult([{ id: 'pend-1' }])   // tx update pending

    const out = await editAndConfirmPending({
      pendingId: 'pend-1',
      overrides: {
        amount: 26000,
        description: '5 月房租（漲了）',
      },
    })

    expect(out).toEqual({ ok: true, data: { txId: 'tx-2' } })
    const insertVals = mockBuilder.values.mock.calls[0][0] as Record<string, unknown>
    expect(insertVals.amount).toBe(26000)
    expect(insertVals.description).toBe('5 月房租（漲了）')
    // Non-overridden fields fall back to snapshot
    expect(insertVals.paidBy).toBe('user-a')
    expect(insertVals.splitType).toBe('half')
    expect(insertVals.category).toBe('housing')
    // Balance recalc runs
    expect(mockDb.execute).toHaveBeenCalledTimes(1)
  })

  it('uses overridden paidBy and validates it against group', async () => {
    queueDbResult([GROUP])
    queueDbResult([{
      id: 'pend-1', groupId: GROUP.id,
      proposedAmount: 25000, proposedDate: '2026-06-01',
      proposedDescription: '房租', proposedPaidBy: 'user-a',
      proposedSplitType: 'half',
      ruleCategory: 'housing', ruleAssetId: null,
    }])

    expect(await editAndConfirmPending({
      pendingId: 'pend-1',
      overrides: { paidBy: 'stranger' },
    })).toEqual({ ok: false, code: 'payer_not_in_group' })
  })

  it('returns error code when pending already resolved or skipped', async () => {
    queueDbResult([GROUP])
    queueDbResult([])
    expect(await editAndConfirmPending({
      pendingId: 'pend-x',
      overrides: { amount: 30000 },
    })).toEqual({ ok: false, code: 'pending_expense_not_found' })
  })
})

describe('skipPending', () => {
  it('sets skipped_at on active pending in viewer group', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'pend-1' }])

    await skipPending('pend-1')
    const setCall = mockBuilder.set.mock.calls[0][0] as Record<string, unknown>
    expect(setCall.skippedAt).toBeInstanceOf(Date)
  })

  it('returns error code when already resolved or skipped', async () => {
    queueDbResult([GROUP])
    queueDbResult([])
    expect(await skipPending('pend-x')).toEqual({ ok: false, code: 'pending_expense_not_found' })
  })
})
