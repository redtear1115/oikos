import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setMockUser } from './_mocks/supabase'
import { mockDb, mockBuilder, queueDbResult, resetDbMocks } from './_mocks/db'
import { createRule, updateRule, pauseRule, resumeRule, softDeleteRule, confirmPending, editAndConfirmPending, skipPending } from '@/actions/recurringIncome'

// next/headers cookies() — the actions below resolve the viewer through
// getViewerWriteContext, which reads PAST_EPOCH_COOKIE. No pin in these tests,
// so the open-epoch lookup follows the group lookup in the mock queue.
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: () => undefined, set: vi.fn(), delete: vi.fn() })),
}))

const VIEWER = { id: 'user-a', email: 'a@example.com' }
const GROUP = { id: 'grp-1', memberA: 'user-a', memberB: 'user-b', name: '我們家' }
const OPEN_EPOCH = { id: 'epoch-current', groupId: 'grp-1', startedAt: new Date('2026-01-01T00:00:00Z'), endedAt: null, memberAId: 'user-a', memberBId: 'user-b' }

// Pin "today" so date-relative logic stays deterministic regardless of the real
// calendar day. resumeRule/updateRule derive `today` from `new Date()` and snap
// past occurrences to the *next future* date (lib/recurring#snapToFuture); with
// the real clock the "snaps to future" assertion flaked on/after the 25th
// (2026-05-25 is no longer "future", so it snapped to 2026-06-25). Fake only
// Date so async db mocks keep their real microtask timing.
const FIXED_NOW = new Date('2026-05-07T12:00:00Z') // → today = 2026-05-07

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(FIXED_NOW)
  resetDbMocks()
  setMockUser(VIEWER)
})

