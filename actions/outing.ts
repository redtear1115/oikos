'use server'

import { db } from '@/lib/db/client'
import {
  outings, outingParticipants, outingExpenses, outingExpenseShares, outingSettlements, groupEpochs, profiles,
} from '@/lib/db/schema'
import { splitEqual } from '@/lib/outing/split'
import { and, eq, isNull, inArray } from 'drizzle-orm'
import { requireViewerGroup, type ViewerGroup } from '@/lib/auth/viewer'
import { generateShareToken, generateClaimToken } from '@/lib/outing/token'
import { revalidatePath } from 'next/cache'

type CurrencyCode = 'twd' | 'cny' | 'usd' | 'jpy'

export interface CreateOutingInput {
  name: string
  currency?: CurrencyCode
}

export async function createOuting(input: CreateOutingInput) {
  const { user, group } = await requireViewerGroup()

  const name = input.name.trim()
  if (!name) throw new Error('出遊名稱為空')
  if (name.length > 100) throw new Error('出遊名稱過長')
  const currency = (input.currency ?? group.baseCurrency) as CurrencyCode

  const [currentEpoch] = await db
    .select()
    .from(groupEpochs)
    .where(and(eq(groupEpochs.groupId, group.id), isNull(groupEpochs.endedAt)))
    .limit(1)
  if (!currentEpoch) throw new Error('找不到當前章節')

  const memberIds = [group.memberA, group.memberB].filter(Boolean) as string[]
  const memberProfiles = await db
    .select({ id: profiles.id, displayName: profiles.displayName })
    .from(profiles)
    .where(inArray(profiles.id, memberIds))

  const created = await db.transaction(async (tx) => {
    const [outing] = await tx
      .insert(outings)
      .values({
        groupId: group.id,
        epochId: currentEpoch.id,
        createdBy: user.id,
        name,
        currency,
        shareToken: generateShareToken(),
        status: 'active',
      })
      .returning()

    if (memberProfiles.length > 0) {
      await tx.insert(outingParticipants).values(
        memberProfiles.map((m) => ({
          outingId: outing.id,
          displayName: m.displayName,
          profileId: m.id,
          claimToken: generateClaimToken(),
          claimedAt: new Date(),
        })),
      )
    }
    return outing
  })

  revalidatePath('/outings')
  return created
}

/** Load an active, non-deleted outing that belongs to `group`, or throw. */
async function requireActiveOutingInGroup(outingId: string, group: ViewerGroup) {
  const [outing] = await db
    .select()
    .from(outings)
    .where(and(eq(outings.id, outingId), eq(outings.groupId, group.id), isNull(outings.deletedAt)))
    .limit(1)
  if (!outing) throw new Error('找不到出遊')
  if (outing.status !== 'active') throw new Error('出遊已結束')
  return outing
}

export interface AddParticipantInput {
  outingId: string
  displayName: string
}

export async function addOutingParticipant(input: AddParticipantInput) {
  const { group } = await requireViewerGroup()
  await requireActiveOutingInGroup(input.outingId, group)

  const displayName = input.displayName.trim()
  if (!displayName) throw new Error('名字為空')
  if (displayName.length > 50) throw new Error('名字過長')

  const [participant] = await db
    .insert(outingParticipants)
    .values({
      outingId: input.outingId,
      displayName,
      profileId: null,
      claimToken: generateClaimToken(),
    })
    .returning()

  revalidatePath(`/outings/${input.outingId}`)
  return participant
}

export interface AddExpenseInput {
  outingId: string
  paidByParticipantId: string
  amount: number
  participantIds: string[]
  description?: string
  category?: string
}

export async function addOutingExpense(input: AddExpenseInput) {
  const { group } = await requireViewerGroup()
  await requireActiveOutingInGroup(input.outingId, group)

  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new Error('金額需為正整數')
  }
  if (input.participantIds.length === 0) {
    throw new Error('至少選一位分攤者')
  }

  // All referenced participants (payer + split set) must belong to this outing.
  const referenced = Array.from(new Set([input.paidByParticipantId, ...input.participantIds]))
  const valid = await db
    .select({ id: outingParticipants.id })
    .from(outingParticipants)
    .where(and(
      eq(outingParticipants.outingId, input.outingId),
      inArray(outingParticipants.id, referenced),
    ))
  if (valid.length !== referenced.length) {
    throw new Error('參與者不屬於此出遊')
  }

  const shares = splitEqual(input.amount, input.participantIds)

  const expense = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(outingExpenses)
      .values({
        outingId: input.outingId,
        paidByParticipantId: input.paidByParticipantId,
        amount: input.amount,
        description: input.description?.trim() || null,
        category: input.category ?? null,
        enteredByParticipantId: input.paidByParticipantId,
      })
      .returning()

    await tx.insert(outingExpenseShares).values(
      shares.map((s) => ({
        expenseId: row.id,
        participantId: s.participantId,
        shareAmount: s.shareAmount,
      })),
    )
    return row
  })

  revalidatePath(`/outings/${input.outingId}`)
  return expense
}

export interface RecordSettlementInput {
  outingId: string
  fromParticipantId: string
  toParticipantId: string
  amount: number
}

export async function recordOutingSettlement(input: RecordSettlementInput) {
  const { group } = await requireViewerGroup()
  await requireActiveOutingInGroup(input.outingId, group)

  if (input.fromParticipantId === input.toParticipantId) {
    throw new Error('付款人與收款人不可相同')
  }
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new Error('金額需為正整數')
  }

  const parties = [input.fromParticipantId, input.toParticipantId]
  const valid = await db
    .select({ id: outingParticipants.id })
    .from(outingParticipants)
    .where(and(
      eq(outingParticipants.outingId, input.outingId),
      inArray(outingParticipants.id, parties),
    ))
  if (valid.length !== 2) throw new Error('參與者不屬於此出遊')

  const [settlement] = await db
    .insert(outingSettlements)
    .values({
      outingId: input.outingId,
      fromParticipantId: input.fromParticipantId,
      toParticipantId: input.toParticipantId,
      amount: input.amount,
    })
    .returning()

  revalidatePath(`/outings/${input.outingId}`)
  return settlement
}

export async function endOuting(input: { outingId: string }) {
  const { group } = await requireViewerGroup()

  // Conditional update on status='active' → idempotent: a second end yields no
  // row. Fold-back into the couple ledger is wired in Phase 4 (coupleNet).
  const [row] = await db
    .update(outings)
    .set({ status: 'ended', endedAt: new Date() })
    .where(and(
      eq(outings.id, input.outingId),
      eq(outings.groupId, group.id),
      eq(outings.status, 'active'),
    ))
    .returning()
  if (!row) throw new Error('找不到進行中的出遊')

  revalidatePath('/outings')
  revalidatePath(`/outings/${input.outingId}`)
  return row
}

export async function softDeleteOuting(input: { outingId: string }) {
  const { group } = await requireViewerGroup()
  await db
    .update(outings)
    .set({ deletedAt: new Date() })
    .where(and(eq(outings.id, input.outingId), eq(outings.groupId, group.id)))
  revalidatePath('/outings')
}
