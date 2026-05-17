'use server'

import { db } from '@/lib/db/client'
import { settlements } from '@/lib/db/schema'
import { recalcGroupBalance } from '@/lib/db/queries/balance'
import { eq, and, isNull } from 'drizzle-orm'
import { getViewerWriteContext } from '@/lib/actionContext'
import { assertMemberInGroup } from '@/lib/auth/member'
import { revalidateAfterTransactionMutation } from '@/lib/revalidate'
import { validateSettlementInput } from '@/lib/validators'

export interface EditSettlementInput {
  oldId: string
  amount: number
  payerId: string
  /** Calendar date 'YYYY-MM-DD'. Validator anchors at UTC noon (#453). */
  settledAt: string
  note?: string
}

export interface CreateSettlementInput {
  amount: number       // integer NTD, > 0
  payerId: string      // user.id paying down their debt (must be in group)
  /** Calendar date 'YYYY-MM-DD'. Validator anchors at UTC noon (#453). */
  settledAt: string
  note?: string
}

export async function createSettlement(input: CreateSettlementInput): Promise<{ id: string }> {
  const { group } = await getViewerWriteContext()

  const validated = validateSettlementInput({
    amount: input.amount,
    payerId: input.payerId,
    settledAt: input.settledAt,
    note: input.note,
  })

  assertMemberInGroup(input.payerId, group, '付款人不在家計簿內')

  const [created] = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(settlements)
      .values({
        groupId: group.id,
        paidBy: validated.payerId,
        amount: validated.amount,
        note: validated.note,
        settledAt: validated.settledAt,
      })
      .returning({ id: settlements.id })
    await recalcGroupBalance(group.id, tx)
    return inserted
  })

  revalidateAfterTransactionMutation()
  return { id: created.id }
}

export async function softDeleteSettlement(settlementId: string): Promise<void> {
  const { group } = await getViewerWriteContext()

  await db.transaction(async (tx) => {
    const updated = await tx
      .update(settlements)
      .set({ deletedAt: new Date() })
      .where(and(
        eq(settlements.id, settlementId),
        eq(settlements.groupId, group.id),
        isNull(settlements.deletedAt),
      ))
      .returning({ id: settlements.id })
    if (updated.length === 0) throw new Error('找不到該筆紀錄')
    await recalcGroupBalance(group.id, tx)
  })

  revalidateAfterTransactionMutation()
}

export async function editSettlement(input: EditSettlementInput): Promise<{ id: string }> {
  const { group } = await getViewerWriteContext()

  const validated = validateSettlementInput({
    amount: input.amount,
    payerId: input.payerId,
    settledAt: input.settledAt,
    note: input.note,
  })

  assertMemberInGroup(input.payerId, group, '付款人不在家計簿內')

  const [created] = await db.transaction(async (tx) => {
    const deleted = await tx
      .update(settlements)
      .set({ deletedAt: new Date() })
      .where(and(
        eq(settlements.id, input.oldId),
        eq(settlements.groupId, group.id),
        isNull(settlements.deletedAt),
      ))
      .returning({ id: settlements.id })
    if (deleted.length === 0) throw new Error('找不到該筆紀錄')

    const inserted = await tx
      .insert(settlements)
      .values({
        groupId: group.id,
        paidBy: validated.payerId,
        amount: validated.amount,
        note: validated.note,
        settledAt: validated.settledAt,
      })
      .returning({ id: settlements.id })

    await recalcGroupBalance(group.id, tx)
    return inserted
  })

  revalidateAfterTransactionMutation()
  return { id: created.id }
}
