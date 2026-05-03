'use server'

import { db } from '@/lib/db/client'
import { settlements, oikosGroups } from '@/lib/db/schema'
import { createClient } from '@/lib/supabase/server'
import { recalcGroupBalance } from '@/lib/db/queries/balance'
import { eq, or, and, isNull } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { validateSettlementInput } from '@/lib/validators'

export interface EditSettlementInput {
  oldId: string
  amount: number
  payerId: string
  settledAt: Date
  note?: string
}

export interface CreateSettlementInput {
  amount: number       // integer NTD, > 0
  payerId: string      // user.id paying down their debt (must be in group)
  settledAt: Date
  note?: string
}

export async function createSettlement(input: CreateSettlementInput): Promise<{ id: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const validated = validateSettlementInput({
    amount: input.amount,
    payerId: input.payerId,
    settledAt: input.settledAt,
    note: input.note,
  })

  const [group] = await db
    .select()
    .from(oikosGroups)
    .where(or(eq(oikosGroups.memberA, user.id), eq(oikosGroups.memberB, user.id)))
    .limit(1)
  if (!group) throw new Error('找不到家計簿')

  if (input.payerId !== group.memberA && input.payerId !== group.memberB) {
    throw new Error('付款人不在家計簿內')
  }

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

  revalidatePath('/dashboard')
  revalidatePath('/records')
  return { id: created.id }
}

export async function softDeleteSettlement(settlementId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const [group] = await db
    .select()
    .from(oikosGroups)
    .where(or(eq(oikosGroups.memberA, user.id), eq(oikosGroups.memberB, user.id)))
    .limit(1)
  if (!group) throw new Error('找不到家計簿')

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

  revalidatePath('/dashboard')
  revalidatePath('/records')
}

export async function editSettlement(input: EditSettlementInput): Promise<{ id: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const validated = validateSettlementInput({
    amount: input.amount,
    payerId: input.payerId,
    settledAt: input.settledAt,
    note: input.note,
  })

  const [group] = await db
    .select()
    .from(oikosGroups)
    .where(or(eq(oikosGroups.memberA, user.id), eq(oikosGroups.memberB, user.id)))
    .limit(1)
  if (!group) throw new Error('找不到家計簿')

  if (input.payerId !== group.memberA && input.payerId !== group.memberB) {
    throw new Error('付款人不在家計簿內')
  }

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

  revalidatePath('/dashboard')
  revalidatePath('/records')
  return { id: created.id }
}
