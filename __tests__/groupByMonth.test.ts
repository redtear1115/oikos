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
  it('formats YYYY-MM using Intl for zh-TW', () => {
    const fmt = (key: string) => new Intl.DateTimeFormat('zh-TW', { year: 'numeric', month: 'long' })
      .format(new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1))
    expect(monthLabel('2026-05', 'zh-TW')).toBe(fmt('2026-05'))
    expect(monthLabel('2026-12', 'zh-TW')).toBe(fmt('2026-12'))
    expect(monthLabel('2026-01', 'zh-TW')).toBe(fmt('2026-01'))
  })

  it('formats YYYY-MM using Intl for en', () => {
    expect(monthLabel('2026-05', 'en')).toBe(
      new Intl.DateTimeFormat('en', { year: 'numeric', month: 'long' }).format(new Date(2026, 4, 1))
    )
  })
})
