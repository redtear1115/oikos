'use server'

import { db } from '@/lib/db/client'
import { assets, cashTransactions, oikosGroups } from '@/lib/db/schema'
import { createClient } from '@/lib/supabase/server'
import { recalcGroupBalance } from '@/lib/db/queries/balance'
import type { CategoryId } from '@/lib/categories'
import type { SplitType } from '@/lib/balance'
import { validateTransactionInput } from '@/lib/validators'
import { listTransactionsPaged, listFeedAllPaged, type TxnCursor, type ResolvedTxnFilter, type FeedKind } from '@/lib/db/queries/transactions'
import { listTransactionsPagedForAsset } from '@/lib/db/queries/asset'
import { fromWire, hidesSettlements, type TxnFilterWire } from '@/lib/filter'
import { eq, or, and, isNull } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

export interface CreateTransactionInput {
  amount: number              // integer NTD, > 0
  description: string         // required, non-empty after trim
  category: CategoryId | string  // 'other' fallback if invalid
  splitType: SplitType
  payerId: string             // user.id of payer (must be in group)
  transactedAt: Date
  assetId?: string | null
}

export async function createTransaction(input: CreateTransactionInput): Promise<{ id: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  // Validate
  const validated = validateTransactionInput(input)

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

  // Asset ownership + not-deleted check (only if assetId provided)
  if (validated.assetId) {
    const [asset] = await db
      .select({ id: assets.id, deletedAt: assets.deletedAt })
      .from(assets)
      .where(and(
        eq(assets.id, validated.assetId),
        eq(assets.groupId, group.id),
      ))
      .limit(1)
    if (!asset) throw new Error('關聯資產不在家計簿內')
    if (asset.deletedAt) throw new Error('關聯資產已刪除')
  }

  const [created] = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(cashTransactions)
      .values({
        groupId: group.id,
        paidBy: validated.payerId,
        amount: validated.amount,
        splitType: validated.splitType,
        description: validated.description,
        category: validated.category,
        transactedAt: validated.transactedAt,
        assetId: validated.assetId,
      })
      .returning({ id: cashTransactions.id })
    await recalcGroupBalance(group.id, tx)
    return inserted
  })

  revalidatePath('/dashboard')
  revalidatePath('/records')
  if (validated.assetId) revalidatePath(`/assets/${validated.assetId}`)
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
  revalidatePath('/records')
}

export interface EditTransactionInput {
  oldId: string
  amount: number
  description: string
  category: CategoryId | string
  splitType: SplitType
  payerId: string
  transactedAt: Date
  assetId?: string | null
}

export async function editTransaction(input: EditTransactionInput): Promise<{ id: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const validated = validateTransactionInput(input)

  const [group] = await db
    .select()
    .from(oikosGroups)
    .where(or(eq(oikosGroups.memberA, user.id), eq(oikosGroups.memberB, user.id)))
    .limit(1)
  if (!group) throw new Error('找不到家計簿')

  if (input.payerId !== group.memberA && input.payerId !== group.memberB) {
    throw new Error('付款人不在家計簿內')
  }

  // 1. Look up old row to (a) prove existence, (b) get its assetId for the
  //    "kept zombie" exemption check.
  const [oldRow] = await db
    .select({ assetId: cashTransactions.assetId })
    .from(cashTransactions)
    .where(and(
      eq(cashTransactions.id, input.oldId),
      eq(cashTransactions.groupId, group.id),
      isNull(cashTransactions.deletedAt),
    ))
    .limit(1)
  if (!oldRow) throw new Error('找不到該筆紀錄')

  // 2. Asset check — only when newly assigning (or changing) to a different asset.
  if (validated.assetId && validated.assetId !== oldRow.assetId) {
    const [asset] = await db
      .select({ id: assets.id, deletedAt: assets.deletedAt })
      .from(assets)
      .where(and(
        eq(assets.id, validated.assetId),
        eq(assets.groupId, group.id),
      ))
      .limit(1)
    if (!asset) throw new Error('關聯資產不在家計簿內')
    if (asset.deletedAt) throw new Error('關聯資產已刪除')
  }

  // 3. Soft-delete old + insert new in one tx. Keep .returning() on the soft-delete
  //    as a race guard: if a partner soft-deleted the row between step 1 and now,
  //    the WHERE's isNull(deletedAt) makes the UPDATE no-op, and we'd silently
  //    create a dup. The length check restores the existence proof inside the tx.
  const [created] = await db.transaction(async (tx) => {
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

    const inserted = await tx
      .insert(cashTransactions)
      .values({
        groupId: group.id,
        paidBy: validated.payerId,
        amount: validated.amount,
        splitType: validated.splitType,
        description: validated.description,
        category: validated.category,
        transactedAt: validated.transactedAt,
        assetId: validated.assetId,
      })
      .returning({ id: cashTransactions.id })

    await recalcGroupBalance(group.id, tx)
    return inserted
  })

  revalidatePath('/dashboard')
  revalidatePath('/records')
  if (oldRow.assetId) revalidatePath(`/assets/${oldRow.assetId}`)
  if (validated.assetId) revalidatePath(`/assets/${validated.assetId}`)

  return { id: created.id }
}

