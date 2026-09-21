'use server'

import { db } from '@/lib/db/client'
import {
  outings, outingParticipants, outingExpenses, outingExpenseShares, outingSettlements,
  groupEpochs, oikosGroups, profiles, settlements,
} from '@/lib/db/schema'
import { and, eq, isNull, inArray, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getViewerWriteContext } from '@/lib/actionContext'
import { action, actionError } from '@/lib/action-errors'
import { recalcGroupBalance } from '@/lib/db/queries/balance'
import { revalidateAfterTransactionMutation } from '@/lib/revalidate'
import { getTranslations } from '@/lib/i18n/t'
import { getTodayYMD } from '@/lib/today-server'
import { ymdToUTCNoon } from '@/lib/local-date'
import { splitEqual } from '@/lib/outing/split'
import { coupleNetFromOuting } from '@/lib/outing/foldback'
import {
  OUTING_PARTICIPANT_CAP,
  foldNoteName,
  foldSettlementFor,
  isUuid,
  memberParticipantName,
  normalizeCategory,
  normalizeDescription,
  normalizeOutingName,
  normalizeParticipantName,
  normalizeShareIds,
  validateOutingAmount,
} from '@/lib/outing/validate'

/**
 * 出遊 (Group Outing) actions, v1.6.0 (#943). spec:
 * docs/superpowers/specs/group-outing-design.md
 *
 * ## Who may write
 * Both members of the viewer's group, through `getViewerWriteContext()` —
 * which also rejects a viewer pinned to a past epoch. There is no anonymous
 * access in v1.6.0.
 *
 * ## Scoping (every id the client sends is untrusted)
 * - The outing is always loaded `WHERE id AND group_id = viewer's group AND
 *   deleted_at IS NULL`. Another group's outing id is indistinguishable from a
 *   missing one: `outing_not_found`.
 * - Every participant id (payer, share ids, settlement from/to) must be an
 *   active participant of THAT outing, else `outing_participant_not_found`.
 * - Member participants are created only here, from the group's member_a /
 *   member_b. Friends always get `profile_id NULL`; no action accepts a
 *   profile id from the client. Foldback finds the two members by profile_id.
 *
 * ## Locking — why a Settlement can never miss an expense
 * - Every mutation of an outing's contents runs in one transaction that first
 *   locks the outing row (`FOR SHARE`; `FOR UPDATE` when adding a participant,
 *   so two concurrent adds cannot both pass the 20-person cap) and re-checks
 *   status = 'active' under that lock.
 * - `endOuting` flips status with a conditional UPDATE, which takes the row's
 *   exclusive lock. It therefore waits for in-flight mutations to commit, and
 *   any mutation that starts afterwards sees 'ended' and is rejected. Only then
 *   does it read expenses/settlements and compute the couple net.
 * - Lock order is Outings → OikosGroups (endOuting only). leaveGroup /
 *   removePartner lock OikosGroups only and never Outings, so there is no cycle.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
type CurrencyCode = 'twd' | 'cny' | 'usd' | 'jpy'

async function currentEpochId(tx: Tx, groupId: string): Promise<string | null> {
  const [row] = await tx
    .select({ id: groupEpochs.id })
    .from(groupEpochs)
    .where(and(eq(groupEpochs.groupId, groupId), isNull(groupEpochs.endedAt)))
    .limit(1)
  return row?.id ?? null
}

/**
 * Lock the outing for a content mutation and assert it can still be written:
 * belongs to the group, not deleted, active, and in the group's current epoch.
 * An outing whose epoch has closed (a solo owner's outing after a partner
 * accepted an invite) is read-only history; it can still be ended.
 */
async function lockOutingForWrite(
  tx: Tx,
  outingId: string,
  groupId: string,
  strength: 'share' | 'update',
) {
  const [outing] = await tx
    .select({ id: outings.id, status: outings.status, epochId: outings.epochId })
    .from(outings)
    .where(and(eq(outings.id, outingId), eq(outings.groupId, groupId), isNull(outings.deletedAt)))
    .for(strength)
  if (!outing) throw actionError('outing_not_found')
  if (outing.status !== 'active') throw actionError('outing_not_active')
  if (outing.epochId !== await currentEpochId(tx, groupId)) throw actionError('outing_epoch_closed')
  return outing
}

/**
 * Lock the group row FOR SHARE (after any outing lock: the order is always
 * Outings → OikosGroups). Shared, so outing writes don't serialize against
 * each other — only against leaveGroup / removePartner / endOuting, which take
 * it FOR UPDATE.
 */