afterEach(() => {
  vi.useRealTimers()
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

    expect(out).toEqual({ ok: true, data: { id: 'rule-1' } })
    const values = mockBuilder.values.mock.calls[0][0] as Record<string, unknown>
    expect(values.groupId).toBe(GROUP.id)
    expect(values.amount).toBe(75000)
    expect(values.nextOccurrenceAt).toBe('2026-05-25')
  })

  // #1244, mirror of the expense side: a back-dated startsOn used to leave the
  // rule showing a "下次 {date}" that had already passed.
  it('snaps a back-dated quarterly rule to the first future period of its own series', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'rule-1' }])

    await createRule({
      amount: 60000,
      category: 'salary',
      recipientId: 'user-a',
      intervalMonths: 3,
      dayOfMonth: 25,
      startsOn: '2025-11-25',
      endsOn: null,
      source: '季獎金',
      assetId: null,
    })

    // 2025-11-25 → 2026-02-25 → 2026-05-25; today is 2026-05-07, so the
    // 2026-05-25 period is the first one still ahead on the 3-month grid.
    const values = mockBuilder.values.mock.calls[0][0] as Record<string, unknown>
    expect(values.nextOccurrenceAt).toBe('2026-05-25')
    expect(values.startsOn).toBe('2025-11-25')
  })

  // Half of the create/edit asymmetry (#1244); see the updateRule counterpart
  // below. Creating "starting today, the 7th" on the 7th keeps today — the
  // form's default path seeds exactly this input.
  it('keeps an anchor that lands on today, so this period still counts', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'rule-1' }])

    await createRule({
      amount: 3000,
      category: 'other',
      recipientId: 'user-a',
      intervalMonths: 1,
      dayOfMonth: 7,
      startsOn: '2026-05-07',
      endsOn: null,
      source: '今天建立',
      assetId: null,
    })

    const values = mockBuilder.values.mock.calls[0][0] as Record<string, unknown>
    expect(values.nextOccurrenceAt).toBe('2026-05-07')
  })

  // Identical to the test above except `startsOn`, and the answer must be
  // identical too (#1244): `startsOn` says which period the series counts
  // from, not when the first card appears. updateRule counterpart below.
  it('keeps today for a back-dated series that lands on today', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'rule-1' }])

    await createRule({
      amount: 3000,
      category: 'other',
      recipientId: 'user-a',
      intervalMonths: 1,
      dayOfMonth: 7,
      startsOn: '2025-11-07',
      endsOn: null,
      source: '回填起始日',
      assetId: null,
    })

    const values = mockBuilder.values.mock.calls[0][0] as Record<string, unknown>
    expect(values.nextOccurrenceAt).toBe('2026-05-07')
  })

  it('rejects when recipient not in viewer group', async () => {
    queueDbResult([GROUP])
    expect(await createRule({
      amount: 1, category: 'other', recipientId: 'stranger',
      intervalMonths: 1, dayOfMonth: 1, startsOn: '2026-05-07', endsOn: null,
    })).toEqual({ ok: false, code: 'recipient_not_in_group' })
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
  // The other half of the create/edit asymmetry (#1244): same input as the
  // createRule test above, deliberately different answer. Editing skips today
  // because `sheet.editEffectHint` promises 改動從下一期開始套用 while the
  // user is saving. Harmonising the `>`/`>=` guards turns exactly one of this
  // pair red.
  it('still skips today when editing, unlike createRule', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'rule-1', groupId: GROUP.id }])
    queueDbResult([{ id: 'rule-1' }])

    await updateRule({
      id: 'rule-1',
      amount: 3000,
      category: 'other',
      recipientId: 'user-a',
      intervalMonths: 1,
      dayOfMonth: 7,
      startsOn: '2026-05-07',
      endsOn: null,
      source: '今天編輯',
      assetId: null,
    })

    const setCall = mockBuilder.set.mock.calls[0][0] as Record<string, unknown>
    expect(setCall.nextOccurrenceAt).toBe('2026-06-07')
  })

  // Counterpart to createRule's back-dated case: same input, still skips today.
  it('still skips today for a back-dated series that lands on today', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'rule-1', groupId: GROUP.id }])
    queueDbResult([{ id: 'rule-1' }])

    await updateRule({
      id: 'rule-1',
      amount: 3000,
      category: 'other',
      recipientId: 'user-a',
      intervalMonths: 1,
      dayOfMonth: 7,
      startsOn: '2025-11-07',
      endsOn: null,
      source: '回填起始日',
      assetId: null,
    })

    const setCall = mockBuilder.set.mock.calls[0][0] as Record<string, unknown>
    expect(setCall.nextOccurrenceAt).toBe('2026-06-07')
  })

  it('updates fields and recomputes next_occurrence_at when schedule changes', async () => {
    queueDbResult([GROUP])
    queueDbResult([{
      id: 'rule-1', groupId: GROUP.id, startsOn: '2026-05-01',
      dayOfMonth: 25, intervalMonths: 1,
    }])
    queueDbResult([{ id: 'rule-1' }])

    expect(await updateRule({
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
    })).toEqual({ ok: true, data: { id: 'rule-1' } })

    const setCall = mockBuilder.set.mock.calls[0][0] as Record<string, unknown>
    expect(setCall.dayOfMonth).toBe(28)
    expect(setCall.amount).toBe(80000)
    expect(setCall.nextOccurrenceAt).toBeDefined()
  })

  it('returns error code when rule not in viewer group', async () => {
    queueDbResult([GROUP])
    queueDbResult([])
    expect(await updateRule({
      id: 'rule-x', amount: 1, category: 'other', recipientId: 'user-a',
      intervalMonths: 1, dayOfMonth: 1, startsOn: '2026-05-01', endsOn: null,
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

  it('returns error code when rule not in viewer group', async () => {
    queueDbResult([GROUP])
    queueDbResult([])
    expect(await softDeleteRule('rule-x')).toEqual({ ok: false, code: 'recurring_rule_not_found' })
  })
})

describe('confirmPending', () => {
  it('atomically inserts IncomeTx and updates pending.resolved_tx_id', async () => {
    queueDbResult([GROUP])
    queueDbResult([OPEN_EPOCH])
    queueDbResult([{
      id: 'pend-1', groupId: GROUP.id, ruleId: 'rule-1',
      proposedAmount: 75000, proposedDate: '2026-05-25',
      recipientId: 'user-a', category: 'salary',
      source: '公司 A 月薪', assetId: null,
    }])
    queueDbResult([{ id: 'tx-1' }])     // tx insert IncomeTx
    queueDbResult([{ id: 'pend-1' }])   // tx update pending

    const out = await confirmPending('pend-1')

    expect(out).toEqual({ ok: true, data: { txId: 'tx-1' } })
    expect(mockDb.transaction).toHaveBeenCalledOnce()
  })

  it('returns error code when pending already resolved or skipped', async () => {
    queueDbResult([GROUP])
    queueDbResult([OPEN_EPOCH])
    queueDbResult([])
    expect(await confirmPending('pend-x')).toEqual({ ok: false, code: 'pending_income_not_found' })
  })
})

describe('editAndConfirmPending', () => {
  it('inserts IncomeTx with edited fields and resolves pending', async () => {
    queueDbResult([GROUP])
    queueDbResult([OPEN_EPOCH])
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

    expect(out).toEqual({ ok: true, data: { txId: 'tx-2' } })
    const insertVals = mockBuilder.values.mock.calls[0][0] as Record<string, unknown>
    expect(insertVals.amount).toBe(80000)
    expect(insertVals.source).toBe('加薪後 5 月')
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
    expect(await skipPending('pend-x')).toEqual({ ok: false, code: 'pending_income_not_found' })
  })
})
