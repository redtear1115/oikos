import { describe, it, expect } from 'vitest'
import { transactionDelta, computeBalance } from '@/lib/balance'

/**
 * Server-side `transactionDelta` for the `weighted` split branch. The
 * `split_ratio_a` argument here is **member A's share %** per DB schema —
 * the form-side conversion lives in `lib/splitRatio.ts` and is tested in
 * `splitRatio.test.ts`. Together they pin the full UI → DB → balance
 * pipeline.
 *
 * Convention: `transactionDelta` returns the balance delta from member A's
 * perspective. Positive = member B owes member A by that much; negative =
 * member A owes member B. `GroupBalance.balance` accumulates these.
 *
 * Ceil semantics: the payer benefits from any odd cent — `ceil(amount × X)`
 * rounds the *other* member's debt up so the payer never gets short-changed.
 */
describe('transactionDelta — weighted split', () => {
  describe('the prod-scenario amounts (#783 / PR #784)', () => {
    it('payer = A, ratioA = 90, amount = 1350 → +135 (B owes A their 10% share)', () => {
      // A keeps 90% of 1350 = 1215; A paid 1350; B owes A the 10% slice = 135.
      expect(transactionDelta({
        amount: 1350, splitType: 'weighted', payerIs: 'a', splitRatioA: 90,
      })).toBe(+135)
    })

    it('payer = B, ratioA = 90, amount = 1350 → −1215 (A owes B their 90% share)', () => {
      // ratioA = 90 means A keeps 90%; B paid 1350; A owes B 90% × 1350 = 1215.
      // Negative because the convention is "from A's perspective".
      expect(transactionDelta({
        amount: 1350, splitType: 'weighted', payerIs: 'b', splitRatioA: 90,
      })).toBe(-1215)
    })

    it('payer = A, ratioA = 10, amount = 1350 → +1215 (B owes A the bigger share)', () => {
      // ratioA = 10 means A keeps 10%; A paid 1350; B's 90% slice = 1215.
      expect(transactionDelta({
        amount: 1350, splitType: 'weighted', payerIs: 'a', splitRatioA: 10,
      })).toBe(+1215)
    })

    it('payer = B, ratioA = 10, amount = 1350 → −135 (A owes B their 10% share)', () => {
      expect(transactionDelta({
        amount: 1350, splitType: 'weighted', payerIs: 'b', splitRatioA: 10,
      })).toBe(-135)
    })
  })

  describe('standard 75/25 splits', () => {
    it('payer = A, ratioA = 75, amount = 1000 → +250 (B owes A 25%)', () => {
      expect(transactionDelta({
        amount: 1000, splitType: 'weighted', payerIs: 'a', splitRatioA: 75,
      })).toBe(+250)
    })

    it('payer = B, ratioA = 75, amount = 1000 → −750 (A owes B 75%)', () => {
      expect(transactionDelta({
        amount: 1000, splitType: 'weighted', payerIs: 'b', splitRatioA: 75,
      })).toBe(-750)
    })

    it('matches the user-reported screen-1 case: 865 × 25 → +217 (ceil(216.25))', () => {
      // Screen 1 in the bug report: "我付 865, 我 75% / 對方 25%,
      // 對方欠你 NT$217" — verifies the ceil semantic produces the same
      // 217 the form preview displays.
      expect(transactionDelta({
        amount: 865, splitType: 'weighted', payerIs: 'a', splitRatioA: 75,
      })).toBe(+217)
    })
  })

  describe('ratioA = 50 — equivalent to half', () => {
    it('weighted ratioA = 50 matches half-split for an even amount', () => {
      const weighted = transactionDelta({
        amount: 1000, splitType: 'weighted', payerIs: 'a', splitRatioA: 50,
      })
      const half = transactionDelta({
        amount: 1000, splitType: 'half', payerIs: 'a',
      })
      expect(weighted).toBe(half)
      expect(weighted).toBe(+500)
    })

    it('weighted ratioA = 50 matches half-split for an odd amount (payer benefits via ceil)', () => {
      const weighted = transactionDelta({
        amount: 999, splitType: 'weighted', payerIs: 'a', splitRatioA: 50,
      })
      const half = transactionDelta({
        amount: 999, splitType: 'half', payerIs: 'a',
      })
      expect(weighted).toBe(half)
      expect(weighted).toBe(+500) // ceil(999 × 50/100) = ceil(499.5) = 500
    })
  })

  describe('null / undefined ratioA falls back to 50/50', () => {
    it('omitted splitRatioA defaults to 50', () => {
      expect(transactionDelta({
        amount: 1000, splitType: 'weighted', payerIs: 'a',
      })).toBe(+500)
    })

    it('explicit undefined splitRatioA defaults to 50', () => {
      expect(transactionDelta({
        amount: 1000, splitType: 'weighted', payerIs: 'a', splitRatioA: undefined,
      })).toBe(+500)
    })
  })

  describe('ceil rounding — payer never gets short-changed', () => {
    it('amount = 101, ratioA = 90, payer = A → +11 (ceil(101 × 10/100) = ceil(10.1))', () => {
      // Without ceil the non-payer would owe 10.1 → truncated to 10, and
      // the payer would silently absorb the lost cent. The convention
      // rounds the debt up so the payer is whole.
      expect(transactionDelta({
        amount: 101, splitType: 'weighted', payerIs: 'a', splitRatioA: 90,
      })).toBe(+11)
    })

    it('amount = 101, ratioA = 90, payer = B → −91 (ceil(101 × 90/100) = ceil(90.9))', () => {
      expect(transactionDelta({
        amount: 101, splitType: 'weighted', payerIs: 'b', splitRatioA: 90,
      })).toBe(-91)
    })

    it('amount = 7, ratioA = 33, payer = A → +5 (ceil(7 × 67/100) = ceil(4.69))', () => {
      expect(transactionDelta({
        amount: 7, splitType: 'weighted', payerIs: 'a', splitRatioA: 33,
      })).toBe(+5)
    })
  })

  describe('edge ratios — 1 and 99', () => {
    it('ratioA = 1, payer = A, amount = 1000 → +990 (B owes 99%)', () => {
      expect(transactionDelta({
        amount: 1000, splitType: 'weighted', payerIs: 'a', splitRatioA: 1,
      })).toBe(+990)
    })

    it('ratioA = 99, payer = A, amount = 1000 → +10 (B owes 1%)', () => {
      expect(transactionDelta({
        amount: 1000, splitType: 'weighted', payerIs: 'a', splitRatioA: 99,
      })).toBe(+10)
    })

    it('ratioA = 1, payer = B, amount = 1000 → −10 (A owes 1%)', () => {
      expect(transactionDelta({
        amount: 1000, splitType: 'weighted', payerIs: 'b', splitRatioA: 1,
      })).toBe(-10)
    })

    it('ratioA = 99, payer = B, amount = 1000 → −990 (A owes 99%)', () => {
      expect(transactionDelta({
        amount: 1000, splitType: 'weighted', payerIs: 'b', splitRatioA: 99,
      })).toBe(-990)
    })
  })
})