async function lockGroupShared(tx: Tx, groupId: string) {
  const [row] = await tx
    .select({ memberA: oikosGroups.memberA, memberB: oikosGroups.memberB, baseCurrency: oikosGroups.baseCurrency })
    .from(oikosGroups)
    .where(eq(oikosGroups.id, groupId))
    .for('share')
  if (!row) throw actionError('group_not_found')
  return row
}

/**
 * Reject ids that are not UUIDs before they reach Postgres: a malformed id
 * would fail the uuid cast (22P02) and surface as an unexpected error instead
 * of the "not found" it is.
 */
function assertOutingId(outingId: unknown): asserts outingId is string {
  if (!isUuid(outingId)) throw actionError('outing_not_found')
}

/** Throws unless every id is an active participant of `outingId`. */
async function assertActiveParticipants(tx: Tx, outingId: string, ids: string[]) {
  if (!ids.every(isUuid)) throw actionError('outing_participant_not_found')
  const found = await tx
    .select({ id: outingParticipants.id })
    .from(outingParticipants)
    .where(and(
      eq(outingParticipants.outingId, outingId),
      isNull(outingParticipants.deactivatedAt),
      inArray(outingParticipants.id, ids),
    ))
  if (found.length !== new Set(ids).size) throw actionError('outing_participant_not_found')
}

function revalidateOuting(outingId: string) {
  revalidatePath('/outings')
  revalidatePath(`/outings/${outingId}`)
}

export interface CreateOutingInput {
  name: string
}

/**
 * Open an outing in the current epoch. The currency is always the group's base
 * currency (v1.6.0 has no multi-currency); both group members are added as
 * participants, linked by profile id.
 */
export const createOuting = action(async (input: CreateOutingInput): Promise<{ id: string }> => {
  const { user, group } = await getViewerWriteContext()
  const name = normalizeOutingName(input?.name)
  const t = await getTranslations()

  const created = await db.transaction(async (tx) => {
    // Group row FOR SHARE: a concurrent leaveGroup / removePartner (FOR UPDATE)
    // either commits first — and we read the solo group it left — or waits for
    // this outing and then sees it through its active-outing fence. Members and
    // base currency come from the locked row, not the pre-transaction context.
    const locked = await lockGroupShared(tx, group.id)
    const memberIds = [locked.memberA, locked.memberB].filter((id): id is string => !!id)
    const memberProfiles = await tx
      .select({ id: profiles.id, displayName: profiles.displayName })
      .from(profiles)
      .where(inArray(profiles.id, memberIds))
    const nameOf = new Map(memberProfiles.map((p) => [p.id, p.displayName]))

    const epochId = await currentEpochId(tx, group.id)
    if (!epochId) throw actionError('current_epoch_not_found')

    const [outing] = await tx
      .insert(outings)
      .values({
        groupId: group.id,
        epochId,
        createdBy: user.id,
        name,
        currency: locked.baseCurrency as CurrencyCode,
        status: 'active',
      })
      .returning({ id: outings.id })

    await tx.insert(outingParticipants).values(
      memberIds.map((profileId) => ({
        outingId: outing.id,
        displayName: memberParticipantName(nameOf.get(profileId), t.outing.memberFallbackName),
        profileId,
      })),
    )
    return outing
  })

  revalidatePath('/outings')
  return { id: created.id }
})

export interface AddParticipantInput {
  outingId: string
  displayName: string
}

