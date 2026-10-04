import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import {
  formatDateRelative,
  formatDateFull,
  formatDateAbsolute,
  formatDateShort,
  formatMonthShort,
  formatPickerSubtitle,
} from '@/lib/format-date'

const FIXED_NOW = new Date(2026, 4, 14, 10, 0, 0)  // May 14 2026, local

beforeAll(() => {
  vi.useFakeTimers()
  vi.setSystemTime(FIXED_NOW)
})
afterAll(() => {
  vi.useRealTimers()
})

describe('formatDateRelative — records list', () => {
  it.each([
    ['zh-TW', '2026-05-14', '今天'],
    ['zh-TW', '2026-05-13', '昨天'],
    ['zh-CN', '2026-05-14', '今天'],
    ['en',    '2026-05-14', 'today'],
    ['en',    '2026-05-13', 'yesterday'],
    ['ja',    '2026-05-14', '今日'],
    ['ja',    '2026-05-13', '昨日'],
  ])('%s diff 0 / -1 → %s', (loc, iso, expected) => {
    expect(formatDateRelative(iso, loc, '2026-05-14')).toBe(expected)
  })

  it('>30 days (same year) → short date without year', () => {
    expect(formatDateRelative('2026-01-01', 'en', '2026-05-14')).toBe('Jan 1')
    expect(formatDateRelative('2026-01-01', 'zh-TW', '2026-05-14')).toBe('1月1日')
  })

  it('different year → short date with year', () => {
    expect(formatDateRelative('2025-12-25', 'en', '2026-05-14')).toBe('Dec 25, 2025')
    expect(formatDateRelative('2025-12-25', 'zh-TW', '2026-05-14')).toBe('2025年12月25日')
  })
})

describe('formatDateFull — detail pages with weekday', () => {
  it('CJK locales wrap weekday in fullwidth parens', () => {
    expect(formatDateFull('2026-05-13', 'zh-TW')).toBe('2026年5月13日（週三）')
    expect(formatDateFull('2026-05-13', 'zh-CN')).toBe('2026年5月13日（周三）')
    expect(formatDateFull('2026-05-13', 'ja')).toBe('2026年5月13日（水）')
  })

  it('en uses halfwidth parens', () => {
    expect(formatDateFull('2026-05-13', 'en')).toBe('May 13, 2026 (Wed)')
  })
})

describe('formatDateAbsolute — forms / created_at', () => {
  it('full date without weekday', () => {
    expect(formatDateAbsolute('2026-05-13', 'zh-TW')).toBe('2026年5月13日')
    expect(formatDateAbsolute('2026-05-13', 'en')).toBe('May 13, 2026')
  })
})

describe('formatDateShort — charts / compact', () => {
  it('omits year by default', () => {
    expect(formatDateShort('2026-05-13', 'zh-TW')).toBe('5月13日')
    expect(formatDateShort('2026-05-13', 'en')).toBe('May 13')
  })

  it('includes year when asked', () => {
    expect(formatDateShort('2026-05-13', 'zh-TW', { withYear: true })).toBe('2026年5月13日')
    expect(formatDateShort('2026-05-13', 'en', { withYear: true })).toBe('May 13, 2026')
  })
})

describe('formatMonthShort — month-only axis', () => {
  it.each([
    ['zh-TW', '5月'],
    ['zh-CN', '5月'],
    ['en',    'May'],
    ['ja',    '5月'],
  ])('%s → %s', (loc, expected) => {
    expect(formatMonthShort('2026-05-13', loc)).toBe(expected)
  })
})

describe('formatPickerSubtitle — date picker subtitle', () => {
  it('today returns relative "today" label per locale', () => {
    expect(formatPickerSubtitle('2026-05-14', 'zh-TW', '2026-05-14')).toBe('今天')
    expect(formatPickerSubtitle('2026-05-14', 'en', '2026-05-14')).toBe('today')
    expect(formatPickerSubtitle('2026-05-14', 'ja', '2026-05-14')).toBe('今日')
  })

  it('non-today returns short weekday', () => {
    expect(formatPickerSubtitle('2026-05-13', 'zh-TW', '2026-05-14')).toBe('週三')
    expect(formatPickerSubtitle('2026-05-13', 'en', '2026-05-14')).toBe('Wed')
  })
})

describe('relative day labels — pinned per locale (#1515)', () => {
  it.each([
    ['zh-TW', ['今天', '昨天', '3 天前', '12 天前']],
    ['zh-CN', ['今天', '昨天', '3 天前', '12 天前']],
    ['en',    ['today', 'yesterday', '3 days ago', '12 days ago']],
    ['ja',    ['今日', '昨日', '3 日前', '12 日前']],
  ])('%s: today / yesterday / N days ago', (loc, [t0, t1, t3, t12]) => {
    expect(formatDateRelative('2026-05-14', loc, '2026-05-14')).toBe(t0)
    expect(formatDateRelative('2026-05-13', loc, '2026-05-14')).toBe(t1)
    expect(formatDateRelative('2026-05-11', loc, '2026-05-14')).toBe(t3)
    expect(formatDateRelative('2026-05-02', loc, '2026-05-14')).toBe(t12)
  })

  it('future dates fall through to the short absolute date (cut-off unchanged)', () => {
    expect(formatDateRelative('2026-05-15', 'en', '2026-05-14')).toBe('May 15')
    expect(formatDateRelative('2026-05-15', 'zh-TW', '2026-05-14')).toBe('5月15日')
  })
})

describe('relative day labels — engine-independent (#1515)', () => {
  const realRTF = Intl.RelativeTimeFormat
  const stub = (out: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(Intl as any).RelativeTimeFormat = class { format() { return out } }
  }
  afterAll(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(Intl as any).RelativeTimeFormat = realRTF
  })

  it.each([
    ['zh-TW', ['12 天前', '12天前', '12\u00a0天前', '12\u202f天前'], '12 天前'],
    ['zh-CN', ['12 天前', '12天前'], '12 天前'],
    ['ja',    ['12 日前', '12日前'], '12 日前'],
    ['en',    ['12 days ago', '12\u00a0days ago', '12\u202fdays ago'], '12 days ago'],
  ])('%s: spaced / unspaced engine output → one string', (loc, variants, expected) => {
    for (const v of variants) {
      stub(v)
      expect(formatDateRelative('2026-05-02', loc, '2026-05-14')).toBe(expected)
    }
  })
})
