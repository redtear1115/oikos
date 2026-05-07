import { describe, it, expect, beforeEach } from 'vitest'
import { setMockUser } from './_mocks/supabase'
import { mockDb, mockBuilder, queueDbResult, resetDbMocks } from './_mocks/db'
import { createRule } from '@/actions/recurringIncome'

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
