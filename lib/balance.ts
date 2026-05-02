export type SplitType = 'all_mine' | 'all_theirs' | 'half'
export type PayerIs = 'a' | 'b'

export interface TxDelta {
  amount: number
  splitType: SplitType
  payerIs: PayerIs
}

export interface SettlementDelta {
  amount: number
  payerIs: PayerIs
}

/**
 * Delta to "balance" (member_a's perspective).
 * Positive = member_b owes member_a. Negative = member_a owes member_b.
 * `half` uses ceil(amount/2) so payer benefits from odd cents.
 */
export function transactionDelta({ amount, splitType, payerIs }: TxDelta): number {
  if (splitType === 'all_mine') return 0
  const owedToPayer = splitType === 'all_theirs' ? amount : Math.ceil(amount / 2)
  return payerIs === 'a' ? owedToPayer : -owedToPayer
}

/**
 * Settlement delta. The payer is paying down what they owe.
 * A pays B → A's debt decreases → balance moves negative.
 * B pays A → B's debt decreases → balance moves positive.
 */
export function settlementDelta({ amount, payerIs }: SettlementDelta): number {
  return payerIs === 'a' ? -amount : amount
}

export function computeBalance(input: {
  transactions: TxDelta[]
  settlements: SettlementDelta[]
}): number {
  let net = 0
  for (const t of input.transactions) net += transactionDelta(t)
  for (const s of input.settlements) net += settlementDelta(s)
  return net
}

/**
 * Flip raw balance to viewer perspective.
 * Returns positive if `viewerIsA` and balance > 0 (you are owed),
 * or `!viewerIsA` and balance < 0 (you are owed by a).
 */
export function viewerBalance(rawBalance: number, viewerIsA: boolean): number {
  return viewerIsA ? rawBalance : -rawBalance
}
