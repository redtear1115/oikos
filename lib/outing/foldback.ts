import type { OutingExpenseInput, OutingSettlementInput } from './balance'

/**
 * Inter-member debt to fold into the couple's two-person ledger.
 * Returns a delta in main-ledger convention: > 0 = member_b owes member_a.
 * Only cross terms (one member paid, the OTHER member consumed) plus direct
 * settlements between the two members count; each member's own consumption
 * is personal spending and excluded. Friends' shares never fold.
 *
 * coupleNet = Σ(member_b share | payer = member_a)
 *           − Σ(member_a share | payer = member_b)
 *           + Σ(settlement member_a → member_b)
 *           − Σ(settlement member_b → member_a)
 */
export function coupleNetFromOuting(
  memberAParticipantId: string | null,
  memberBParticipantId: string | null,
  expenses: OutingExpenseInput[],
  settlements: OutingSettlementInput[],
): number {
  if (!memberAParticipantId || !memberBParticipantId) return 0
  let net = 0

  for (const e of expenses) {
    if (e.paidByParticipantId === memberAParticipantId) {
      const bShare = e.shares.find((s) => s.participantId === memberBParticipantId)
      if (bShare) net += bShare.shareAmount
    } else if (e.paidByParticipantId === memberBParticipantId) {
      const aShare = e.shares.find((s) => s.participantId === memberAParticipantId)
      if (aShare) net -= aShare.shareAmount
    }
  }
  for (const s of settlements) {
    if (s.fromParticipantId === memberAParticipantId && s.toParticipantId === memberBParticipantId) {
      net += s.amount
    } else if (s.fromParticipantId === memberBParticipantId && s.toParticipantId === memberAParticipantId) {
      net -= s.amount
    }
  }
  return net
}
