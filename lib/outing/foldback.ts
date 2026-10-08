import { computeOutingNets, type OutingExpenseInput, type OutingSettlementInput } from './balance'
import { minimalTransfers, type Transfer } from './settle'

/**
 * What an outing folds into the couple's two-person ledger when it ends (#1634).
 *
 * It is the member<->member line of the outing's own suggested transfers:
 * `minimalTransfers(computeOutingNets(everyone, ...))`. Friends' lines never
 * fold. If there is no such line, nothing folds.
 *
 * Why not a pairwise cross term: the outing suggests greedy transfers over
 * EVERYONE's nets, and those route friends' debts through either member. Once
 * the friends pay as suggested, everyone is already square, yet a cross term
 * still wrote a Settlement, leaving the couple's out-of-pocket off its shares
 * with no error anywhere. Folding exactly the listed line cannot double-count.
 *
 * The pairwise two-pointer settle pairs a given (debtor, creditor) at most
 * once, so there is at most one A<->B line.
 */

/** Participant ids of the two group members; null when a member has no (bound) participant. */
export function memberPidsOf(
  participants: { id: string; profileId: string | null }[],
  memberA: string | null,
  memberB: string | null,
): { a: string | null; b: string | null } {
  const pidOf = (profileId: string | null) =>
    profileId ? participants.find((p) => p.profileId === profileId)?.id ?? null : null
  return { a: pidOf(memberA), b: pidOf(memberB) }
}

/**
 * The signed fold from a set of suggested transfers, in main-ledger
 * convention: > 0 = member_b owes member_a (line B -> A of x gives +x),
 * < 0 = member_a owes member_b (line A -> B of x gives -x). Null pid gives 0.
 */
export function coupleNetFromTransfers(
  transfers: Transfer[],
  memberAParticipantId: string | null,
  memberBParticipantId: string | null,
): number {
  if (!memberAParticipantId || !memberBParticipantId) return 0
  let net = 0
  for (const t of transfers) {
    if (t.from === memberBParticipantId && t.to === memberAParticipantId) net += t.amount
    else if (t.from === memberAParticipantId && t.to === memberBParticipantId) net -= t.amount
  }
  return net
}

export function coupleNetFromOuting(
  participantIds: string[],
  memberAParticipantId: string | null,
  memberBParticipantId: string | null,
  expenses: OutingExpenseInput[],
  settlements: OutingSettlementInput[],
): number {
  if (!memberAParticipantId || !memberBParticipantId) return 0
  const nets = computeOutingNets(participantIds, expenses, settlements)
  return coupleNetFromTransfers(minimalTransfers(nets), memberAParticipantId, memberBParticipantId)
}

/**
 * The end action's input assembly as a pure function: raw rows in (as the
 * action reads them after the lock), signed fold out. Kept separate so the
 * property tests can pin it against the member page's view.
 */
export function foldNetFromRows(input: {
  participants: { id: string; profileId: string | null }[]
  memberA: string | null
  memberB: string | null
  expenseRows: { id: string; paidBy: string; amount: number }[]
  shareRows: { expenseId: string; participantId: string; shareAmount: number }[]
  settlementRows: OutingSettlementInput[]
}): number {
  const { a, b } = memberPidsOf(input.participants, input.memberA, input.memberB)
  return coupleNetFromOuting(
    input.participants.map((p) => p.id),
    a,
    b,
    input.expenseRows.map((e) => ({
      paidByParticipantId: e.paidBy,
      amount: e.amount,
      shares: input.shareRows.filter((s) => s.expenseId === e.id),
    })),
    input.settlementRows,
  )
}

/**
 * What the member page previews as "will be folded when you end": only an
 * active outing in the group's current chapter folds (the end action's
 * past-epoch rule), so anything else previews 0. A null current epoch never
 * matches a real outing epoch.
 */
export function foldPreviewFor(
  outing: { status: string; epochId: string | null },
  currentEpoch: string | null,
  coupleNet: number,
): number {
  return outing.status === 'active' && currentEpoch !== null && outing.epochId === currentEpoch ? coupleNet : 0
}
