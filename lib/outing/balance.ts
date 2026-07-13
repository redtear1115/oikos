import type { ShareAllocation } from './split'

export interface OutingExpenseInput {
  paidByParticipantId: string
  amount: number
  shares: ShareAllocation[]
}

export interface OutingSettlementInput {
  fromParticipantId: string
  toParticipantId: string
  amount: number
}

/**
 * Net position per participant (creditor-positive: net > 0 = owed money).
 * net(p) = paid(p) − ownShares(p) + sentSettlements(p) − receivedSettlements(p)
 * Every id in participantIds is present in the result (default 0).
 * Invariant: Σ nets === 0.
 */
export function computeOutingNets(
  participantIds: string[],
  expenses: OutingExpenseInput[],
  settlements: OutingSettlementInput[],
): Map<string, number> {
  const net = new Map<string, number>()
  for (const id of participantIds) net.set(id, 0)
  const add = (id: string, delta: number) => net.set(id, (net.get(id) ?? 0) + delta)

  for (const e of expenses) {
    add(e.paidByParticipantId, e.amount)
    for (const s of e.shares) add(s.participantId, -s.shareAmount)
  }
  for (const s of settlements) {
    add(s.fromParticipantId, s.amount)
    add(s.toParticipantId, -s.amount)
  }
  return net
}