/**
 * Cross-check the helpers via `computeBalance` so the full pipeline is
 * exercised in a single sum — guards against any future regression in
 * `transactionDelta`'s wiring into the aggregate.
 */
describe('computeBalance — weighted rows accumulate via transactionDelta', () => {
  it('cancels out a paired weighted + reverse-weighted transaction', () => {
    const net = computeBalance({
      transactions: [
        { amount: 1000, splitType: 'weighted', payerIs: 'a', splitRatioA: 75 }, // +250
        { amount: 1000, splitType: 'weighted', payerIs: 'b', splitRatioA: 25 }, // -250
      ],
      settlements: [],
    })
    expect(net).toBe(0)
  })

  it('replays the screen-2 prod data shape: B paid 1350 with the wrong angle stored', () => {
    // The bug: B intended "me 90%" → form sent splitRatioA = 90 raw,
    // which under the schema means A = 90%. After the form-side fix in
    // PR #784 + this PR, save sends toMemberAShare(90, false) = 10.
    // Before the fix, the row contributed −1215 to balance (= A owes B
    // 1215); after, it contributes the correct −135.
    const before = computeBalance({
      transactions: [{
        amount: 1350, splitType: 'weighted', payerIs: 'b', splitRatioA: 90, // pre-fix DB value
      }],
      settlements: [],
    })
    expect(before).toBe(-1215) // documented prod symptom

    const after = computeBalance({
      transactions: [{
        amount: 1350, splitType: 'weighted', payerIs: 'b', splitRatioA: 10, // post-fix DB value
      }],
      settlements: [],
    })
    expect(after).toBe(-135) // B's actual 10% partner-share that A owes
  })
})
