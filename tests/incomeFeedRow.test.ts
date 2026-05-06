import { describe, it, expect } from 'vitest'
import { incomeToFeedRow } from '@/lib/incomeFeedRow'

const base = {
  id: 'abc',
  amount: 62000,
  category: 'salary',
  recipientId: 'user-1',
  occurredAt: '2026-05-01',
  createdAt: '2026-05-01T10:00:00.000Z',
  assetId: null,
  kind: 'income' as const,
}

describe('incomeToFeedRow', () => {
  it('maps source to description, falls back to empty string', () => {
    expect(incomeToFeedRow({ ...base, source: '五月薪水' }).description).toBe('五月薪水')
    expect(incomeToFeedRow({ ...base, source: null }).description).toBe('')
  })

  it('maps recipientId to paidBy', () => {
    expect(incomeToFeedRow({ ...base, source: null }).paidBy).toBe('user-1')
  })

  it('builds ISO transactedAt from occurredAt', () => {
    expect(incomeToFeedRow({ ...base, source: null }).transactedAt).toBe('2026-05-01T00:00:00.000Z')
  })

  it('always sets splitType null and fuelLogId null', () => {
    const row = incomeToFeedRow({ ...base, source: null })
    expect(row.splitType).toBeNull()
    expect(row.fuelLogId).toBeNull()
  })

  it('sets kind to income', () => {
    expect(incomeToFeedRow({ ...base, source: null }).kind).toBe('income')
  })
})
