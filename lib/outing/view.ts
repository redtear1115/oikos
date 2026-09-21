import { computeOutingNets, type OutingExpenseInput, type OutingSettlementInput } from './balance'
import { minimalTransfers, type Transfer } from './settle'
import { coupleNetFromOuting } from './foldback'

export interface OutingViewParticipant {
  id: string
  displayName: string
  profileId: string | null
  net: number
}

export interface OutingViewInput {
  participants: { id: string; displayName: string; profileId: string | null }[]
  expenses: OutingExpenseInput[]
  settlements: OutingSettlementInput[]
  memberAParticipantId: string | null
  memberBParticipantId: string | null
}

export interface OutingView {
  participants: OutingViewParticipant[]
  transfers: Transfer[]
  coupleNet: number
}

/**
 * Compose the Phase-1 engine into a render-ready view: per-participant net,
 * minimal-transfer suggestions, and the couple inter-member fold amount.
 * Pure — accepts DB-shaped rows (see getOutingDetail), returns derived data.
 */
export function buildOutingView(input: OutingViewInput): OutingView {
  const ids = input.participants.map((p) => p.id)
  const nets = computeOutingNets(ids, input.expenses, input.settlements)
  const participants = input.participants.map((p) => ({ ...p, net: nets.get(p.id) ?? 0 }))
  const transfers = minimalTransfers(nets)
  const coupleNet = coupleNetFromOuting(
    input.memberAParticipantId,
    input.memberBParticipantId,
    input.expenses,
    input.settlements,
  )
  return { participants, transfers, coupleNet }
}
