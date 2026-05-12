import { describe, it, expect } from 'vitest'
import { computeNextPaymentDate, payCycleMonths } from '@/lib/insurance'

describe('payCycleMonths', () => {
  it('maps the four known cycles', () => {
    expect(payCycleMonths('monthly')).toBe(1)
    expect(payCycleMonths('quarterly')).toBe(3)
    expect(payCycleMonths('semi')).toBe(6)
    expect(payCycleMonths('annual')).toBe(12)
  })

  it('falls back to annual for unknown/null', () => {
    expect(payCycleMonths(null)).toBe(12)
    expect(payCycleMonths(undefined)).toBe(12)
    expect(payCycleMonths('bogus')).toBe(12)
  })
})

describe('computeNextPaymentDate', () => {
  const today = new Date(2026, 5, 1) // 2026-06-01

  it('returns null when startsAt is missing', () => {
    expect(computeNextPaymentDate(null, 'annual', 20, today)).toBeNull()
  })

  it('annual cycle: returns next anniversary after today', () => {
    // policy started 2025-03-15, annual cycle, 20 yr term
    const startsAt = new Date(2025, 2, 15)
    const next = computeNextPaymentDate(startsAt, 'annual', 20, today)!
    expect(next.getFullYear()).toBe(2027)
    expect(next.getMonth()).toBe(2)
    expect(next.getDate()).toBe(15)
  })

  it('monthly cycle: returns next month-end', () => {
    const startsAt = new Date(2025, 0, 15) // 2025-01-15, monthly
    const next = computeNextPaymentDate(startsAt, 'monthly', 5, today)!
    // From 2025-01-15 monthly: next after 2026-06-01 is 2026-06-15
    expect(next.getFullYear()).toBe(2026)
    expect(next.getMonth()).toBe(5)
    expect(next.getDate()).toBe(15)
  })

  it('returns null when term has ended', () => {
    // Started 2010-01-01, 10 yr term: ends 2020-01-01. Today=2026 → no next payment.
    const startsAt = new Date(2010, 0, 1)
    expect(computeNextPaymentDate(startsAt, 'annual', 10, today)).toBeNull()
  })

  it('treats today === payment date as already paid (returns next)', () => {
    const startsAt = new Date(2025, 5, 1) // 2025-06-01
    // Today is 2026-06-01 — an anniversary → already paid, next is 2027-06-01.
    const next = computeNextPaymentDate(startsAt, 'annual', 20, today)!
    expect(next.getFullYear()).toBe(2027)
  })

  it('clamps day when target month is shorter (Jan 31 + 1 month → Feb 28)', () => {
    const startsAt = new Date(2026, 0, 31) // 2026-01-31, monthly
    // First payment 2026-01-31, second clamps to 2026-02-28.
    const today2 = new Date(2026, 1, 1) // 2026-02-01
    const next = computeNextPaymentDate(startsAt, 'monthly', 5, today2)!
    expect(next.getFullYear()).toBe(2026)
    expect(next.getMonth()).toBe(1) // February
    expect(next.getDate()).toBe(28)
  })

  it('respects unlimited term when termYears is 0 (treats as no cap)', () => {
    const startsAt = new Date(2020, 0, 1)
    const next = computeNextPaymentDate(startsAt, 'annual', 0, today)!
    expect(next.getFullYear()).toBe(2027)
  })
})
