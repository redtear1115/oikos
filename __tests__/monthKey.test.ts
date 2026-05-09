import { describe, it, expect } from 'vitest'
import {
  monthKeyOf,
  addMonths,
  monthRangeIso,
  isMonthKey,
  clampMonthKey,
} from '@/lib/monthKey'

describe('monthKeyOf (Asia/Taipei)', () => {
  it('formats UTC dates into Taipei calendar month', () => {
    // 2026-05-31 23:50 UTC → 2026-06-01 07:50 Taipei → key '2026-06'
    expect(monthKeyOf(new Date('2026-05-31T23:50:00Z'))).toBe('2026-06')
    // 2026-06-01 00:10 UTC → 2026-06-01 08:10 Taipei → key '2026-06'
    expect(monthKeyOf(new Date('2026-06-01T00:10:00Z'))).toBe('2026-06')
    // 2026-05-31 13:00 UTC → 2026-05-31 21:00 Taipei → key '2026-05'
    expect(monthKeyOf(new Date('2026-05-31T13:00:00Z'))).toBe('2026-05')
  })
})

describe('addMonths', () => {
  it('rolls forward across year boundary', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(addMonths('2026-11', 3)).toBe('2027-02')
  })

  it('rolls backward across year boundary', () => {
    expect(addMonths('2026-01', -1)).toBe('2025-12')
    expect(addMonths('2026-02', -3)).toBe('2025-11')
  })

  it('returns the same month with delta 0', () => {
    expect(addMonths('2026-05', 0)).toBe('2026-05')
  })
})

describe('monthRangeIso', () => {
  it('returns half-open [start, nextStart) timestamps', () => {
    expect(monthRangeIso('2026-05')).toEqual({
      startIso: '2026-05-01 00:00:00',
      endIso: '2026-06-01 00:00:00',
    })
  })

  it('handles year rollover', () => {
    expect(monthRangeIso('2026-12')).toEqual({
      startIso: '2026-12-01 00:00:00',
      endIso: '2027-01-01 00:00:00',
    })
  })
})

describe('isMonthKey', () => {
  it('accepts well-formed keys', () => {
    expect(isMonthKey('2026-05')).toBe(true)
    expect(isMonthKey('1970-01')).toBe(true)
    expect(isMonthKey('2099-12')).toBe(true)
  })

  it('rejects malformed keys', () => {
    expect(isMonthKey('2026-13')).toBe(false)
    expect(isMonthKey('2026-00')).toBe(false)
    expect(isMonthKey('2026-5')).toBe(false)   // single-digit month
    expect(isMonthKey('26-05')).toBe(false)    // 2-digit year
    expect(isMonthKey('2026/05')).toBe(false)
    expect(isMonthKey(undefined)).toBe(false)
    expect(isMonthKey(null)).toBe(false)
    expect(isMonthKey(202605)).toBe(false)
  })
})

describe('clampMonthKey', () => {
  it('returns value unchanged when in range', () => {
    expect(clampMonthKey('2026-05', '2024-01', '2026-12')).toBe('2026-05')
  })

  it('clamps below min', () => {
    expect(clampMonthKey('2023-12', '2024-01', '2026-12')).toBe('2024-01')
  })

  it('clamps above max', () => {
    expect(clampMonthKey('2027-01', '2024-01', '2026-12')).toBe('2026-12')
  })
})
