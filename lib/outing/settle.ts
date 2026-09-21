export interface Transfer {
  from: string
  to: string
  amount: number
}

interface Party {
  id: string
  amount: number
}

/**
 * Greedy debt simplification over a creditor-positive net vector.
 * Sort creditors and debtors largest-first (ties by id for determinism),
 * then two-pointer settle the min of the front pair each step.
 * Produces at most n−1 transfers. Assumes Σ nets === 0.
 */
export function minimalTransfers(nets: Map<string, number>): Transfer[] {
  const byAmountThenId = (x: Party, y: Party) =>
    y.amount - x.amount || (x.id < y.id ? -1 : 1)

  const creditors: Party[] = [...nets.entries()]
    .filter(([, v]) => v > 0)
    .map(([id, v]) => ({ id, amount: v }))
    .sort(byAmountThenId)
  const debtors: Party[] = [...nets.entries()]
    .filter(([, v]) => v < 0)
    .map(([id, v]) => ({ id, amount: -v }))
    .sort(byAmountThenId)

  const transfers: Transfer[] = []
  let i = 0
  let j = 0
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amount, creditors[j].amount)
    transfers.push({ from: debtors[i].id, to: creditors[j].id, amount: pay })
    debtors[i].amount -= pay
    creditors[j].amount -= pay
    if (debtors[i].amount === 0) i++
    if (creditors[j].amount === 0) j++
  }
  return transfers
}
