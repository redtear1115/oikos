import { describe, it, expect } from 'vitest'
import { groupByMonth, monthLabel } from '@/lib/groupByMonth'

interface T { id: string; transactedAt: string; amount: number }

describe('groupByMonth', () => {
  it('returns empty array for no items', () => {
    expect(groupByMonth<T>([], (t) => t.transactedAt)).toEqual([])
  })

  it('groups items by YYYY-MM', () => {
    const items: T[] = [
      { id: 'a', transactedAt: '2026-05-02T00:00:00Z', amount: 100 },
      { id: 'b', transactedAt: '2026-05-01T00:00:00Z', amount: 200 },
      { id: 'c', transactedAt: '2026-04-30T00:00:00Z', amount: 300 },
    ]
    const groups = groupByMonth(items, (t) => t.transactedAt)
    expect(groups).toHaveLength(2)
    expect(groups[0].monthKey).toBe('2026-05')
    expect(groups[0].items.map((i) => i.id)).toEqual(['a', 'b'])
    expect(groups[1].monthKey).toBe('2026-04')
    expect(groups[1].items.map((i) => i.id)).toEqual(['c'])
  })

  it('preserves input order within each group', () => {
    const items: T[] = [
      { id: 'z', transactedAt: '2026-05-15T00:00:00Z', amount: 1 },
      { id: 'y', transactedAt: '2026-05-10T00:00:00Z', amount: 1 },
      { id: 'x', transactedAt: '2026-05-05T00:00:00Z', amount: 1 },
    ]
    const groups = groupByMonth(items, (t) => t.transactedAt)
    expect(groups[0].items.map((i) => i.id)).toEqual(['z', 'y', 'x'])
  })

  it('handles boundary day (UTC vs local TZ note)', () => {
    const items: T[] = [
      { id: 'a', transactedAt: '2026-05-01T00:00:00Z', amount: 1 },
    ]
    const groups = groupByMonth(items, (t) => t.transactedAt)
    expect(groups[0].monthKey).toBe('2026-05')
  })
})

describe('monthLabel', () => {
  it('formats YYYY-MM as Chinese month label', () => {
    expect(monthLabel('2026-05')).toBe('五月 2026')
    expect(monthLabel('2026-12')).toBe('十二月 2026')
    expect(monthLabel('2026-01')).toBe('一月 2026')
  })
})
