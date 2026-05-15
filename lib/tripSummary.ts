import type { SplitType } from '@/lib/balance'

/**
 * v0.17.2 #42 — Trip-end summary math.
 *
 * When a trip ends, the isolated TripExpenses are folded back into the main
 * ledger as up to 2 summary CashTransactions (one per paying member). The
 * spec (docs/superpowers/specs/multi-currency-trip-design.md § "Trip 結束
 * 收斂") says "balance 計算不需任何改動 — 這 2 筆是標準 CashTransactions,
 * 由現有 lib/balance.ts 自然處理", so we compute splitRatioA on each
 * summary such that lib/balance.ts naturally produces the trip's net
 * balance delta on recalc.
 *
 * The summary's splitRatioA is rounded to an integer (0–100), which can
 * introduce ≤ 1-unit cent drift per pair of odd-amount half-split expenses
 * vs running each TripExpense through balance.ts individually. Acceptable
 * at v0.17.2's scale — documented in the PR body.
 *
 * Solo groups still get a summary (all_mine), so the trip remains visible
 * in the main feed. GroupBalance is structurally 0 in solo regardless.
 */

export interface TripExpenseForSummary {
  amount: number              // base currency integer (already converted from rate_snapshot at write)
  paidBy: string
  splitType: SplitType
  splitRatio: number | null   // payer's share %; required iff splitType='weighted'
}

export interface SummaryRecord {
  paidBy: string
  amount: number
  splitType: SplitType
  splitRatioA: number | null  // null for non-weighted
}

/**
 * Member A's share of a single expense, matching lib/balance.ts's ceil()
 * rounding convention so summary deltas line up with per-expense deltas.
 */
function aShareOf(e: TripExpenseForSummary, memberA: string): number {
  const aIsPayer = e.paidBy === memberA
  switch (e.splitType) {
    case 'all_mine':
      return aIsPayer ? e.amount : 0
    case 'all_theirs':
      return aIsPayer ? 0 : e.amount
    case 'half': {
      // Payer keeps `amount - ceil(amount/2)`; partner owes `ceil(amount/2)`.
      const partnerShare = Math.ceil(e.amount / 2)
      return aIsPayer ? e.amount - partnerShare : partnerShare
    }
    case 'weighted': {
      // splitRatio is payer's share % (TripExpense semantic). For A's share:
      //   - if A is payer:  A keeps `amount - ceil(amount × (100-splitRatio)/100)`
      //   - if A is not payer: A's share = ceil(amount × (100-splitRatio)/100)
      const splitRatio = e.splitRatio ?? 50
      const partnerShare = Math.ceil(e.amount * (100 - splitRatio) / 100)
      return aIsPayer ? e.amount - partnerShare : partnerShare
    }
  }
}

/**
 * Build up to 2 summary CashTransactions for the given trip expenses.
 *
 * Returns 0 rows if no expenses; 1 row if only one member paid; 2 rows
 * otherwise. Each summary's `splitRatioA` is rounded so that, when fed
 * into lib/balance.ts, its delta approximates the sum of that member's
 * trip expenses' deltas (small cent drift tolerated).
 */
export function buildTripSummaries(input: {
  expenses: TripExpenseForSummary[]
  memberA: string
  memberB: string | null
}): SummaryRecord[] {
  const { expenses, memberA, memberB } = input
  if (expenses.length === 0) return []

  let paidA = 0
  let paidB = 0
  let aShareInAPaid = 0
  let aShareInBPaid = 0

  for (const e of expenses) {
    const aShare = aShareOf(e, memberA)
    if (e.paidBy === memberA) {
      paidA += e.amount
      aShareInAPaid += aShare
    } else {
      paidB += e.amount
      aShareInBPaid += aShare
    }
  }

  const out: SummaryRecord[] = []

  if (paidA > 0) {
    out.push(makeSummary({
      paidBy: memberA,
      payerIsA: true,
      paidTotal: paidA,
      aShareInTotal: aShareInAPaid,
    }))
  }
  if (paidB > 0 && memberB != null) {
    out.push(makeSummary({
      paidBy: memberB,
      payerIsA: false,
      paidTotal: paidB,
      aShareInTotal: aShareInBPaid,
    }))
  }
  return out
}

/**
 * Pick the integer splitRatioA ∈ [0, 100] whose lib/balance.ts delta best
 * matches the trip's actual delta for this payer. Brute-force 101 values
 * (cheap) — picking round() naïvely can drift by up to ~amount/100 because
 * `ceil(amount × r / 100)` jumps in discrete steps that don't line up with
 * exact fractional shares.
 */
function bestRatioA(args: {
  payerIsA: boolean
  paidTotal: number
  aShareInTotal: number
}): number {
  const { payerIsA, paidTotal, aShareInTotal } = args
  // Desired summary delta magnitude (always non-negative):
  //   payerIsA  → delta = +ceil(paidTotal × (100 - ratioA) / 100)
  //               target = paidTotal - aShareInTotal  (partner's share)
  //   !payerIsA → delta = -ceil(paidTotal × ratioA / 100)
  //               target = aShareInTotal              (A's share, which A owes B)
  const target = payerIsA ? paidTotal - aShareInTotal : aShareInTotal
  let bestRatioA = 50
  let bestErr = Infinity
  for (let r = 0; r <= 100; r++) {
    const otherShare = payerIsA ? (100 - r) : r
    const d = Math.ceil((paidTotal * otherShare) / 100)
    const err = Math.abs(d - target)
    if (err < bestErr) {
      bestErr = err
      bestRatioA = r
    }
  }
  return bestRatioA
}

function makeSummary(args: {
  paidBy: string
  payerIsA: boolean
  paidTotal: number
  aShareInTotal: number
}): SummaryRecord {
  const { paidBy, payerIsA, paidTotal, aShareInTotal } = args
  const ratioA = bestRatioA(args)

  // Edge collapse: 0% or 100% A-share → no inter-member debt in this
  // summary. Encode as all_mine / all_theirs so the row reads cleanly in
  // the main ledger (avoids "weighted, ratio 100%" which would render
  // awkwardly in the UI).
  if (ratioA === 100) {
    return {
      paidBy,
      amount: paidTotal,
      splitType: payerIsA ? 'all_mine' : 'all_theirs',
      splitRatioA: null,
    }
  }
  if (ratioA === 0) {
    return {
      paidBy,
      amount: paidTotal,
      splitType: payerIsA ? 'all_theirs' : 'all_mine',
      splitRatioA: null,
    }
  }
  return {
    paidBy,
    amount: paidTotal,
    splitType: 'weighted',
    splitRatioA: ratioA,
  }
}
