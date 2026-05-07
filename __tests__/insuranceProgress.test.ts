import { describe, it, expect } from 'vitest'
import { computeSavingsProgress } from '@/lib/insuranceProgress'

describe('computeSavingsProgress', () => {
  it('returns zero/null fields when nothing is set', () => {
    const p = computeSavingsProgress({
      premiumTotal: 0,
      returnTotal: 0,
      annualPremium: null,
      termYears: null,
      expectedMaturity: null,
      startsAt: null,
      endsAt: null,
    })
    expect(p.premiumTotal).toBe(0)
    expect(p.returnTotal).toBe(0)
    expect(p.expectedTotalPayment).toBeNull()
    expect(p.expectedMaturity).toBeNull()
    expect(p.estimatedRemaining).toBeNull()
    expect(p.payProgress).toBeNull()
    expect(p.returnProgress).toBeNull()
    expect(p.timeProgress).toBeNull()
    expect(p.payRatio).toBeNull()
    expect(p.returnRatio).toBeNull()
    expect(p.daysToMaturity).toBeNull()
    expect(p.yearsLeft).toBeNull()
    expect(p.isMatured).toBe(false)
    expect(p.isMaturingSoon).toBe(false)
    expect(p.hasOverpaid).toBe(false)
    expect(p.hasOverReceived).toBe(false)
    expect(p.awaitingMaturity).toBe(false)
  })

  it('computes pay progress from annualPremium × termYears', () => {
    const p = computeSavingsProgress({
      premiumTotal: 200_000,
      returnTotal: 0,
      annualPremium: 100_000,
      termYears: 5,
      expectedMaturity: null,
      startsAt: null,
      endsAt: null,
    })
    expect(p.expectedTotalPayment).toBe(500_000)
    expect(p.payProgress).toBeCloseTo(0.4)
    expect(p.payRatio).toBeCloseTo(0.4)
    expect(p.hasOverpaid).toBe(false)
  })

  it('caps payProgress at 1 but keeps raw payRatio when overpaid', () => {
    const p = computeSavingsProgress({
      premiumTotal: 600_000,
      returnTotal: 0,
      annualPremium: 100_000,
      termYears: 5,
      expectedMaturity: null,
      startsAt: null,
      endsAt: null,
    })
    expect(p.payProgress).toBe(1)
    expect(p.payRatio).toBeCloseTo(1.2)
    expect(p.hasOverpaid).toBe(true)
  })

  it('computes return progress + estimatedRemaining from expectedMaturity', () => {
    const p = computeSavingsProgress({
      premiumTotal: 0,
      returnTotal: 50_000,
      annualPremium: null,
      termYears: null,
      expectedMaturity: 600_000,
      startsAt: null,
      endsAt: null,
    })
    expect(p.expectedMaturity).toBe(600_000)
    expect(p.returnProgress).toBeCloseTo(50_000 / 600_000)
    expect(p.returnRatio).toBeCloseTo(50_000 / 600_000)
    expect(p.estimatedRemaining).toBe(550_000)
    expect(p.hasOverReceived).toBe(false)
  })

  it('caps returnProgress at 1, clamps estimatedRemaining ≥ 0, flags overReceived', () => {
    const p = computeSavingsProgress({
      premiumTotal: 0,
      returnTotal: 700_000,
      annualPremium: null,
      termYears: null,
      expectedMaturity: 600_000,
      startsAt: null,
      endsAt: null,
    })
    expect(p.returnProgress).toBe(1)
    expect(p.returnRatio).toBeCloseTo(700_000 / 600_000)
    expect(p.estimatedRemaining).toBe(0)
    expect(p.hasOverReceived).toBe(true)
  })

  it('computes time progress mid-contract', () => {
    const p = computeSavingsProgress({
      premiumTotal: 0,
      returnTotal: 0,
      annualPremium: null,
      termYears: null,
      expectedMaturity: null,
      startsAt: '2024-01-01',
      endsAt: '2034-01-01',
      now: new Date('2026-01-01T00:00:00Z'),
    })
    // Approximately 2/10 of the way through
    expect(p.timeProgress).toBeCloseTo(0.2, 1)
    expect(p.yearsLeft).toBeCloseTo(8, 1)
    expect(p.daysToMaturity).toBeGreaterThan(2900)
    expect(p.daysToMaturity).toBeLessThan(2930)
    expect(p.isMatured).toBe(false)
    expect(p.isMaturingSoon).toBe(false)
  })

  it('flips isMaturingSoon within 30 days of maturity', () => {
    const p = computeSavingsProgress({
      premiumTotal: 0,
      returnTotal: 0,
      annualPremium: null,
      termYears: null,
      expectedMaturity: null,
      startsAt: '2024-01-01',
      endsAt: '2026-06-01',
      now: new Date('2026-05-15T00:00:00Z'),  // 17 days before
    })
    expect(p.isMaturingSoon).toBe(true)
    expect(p.isMatured).toBe(false)
    expect(p.daysToMaturity).toBeGreaterThan(0)
    expect(p.daysToMaturity).toBeLessThanOrEqual(30)
  })

  it('clamps timeProgress to 0 before contract starts', () => {
    const p = computeSavingsProgress({
      premiumTotal: 0,
      returnTotal: 0,
      annualPremium: null,
      termYears: null,
      expectedMaturity: null,
      startsAt: '2027-01-01',
      endsAt: '2037-01-01',
      now: new Date('2026-01-01T00:00:00Z'),
    })
    expect(p.timeProgress).toBe(0)
    expect(p.isMaturingSoon).toBe(false)
    expect(p.isMatured).toBe(false)
    expect(p.daysToMaturity).toBeGreaterThan(0)
  })

  it('flags isMatured once endsAt has passed', () => {
    const p = computeSavingsProgress({
      premiumTotal: 0,
      returnTotal: 0,
      annualPremium: null,
      termYears: null,
      expectedMaturity: null,
      startsAt: '2014-01-01',
      endsAt: '2024-01-01',
      now: new Date('2026-01-01T00:00:00Z'),
    })
    expect(p.isMatured).toBe(true)
    expect(p.isMaturingSoon).toBe(false)
    expect(p.timeProgress).toBe(1)
    expect(p.daysToMaturity).toBeLessThan(0)
    expect(p.yearsLeft).toBeLessThan(0)
  })

  it('flags awaitingMaturity when matured but returnTotal < expectedMaturity', () => {
    const p = computeSavingsProgress({
      premiumTotal: 500_000,
      returnTotal: 0,
      annualPremium: 100_000,
      termYears: 5,
      expectedMaturity: 600_000,
      startsAt: '2014-01-01',
      endsAt: '2024-01-01',
      now: new Date('2026-01-01T00:00:00Z'),
    })
    expect(p.isMatured).toBe(true)
    expect(p.awaitingMaturity).toBe(true)
  })

  it('does not flag awaitingMaturity once full expectedMaturity received', () => {
    const p = computeSavingsProgress({
      premiumTotal: 500_000,
      returnTotal: 600_000,
      annualPremium: 100_000,
      termYears: 5,
      expectedMaturity: 600_000,
      startsAt: '2014-01-01',
      endsAt: '2024-01-01',
      now: new Date('2026-01-01T00:00:00Z'),
    })
    expect(p.isMatured).toBe(true)
    expect(p.awaitingMaturity).toBe(false)
  })

  it('does not flag awaitingMaturity when expectedMaturity is null', () => {
    const p = computeSavingsProgress({
      premiumTotal: 500_000,
      returnTotal: 0,
      annualPremium: 100_000,
      termYears: 5,
      expectedMaturity: null,
      startsAt: '2014-01-01',
      endsAt: '2024-01-01',
      now: new Date('2026-01-01T00:00:00Z'),
    })
    expect(p.isMatured).toBe(true)
    expect(p.awaitingMaturity).toBe(false)
  })

  it('does not flag hasOverpaid within 5% tolerance', () => {
    const p = computeSavingsProgress({
      premiumTotal: 520_000,  // 4% over expected 500k
      returnTotal: 0,
      annualPremium: 100_000,
      termYears: 5,
      expectedMaturity: null,
      startsAt: null,
      endsAt: null,
    })
    expect(p.hasOverpaid).toBe(false)
  })

  it('does not flag hasOverReceived within 5% tolerance', () => {
    const p = computeSavingsProgress({
      premiumTotal: 0,
      returnTotal: 624_000,  // 4% over expected 600k
      annualPremium: null,
      termYears: null,
      expectedMaturity: 600_000,
      startsAt: null,
      endsAt: null,
    })
    expect(p.hasOverReceived).toBe(false)
  })
})
