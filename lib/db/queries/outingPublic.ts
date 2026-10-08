import { db } from '@/lib/db/client'
import {
  oikosGroups, outings, outingParticipants, outingExpenses, outingExpenseShares, outingSettlements,
} from '@/lib/db/schema'
import { and, desc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm'
import { buildOutingView, type OutingView } from '@/lib/outing/view'
import type { OutingActor, OutingRow } from '@/lib/outing/access'
import { hashToken, isWellFormedToken } from '@/lib/outing/tokens'

/**
 * Read side of 出遊．朋友從分享連結加入 (#1558). Who may see what (PLAN-1558
 * rev 2 「Reads」):
 *   share token only        → getOutingLanding: name, status, slot list
 *                             (display name + claim state). No amounts, no
 *                             feed, no nets.
 *   participant or member   → getOutingFullView (actor from
 *                             lib/outing/access.ts › resolveReader).
 *   invalid / reset token   → null: render the invalid-link state, no content.
 *
 * Every shape here is what a client component may receive. Never add a
 * profile id, group id, epoch id, token hash or ciphertext to one: the
 * public page's RSC payload is readable by anyone holding the link.
 * Failure looks like: nothing on screen changes; the value is only visible in
 * view-source / the RSC payload.
 */

export type SlotClaimState = 'unclaimed' | 'claimed' | 'bound'

export interface OutingSlot {
  id: string
  displayName: string
  claim: SlotClaimState
}

export interface OutingLanding {
  outingId: string
  name: string
  status: OutingRow['status']
  slots: OutingSlot[]
}

function claimState(p: { profileId: string | null; claimedAt: Date | null }): SlotClaimState {
  if (p.profileId !== null) return 'bound'
  return p.claimedAt !== null ? 'claimed' : 'unclaimed'
}

/** Landing data for a share link, or null for a malformed / reset / deleted link. */
export async function getOutingLanding(shareToken: unknown): Promise<OutingLanding | null> {
  if (!isWellFormedToken(shareToken)) return null
  const [outing] = await db
    .select({ id: outings.id, name: outings.name, status: outings.status })
    .from(outings)
    .where(and(eq(outings.shareTokenHash, hashToken(shareToken)), isNull(outings.deletedAt)))
    .limit(1)
  if (!outing) return null
  const slots = await db
    .select({
      id: outingParticipants.id,
      displayName: outingParticipants.displayName,
      profileId: outingParticipants.profileId,
      claimedAt: outingParticipants.claimedAt,
    })
    .from(outingParticipants)
    .where(and(eq(outingParticipants.outingId, outing.id), isNull(outingParticipants.deactivatedAt)))
    .orderBy(outingParticipants.createdAt)
  return {
    outingId: outing.id,
    name: outing.name,
    status: outing.status,
    slots: slots.map((s) => ({ id: s.id, displayName: s.displayName, claim: claimState(s) })),
  }
}

export interface OutingFullParticipant extends OutingSlot {
  active: boolean
  net: number
}

export interface OutingFullExpense {
  id: string
  paidByParticipantId: string
  amount: number
  description: string | null
  category: string | null
  transactedAt: Date
  enteredByParticipantId: string | null
  shares: { participantId: string; shareAmount: number }[]
}

export interface OutingFullView {
  outing: { id: string; name: string; currency: string; status: OutingRow['status'] }
  /** The caller's own participant row, if any. */
  youParticipantId: string | null
  /** Members may rename / end / delete / manage the link and slots. */
  isAdmin: boolean
  participants: OutingFullParticipant[]
  expenses: OutingFullExpense[]
  settlements: { id: string; fromParticipantId: string; toParticipantId: string; amount: number }[]
  transfers: OutingView['transfers']
}

/**
 * Full view for a resolved actor (participant or member). Same data for both
 * tiers except `isAdmin`. Ended outings return the same shape; the page renders
 * it read-only.
 */
export async function getOutingFullView(outing: OutingRow, actor: OutingActor): Promise<OutingFullView> {
  const participants = await db
    .select({
      id: outingParticipants.id,
      displayName: outingParticipants.displayName,
      profileId: outingParticipants.profileId,
      claimedAt: outingParticipants.claimedAt,
      deactivatedAt: outingParticipants.deactivatedAt,
    })
    .from(outingParticipants)
    .where(eq(outingParticipants.outingId, outing.id))
    .orderBy(outingParticipants.createdAt)

  const expenseRows = await db
    .select({
      id: outingExpenses.id,
      paidByParticipantId: outingExpenses.paidByParticipantId,
      amount: outingExpenses.amount,
      description: outingExpenses.description,
      category: outingExpenses.category,
      transactedAt: outingExpenses.transactedAt,
      enteredByParticipantId: outingExpenses.enteredByParticipantId,
    })
    .from(outingExpenses)
    .where(and(eq(outingExpenses.outingId, outing.id), isNull(outingExpenses.deletedAt)))
    .orderBy(desc(outingExpenses.transactedAt))

  const shareRows = expenseRows.length
    ? await db
      .select({
        expenseId: outingExpenseShares.expenseId,
        participantId: outingExpenseShares.participantId,
        shareAmount: outingExpenseShares.shareAmount,
      })
      .from(outingExpenseShares)
      .where(inArray(outingExpenseShares.expenseId, expenseRows.map((e) => e.id)))
    : []
  const sharesOf = new Map<string, { participantId: string; shareAmount: number }[]>()
  for (const s of shareRows) {
    const arr = sharesOf.get(s.expenseId) ?? []
    arr.push({ participantId: s.participantId, shareAmount: s.shareAmount })
    sharesOf.set(s.expenseId, arr)
  }
  const expenses = expenseRows.map((e) => ({ ...e, shares: sharesOf.get(e.id) ?? [] }))

  const settlements = await db
    .select({
      id: outingSettlements.id,
      fromParticipantId: outingSettlements.fromParticipantId,
      toParticipantId: outingSettlements.toParticipantId,
      amount: outingSettlements.amount,
    })
    .from(outingSettlements)
    .where(and(eq(outingSettlements.outingId, outing.id), isNull(outingSettlements.deletedAt)))

  // No profile ids into the engine: its participants come back out in the view.
  const view = buildOutingView({
    participants: participants.map((p) => ({ id: p.id, displayName: p.displayName, profileId: null })),
    expenses,
    settlements,
    memberAParticipantId: null,
    memberBParticipantId: null,
  })
  const netOf = new Map(view.participants.map((p) => [p.id, p.net]))

  return {
    outing: { id: outing.id, name: outing.name, currency: outing.currency, status: outing.status },
    youParticipantId: actor.participantId,
    isAdmin: actor.kind === 'member',
    participants: participants.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      claim: claimState(p),
      active: p.deactivatedAt === null,
      net: netOf.get(p.id) ?? 0,
    })),
    expenses,
    settlements,
    transfers: view.transfers,
  }
}

export interface ParticipatingOutingRow {
  id: string
  name: string
  status: OutingRow['status']
  createdAt: Date
}

/**
 * 我參與的出遊: outings where `userId` is bound to an active slot but which do
 * not belong to a ledger they are a member of (those are listed under their
 * own outings already). The link goes to `/<locale>/outing/r/<id>`.
 */
export async function listParticipatingOutings(userId: string): Promise<ParticipatingOutingRow[]> {
  return db
    .select({ id: outings.id, name: outings.name, status: outings.status, createdAt: outings.createdAt })
    .from(outingParticipants)
    .innerJoin(outings, eq(outings.id, outingParticipants.outingId))
    .innerJoin(oikosGroups, eq(oikosGroups.id, outings.groupId))
    .where(and(
      eq(outingParticipants.profileId, userId),
      isNull(outingParticipants.deactivatedAt),
      isNull(outings.deletedAt),
      // Not a member of the outing's ledger. member_b may be NULL (solo):
      // `ne` alone would drop those rows (NULL <> x is NULL).
      ne(oikosGroups.memberA, userId),
      or(isNull(oikosGroups.memberB), ne(oikosGroups.memberB, userId)),
    ))
    .orderBy(sql`${outings.createdAt} DESC`)
}
