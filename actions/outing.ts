'use server'

import { cookies } from 'next/headers'
import { db } from '@/lib/db/client'
import {
  outings, outingParticipants, outingExpenses, outingExpenseShares, outingSettlements,
  oikosGroups, profiles, settlements,
} from '@/lib/db/schema'
import { and, eq, isNull, isNotNull, inArray, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getViewerWriteContext } from '@/lib/actionContext'
import { action, actionError } from '@/lib/action-errors'
import { recalcGroupBalance } from '@/lib/db/queries/balance'
import { revalidateAfterTransactionMutation } from '@/lib/revalidate'
import { getTranslations } from '@/lib/i18n/t'
import { getTodayYMD } from '@/lib/today-server'
import { ymdToUTCNoon } from '@/lib/local-date'
import { splitEqual } from '@/lib/outing/split'
import { minorToWhole } from '@/lib/currency'
import { foldLineFromRows, foldNetFromRows } from '@/lib/outing/foldback'
import {
  type OutingActor,
  claimCookieName,
  claimCookieOptions,
  currentEpochId,
  getSessionUserId,
  loadOuting,
  lockForAdmin,
  lockForContentWrite,
  readClaimToken,
  requestActorInputs,
  resolveActor,
} from '@/lib/outing/access'
import {
  decryptShareToken,
  encryptShareToken,
  generateToken,
  hashToken,
  isWellFormedToken,
} from '@/lib/outing/tokens'
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
 * 出遊 (Group Outing) actions. v1.6.0 (#943) members only; v1.7.0 (#1558)
 * friends join from a share link. spec:
 * docs/superpowers/specs/group-outing-design.md
 *
 * ## Who may write (lib/outing/access.ts)
 * - Content (add / edit / delete expense, record / delete settlement): a
 *   member of the outing's group, or a participant (bound by session, or by
 *   the `oc_<outingId>` claim cookie).
 * - Outing-level (rename, end, delete, add / deactivate participant, get /
 *   reset link, release slot): members only → participants get
 *   `outing_admin_only`.
 * - Creating an outing needs the viewer's own ledger (getViewerWriteContext).
 * A member pinned to a past chapter is refused with a code, not a throw.
 *
 * ## Scoping (every id the client sends is untrusted)
 * - The group always comes from the outing row. No action accepts a group id
 *   or a profile id from the client.
 * - An outing the caller cannot act on is `outing_not_found`, same as a
 *   missing one. Expense / settlement ids are matched `WHERE id AND
 *   outing_id = <resolved> AND deleted_at IS NULL`; another outing's id is
 *   `outing_expense_not_found` / `outing_settlement_not_found`.
 * - Every participant id (payer, share ids, settlement from/to) must be a
 *   participant of THAT outing, else `outing_participant_not_found`.
 *
 * ## What leaves the server
 * Results carry only ids the caller already addresses (outing, participant,
 * expense, settlement) and, for members, the share token. Never a claim
 * token (it goes out only as the httpOnly cookie), a hash, a profile id, a
 * group id or an epoch id.
 *
 * ## Locking — why a Settlement can never miss an expense
 * - Every mutation of an outing's contents runs in one transaction that first
 *   locks the outing row (`FOR SHARE`; `FOR UPDATE` when adding a participant
 *   or claiming a new slot, so two concurrent adds cannot both pass the
 *   20-person cap) and re-checks status = 'active' under that lock.
 * - `endOuting` locks the outing row FOR UPDATE before flipping status. It
 *   therefore waits for in-flight mutations to commit, and any mutation that
 *   starts afterwards sees 'ended' and is rejected. Only then does it read
 *   expenses/settlements and compute the couple net.
 * - Lock order is Outings → OikosGroups. leaveGroup / removePartner /
 *   acceptInvite lock OikosGroups, then the open GroupEpochs row, and never
 *   Outings; outing writes never lock GroupEpochs beyond the FK check (FOR
 *   KEY SHARE, which those NO KEY UPDATE locks don't block), so there is no
 *   cycle.
 * - Claims are one conditional `UPDATE … RETURNING` on the slot: two
 *   concurrent claims of one slot → exactly one row comes back.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
type CurrencyCode = 'twd' | 'cny' | 'usd' | 'jpy'

/**
 * Lock the group row FOR SHARE (after any outing lock: the order is always
 * Outings → OikosGroups). Shared, so outing writes don't serialize against
 * each other — only against leaveGroup / removePartner / acceptInvite /
 * endOuting, which take it FOR NO KEY UPDATE.
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

/** The participant row that entered a write, for `entered_by_participant_id`. */
function enteredByOf(actor: OutingActor): string | null {
  return actor.participantId
}

function revalidateOuting(outingId: string) {
  revalidatePath('/outings')
  revalidatePath(`/outings/${outingId}`)
}

const isUniqueViolation = (e: unknown) =>
  typeof e === 'object' && e !== null &&
  ((e as { code?: unknown }).code === '23505' || (e as { cause?: { code?: unknown } }).cause?.code === '23505')

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
    // Group row FOR SHARE: a concurrent leaveGroup / removePartner (FOR NO KEY UPDATE)
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

/** Add a friend by name (members only). At most 20 people per outing. */
export const addOutingParticipant = action(async (input: AddParticipantInput): Promise<{ id: string }> => {
  const inputs = await requestActorInputs(String(input?.outingId))
  const displayName = normalizeParticipantName(input?.displayName)

  const participant = await db.transaction(async (tx) => {
    // FOR UPDATE, not FOR SHARE: two concurrent adds must serialize, or both
    // would count 19 and both insert.
    const { outing } = await lockForAdmin(tx, input?.outingId, inputs, 'update')
    await assertWritable(tx, outing)
    await assertUnderCap(tx, outing.id)
    const [row] = await tx
      .insert(outingParticipants)
      .values({ outingId: outing.id, displayName, profileId: null })
      .returning({ id: outingParticipants.id })
    return row
  })

  revalidateOuting(input.outingId)
  return { id: participant.id }
})

/** Content-mutation status checks for admin paths (lockForContentWrite has its own). */
async function assertWritable(tx: Tx, outing: { status: string; epochId: string; groupId: string }) {
  if (outing.status !== 'active') throw actionError('outing_not_active')
  if (outing.epochId !== await currentEpochId(tx, outing.groupId)) throw actionError('outing_epoch_closed')
}

/** Under the outing's FOR UPDATE lock: refuse the 21st participant. */
async function assertUnderCap(tx: Tx, outingId: string) {
  const [{ n }] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(outingParticipants)
    .where(eq(outingParticipants.outingId, outingId))
  if (Number(n) >= OUTING_PARTICIPANT_CAP) throw actionError('outing_participant_limit')
}

export interface AddExpenseInput {
  outingId: string
  paidByParticipantId: string
  amount: number
  /** Who shares this expense. The server splits evenly; the client never sends amounts per person. */
  participantIds: string[]
  description?: string | null
  category?: string | null
}

interface ValidExpense {
  paidBy: string
  amount: number
  shareIds: string[]
  description: string | null
  category: string | null
}

function validateExpense(input: Omit<AddExpenseInput, 'outingId'> | undefined): ValidExpense {
  const amount = validateOutingAmount(input?.amount)
  const shareIds = normalizeShareIds(input?.participantIds)
  const description = normalizeDescription(input?.description)
  const category = normalizeCategory(input?.category)
  const paidBy = input?.paidByParticipantId
  if (typeof paidBy !== 'string' || !paidBy) throw actionError('outing_participant_not_found')
  return { paidBy, amount, shareIds, description, category }
}

async function insertExpense(tx: Tx, outingId: string, e: ValidExpense, enteredBy: string | null) {
  const [row] = await tx
    .insert(outingExpenses)
    .values({
      outingId,
      paidByParticipantId: e.paidBy,
      amount: e.amount,
      description: e.description,
      category: e.category,
      enteredByParticipantId: enteredBy,
    })
    .returning({ id: outingExpenses.id })
  await tx.insert(outingExpenseShares).values(
    splitEqual(e.amount, e.shareIds).map((s) => ({
      expenseId: row.id,
      participantId: s.participantId,
      shareAmount: s.shareAmount,
    })),
  )
  return row
}

export const addOutingExpense = action(async (input: AddExpenseInput): Promise<{ id: string }> => {
  const inputs = await requestActorInputs(String(input?.outingId))
  const e = validateExpense(input)

  const expense = await db.transaction(async (tx) => {
    const { outing, actor } = await lockForContentWrite(tx, input?.outingId, inputs)
    await assertActiveParticipants(tx, outing.id, [e.paidBy, ...e.shareIds])
    return insertExpense(tx, outing.id, e, enteredByOf(actor))
  })

  revalidateOuting(input.outingId)
  return { id: expense.id }
})

export interface EditExpenseInput extends AddExpenseInput {
  expenseId: string
}

/**
 * Edit = soft-delete + insert (the app's convention). Any member or
 * participant may edit any expense (spec 「朋友的寫權限」); the new row's
 * entered_by records who did. A participant who has since been deactivated
 * may stay on the expense they were already on, but cannot be added.
 */
export const editOutingExpense = action(async (input: EditExpenseInput): Promise<{ id: string }> => {
  const inputs = await requestActorInputs(String(input?.outingId))
  const e = validateExpense(input)
  if (!isUuid(input?.expenseId)) throw actionError('outing_expense_not_found')

  const expense = await db.transaction(async (tx) => {
    const { outing, actor } = await lockForContentWrite(tx, input?.outingId, inputs)
    const [old] = await tx
      .update(outingExpenses)
      .set({ deletedAt: new Date() })
      .where(and(
        eq(outingExpenses.id, input.expenseId),
        eq(outingExpenses.outingId, outing.id),
        isNull(outingExpenses.deletedAt),
      ))
      .returning({ id: outingExpenses.id, paidBy: outingExpenses.paidByParticipantId })
    if (!old) throw actionError('outing_expense_not_found')

    const oldShares = await tx
      .select({ participantId: outingExpenseShares.participantId })
      .from(outingExpenseShares)
      .where(eq(outingExpenseShares.expenseId, old.id))
    const already = new Set([old.paidBy, ...oldShares.map((s) => s.participantId)])
    const ids = [...new Set([e.paidBy, ...e.shareIds])]
    if (!ids.every(isUuid)) throw actionError('outing_participant_not_found')
    const rows = await tx
      .select({ id: outingParticipants.id, deactivatedAt: outingParticipants.deactivatedAt })
      .from(outingParticipants)
      .where(and(eq(outingParticipants.outingId, outing.id), inArray(outingParticipants.id, ids)))
    const ok = rows.filter((r) => r.deactivatedAt === null || already.has(r.id))
    if (ok.length !== ids.length) throw actionError('outing_participant_not_found')

    return insertExpense(tx, outing.id, e, enteredByOf(actor))
  })

  revalidateOuting(input.outingId)
  return { id: expense.id }
})

export const deleteOutingExpense = action(async (input: { outingId: string; expenseId: string }): Promise<void> => {
  const inputs = await requestActorInputs(String(input?.outingId))
  if (!isUuid(input?.expenseId)) throw actionError('outing_expense_not_found')
  await db.transaction(async (tx) => {
    const { outing } = await lockForContentWrite(tx, input?.outingId, inputs)
    const [row] = await tx
      .update(outingExpenses)
      .set({ deletedAt: new Date() })
      .where(and(
        eq(outingExpenses.id, input.expenseId),
        eq(outingExpenses.outingId, outing.id),
        isNull(outingExpenses.deletedAt),
      ))
      .returning({ id: outingExpenses.id })
    if (!row) throw actionError('outing_expense_not_found')
  })
  revalidateOuting(input.outingId)
})

export interface RecordSettlementInput {
  outingId: string
  fromParticipantId: string
  toParticipantId: string
  amount: number
}

/** A repayment between two people inside the outing. Never touches the main ledger. */
export const recordOutingSettlement = action(async (input: RecordSettlementInput): Promise<{ id: string }> => {
  const inputs = await requestActorInputs(String(input?.outingId))
  const amount = validateOutingAmount(input?.amount)
  const from = input?.fromParticipantId
  const to = input?.toParticipantId
  if (typeof from !== 'string' || typeof to !== 'string' || !from || !to) {
    throw actionError('outing_participant_not_found')
  }
  if (from === to) throw actionError('outing_settlement_same_party')

  const settlement = await db.transaction(async (tx) => {
    const { outing } = await lockForContentWrite(tx, input?.outingId, inputs)
    await assertActiveParticipants(tx, outing.id, [from, to])
    const [row] = await tx
      .insert(outingSettlements)
      .values({ outingId: outing.id, fromParticipantId: from, toParticipantId: to, amount })
      .returning({ id: outingSettlements.id })
    return row
  })

  revalidateOuting(input.outingId)
  return { id: settlement.id }
})

export const deleteOutingSettlement = action(async (input: { outingId: string; settlementId: string }): Promise<void> => {
  const inputs = await requestActorInputs(String(input?.outingId))
  if (!isUuid(input?.settlementId)) throw actionError('outing_settlement_not_found')
  await db.transaction(async (tx) => {
    const { outing } = await lockForContentWrite(tx, input?.outingId, inputs)
    const [row] = await tx
      .update(outingSettlements)
      .set({ deletedAt: new Date() })
      .where(and(
        eq(outingSettlements.id, input.settlementId),
        eq(outingSettlements.outingId, outing.id),
        isNull(outingSettlements.deletedAt),
      ))
      .returning({ id: outingSettlements.id })
    if (!row) throw actionError('outing_settlement_not_found')
  })
  revalidateOuting(input.outingId)
})

/**
 * End the outing (members only). If it belongs to the group's current epoch,
 * the couple's mutual debt folds into the main ledger as ONE ordinary
 * Settlement (note 「出遊『{name}』結算」) and GroupBalance is recalculated —
 * in the same transaction as the status change. Friends' shares never touch
 * the main ledger.
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
  const inputs = await requestActorInputs(String(input?.outingId))
  const t = await getTranslations()
  const todayYMD = await getTodayYMD()
  const now = new Date()

  const result = await db.transaction(async (tx) => {
    // 1. Outing row FOR UPDATE, then the group row NO KEY UPDATE (members read
    //    from it fresh, not from any pre-transaction context). NO KEY UPDATE,
    //    like the chapter closers: it excludes them and other endOutings, but
    //    does not block the FK check (FOR KEY SHARE) of an insert that
    //    references this group. Asked for up front: upgrading a SHARE lock
    //    later would let two endOutings deadlock.
    const { outing } = await lockForAdmin(tx, input?.outingId, inputs, 'update', 'no key update')
    const group = { id: outing.groupId }

    // 2. Status flip. Waits for nothing more (the row is ours); later
    //    mutations see 'ended'.
    const [ended] = await tx
      .update(outings)
      .set({ status: 'ended', endedAt: now, foldedAt: now })
      .where(and(eq(outings.id, outing.id), eq(outings.status, 'active'), isNull(outings.foldedAt)))
      .returning({ id: outings.id, name: outings.name, epochId: outings.epochId, currency: outings.currency })
    if (!ended) throw actionError('outing_not_active')

    const [locked] = await tx
      .select({ memberA: oikosGroups.memberA, memberB: oikosGroups.memberB, baseCurrency: oikosGroups.baseCurrency })
      .from(oikosGroups)
      .where(eq(oikosGroups.id, group.id))

    // 3. Past epoch → terminal, no fold.
    if (ended.epochId !== await currentEpochId(tx, group.id)) return { folded: false }

    // 4. Net from rows read AFTER the lock.
    const participants = await tx
      .select({ id: outingParticipants.id, profileId: outingParticipants.profileId })
      .from(outingParticipants)
      .where(eq(outingParticipants.outingId, ended.id))

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

    const foldRows = {
      participants,
      memberA: locked.memberA,
      memberB: locked.memberB,
      expenseRows,
      shareRows,
      settlementRows,
    }
    const net = foldNetFromRows(foldRows)

    const fold = foldSettlementFor(net, locked.memberA, locked.memberB)
    if (!fold) return { folded: false }

    // The outing's integers are in the currency it was opened with; the
    // Settlement is read in today's base currency. This should be unreachable:
    // setBaseCurrency refuses while an outing is active, and it checks under
    // the same group-row lock createOuting takes, so neither can slip past the
    // other. Kept as a defensive guard — refusing beats folding NT$1500 as
    // ¥1500, and beats ending without the fold, which would silently drop a
    // real debt. Throwing rolls back the status flip; nothing is written.
    if (ended.currency !== locked.baseCurrency) throw actionError('outing_currency_changed')

    // Outing integers are minor units (USD cents); Settlements are whole units
    // (#1582). A residual that rounds below 1 whole unit is not worth a row.
    const foldAmount = minorToWhole(fold.amount, ended.currency)
    if (foldAmount < 1) return { folded: false }

    // #1635: remember the line that is about to become a Settlement, in the
    // same transaction, so the ended outing stops listing it as still to pay.
    // The same rows give `net` and `line`, so a non-zero net always has a line.
    const line = foldLineFromRows(foldRows)
    if (!line) throw new Error('fold net without a fold line')
    await tx
      .update(outings)
      .set({ foldFromParticipantId: line.from, foldToParticipantId: line.to, foldAmount: line.amount })
      .where(eq(outings.id, ended.id))

    await tx.insert(settlements).values({
      groupId: group.id,
      paidBy: fold.paidBy,
      amount: foldAmount,
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
 * Soft-delete an outing, active or ended (members only). Deleting an ended
 * outing does NOT undo its fold: that Settlement is an ordinary main-ledger
 * row, deletable on its own like any other, and GroupBalance does not move
 * here.
 */
export const softDeleteOuting = action(async (input: { outingId: string }): Promise<void> => {
  const inputs = await requestActorInputs(String(input?.outingId))
  await db.transaction(async (tx) => {
    const { outing } = await lockForAdmin(tx, input?.outingId, inputs)
    await tx.update(outings).set({ deletedAt: new Date() }).where(eq(outings.id, outing.id))
  })
  revalidatePath('/outings')
})

/** Rename (members only). Works on an ended outing too. */
export const renameOuting = action(async (input: { outingId: string; name: string }): Promise<void> => {
  const inputs = await requestActorInputs(String(input?.outingId))
  const name = normalizeOutingName(input?.name)
  await db.transaction(async (tx) => {
    const { outing } = await lockForAdmin(tx, input?.outingId, inputs)
    await tx.update(outings).set({ name }).where(eq(outings.id, outing.id))
  })
  revalidateOuting(input.outingId)
})

/**
 * Mark a participant inactive (members only): out of new expenses, history
 * kept. Their claim cookie stops resolving (access.ts requires an active
 * slot), so a friend holding it falls back to "choose who you are".
 */
export const deactivateOutingParticipant = action(async (
  input: { outingId: string; participantId: string },
): Promise<void> => {
  const inputs = await requestActorInputs(String(input?.outingId))
  if (!isUuid(input?.participantId)) throw actionError('outing_participant_not_found')
  await db.transaction(async (tx) => {
    const { outing } = await lockForAdmin(tx, input?.outingId, inputs)
    await assertWritable(tx, outing)
    const [row] = await tx
      .update(outingParticipants)
      .set({ deactivatedAt: new Date() })
      .where(and(
        eq(outingParticipants.id, input.participantId),
        eq(outingParticipants.outingId, outing.id),
        isNull(outingParticipants.deactivatedAt),
      ))
      .returning({ id: outingParticipants.id })
    if (!row) throw actionError('outing_participant_not_found')
  })
  revalidateOuting(input.outingId)
})

/** Store a fresh share token on the (locked) outing row; returns the plaintext. */
async function rotateShareToken(tx: Tx, outingId: string): Promise<string> {
  const token = generateToken()
  await tx
    .update(outings)
    .set({
      shareTokenHash: hashToken(token),
      shareTokenEncrypted: encryptShareToken(token, outingId),
      shareTokenRotatedAt: new Date(),
    })
    .where(eq(outings.id, outingId))
  return token
}

/**
 * The outing's share token (members only). Created on first call; later calls
 * return the same token (decrypted, bound to this outing's id), so copying the
 * link twice never rotates it. The caller builds the URL.
 */
export const getOutingShareLink = action(async (input: { outingId: string }): Promise<{ token: string }> => {
  const inputs = await requestActorInputs(String(input?.outingId))
  const token = await db.transaction(async (tx) => {
    const { outing } = await lockForAdmin(tx, input?.outingId, inputs)
    const [row] = await tx
      .select({ enc: outings.shareTokenEncrypted })
      .from(outings)
      .where(eq(outings.id, outing.id))
    if (row?.enc) return decryptShareToken(row.enc, outing.id)
    return rotateShareToken(tx, outing.id)
  })
  return { token }
})

/**
 * Replace the share token (members only). The old link stops working at once;
 * claimed participants keep writing (their cookie / session is not the share
 * token).
 */
export const resetOutingShareLink = action(async (input: { outingId: string }): Promise<{ token: string }> => {
  const inputs = await requestActorInputs(String(input?.outingId))
  const token = await db.transaction(async (tx) => {
    const { outing } = await lockForAdmin(tx, input?.outingId, inputs)
    return rotateShareToken(tx, outing.id)
  })
  revalidateOuting(input.outingId)
  return { token }
})

/**
 * Release a slot claimed by cookie and not bound to an account (members
 * only): clears its claim, so the old cookie stops resolving and the slot is
 * claimable again from the link. History stays on the same row.
 * - Bound to an account (profile_id set), or a deleted account's slot
 *   (claimed_at kept, no claim token — 0083) → `outing_slot_bound`.
 * - Already unclaimed → nothing to do (ok).
 */
export const releaseOutingSlot = action(async (input: { outingId: string; participantId: string }): Promise<void> => {
  const inputs = await requestActorInputs(String(input?.outingId))
  if (!isUuid(input?.participantId)) throw actionError('outing_participant_not_found')
  await db.transaction(async (tx) => {
    const { outing } = await lockForAdmin(tx, input?.outingId, inputs)
    const [slot] = await tx
      .select({
        profileId: outingParticipants.profileId,
        claimTokenHash: outingParticipants.claimTokenHash,
        claimedAt: outingParticipants.claimedAt,
      })
      .from(outingParticipants)
      .where(and(eq(outingParticipants.id, input.participantId), eq(outingParticipants.outingId, outing.id)))
      .for('update')
    if (!slot) throw actionError('outing_participant_not_found')
    if (slot.profileId !== null || (slot.claimTokenHash === null && slot.claimedAt !== null)) {
      throw actionError('outing_slot_bound')
    }
    if (slot.claimTokenHash === null) return
    await tx
      .update(outingParticipants)
      .set({ claimTokenHash: null, claimedAt: null })
      .where(and(
        eq(outingParticipants.id, input.participantId),
        isNull(outingParticipants.profileId),
        isNotNull(outingParticipants.claimTokenHash),
      ))
  })
  revalidateOuting(input.outingId)
})

export interface JoinOutingInput {
  shareToken: string
  /** Claim this existing unclaimed slot… */
  participantId?: string
  /** …or add yourself under this name. Exactly one of the two. */
  displayName?: string
}

/**
 * Join an outing from its share link: claim an unclaimed slot, or add
 * yourself (counts toward the 20-person cap).
 *
 * - Signed in → the slot is bound to the account (profile_id); no cookie.
 * - Anonymous → a fresh claim token; its sha256 goes on the slot and the
 *   token itself only into the httpOnly `oc_<outingId>` cookie.
 *
 * Refusals (codes, never 23505):
 *   bad / reset / deleted link           → outing_link_invalid
 *   ended outing                         → outing_not_active
 *   member of the outing's group, a user already bound here, or a valid
 *   claim cookie for this outing         → outing_already_joined
 *   slot claimed meanwhile (lost race)   → outing_slot_taken
 */
export const joinOuting = action(async (input: JoinOutingInput): Promise<{ participantId: string }> => {
  const shareToken = input?.shareToken
  if (!isWellFormedToken(shareToken)) throw actionError('outing_link_invalid')
  const claimId = input?.participantId
  const addName = input?.displayName
  if ((claimId === undefined) === (addName === undefined)) throw actionError('outing_participant_not_found')
  if (claimId !== undefined && !isUuid(claimId)) throw actionError('outing_participant_not_found')
  const displayName = addName !== undefined ? normalizeParticipantName(addName) : null

  const [found] = await db
    .select({ id: outings.id })
    .from(outings)
    .where(and(eq(outings.shareTokenHash, hashToken(shareToken)), isNull(outings.deletedAt)))
    .limit(1)
  if (!found) throw actionError('outing_link_invalid')

  const userId = await getSessionUserId()
  const cookieToken = await readClaimToken(found.id)
  const claimToken = userId ? null : generateToken()
  const claimHash = claimToken ? hashToken(claimToken) : null

  let result: { participantId: string; status: Parameters<typeof claimCookieOptions>[0] }
  try {
    result = await db.transaction(async (tx) => {
      // FOR UPDATE: the cap check below must serialize against other adds,
      // and a reset link committed before this lock must be seen.
      const outing = await loadOuting(tx, found.id, claimId ? 'share' : 'update')
      const [still] = await tx
        .select({ hash: outings.shareTokenHash })
        .from(outings)
        .where(eq(outings.id, outing.id))
      if (still?.hash !== hashToken(shareToken)) throw actionError('outing_link_invalid')
      if (outing.status !== 'active') throw actionError('outing_not_active')
      if (outing.epochId !== await currentEpochId(tx, outing.groupId)) throw actionError('outing_epoch_closed')

      const existing = await resolveActor(tx, outing, { userId, claimToken: cookieToken }, { lockGroup: 'share' })
      if (existing) throw actionError('outing_already_joined')

      const now = new Date()
      const claim = { profileId: userId, claimTokenHash: claimHash, claimedAt: now }

      if (claimId) {
        const [row] = await tx
          .update(outingParticipants)
          .set(claim)
          .where(and(
            eq(outingParticipants.id, claimId),
            eq(outingParticipants.outingId, outing.id),
            isNull(outingParticipants.profileId),
            isNull(outingParticipants.claimTokenHash),
            isNull(outingParticipants.claimedAt),
            isNull(outingParticipants.deactivatedAt),
          ))
          .returning({ id: outingParticipants.id })
        if (row) return { participantId: row.id, status: outing.status }
        const [exists] = await tx
          .select({ id: outingParticipants.id })
          .from(outingParticipants)
          .where(and(
            eq(outingParticipants.id, claimId),
            eq(outingParticipants.outingId, outing.id),
            isNull(outingParticipants.deactivatedAt),
          ))
        throw actionError(exists ? 'outing_slot_taken' : 'outing_participant_not_found')
      }

      await assertUnderCap(tx, outing.id)
      const [row] = await tx
        .insert(outingParticipants)
        .values({ outingId: outing.id, displayName: displayName!, ...claim })
        .returning({ id: outingParticipants.id })
      return { participantId: row.id, status: outing.status }
    })
  } catch (e) {
    // uq_outing_participants_profile: the same account bound concurrently in
    // another request. Not reachable for an anonymous claim (fresh token).
    if (isUniqueViolation(e)) throw actionError('outing_already_joined')
    throw e
  }

  if (claimToken) {
    const jar = await cookies()
    jar.set(claimCookieName(found.id), claimToken, claimCookieOptions(result.status))
  }
  return { participantId: result.participantId }
})

/**
 * Bind the slot this browser's claim cookie holds to the signed-in account —
 * only after the person confirms 「這是你嗎」 (never on render). Then the
 * cookie is no longer needed and is cleared; the session carries the slot.
 *
 * Refusals: not signed in / no valid cookie → outing_not_found; a member of
 * the outing's group, or an account already bound to a slot here →
 * outing_already_joined.
 */
export const bindOutingParticipant = action(async (input: { outingId: string }): Promise<{ participantId: string }> => {
  const userId = await getSessionUserId()
  if (!userId || !isUuid(input?.outingId)) throw actionError('outing_not_found')
  const claimToken = await readClaimToken(input.outingId)
  if (!claimToken) throw actionError('outing_not_found')

  let participantId: string
  try {
    participantId = await db.transaction(async (tx) => {
      const outing = await loadOuting(tx, input.outingId, 'share')
      const actor = await resolveActor(tx, outing, { userId, claimToken }, { lockGroup: 'share' })
      if (!actor) throw actionError('outing_not_found')
      if (actor.kind === 'member' || actor.via === 'session') throw actionError('outing_already_joined')
      const [row] = await tx
        .update(outingParticipants)
        .set({ profileId: userId, claimTokenHash: null })
        .where(and(
          eq(outingParticipants.id, actor.participantId),
          eq(outingParticipants.outingId, outing.id),
          isNull(outingParticipants.profileId),
          eq(outingParticipants.claimTokenHash, hashToken(claimToken)),
          isNull(outingParticipants.deactivatedAt),
        ))
        .returning({ id: outingParticipants.id })
      if (!row) throw actionError('outing_not_found')
      return row.id
    })
  } catch (e) {
    if (isUniqueViolation(e)) throw actionError('outing_already_joined')
    throw e
  }

  const jar = await cookies()
  jar.delete(claimCookieName(input.outingId))
  revalidateOuting(input.outingId)
  return { participantId }
})
