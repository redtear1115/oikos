import { computeOutingNets, type OutingExpenseInput, type OutingSettlementInput } from './balance'
import { minimalTransfers, type Transfer } from './settle'
import { coupleNetFromTransfers } from './foldback'

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
  /**
   * The member<->member line this outing already folded into the couple's
   * ledger when it ended (#1635). Dropped from `transfers` in either direction.
   */
  foldedLine?: { from: string; to: string } | null
}

export interface OutingView {
  participants: OutingViewParticipant[]
  transfers: Transfer[]
  coupleNet: number
}

/**
 * Compose the Phase-1 engine into a render-ready view: per-participant net,
 * minimal-transfer suggestions, and the couple fold amount (the member<->member suggested line).
 * Pure — accepts DB-shaped rows (see getOutingDetail), returns derived data.
 */
export function buildOutingView(input: OutingViewInput): OutingView {
  const ids = input.participants.map((p) => p.id)
  const nets = computeOutingNets(ids, input.expenses, input.settlements)
  const participants = input.participants.map((p) => ({ ...p, net: nets.get(p.id) ?? 0 }))
  const all = minimalTransfers(nets)
  const coupleNet = coupleNetFromTransfers(all, input.memberAParticipantId, input.memberBParticipantId)
  const fl = input.foldedLine
  const transfers = fl
    ? all.filter((t) => !((t.from === fl.from && t.to === fl.to) || (t.from === fl.to && t.to === fl.from)))
    : all
  return { participants, transfers, coupleNet }
}
