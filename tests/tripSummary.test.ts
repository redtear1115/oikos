import { describe, it, expect } from 'vitest'
import { buildTripSummaries } from '@/lib/tripSummary'
import { transactionDelta } from '@/lib/balance'

// ─── Unit tests for the trip-end summary math ────────────────────────────
//
// Pure-function tests; no DB. Verifies that the summary records built from
// TripExpenses, when fed through lib/balance.ts, reproduce (within ≤ 1-unit
// rounding) the trip's net balance delta computed expense-by-expense.
// ──────────────────────────────────────────────────────────────────────────

const A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

function summaryDelta(s: {
  paidBy: string
  amount: number
  splitType: 'all_mine' | 'all_theirs' | 'half' | 'weighted'
  splitRatioA: number | null
}, memberA: string): number {
  return transactionDelta({
    amount: s.amount,
    splitType: s.splitType,
    payerIs: s.paidBy === memberA ? 'a' : 'b',
    splitRatioA: s.splitRatioA ?? undefined,
  })
}

function expenseDelta(e: {
  amount: number
  paidBy: string
  splitType: 'all_mine' | 'all_theirs' | 'half' | 'weighted'
  splitRatio: number | null
}, memberA: string): number {
  const payerIs = e.paidBy === memberA ? 'a' : 'b'
  // TripExpense.splitRatio is payer's share %. CashTransaction.splitRatioA is
  // A's share %. Map between them:
  const splitRatioA = e.splitRatio == null
    ? undefined
    : payerIs === 'a'
      ? e.splitRatio
      : 100 - e.splitRatio
  return transactionDelta({
    amount: e.amount,
    splitType: e.splitType,
    payerIs,
    splitRatioA,
  })
}