export interface PagedTxnRow {
  id: string
  amount: number
  splitType: SplitType | null  // null for settlements
  description: string
  category: string
  paidBy: string
  transactedAt: string  // ISO
  createdAt: string     // ISO (used as cursor part)
  kind: FeedKind
  assetId: string | null
  fuelLogId: string | null  // non-null when row was created by a FuelLog dual-write
}

export async function loadMoreTransactions(
  cursor: TxnCursor | null,
  limit = 20,
  filterWire?: TxnFilterWire,
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

  let resolved: ResolvedTxnFilter | undefined
  if (filterWire) {
    const f = fromWire(filterWire)
    let paidBy: string | null = null
    if (f.payer === 'mine') paidBy = user.id
    else if (f.payer === 'theirs') {
      const partner = group.memberA === user.id ? group.memberB : group.memberA
      // If no partner yet, "對方" filter matches nothing — emit an impossible UUID so
      // the SQL returns 0 rows instead of crashing on a NULL comparison.
      paidBy = partner ?? '00000000-0000-0000-0000-000000000000'
    }
    resolved = {
      paidBy,
      splitTypes: f.split === 'all' ? [] : [f.split],
      categories: Array.from(f.categories),
      excludeSettlements: hidesSettlements(f),
    }
  }

  const rows = await listTransactionsPaged(group.id, cursor, limit, resolved)
  return rows.map((r) => ({
    id: r.id,
    amount: r.amount,
    splitType: r.splitType,
    description: r.description,
    category: r.category,
    paidBy: r.paidBy,
    transactedAt: r.transactedAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
    kind: r.kind,
    assetId: r.assetId,
    fuelLogId: r.fuelLogId ?? null,
  }))
}

/**
 * Records "全部" tab feed: UNION CashTransactions + Settlements + IncomeTransactions,
 * newest first.
 */
export async function loadMoreFeedAll(
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

  const rows = await listFeedAllPaged(group.id, cursor, limit)
  return rows.map((r) => ({
    id: r.id,
    amount: r.amount,
    splitType: r.splitType,
    description: r.description,
    category: r.category,
    paidBy: r.paidBy,
    transactedAt: r.transactedAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
    kind: r.kind,
    assetId: r.assetId,
    fuelLogId: r.fuelLogId ?? null,
  }))
}

/**
 * Asset-scoped page-through (newest first). Settlements never have an asset,
 * so this is transactions-only.
 */
export async function loadMoreTransactionsForAsset(
  assetId: string,
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

  const rows = await listTransactionsPagedForAsset(assetId, group.id, cursor, limit)
  return rows.map((r) => ({
    id: r.id,
    amount: r.amount,
    splitType: r.splitType,
    description: r.description,
    category: r.category,
    paidBy: r.paidBy,
    transactedAt: r.transactedAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
    kind: r.kind,
    assetId: r.assetId ?? null,
    fuelLogId: r.fuelLogId ?? null,
  }))
}
