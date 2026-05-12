export type SplitType = 'all_mine' | 'all_theirs' | 'half' | 'weighted'
export type PayerIs = 'a' | 'b'

export interface TxDelta {
  amount: number
  splitType: SplitType
  payerIs: PayerIs
  splitRatioA?: number   // 1–99; required when splitType = 'weighted', ignored otherwise
}

export interface SettlementDelta {
  amount: number
  payerIs: PayerIs
}

/**
 * Delta to "balance" (member_a's perspective).
 * Positive = member_b owes member_a. Negative = member_a owes member_b.
 * `half` uses ceil(amount/2) so payer benefits from odd cents.
 * `weighted` uses ceil(amount * (100 - ratioA) / 100) for payer=a, ceil(amount * ratioA / 100) for payer=b.
 */
export function transactionDelta({ amount, splitType, payerIs, splitRatioA }: TxDelta): number {
  if (splitType === 'all_mine') return 0
  let owedToPayer: number
  if (splitType === 'weighted') {
    const ratioA = splitRatioA ?? 50
    owedToPayer = payerIs === 'a'
      ? Math.ceil(amount * (100 - ratioA) / 100)
      : Math.ceil(amount * ratioA / 100)
  } else {
    owedToPayer = splitType === 'all_theirs' ? amount : Math.ceil(amount / 2)
  }
  return payerIs === 'a' ? owedToPayer : -owedToPayer
}

/**
 * Settlement delta. `paid_by` is the actual cash sender.
 *
 * Convention: balance > 0 = member_b owes member_a.
 *
 * A pays B (paid_by=A): cash flows A → B. B is now in deficit by `amount` to A,
 *   so balance += amount.
 * B pays A (paid_by=B): cash flows B → A. A is now in deficit by `amount` to B,
 *   so balance −= amount.
 *
 * Net effect: a settlement that pays down existing debt drives balance toward 0.
 */
export function settlementDelta({ amount, payerIs }: SettlementDelta): number {
  return payerIs === 'a' ? amount : -amount
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

export type TxStatus = 'settled' | 'pending'

export interface TxDeltaWithStatus extends TxDelta {
  status: TxStatus
}

/**
 * Balance display mode (issue #164).
 *   - 'settled'         : v1 behaviour. Only `status='settled'` rows count.
 *                         GroupBalance.balance is cached against this view.
 *   - 'include-pending' : "after-settle" view. Pending rows (e.g. credit-card
 *                         charges not yet billed) participate in the formula.
 *
 * Settlements have no status — they always count in both modes.
 */
export type BalanceMode = 'settled' | 'include-pending'

export function computeBalanceWithMode(input: {
  transactions: TxDeltaWithStatus[]
  settlements: SettlementDelta[]
  mode: BalanceMode
}): number {
  let net = 0
  for (const t of input.transactions) {
    if (input.mode === 'settled' && t.status !== 'settled') continue
    net += transactionDelta(t)
  }
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