describe('buildTripSummaries', () => {
  it('returns no rows for an empty trip', () => {
    expect(buildTripSummaries({ expenses: [], memberA: A, memberB: B })).toEqual([])
  })

  it('returns 1 row when only A paid (half-split)', () => {
    const summaries = buildTripSummaries({
      expenses: [
        { amount: 1000, paidBy: A, splitType: 'half', splitRatio: null },
        { amount: 500, paidBy: A, splitType: 'half', splitRatio: null },
      ],
      memberA: A,
      memberB: B,
    })
    expect(summaries).toHaveLength(1)
    expect(summaries[0].paidBy).toBe(A)
    expect(summaries[0].amount).toBe(1500)
    expect(summaries[0].splitType).toBe('weighted')
    expect(summaries[0].splitRatioA).toBe(50)
  })

  it('returns 2 rows when both members paid', () => {
    const summaries = buildTripSummaries({
      expenses: [
        { amount: 1000, paidBy: A, splitType: 'half', splitRatio: null },
        { amount: 600, paidBy: B, splitType: 'half', splitRatio: null },
      ],
      memberA: A,
      memberB: B,
    })
    expect(summaries).toHaveLength(2)
    expect(summaries[0].paidBy).toBe(A)
    expect(summaries[1].paidBy).toBe(B)
  })

  it('collapses all_mine when payer keeps everything', () => {
    const summaries = buildTripSummaries({
      expenses: [
        { amount: 800, paidBy: A, splitType: 'all_mine', splitRatio: null },
      ],
      memberA: A,
      memberB: B,
    })
    expect(summaries).toHaveLength(1)
    expect(summaries[0].splitType).toBe('all_mine')
    expect(summaries[0].splitRatioA).toBeNull()
  })

  it('collapses all_theirs when payer gives everything to partner', () => {
    const summaries = buildTripSummaries({
      expenses: [
        { amount: 800, paidBy: A, splitType: 'all_theirs', splitRatio: null },
      ],
      memberA: A,
      memberB: B,
    })
    expect(summaries).toHaveLength(1)
    expect(summaries[0].splitType).toBe('all_theirs')
    expect(summaries[0].splitRatioA).toBeNull()
  })

  it('preserves weighted splitRatioA across A as payer', () => {
    // A paid 1000 with payer's share = 70% (A keeps 700, B owes 300)
    const summaries = buildTripSummaries({
      expenses: [
        { amount: 1000, paidBy: A, splitType: 'weighted', splitRatio: 70 },
      ],
      memberA: A,
      memberB: B,
    })
    expect(summaries[0].splitType).toBe('weighted')
    expect(summaries[0].splitRatioA).toBe(70)
  })

  it('converts weighted splitRatio when B is payer (splitRatio is payer share, splitRatioA is A share)', () => {
    // B paid 1000 with payer's (B's) share = 70% → A's share = 30%
    const summaries = buildTripSummaries({
      expenses: [
        { amount: 1000, paidBy: B, splitType: 'weighted', splitRatio: 70 },
      ],
      memberA: A,
      memberB: B,
    })
    expect(summaries[0].paidBy).toBe(B)
    expect(summaries[0].splitType).toBe('weighted')
    expect(summaries[0].splitRatioA).toBe(30)
  })

  it('reproduces the per-expense net balance delta within the integer-ratioA drift bound', () => {
    const expenses = [
      { amount: 1000, paidBy: A, splitType: 'half' as const, splitRatio: null },
      { amount: 600, paidBy: B, splitType: 'half' as const, splitRatio: null },
      { amount: 200, paidBy: A, splitType: 'all_mine' as const, splitRatio: null },
      { amount: 800, paidBy: B, splitType: 'weighted' as const, splitRatio: 60 },
    ]

    const expectedDelta = expenses.reduce((sum, e) => sum + expenseDelta(e, A), 0)

    const summaries = buildTripSummaries({ expenses, memberA: A, memberB: B })
    const summaryTotal = summaries.reduce((sum, s) => sum + summaryDelta(s, A), 0)

    // Theoretical bound: integer splitRatioA can't always express the exact
    // per-payer share fraction, so each summary's delta can be off by up to
    // ~paid_M/100 (the step size between consecutive ratioA values). Total
    // drift across both summaries ≤ trip_total/100. See lib/tripSummary.ts.
    const tripTotal = expenses.reduce((s, e) => s + e.amount, 0)
    const bound = Math.ceil(tripTotal / 100) + 1
    expect(Math.abs(summaryTotal - expectedDelta)).toBeLessThanOrEqual(bound)
  })

  it('drift is 0 when all expenses share the same payer + splitType + ratio', () => {
    // No per-summary rounding loss — the consolidated record is structurally
    // identical to "one big expense" with the same parameters.
    const expenses = [
      { amount: 1000, paidBy: A, splitType: 'half' as const, splitRatio: null },
      { amount: 500, paidBy: A, splitType: 'half' as const, splitRatio: null },
    ]
    const expectedDelta = expenses.reduce((sum, e) => sum + expenseDelta(e, A), 0)
    const summaries = buildTripSummaries({ expenses, memberA: A, memberB: B })
    const summaryTotal = summaries.reduce((sum, s) => sum + summaryDelta(s, A), 0)
    expect(summaryTotal).toBe(expectedDelta)
  })

  it('produces 1 row for a solo group (memberB = null)', () => {
    const summaries = buildTripSummaries({
      expenses: [
        { amount: 1000, paidBy: A, splitType: 'all_mine', splitRatio: null },
        { amount: 500, paidBy: A, splitType: 'all_mine', splitRatio: null },
      ],
      memberA: A,
      memberB: null,
    })
    expect(summaries).toHaveLength(1)
    expect(summaries[0].paidBy).toBe(A)
    expect(summaries[0].amount).toBe(1500)
    expect(summaries[0].splitType).toBe('all_mine')
  })

  it('drops B-paid expenses when memberB is null (solo group safety)', () => {
    const summaries = buildTripSummaries({
      expenses: [
        { amount: 1000, paidBy: A, splitType: 'all_mine', splitRatio: null },
        // Pathological: paidBy=B but memberB is null. Skip B-paid rows.
        { amount: 500, paidBy: B, splitType: 'half', splitRatio: null },
      ],
      memberA: A,
      memberB: null,
    })
    expect(summaries).toHaveLength(1)
    expect(summaries[0].paidBy).toBe(A)
  })
})