/** Add a friend (a name, never linked to a profile in v1.6.0). At most 20 people per outing. */
export const addOutingParticipant = action(async (input: AddParticipantInput): Promise<{ id: string }> => {
  const { group } = await getViewerWriteContext()
  assertOutingId(input?.outingId)
  const displayName = normalizeParticipantName(input?.displayName)

  const participant = await db.transaction(async (tx) => {
    // FOR UPDATE, not FOR SHARE: two concurrent adds must serialize, or both
    // would count 19 and both insert.
    await lockOutingForWrite(tx, input.outingId, group.id, 'update')
    const [{ n }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(outingParticipants)
      .where(eq(outingParticipants.outingId, input.outingId))
    if (Number(n) >= OUTING_PARTICIPANT_CAP) throw actionError('outing_participant_limit')

    const [row] = await tx
      .insert(outingParticipants)
      .values({ outingId: input.outingId, displayName, profileId: null })
      .returning({ id: outingParticipants.id })
    return row
  })

  revalidateOuting(input.outingId)
  return { id: participant.id }
})

export interface AddExpenseInput {
  outingId: string
  paidByParticipantId: string
  amount: number
  /** Who shares this expense. The server splits evenly; the client never sends amounts per person. */
  participantIds: string[]
  description?: string | null
  category?: string | null
}

export const addOutingExpense = action(async (input: AddExpenseInput): Promise<{ id: string }> => {
  const { user, group } = await getViewerWriteContext()
  assertOutingId(input?.outingId)
  const amount = validateOutingAmount(input?.amount)
  const shareIds = normalizeShareIds(input?.participantIds)
  const description = normalizeDescription(input?.description)
  const category = normalizeCategory(input?.category)
  if (typeof input.paidByParticipantId !== 'string' || !input.paidByParticipantId) {
    throw actionError('outing_participant_not_found')
  }

  const expense = await db.transaction(async (tx) => {
    await lockOutingForWrite(tx, input.outingId, group.id, 'share')
    await lockGroupShared(tx, group.id)
    await assertActiveParticipants(tx, input.outingId, [input.paidByParticipantId, ...shareIds])

    // Audit: which member entered it. Null only if the viewer somehow has no
    // participant row (e.g. joined the group after the outing was opened).
    const [enteredBy] = await tx
      .select({ id: outingParticipants.id })
      .from(outingParticipants)
      .where(and(eq(outingParticipants.outingId, input.outingId), eq(outingParticipants.profileId, user.id)))
      .limit(1)

    const [row] = await tx
      .insert(outingExpenses)
      .values({
        outingId: input.outingId,
        paidByParticipantId: input.paidByParticipantId,
        amount,
        description,
        category,
        enteredByParticipantId: enteredBy?.id ?? null,
      })
      .returning({ id: outingExpenses.id })

    await tx.insert(outingExpenseShares).values(
      splitEqual(amount, shareIds).map((s) => ({
        expenseId: row.id,
        participantId: s.participantId,
        shareAmount: s.shareAmount,
      })),
    )
    return row
  })

  revalidateOuting(input.outingId)
  return { id: expense.id }
})

export interface RecordSettlementInput {
  outingId: string
  fromParticipantId: string
  toParticipantId: string
  amount: number
}

/** A repayment between two people inside the outing. Never touches the main ledger. */
export const recordOutingSettlement = action(async (input: RecordSettlementInput): Promise<{ id: string }> => {
  const { group } = await getViewerWriteContext()
  assertOutingId(input?.outingId)
  const amount = validateOutingAmount(input?.amount)
  const { fromParticipantId: from, toParticipantId: to } = input
  if (typeof from !== 'string' || typeof to !== 'string' || !from || !to) {
    throw actionError('outing_participant_not_found')
  }
  if (from === to) throw actionError('outing_settlement_same_party')

  const settlement = await db.transaction(async (tx) => {
    await lockOutingForWrite(tx, input.outingId, group.id, 'share')
    await assertActiveParticipants(tx, input.outingId, [from, to])
    const [row] = await tx
      .insert(outingSettlements)
      .values({ outingId: input.outingId, fromParticipantId: from, toParticipantId: to, amount })
      .returning({ id: outingSettlements.id })
    return row
  })

  revalidateOuting(input.outingId)
  return { id: settlement.id }
})

/**
 * End the outing. If it belongs to the group's current epoch, the couple's
 * mutual debt folds into the main ledger as ONE ordinary Settlement (note
 * 「出遊『{name}』結算」) and GroupBalance is recalculated — in the same
 * transaction as the status change. Friends' shares never touch the main
 * ledger.
 *
 * An outing whose epoch has closed ends WITHOUT folding. Duo epochs close only
 * through leaveGroup / removePartner, which refuse while an outing is active,
 * so this path is reached by a solo owner's outing after an invite is accepted
 * (member_b was null → net 0 anyway) or by account deletion.
 *
 * Idempotent: the conditional UPDATE matches only an active, unfolded outing;
 * a second call gets `outing_not_active` and writes nothing.
 */
export const endOuting = action(async (input: { outingId: string }): Promise<{ folded: boolean }> => {
  const { group } = await getViewerWriteContext()
  assertOutingId(input?.outingId)
  const t = await getTranslations()
  const todayYMD = await getTodayYMD()
  const now = new Date()

  const result = await db.transaction(async (tx) => {
    // 1. Outing row lock (exclusive) + status flip. Waits for any in-flight
    //    FOR SHARE mutation; later mutations see 'ended'.
    const [ended] = await tx
      .update(outings)
      .set({ status: 'ended', endedAt: now, foldedAt: now })
      .where(and(
        eq(outings.id, input.outingId),
        eq(outings.groupId, group.id),
        eq(outings.status, 'active'),
        isNull(outings.foldedAt),
        isNull(outings.deletedAt),
      ))
      .returning({ id: outings.id, name: outings.name, epochId: outings.epochId, currency: outings.currency })
    if (!ended) {
      const [exists] = await tx
        .select({ id: outings.id })
        .from(outings)
        .where(and(eq(outings.id, input.outingId), eq(outings.groupId, group.id), isNull(outings.deletedAt)))
        .limit(1)
      throw actionError(exists ? 'outing_not_active' : 'outing_not_found')
    }

    // 2. Group row lock, then read the members fresh — not from the viewer
    //    context resolved before the transaction.
    const [locked] = await tx
      .select({ memberA: oikosGroups.memberA, memberB: oikosGroups.memberB, baseCurrency: oikosGroups.baseCurrency })
      .from(oikosGroups)
      .where(eq(oikosGroups.id, group.id))
      .for('update')

    // 3. Past epoch → terminal, no fold.
    if (ended.epochId !== await currentEpochId(tx, group.id)) return { folded: false }

    // 4. Net from rows read AFTER the lock.
    const participants = await tx
      .select({ id: outingParticipants.id, profileId: outingParticipants.profileId })
      .from(outingParticipants)
      .where(eq(outingParticipants.outingId, ended.id))
    const pidOf = (profileId: string | null) =>
      profileId ? participants.find((p) => p.profileId === profileId)?.id ?? null : null

    const expenseRows = await tx
      .select({ id: outingExpenses.id, paidBy: outingExpenses.paidByParticipantId, amount: outingExpenses.amount })
      .from(outingExpenses)
      .where(and(eq(outingExpenses.outingId, ended.id), isNull(outingExpenses.deletedAt)))
    const shareRows = expenseRows.length
      ? await tx
        .select({
          expenseId: outingExpenseShares.expenseId,
          participantId: outingExpenseShares.participantId,
          shareAmount: outingExpenseShares.shareAmount,
        })
        .from(outingExpenseShares)
        .where(inArray(outingExpenseShares.expenseId, expenseRows.map((e) => e.id)))
      : []
    const settlementRows = await tx
      .select({
        fromParticipantId: outingSettlements.fromParticipantId,
        toParticipantId: outingSettlements.toParticipantId,
        amount: outingSettlements.amount,
      })
      .from(outingSettlements)
      .where(and(eq(outingSettlements.outingId, ended.id), isNull(outingSettlements.deletedAt)))

    const net = coupleNetFromOuting(
      pidOf(locked.memberA),
      pidOf(locked.memberB),
      expenseRows.map((e) => ({
        paidByParticipantId: e.paidBy,
        amount: e.amount,
        shares: shareRows.filter((s) => s.expenseId === e.id),
      })),
      settlementRows,
    )

    const fold = foldSettlementFor(net, locked.memberA, locked.memberB)
    if (!fold) return { folded: false }

    // The outing's integers are in the currency it was opened with; the
    // Settlement is read in today's base currency. setBaseCurrency refuses while
    // an outing is active (currentEpochHasRecords), but a base change racing
    // createOuting can still slip through. Refuse rather than fold NT$1500 as
    // ¥1500 — and rather than end without folding, which would silently drop a
    // real debt. Throwing rolls back the status flip: the outing stays active,
    // and the couple can switch the currency back or delete the outing.
    if (ended.currency !== locked.baseCurrency) throw actionError('outing_currency_changed')

    await tx.insert(settlements).values({
      groupId: group.id,
      paidBy: fold.paidBy,
      amount: fold.amount,
      note: t.outing.foldSettlementNote.replace('{name}', foldNoteName(ended.name)),
      settledAt: ymdToUTCNoon(todayYMD),
    })
    await recalcGroupBalance(group.id, tx)
    return { folded: true }
  })

  revalidateOuting(input.outingId)
  if (result.folded) revalidateAfterTransactionMutation()
  return result
})

/**
 * Soft-delete an outing, active or ended. Deleting an ended outing does NOT
 * undo its fold: that Settlement is an ordinary main-ledger row, deletable on
 * its own like any other, and GroupBalance does not move here.
 */
export const softDeleteOuting = action(async (input: { outingId: string }): Promise<void> => {
  const { group } = await getViewerWriteContext()
  assertOutingId(input?.outingId)
  const [row] = await db
    .update(outings)
    .set({ deletedAt: new Date() })
    .where(and(eq(outings.id, input.outingId), eq(outings.groupId, group.id), isNull(outings.deletedAt)))
    .returning({ id: outings.id })
  if (!row) throw actionError('outing_not_found')
  revalidatePath('/outings')
})
