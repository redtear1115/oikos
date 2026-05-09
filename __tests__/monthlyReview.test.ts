import { describe, expect, it } from 'vitest'
import {
  codepointLength,
  truncateCodepoints,
  parseYearMonth,
  formatYearMonth,
  previousMonth,
  nextMonth,
  isAfter,
  validateMessageBody,
  MONTHLY_REVIEW_MESSAGE_MAX_CODEPOINTS,
} from '@/lib/monthlyReview'

describe('codepointLength', () => {
  it('counts ASCII characters one-for-one', () => {
    expect(codepointLength('hello')).toBe(5)
  })

  it('counts CJK characters as 1 each', () => {
    expect(codepointLength('下個月想一起去看海')).toBe(9)
  })

  it('counts a basic emoji as 1 codepoint (handles surrogate pair)', () => {
    expect(codepointLength('🌙')).toBe(1)
    expect(codepointLength('hi 🌙')).toBe(4)
  })

  it('counts ZWJ-joined emoji as multiple codepoints (documented trade-off)', () => {
    // 👨‍👩‍👧 = man + ZWJ + woman + ZWJ + girl = 5 codepoints
    expect(codepointLength('👨‍👩‍👧')).toBeGreaterThan(1)
  })
})

describe('truncateCodepoints', () => {
  it('truncates plain ASCII', () => {
    expect(truncateCodepoints('hello world', 5)).toBe('hello')
  })

  it('preserves the first N codepoints, no surrogate split', () => {
    const text = '🌙'.repeat(10)
    const out = truncateCodepoints(text, 3)
    expect(codepointLength(out)).toBe(3)
    expect(out).toBe('🌙🌙🌙')
  })
})

describe('parseYearMonth', () => {
  it('parses YYYY-MM strings', () => {
    expect(parseYearMonth('2026-05')).toEqual({ year: 2026, month: 5 })
    expect(parseYearMonth('2026-12')).toEqual({ year: 2026, month: 12 })
  })

  it('rejects bad shapes', () => {
    expect(parseYearMonth('2026-5')).toBeNull()
    expect(parseYearMonth('2026/05')).toBeNull()
    expect(parseYearMonth('20260-05')).toBeNull()
    expect(parseYearMonth('')).toBeNull()
    expect(parseYearMonth(null)).toBeNull()
    expect(parseYearMonth(undefined)).toBeNull()
  })

  it('rejects out-of-range months', () => {
    expect(parseYearMonth('2026-00')).toBeNull()
    expect(parseYearMonth('2026-13')).toBeNull()
  })

  it('rejects out-of-range years', () => {
    expect(parseYearMonth('1999-01')).toBeNull()
    expect(parseYearMonth('3000-01')).toBeNull()
  })
})

describe('formatYearMonth', () => {
  it('zero-pads single-digit months', () => {
    expect(formatYearMonth({ year: 2026, month: 5 })).toBe('2026-05')
    expect(formatYearMonth({ year: 2026, month: 12 })).toBe('2026-12')
  })
})

describe('previousMonth / nextMonth', () => {
  it('handles year boundary on previousMonth', () => {
    expect(previousMonth({ year: 2026, month: 1 })).toEqual({ year: 2025, month: 12 })
  })

  it('handles year boundary on nextMonth', () => {
    expect(nextMonth({ year: 2026, month: 12 })).toEqual({ year: 2027, month: 1 })
  })

  it('mid-year is just ±1', () => {
    expect(previousMonth({ year: 2026, month: 6 })).toEqual({ year: 2026, month: 5 })
    expect(nextMonth({ year: 2026, month: 6 })).toEqual({ year: 2026, month: 7 })
  })
})

describe('isAfter', () => {
  it('compares by year first, then month', () => {
    expect(isAfter({ year: 2027, month: 1 }, { year: 2026, month: 12 })).toBe(true)
    expect(isAfter({ year: 2026, month: 6 }, { year: 2026, month: 5 })).toBe(true)
    expect(isAfter({ year: 2026, month: 5 }, { year: 2026, month: 5 })).toBe(false)
    expect(isAfter({ year: 2026, month: 4 }, { year: 2026, month: 5 })).toBe(false)
  })
})

describe('validateMessageBody', () => {
  it('returns trimmed body when valid', () => {
    expect(validateMessageBody('下個月想一起去看海   ')).toBe('下個月想一起去看海')
  })

  it('rejects empty / whitespace-only input', () => {
    expect(() => validateMessageBody('')).toThrow(/不能為空/)
    expect(() => validateMessageBody('    ')).toThrow(/不能為空/)
  })

  it('rejects bodies over the max codepoint limit', () => {
    const tooLong = '字'.repeat(MONTHLY_REVIEW_MESSAGE_MAX_CODEPOINTS + 1)
    expect(() => validateMessageBody(tooLong)).toThrow(/最長/)
  })

  it('accepts exactly the max codepoint limit', () => {
    const exactly = '字'.repeat(MONTHLY_REVIEW_MESSAGE_MAX_CODEPOINTS)
    expect(validateMessageBody(exactly)).toBe(exactly)
  })

  it('accepts emoji within the limit', () => {
    expect(validateMessageBody('🌙 一起 ✨')).toBe('🌙 一起 ✨')
  })
})
