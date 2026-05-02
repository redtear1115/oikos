'use server'

import { db } from '@/lib/db/client'
import { cashTransactions, oikosGroups } from '@/lib/db/schema'
import { createClient } from '@/lib/supabase/server'
import { recalcGroupBalance } from '@/lib/db/queries/balance'
import { isValidCategoryId, type CategoryId } from '@/lib/categories'
import type { SplitType } from '@/lib/balance'
import { listTransactionsPaged, type TxnCursor } from '@/lib/db/queries/transactions'
import { eq, or, and, isNull } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

export interface CreateTransactionInput {
  amount: number              // integer NTD, > 0
  description: string         // required, non-empty after trim
  category: CategoryId | string  // 'other' fallback if invalid
  splitType: SplitType
  payerId: string             // user.id of payer (must be in group)
  transactedAt: Date
}

export async function createTransaction(input: CreateTransactionInput): Promise<{ id: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  // Validate
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new Error('金額必須是正整數')
  }
  const description = input.description.trim()
  if (!description) throw new Error('描述不能為空')
  const category = isValidCategoryId(input.category) ? input.category : 'other'
  if (category === 'settle') throw new Error('不可使用此分類')

  // Find viewer's group
  const [group] = await db
    .select()
    .from(oikosGroups)
    .where(or(eq(oikosGroups.memberA, user.id), eq(oikosGroups.memberB, user.id)))
    .limit(1)
  if (!group) throw new Error('找不到家計簿')

  // Payer must be in group
  if (input.payerId !== group.memberA && input.payerId !== group.memberB) {
    throw new Error('付款人不在家計簿內')
  }

  const [created] = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(cashTransactions)
      .values({
        groupId: group.id,
        paidBy: input.payerId,
        amount: input.amount,
        splitType: input.splitType,
        description,
        category,
        transactedAt: input.transactedAt,
      })
      .returning({ id: cashTransactions.id })
    await recalcGroupBalance(group.id, tx)
    return inserted
  })

  revalidatePath('/dashboard')
  return { id: created.id }
}

export async function softDeleteTransaction(transactionId: string): Promise<void> {
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
      .update(cashTransactions)
      .set({ deletedAt: new Date() })
      .where(and(
        eq(cashTransactions.id, transactionId),
        eq(cashTransactions.groupId, group.id),
        isNull(cashTransactions.deletedAt),
      ))
      .returning({ id: cashTransactions.id })
    if (updated.length === 0) throw new Error('找不到該筆紀錄')
    await recalcGroupBalance(group.id, tx)
  })

  revalidatePath('/dashboard')
}

export interface EditTransactionInput {
  oldId: string
  amount: number
  description: string
  category: CategoryId | string
  splitType: SplitType
  payerId: string
  transactedAt: Date
}

export async function editTransaction(input: EditTransactionInput): Promise<{ id: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  // Validate (mirror createTransaction)
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new Error('金額必須是正整數')
  }
  const description = input.description.trim()
  if (!description) throw new Error('描述不能為空')
  const category = isValidCategoryId(input.category) ? input.category : 'other'
  if (category === 'settle') throw new Error('不可使用此分類')

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
    // Soft-delete old (must belong to this group + still active)
    const deleted = await tx
      .update(cashTransactions)
      .set({ deletedAt: new Date() })
      .where(and(
        eq(cashTransactions.id, input.oldId),
        eq(cashTransactions.groupId, group.id),
        isNull(cashTransactions.deletedAt),
      ))
      .returning({ id: cashTransactions.id })
    if (deleted.length === 0) throw new Error('找不到該筆紀錄')

    // Insert new
    const inserted = await tx
      .insert(cashTransactions)
      .values({
        groupId: group.id,
        paidBy: input.payerId,
        amount: input.amount,
        splitType: input.splitType,
        description,
        category,
        transactedAt: input.transactedAt,
      })
      .returning({ id: cashTransactions.id })

    await recalcGroupBalance(group.id, tx)
    return inserted
  })

  revalidatePath('/dashboard')
  revalidatePath('/records')

  return { id: created.id }
}

export interface PagedTxnRow {
  id: string
  amount: number
  splitType: SplitType
  description: string
  category: string
  paidBy: string
  transactedAt: string  // ISO
  createdAt: string     // ISO (used as cursor part)
}

export async function loadMoreTransactions(
  cursor: TxnCursor | null,
  limit = 20,
): Promise<PagedTxnRow[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const [group] = await db
    .select()
    .from(oikosGroups)
    .where(or(eq(oikosGroups.memberA, user.id), eq(oikosGroups.memberB, user.id)))
    .limit(1)
  if (!group) throw new Error('找不到家計簿')

  const rows = await listTransactionsPaged(group.id, cursor, limit)
  return rows.map((r) => ({
    id: r.id,
    amount: r.amount,
    splitType: r.splitType,
    description: r.description,
    category: r.category,
    paidBy: r.paidBy,
    transactedAt: r.transactedAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
  }))
}
