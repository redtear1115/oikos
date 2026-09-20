// #1339 — the 愛物 list card and the 愛物 detail page showed two different ages
// for the same birthday. The list used `computeAge` (local-date arithmetic,
// future-date guard); the detail page's `AgeDisplay` had its own inline version
// that parsed `new Date(birth)` as UTC and had no guard at all.
//
// Failure looks like: nothing throws. A due date typed in before the birth —
// the single most common thing a parent does with the 孩子 type — reads as
// 「-1 歲」 on the detail page while the list correctly shows no age; and on
// the days around a month boundary the two surfaces disagree by one month.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { computeAge } from '@/lib/age'

// Fixed "today" so every expectation below is a literal, not a computation.
// Local-midnight construction on purpose: `computeAge` reads local calendar
// fields, which is the whole point of the fix.
const TODAY = new Date(2026, 8, 20, 10, 30) // 2026-09-20, local

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(TODAY)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('computeAge (#1339)', () => {
  it('returns null for a birthday in the future — a due date has no age yet', () => {
    expect(computeAge('2027-01-01')).toBeNull()
  })

  it('returns null for the day after today, not a negative year', () => {
    expect(computeAge('2026-09-21')).toBeNull()
  })

  it('returns 0 years 0 months on the birthday itself', () => {
    expect(computeAge('2026-09-20')).toEqual({ years: 0, months: 0 })
  })

  it('counts a pet born 2025-09-25 as 11 months on 2026-09-20 — not 1 year', () => {
    // The month boundary from the issue: day-of-month 25 has not come round
    // yet this month, so the 12th month is still incomplete.
    expect(computeAge('2025-09-25')).toEqual({ years: 0, months: 11 })
  })

  it('counts a child born 2024-03-15 as 2 years 6 months', () => {
    expect(computeAge('2024-03-15')).toEqual({ years: 2, months: 6 })
  })

  it('borrows a year when the anniversary month has not been reached', () => {
    expect(computeAge('2024-12-01')).toEqual({ years: 1, months: 9 })
  })

  it('returns null for missing or malformed input', () => {
    expect(computeAge(null)).toBeNull()
    expect(computeAge(undefined)).toBeNull()
    expect(computeAge('')).toBeNull()
    expect(computeAge('2024-13-01')).toBeNull()
    expect(computeAge('2024-01-99')).toBeNull()
  })

  it('reads the birthday as a LOCAL calendar date, not UTC', () => {
    // The old detail-page implementation did `new Date('2026-09-01')`, which
    // parses as UTC midnight — 2026-08-31 in any timezone west of UTC, and an
    // hour into the previous day for anyone east of it at the wrong moment.
    // Local parsing keeps the answer the same as the list card's.
    expect(computeAge('2026-09-01')).toEqual({ years: 0, months: 0 })
    expect(computeAge('2025-09-01')).toEqual({ years: 1, months: 0 })
  })
})
